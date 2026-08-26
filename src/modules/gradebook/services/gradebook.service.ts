import type { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import { LEGACY_TEACHER_ROLE_CODES } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import { requireGradebookEnabled } from "@/modules/gradebook/feature";
import {
  assignClassSectionSubjectSchema,
  cancelGradebookAssessmentSchema,
  createGradebookAssessmentSchema,
  gradebookAssessmentIdSchema,
  reopenGradebookAssessmentSchema,
  saveGradebookMarksSchema,
  updateClassSectionSubjectSchema
} from "@/modules/gradebook/schemas";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

function validationError(code: string) {
  return new AppError(code, code, 400);
}

function isPrismaUniqueError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function assessmentSnapshot(assessment: {
  id: string;
  branchId: string;
  academicYearId: string;
  classSectionId: string;
  classSectionSubjectId: string;
  code: string;
  title: string;
  type: string;
  assessmentDate: Date;
  maxMarks: Prisma.Decimal;
  passMarks: Prisma.Decimal;
  status: string;
  publishedAt?: Date | null;
  cancelledAt?: Date | null;
}) {
  return {
    id: assessment.id,
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId,
    classSectionId: assessment.classSectionId,
    classSectionSubjectId: assessment.classSectionSubjectId,
    code: assessment.code,
    title: assessment.title,
    type: assessment.type,
    assessmentDate: assessment.assessmentDate,
    maxMarks: assessment.maxMarks.toString(),
    passMarks: assessment.passMarks.toString(),
    status: assessment.status,
    publishedAt: assessment.publishedAt ?? null,
    cancelledAt: assessment.cancelledAt ?? null
  };
}

async function loadAssessmentScope(ctx: TenantContext, assessmentId: string) {
  const assessment = await db.gradebookAssessment.findFirst({
    where: {
      id: assessmentId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: {
      id: true,
      tenantId: true,
      branchId: true,
      academicYearId: true,
      classSectionId: true,
      classSectionSubjectId: true,
      code: true,
      title: true,
      type: true,
      assessmentDate: true,
      maxMarks: true,
      passMarks: true,
      status: true,
      publishedAt: true,
      cancelledAt: true,
      classSection: { select: { classTeacherUserId: true } },
      classSectionSubject: { select: { teacherUserId: true } }
    }
  });
  if (!assessment) throw notFound("GRADEBOOK_ASSESSMENT_NOT_FOUND");
  return assessment;
}

async function requireMarksEntryAccess(ctx: TenantContext, assessment: Awaited<ReturnType<typeof loadAssessmentScope>>) {
  await requirePermission({
    ctx,
    permission: "gradebook.marks.enter",
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId
  });
  const permissions = await getEffectivePermissions({
    ctx,
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId
  });
  const canManageAnyAssessment = permissions.has("gradebook.assessment.manage") || permissions.has("gradebook.publish");
  const assignedTeacher = assessment.classSection.classTeacherUserId === ctx.userId ||
    assessment.classSectionSubject.teacherUserId === ctx.userId;
  if (!canManageAnyAssessment && !assignedTeacher) {
    throw notFound("GRADEBOOK_ASSESSMENT_NOT_FOUND");
  }
}

export async function assignClassSectionSubject(ctx: TenantContext, input: unknown) {
  const data = assignClassSectionSubjectSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");

  const classSection = await db.classSection.findFirst({
    where: {
      id: data.classSectionId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      status: "ACTIVE"
    },
    select: { id: true, branchId: true, academicYearId: true }
  });
  if (!classSection) throw notFound("GRADEBOOK_CLASS_SECTION_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "gradebook.setup.manage",
    branchId: classSection.branchId,
    academicYearId: classSection.academicYearId
  });

  try {
    return await db.$transaction(async (tx) => {
      const subject = await tx.subject.findFirst({
        where: { id: data.subjectId, tenantId: ctx.tenantId, status: "ACTIVE" },
        select: { id: true, code: true, name: true }
      });
      if (!subject) throw notFound("GRADEBOOK_SUBJECT_NOT_FOUND");

      if (data.teacherUserId) {
        const now = new Date();
        const teacher = await tx.user.findFirst({
          where: {
            id: data.teacherUserId,
            tenantId: ctx.tenantId,
            status: "ACTIVE",
            branchAccesses: {
              some: { tenantId: ctx.tenantId, branchId: classSection.branchId, isActive: true }
            },
            roleAssignments: {
              some: {
                tenantId: ctx.tenantId,
                isActive: true,
                role: { code: { in: ["TEACHER", ...LEGACY_TEACHER_ROLE_CODES] } },
                AND: [
                  { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
                  { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
                ]
              }
            }
          },
          select: { id: true }
        });
        if (!teacher) throw notFound("GRADEBOOK_TEACHER_NOT_AVAILABLE");
      }

      const existing = await tx.classSectionSubject.findUnique({
        where: {
          tenantId_classSectionId_subjectId: {
            tenantId: ctx.tenantId,
            classSectionId: classSection.id,
            subjectId: subject.id
          }
        }
      });
      if (existing?.status === "ACTIVE") throw conflict("GRADEBOOK_CLASS_SUBJECT_ALREADY_ASSIGNED");

      const assignment = existing
        ? await tx.classSectionSubject.update({
            where: { id: existing.id },
            data: { teacherUserId: data.teacherUserId ?? null, status: "ACTIVE", updatedById: ctx.userId }
          })
        : await tx.classSectionSubject.create({
            data: {
              tenantId: ctx.tenantId,
              branchId: classSection.branchId,
              academicYearId: classSection.academicYearId,
              classSectionId: classSection.id,
              subjectId: subject.id,
              teacherUserId: data.teacherUserId,
              createdById: ctx.userId
            }
          });

      await writeAuditLog({
        ctx,
        action: GRADEBOOK_AUDIT_EVENTS.CLASS_SUBJECT_ASSIGNED,
        entityType: "ClassSectionSubject",
        entityId: assignment.id,
        branchId: assignment.branchId,
        academicYearId: assignment.academicYearId,
        before: existing ? {
          id: existing.id,
          subjectId: existing.subjectId,
          teacherUserId: existing.teacherUserId,
          status: existing.status
        } : undefined,
        after: {
          id: assignment.id,
          classSectionId: assignment.classSectionId,
          subjectId: assignment.subjectId,
          teacherUserId: assignment.teacherUserId,
          status: assignment.status
        }
      }, tx);
      return assignment;
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) throw conflict("GRADEBOOK_CLASS_SUBJECT_ALREADY_ASSIGNED");
    throw error;
  }
}

export async function updateClassSectionSubject(ctx: TenantContext, input: unknown) {
  const data = updateClassSectionSubjectSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");

  const assignment = await db.classSectionSubject.findFirst({
    where: {
      id: data.classSectionSubjectId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    include: { _count: { select: { assessments: true } } }
  });
  if (!assignment) throw notFound("GRADEBOOK_CLASS_SUBJECT_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "gradebook.setup.manage",
    branchId: assignment.branchId,
    academicYearId: assignment.academicYearId
  });
  if (data.status === "INACTIVE" && assignment._count.assessments > 0) {
    throw conflict("GRADEBOOK_CLASS_SUBJECT_HAS_ASSESSMENTS");
  }

  if (data.teacherUserId) {
    const now = new Date();
    const teacher = await db.user.findFirst({
      where: {
        id: data.teacherUserId,
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        branchAccesses: {
          some: { tenantId: ctx.tenantId, branchId: assignment.branchId, isActive: true }
        },
        roleAssignments: {
          some: {
            tenantId: ctx.tenantId,
            isActive: true,
            role: { code: { in: ["TEACHER", ...LEGACY_TEACHER_ROLE_CODES] } },
            AND: [
              { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
              { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
            ]
          }
        }
      },
      select: { id: true }
    });
    if (!teacher) throw notFound("GRADEBOOK_TEACHER_NOT_AVAILABLE");
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.classSectionSubject.update({
      where: { id: assignment.id },
      data: {
        ...(data.teacherUserId !== undefined ? { teacherUserId: data.teacherUserId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updatedById: ctx.userId
      }
    });
    await writeAuditLog({
      ctx,
      action: GRADEBOOK_AUDIT_EVENTS.CLASS_SUBJECT_UPDATED,
      entityType: "ClassSectionSubject",
      entityId: assignment.id,
      branchId: assignment.branchId,
      academicYearId: assignment.academicYearId,
      before: {
        id: assignment.id,
        teacherUserId: assignment.teacherUserId,
        status: assignment.status
      },
      after: {
        id: updated.id,
        teacherUserId: updated.teacherUserId,
        status: updated.status
      }
    }, tx);
    return updated;
  });
}

export async function createGradebookAssessment(ctx: TenantContext, input: unknown) {
  const data = createGradebookAssessmentSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");

  const assignment = await db.classSectionSubject.findFirst({
    where: {
      id: data.classSectionSubjectId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      status: "ACTIVE",
      classSection: { status: "ACTIVE" },
      subject: { status: "ACTIVE" }
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      classSectionId: true,
      academicYear: { select: { startDate: true, endDate: true, status: true } }
    }
  });
  if (!assignment) throw notFound("GRADEBOOK_CLASS_SUBJECT_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "gradebook.assessment.manage",
    branchId: assignment.branchId,
    academicYearId: assignment.academicYearId
  });
  if (assignment.academicYear.status === "ARCHIVED" ||
      data.assessmentDate < assignment.academicYear.startDate ||
      data.assessmentDate > assignment.academicYear.endDate) {
    throw validationError("GRADEBOOK_ASSESSMENT_DATE_OUTSIDE_YEAR");
  }

  try {
    return await db.$transaction(async (tx) => {
      const assessment = await tx.gradebookAssessment.create({
        data: {
          tenantId: ctx.tenantId,
          branchId: assignment.branchId,
          academicYearId: assignment.academicYearId,
          classSectionId: assignment.classSectionId,
          classSectionSubjectId: assignment.id,
          code: data.code,
          title: data.title,
          type: data.type,
          assessmentDate: data.assessmentDate,
          maxMarks: data.maxMarks,
          passMarks: data.passMarks,
          createdById: ctx.userId
        }
      });
      await writeAuditLog({
        ctx,
        action: GRADEBOOK_AUDIT_EVENTS.ASSESSMENT_CREATED,
        entityType: "GradebookAssessment",
        entityId: assessment.id,
        branchId: assessment.branchId,
        academicYearId: assessment.academicYearId,
        after: assessmentSnapshot(assessment)
      }, tx);
      return assessment;
    });
  } catch (error) {
    if (isPrismaUniqueError(error)) throw conflict("GRADEBOOK_ASSESSMENT_ALREADY_EXISTS");
    throw error;
  }
}

export async function saveGradebookMarks(ctx: TenantContext, input: unknown) {
  const data = saveGradebookMarksSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");
  const assessment = await loadAssessmentScope(ctx, data.assessmentId);
  await requireMarksEntryAccess(ctx, assessment);
  if (assessment.status === "CANCELLED") throw conflict("GRADEBOOK_ASSESSMENT_CANCELLED");
  if (assessment.status !== "OPEN") throw conflict("GRADEBOOK_ASSESSMENT_NOT_OPEN");

  const maxMarks = Number(assessment.maxMarks);
  if (data.entries.some((entry) => entry.status === "GRADED" && (entry.marksObtained ?? 0) > maxMarks)) {
    throw validationError("GRADEBOOK_MARKS_OUT_OF_RANGE");
  }

  return db.$transaction(async (tx) => {
    const lock = await tx.gradebookAssessment.updateMany({
      where: { id: assessment.id, tenantId: ctx.tenantId, status: "OPEN" },
      data: { updatedAt: new Date() }
    });
    if (lock.count !== 1) throw conflict("GRADEBOOK_ASSESSMENT_NOT_OPEN");

    const enrollments = await tx.enrollment.findMany({
      where: {
        id: { in: data.entries.map((entry) => entry.enrollmentId) },
        tenantId: ctx.tenantId,
        branchId: assessment.branchId,
        academicYearId: assessment.academicYearId,
        classSectionId: assessment.classSectionId,
        status: "ACTIVE",
        student: { tenantId: ctx.tenantId, branchId: assessment.branchId, status: "ACTIVE" }
      },
      select: { id: true, studentId: true }
    });
    if (enrollments.length !== data.entries.length) throw notFound("GRADEBOOK_ENROLLMENT_NOT_ELIGIBLE");
    const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
    const existingMarks = await tx.gradebookMark.findMany({
      where: {
        tenantId: ctx.tenantId,
        assessmentId: assessment.id,
        enrollmentId: { in: data.entries.map((entry) => entry.enrollmentId) }
      },
      select: { enrollmentId: true, status: true, marksObtained: true, remarks: true }
    });

    for (const entry of data.entries) {
      const enrollment = enrollmentById.get(entry.enrollmentId);
      if (!enrollment) throw notFound("GRADEBOOK_ENROLLMENT_NOT_ELIGIBLE");
      await tx.gradebookMark.upsert({
        where: {
          tenantId_assessmentId_enrollmentId: {
            tenantId: ctx.tenantId,
            assessmentId: assessment.id,
            enrollmentId: enrollment.id
          }
        },
        create: {
          tenantId: ctx.tenantId,
          branchId: assessment.branchId,
          academicYearId: assessment.academicYearId,
          assessmentId: assessment.id,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          status: entry.status,
          marksObtained: entry.status === "GRADED" ? entry.marksObtained : null,
          remarks: entry.remarks,
          enteredById: ctx.userId
        },
        update: {
          status: entry.status,
          marksObtained: entry.status === "GRADED" ? entry.marksObtained : null,
          remarks: entry.remarks,
          enteredById: ctx.userId,
          enteredAt: new Date()
        }
      });
    }

    const statusSummary = data.entries.reduce<Record<string, number>>((summary, entry) => {
      summary[entry.status] = (summary[entry.status] ?? 0) + 1;
      return summary;
    }, {});
    await writeAuditLog({
      ctx,
      action: GRADEBOOK_AUDIT_EVENTS.MARKS_SAVED,
      entityType: "GradebookAssessment",
      entityId: assessment.id,
      branchId: assessment.branchId,
      academicYearId: assessment.academicYearId,
      before: existingMarks.map((mark) => ({
        enrollmentId: mark.enrollmentId,
        status: mark.status,
        marksObtained: mark.marksObtained?.toString() ?? null,
        remarks: mark.remarks
      })),
      after: data.entries.map((entry) => ({
        enrollmentId: entry.enrollmentId,
        status: entry.status,
        marksObtained: entry.status === "GRADED" ? entry.marksObtained ?? null : null,
        remarks: entry.remarks ?? null
      })),
      metadata: { entryCount: data.entries.length, statusSummary }
    }, tx);
    return { assessmentId: assessment.id, savedCount: data.entries.length };
  });
}

export async function publishGradebookAssessment(ctx: TenantContext, input: unknown) {
  const { assessmentId } = gradebookAssessmentIdSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");
  const assessment = await loadAssessmentScope(ctx, assessmentId);
  await requirePermission({
    ctx,
    permission: "gradebook.publish",
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId
  });
  if (assessment.status === "CANCELLED") throw conflict("GRADEBOOK_ASSESSMENT_CANCELLED");
  if (assessment.status === "PUBLISHED") throw conflict("GRADEBOOK_ASSESSMENT_ALREADY_PUBLISHED");

  return db.$transaction(async (tx) => {
    const lock = await tx.gradebookAssessment.updateMany({
      where: { id: assessment.id, tenantId: ctx.tenantId, status: "OPEN" },
      data: { updatedAt: new Date() }
    });
    if (lock.count !== 1) throw conflict("GRADEBOOK_ASSESSMENT_NOT_OPEN");

    const activeEnrollments = await tx.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: assessment.branchId,
        academicYearId: assessment.academicYearId,
        classSectionId: assessment.classSectionId,
        status: "ACTIVE",
        student: { tenantId: ctx.tenantId, branchId: assessment.branchId, status: "ACTIVE" }
      },
      select: { id: true }
    });
    if (activeEnrollments.length === 0) throw validationError("GRADEBOOK_RESULTS_INCOMPLETE");

    const markCount = await tx.gradebookMark.count({
      where: {
        tenantId: ctx.tenantId,
        assessmentId: assessment.id,
        enrollmentId: { in: activeEnrollments.map((enrollment) => enrollment.id) }
      }
    });
    if (markCount !== activeEnrollments.length) throw validationError("GRADEBOOK_RESULTS_INCOMPLETE");

    const before = assessmentSnapshot(assessment);
    const after = await tx.gradebookAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "PUBLISHED",
        publishedById: ctx.userId,
        publishedAt: new Date(),
        reopenReason: null
      }
    });
    await writeAuditLog({
      ctx,
      action: GRADEBOOK_AUDIT_EVENTS.ASSESSMENT_PUBLISHED,
      entityType: "GradebookAssessment",
      entityId: assessment.id,
      branchId: assessment.branchId,
      academicYearId: assessment.academicYearId,
      before,
      after: assessmentSnapshot(after),
      metadata: { publishedResultCount: markCount }
    }, tx);
    return after;
  });
}

export async function reopenGradebookAssessment(ctx: TenantContext, input: unknown) {
  const data = reopenGradebookAssessmentSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");
  const assessment = await loadAssessmentScope(ctx, data.assessmentId);
  await requirePermission({
    ctx,
    permission: "gradebook.publish",
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId
  });
  if (assessment.status !== "PUBLISHED") throw conflict("GRADEBOOK_ASSESSMENT_NOT_PUBLISHED");

  return db.$transaction(async (tx) => {
    const after = await tx.gradebookAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "OPEN",
        publishedById: null,
        publishedAt: null,
        reopenReason: data.reason
      }
    });
    await writeAuditLog({
      ctx,
      action: GRADEBOOK_AUDIT_EVENTS.ASSESSMENT_REOPENED,
      entityType: "GradebookAssessment",
      entityId: assessment.id,
      branchId: assessment.branchId,
      academicYearId: assessment.academicYearId,
      before: assessmentSnapshot(assessment),
      after: assessmentSnapshot(after),
      metadata: { reason: data.reason }
    }, tx);
    return after;
  });
}

export async function cancelGradebookAssessment(ctx: TenantContext, input: unknown) {
  const data = cancelGradebookAssessmentSchema.parse(input);
  await requireGradebookEnabled(ctx, "WRITE");
  const assessment = await loadAssessmentScope(ctx, data.assessmentId);
  await requirePermission({
    ctx,
    permission: "gradebook.assessment.manage",
    branchId: assessment.branchId,
    academicYearId: assessment.academicYearId
  });
  if (assessment.status === "CANCELLED") throw conflict("GRADEBOOK_ASSESSMENT_CANCELLED");
  if (assessment.status === "PUBLISHED") throw conflict("GRADEBOOK_PUBLISHED_REOPEN_REQUIRED");

  return db.$transaction(async (tx) => {
    const after = await tx.gradebookAssessment.update({
      where: { id: assessment.id },
      data: {
        status: "CANCELLED",
        cancelledById: ctx.userId,
        cancelledAt: new Date(),
        cancellationReason: data.reason
      }
    });
    await writeAuditLog({
      ctx,
      action: GRADEBOOK_AUDIT_EVENTS.ASSESSMENT_CANCELLED,
      entityType: "GradebookAssessment",
      entityId: assessment.id,
      branchId: assessment.branchId,
      academicYearId: assessment.academicYearId,
      before: assessmentSnapshot(assessment),
      after: assessmentSnapshot(after),
      metadata: { reason: data.reason }
    }, tx);
    return after;
  });
}
