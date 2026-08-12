import { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { LEGACY_TEACHER_ROLE_CODES } from "@/lib/rbac/roles";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  assignTeacherSchema,
  cancelExamSchema,
  createExamSchema,
  examIdSchema,
  revokeTeacherAssignmentSchema,
  upsertExamScheduleSchema
} from "@/modules/gradebook/schemas/exam.schemas";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { resolveGradebookRequestContext, type GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function loadScopedExam(request: GradebookRequestContext, examId: string) {
  const exam = await db.gradebookExam.findFirst({
    where: {
      id: examId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId
    }
  });
  if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
  return exam;
}

export async function createExam(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.create", feature: "configuration" });
  const data = createExamSchema.parse(input);

  try {
    return await db.$transaction(async (tx) => {
      const [term, examType, classSections, subjects] = await Promise.all([
        tx.gradebookExamTerm.findFirst({
          where: { id: data.termId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, status: "ACTIVE" }
        }),
        tx.gradebookExamType.findFirst({ where: { id: data.examTypeId, tenantId: request.tenantId, status: "ACTIVE" } }),
        tx.classSection.findMany({
          where: { id: { in: data.classSectionIds }, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, status: "ACTIVE" },
          select: { id: true }
        }),
        tx.subject.findMany({
          where: { id: { in: data.subjects.map((subject) => subject.subjectId) }, tenantId: request.tenantId, status: "ACTIVE" },
          select: { id: true }
        })
      ]);
      if (!term) throw notFound("GRADEBOOK_TERM_NOT_FOUND");
      if (!examType) throw notFound("GRADEBOOK_EXAM_TYPE_NOT_FOUND");
      if (classSections.length !== data.classSectionIds.length) throw notFound("GRADEBOOK_CLASS_SECTION_NOT_FOUND");
      if (subjects.length !== data.subjects.length) throw notFound("GRADEBOOK_SUBJECT_NOT_FOUND");

      const classSubjectCount = await tx.classSectionSubject.count({
        where: {
          tenantId: request.tenantId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          classSectionId: { in: data.classSectionIds },
          subjectId: { in: data.subjects.map((subject) => subject.subjectId) },
          status: "ACTIVE"
        }
      });
      if (classSubjectCount !== data.classSectionIds.length * data.subjects.length) {
        throw new AppError("GRADEBOOK_CLASS_SUBJECT_SCOPE_INCOMPLETE", "GRADEBOOK_CLASS_SUBJECT_SCOPE_INCOMPLETE", 400);
      }

      if (data.schemeVersionId) {
        const value = await tx.gradebookAssessmentSchemeVersion.findFirst({ where: { id: data.schemeVersionId, tenantId: request.tenantId, status: "ACTIVE" } });
        if (!value) throw notFound("GRADEBOOK_SCHEME_VERSION_NOT_FOUND");
      }
      if (data.gradeScaleVersionId) {
        const value = await tx.gradebookGradeScaleVersion.findFirst({ where: { id: data.gradeScaleVersionId, tenantId: request.tenantId, status: "ACTIVE" } });
        if (!value) throw notFound("GRADEBOOK_GRADE_SCALE_VERSION_NOT_FOUND");
      }
      if (data.calculationRuleSetVersionId) {
        const value = await tx.gradebookCalculationRuleSetVersion.findFirst({ where: { id: data.calculationRuleSetVersionId, tenantId: request.tenantId, status: "ACTIVE" } });
        if (!value) throw notFound("GRADEBOOK_CALCULATION_RULE_VERSION_NOT_FOUND");
      }

      for (const subject of data.subjects) {
        const componentTotal = subject.components.reduce((sum, component) => sum + component.maximumMarks, 0);
        const weightTotal = subject.components.reduce((sum, component) => sum + (component.weightagePercent ?? 0), 0);
        if (subject.maximumMarks !== undefined && Math.abs(componentTotal - subject.maximumMarks) > 0.0001) {
          throw new AppError("GRADEBOOK_COMPONENT_TOTAL_INVALID", "GRADEBOOK_COMPONENT_TOTAL_INVALID", 400);
        }
        if (subject.components.some((component) => component.weightagePercent !== undefined) && Math.abs(weightTotal - 100) > 0.0001) {
          throw new AppError("GRADEBOOK_COMPONENT_WEIGHTAGE_INVALID", "GRADEBOOK_COMPONENT_WEIGHTAGE_INVALID", 400);
        }
      }

      const exam = await tx.gradebookExam.create({
        data: {
          tenantId: request.tenantId,
          institutionId: request.institutionId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          termId: data.termId,
          examTypeId: data.examTypeId,
          schemeVersionId: data.schemeVersionId,
          gradeScaleVersionId: data.gradeScaleVersionId,
          calculationRuleSetVersionId: data.calculationRuleSetVersionId,
          code: data.code,
          name: data.name,
          description: data.description,
          instructions: data.instructions,
          marksEntryOpensAt: data.marksEntryOpensAt,
          marksEntryClosesAt: data.marksEntryClosesAt,
          resultPublicationPolicy: data.resultPublicationPolicy,
          scheduledPublishAt: data.scheduledPublishAt,
          createdById: request.userId,
          updatedById: request.userId,
          classSections: {
            create: data.classSectionIds.map((classSectionId) => ({
              tenantId: request.tenantId,
              branchId: request.branchId,
              academicYearId: request.academicYearId,
              classSectionId
            }))
          },
          subjects: {
            create: data.subjects.map((subject) => ({
              tenantId: request.tenantId,
              subjectId: subject.subjectId,
              displayName: subject.displayName,
              maximumMarks: subject.maximumMarks ?? subject.components.reduce((sum, component) => sum + component.maximumMarks, 0),
              passingMarks: subject.passingMarks,
              displayOrder: subject.displayOrder,
              components: {
                create: subject.components.map((component) => ({
                  tenantId: request.tenantId,
                  componentId: component.componentId,
                  examTypeId: component.examTypeId ?? data.examTypeId,
                  componentCode: component.componentCode,
                  componentName: component.componentName,
                  maximumMarks: component.maximumMarks,
                  passingMarks: component.passingMarks,
                  weightagePercent: component.weightagePercent,
                  displayOrder: component.displayOrder,
                  isOptional: component.isOptional
                }))
              }
            }))
          }
        },
        include: { classSections: true, subjects: { include: { components: true } } }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.EXAM_CREATED,
        entityType: "GradebookExam",
        entityId: exam.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: {
          code: exam.code,
          name: exam.name,
          termId: exam.termId,
          classSectionCount: exam.classSections.length,
          subjectCount: exam.subjects.length,
          status: exam.status
        },
        metadata: { correlationId: request.correlationId }
      }, tx);
      await enqueueGradebookDomainEvent(tx, request, {
        eventType: "gradebook.exam.configured.v1",
        aggregateType: "GradebookExam",
        aggregateId: exam.id,
        payload: { examId: exam.id, status: exam.status },
        idempotencyKey: `exam:${exam.id}:configured:${exam.version}`
      });
      return exam;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_EXAM_CODE_EXISTS");
    throw error;
  }
}

export async function getExamReadiness(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.readiness.view", feature: "configuration" });
  const { examId } = examIdSchema.parse(input);
  const exam = await db.gradebookExam.findFirst({
    where: { id: examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
    include: {
      term: { select: { status: true } },
      examType: { select: { status: true, requiresSchedule: true } },
      schemeVersion: { select: { status: true } },
      gradeScaleVersion: { select: { status: true } },
      calculationRuleSetVersion: { select: { status: true } },
      classSections: { select: { id: true } },
      subjects: { include: { components: { select: { id: true } } } },
      schedules: { where: { status: { in: ["PUBLISHED", "COMPLETED"] } }, select: { id: true } },
      teacherAssignments: { where: { status: "ACTIVE" }, select: { examClassSectionId: true, examSubjectId: true } }
    }
  });
  if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
  const blockers: Array<{ code: string; message: string }> = [];
  if (exam.term.status !== "ACTIVE") blockers.push({ code: "TERM_NOT_ACTIVE", message: "The exam term is not active." });
  if (exam.examType.status !== "ACTIVE") blockers.push({ code: "EXAM_TYPE_NOT_ACTIVE", message: "The exam type is not active." });
  if (!exam.gradeScaleVersion || exam.gradeScaleVersion.status !== "ACTIVE") blockers.push({ code: "GRADE_SCALE_REQUIRED", message: "An active grade scale is required." });
  if (!exam.calculationRuleSetVersion || exam.calculationRuleSetVersion.status !== "ACTIVE") blockers.push({ code: "CALCULATION_RULES_REQUIRED", message: "Active calculation rules are required." });
  if (exam.schemeVersion && exam.schemeVersion.status !== "ACTIVE") blockers.push({ code: "SCHEME_NOT_ACTIVE", message: "The selected assessment scheme is not active." });
  if (exam.classSections.length === 0) blockers.push({ code: "CLASS_SECTIONS_REQUIRED", message: "Select at least one class-section." });
  if (exam.subjects.length === 0 || exam.subjects.some((subject) => subject.components.length === 0)) blockers.push({ code: "COMPONENTS_REQUIRED", message: "Every subject needs at least one component." });
  const expectedAssignments = exam.classSections.length * exam.subjects.length;
  const assignmentKeys = new Set(exam.teacherAssignments.map((assignment) => `${assignment.examClassSectionId}:${assignment.examSubjectId}`));
  if (assignmentKeys.size < expectedAssignments) blockers.push({ code: "TEACHER_ASSIGNMENTS_INCOMPLETE", message: "Every class-section subject needs an active teacher assignment." });
  if (exam.examType.requiresSchedule && exam.schedules.length < expectedAssignments) blockers.push({ code: "SCHEDULE_INCOMPLETE", message: "Publish the complete examination schedule." });
  return { examId: exam.id, ready: blockers.length === 0, blockers };
}

export async function activateExam(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.activate", feature: "configuration" });
  const { examId } = examIdSchema.parse(input);
  const readiness = await getExamReadiness(ctx, { examId });
  if (!readiness.ready) throw new AppError("GRADEBOOK_EXAM_NOT_READY", "GRADEBOOK_EXAM_NOT_READY", 409);
  return db.$transaction(async (tx) => {
    const exam = await tx.gradebookExam.findFirst({ where: { id: examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
    if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
    if (!["DRAFT", "CONFIGURED", "SCHEDULED", "REOPENED"].includes(exam.status)) throw conflict("GRADEBOOK_EXAM_TRANSITION_INVALID");
    const status = exam.marksEntryOpensAt && exam.marksEntryOpensAt > new Date() ? "SCHEDULED" : "MARKS_OPEN";
    const changed = await tx.gradebookExam.updateMany({
      where: { id: exam.id, tenantId: request.tenantId, version: exam.version, status: exam.status },
      data: { status, version: { increment: 1 }, activatedAt: new Date(), activatedById: request.userId, updatedById: request.userId }
    });
    if (changed.count !== 1) throw conflict("GRADEBOOK_VERSION_CONFLICT");
    await tx.gradebookTeacherMarkAssignment.updateMany({
      where: { tenantId: request.tenantId, examId: exam.id, status: "DRAFT" },
      data: { status: "ACTIVE" }
    });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.EXAM_ACTIVATED,
      entityType: "GradebookExam",
      entityId: exam.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: exam.status, version: exam.version },
      after: { status, version: exam.version + 1 },
      metadata: { correlationId: request.correlationId, readiness }
    }, tx);
    return { id: exam.id, status };
  });
}

export async function assignTeacherToExamScope(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.assignment.manage", feature: "marksEntry" });
  const data = assignTeacherSchema.parse(input);
  return db.$transaction(async (tx) => {
    const [exam, classScope, subjectScope, componentScope, teacher] = await Promise.all([
      tx.gradebookExam.findFirst({ where: { id: data.examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } }),
      tx.gradebookExamClassSection.findFirst({ where: { id: data.examClassSectionId, tenantId: request.tenantId, examId: data.examId, branchId: request.branchId } }),
      tx.gradebookExamSubject.findFirst({ where: { id: data.examSubjectId, tenantId: request.tenantId, examId: data.examId } }),
      data.examSubjectComponentId
        ? tx.gradebookExamSubjectComponent.findFirst({ where: { id: data.examSubjectComponentId, tenantId: request.tenantId, examSubjectId: data.examSubjectId } })
        : Promise.resolve(null),
      tx.user.findFirst({
        where: {
          id: data.teacherUserId,
          tenantId: request.tenantId,
          status: "ACTIVE",
          branchAccesses: { some: { tenantId: request.tenantId, branchId: request.branchId, isActive: true } },
          roleAssignments: {
            some: {
              tenantId: request.tenantId,
              isActive: true,
              role: { code: { in: ["TEACHER", ...LEGACY_TEACHER_ROLE_CODES] }, isActive: true }
            }
          }
        },
        select: { id: true }
      })
    ]);
    if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
    if (!classScope || !subjectScope || (data.examSubjectComponentId && !componentScope)) throw notFound("GRADEBOOK_EXAM_SCOPE_NOT_FOUND");
    if (!teacher) throw notFound("GRADEBOOK_TEACHER_NOT_AVAILABLE");
    if (data.isPrimary) {
      const currentPrimary = await tx.gradebookTeacherMarkAssignment.findFirst({
        where: {
          tenantId: request.tenantId,
          examId: exam.id,
          examClassSectionId: classScope.id,
          examSubjectId: subjectScope.id,
          examSubjectComponentId: data.examSubjectComponentId ?? null,
          status: { in: ["DRAFT", "ACTIVE"] },
          isPrimary: true
        }
      });
      if (currentPrimary) throw conflict("GRADEBOOK_PRIMARY_ASSIGNMENT_EXISTS");
    }
    if (!data.sourceClassSectionSubjectId && !data.overrideReason) {
      throw new AppError("GRADEBOOK_ASSIGNMENT_OVERRIDE_REASON_REQUIRED", "GRADEBOOK_ASSIGNMENT_OVERRIDE_REASON_REQUIRED", 400);
    }
    if (data.sourceClassSectionSubjectId) {
      const source = await tx.classSectionSubject.findFirst({
        where: {
          id: data.sourceClassSectionSubjectId,
          tenantId: request.tenantId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          classSectionId: classScope.classSectionId,
          subjectId: subjectScope.subjectId,
          status: "ACTIVE"
        }
      });
      if (!source) throw notFound("GRADEBOOK_SOURCE_ASSIGNMENT_NOT_FOUND");
      if (source.teacherUserId !== teacher.id && !data.overrideReason) {
        throw new AppError("GRADEBOOK_ASSIGNMENT_OVERRIDE_REASON_REQUIRED", "GRADEBOOK_ASSIGNMENT_OVERRIDE_REASON_REQUIRED", 400);
      }
    }

    const assignment = await tx.gradebookTeacherMarkAssignment.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        examId: exam.id,
        examClassSectionId: classScope.id,
        examSubjectId: subjectScope.id,
        examSubjectComponentId: data.examSubjectComponentId,
        teacherUserId: teacher.id,
        sourceClassSectionSubjectId: data.sourceClassSectionSubjectId,
        isPrimary: data.isPrimary,
        canEdit: data.canEdit,
        canSubmit: data.canSubmit,
        status: exam.status === "DRAFT" ? "DRAFT" : "ACTIVE",
        validFrom: data.validFrom,
        validUntil: data.validUntil,
        overrideReason: data.overrideReason,
        createdById: request.userId
      }
    });
    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        classSectionId: classScope.classSectionId,
        status: "ACTIVE",
        student: { tenantId: request.tenantId, branchId: request.branchId, status: "ACTIVE" }
      },
      select: { id: true, studentId: true, rollNumber: true, student: { select: { admissionNumber: true, firstName: true, lastName: true } } },
      orderBy: [{ rollNumber: "asc" }, { student: { firstName: "asc" } }]
    });
    const rosterSnapshot = enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentId: enrollment.studentId,
      scholarNumber: enrollment.student.admissionNumber,
      rollNumber: enrollment.rollNumber,
      displayName: [enrollment.student.firstName, enrollment.student.lastName].filter(Boolean).join(" ")
    }));
    const batch = await tx.gradebookMarkEntryBatch.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        teacherMarkAssignmentId: assignment.id,
        examId: exam.id,
        examClassSectionId: classScope.id,
        examSubjectId: subjectScope.id,
        status: exam.status === "MARKS_OPEN" ? "NOT_STARTED" : "NOT_STARTED",
        entryOpenedAt: exam.marksEntryOpensAt,
        entryClosedAt: exam.marksEntryClosesAt,
        rosterSnapshotJson: rosterSnapshot,
        completionCountsJson: { total: rosterSnapshot.length, entered: 0, incomplete: rosterSnapshot.length },
        createdById: request.userId
      }
    });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.ASSIGNMENT_CREATED,
      entityType: "GradebookTeacherMarkAssignment",
      entityId: assignment.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: {
        examId: exam.id,
        examClassSectionId: classScope.id,
        examSubjectId: subjectScope.id,
        examSubjectComponentId: data.examSubjectComponentId ?? null,
        teacherUserId: teacher.id,
        status: assignment.status,
        batchId: batch.id
      },
      metadata: { correlationId: request.correlationId, overrideReason: data.overrideReason ?? null }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: "gradebook.assignment.created.v1",
      aggregateType: "GradebookTeacherMarkAssignment",
      aggregateId: assignment.id,
      payload: { assignmentId: assignment.id, batchId: batch.id, teacherUserId: teacher.id },
      idempotencyKey: `assignment:${assignment.id}:created`
    });
    return { assignment, batch };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function revokeTeacherAssignment(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.assignment.manage", feature: "marksEntry" });
  const data = revokeTeacherAssignmentSchema.parse(input);
  return db.$transaction(async (tx) => {
    const assignment = await tx.gradebookTeacherMarkAssignment.findFirst({
      where: { id: data.assignmentId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId }
    });
    if (!assignment) throw notFound("GRADEBOOK_ASSIGNMENT_NOT_FOUND");
    if (assignment.status === "REVOKED") throw conflict("GRADEBOOK_ASSIGNMENT_ALREADY_REVOKED");
    const updated = await tx.gradebookTeacherMarkAssignment.update({
      where: { id: assignment.id },
      data: { status: "REVOKED", revokedAt: new Date(), revokedById: request.userId, overrideReason: data.reason }
    });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.ASSIGNMENT_REVOKED,
      entityType: "GradebookTeacherMarkAssignment",
      entityId: assignment.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { teacherUserId: assignment.teacherUserId, status: assignment.status },
      after: { teacherUserId: updated.teacherUserId, status: updated.status },
      metadata: { correlationId: request.correlationId, reason: data.reason }
    }, tx);
    return updated;
  });
}

export async function upsertExamSchedule(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.schedule.manage", feature: "configuration" });
  const data = upsertExamScheduleSchema.parse(input);
  const exam = await loadScopedExam(request, data.examId);
  if (["CANCELLED", "ARCHIVED", "PUBLISHED"].includes(exam.status)) throw conflict("GRADEBOOK_EXAM_SCHEDULE_LOCKED");
  const scope = await db.gradebookExamClassSection.findFirst({ where: { id: data.examClassSectionId, tenantId: request.tenantId, examId: exam.id } });
  const subject = await db.gradebookExamSubject.findFirst({ where: { id: data.examSubjectId, tenantId: request.tenantId, examId: exam.id } });
  if (!scope || !subject) throw notFound("GRADEBOOK_EXAM_SCOPE_NOT_FOUND");
  if (data.examSubjectComponentId) {
    const component = await db.gradebookExamSubjectComponent.findFirst({ where: { id: data.examSubjectComponentId, tenantId: request.tenantId, examSubjectId: subject.id } });
    if (!component) throw notFound("GRADEBOOK_COMPONENT_NOT_FOUND");
  }
  const conflictRecord = await db.gradebookExamSchedule.findFirst({
    where: {
      tenantId: request.tenantId,
      branchId: request.branchId,
      examDate: data.examDate,
      status: { notIn: ["CANCELLED", "RESCHEDULED"] },
      OR: [
        { examClassSectionId: scope.id },
        ...(data.roomName ? [{ roomName: data.roomName }] : [])
      ],
      startTime: { lt: data.endTime },
      endTime: { gt: data.startTime }
    },
    select: { id: true }
  });
  if (conflictRecord) throw conflict("GRADEBOOK_SCHEDULE_CONFLICT");
  return db.gradebookExamSchedule.create({
    data: {
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      examId: exam.id,
      examClassSectionId: scope.id,
      examSubjectId: subject.id,
      examSubjectComponentId: data.examSubjectComponentId,
      examDate: data.examDate,
      startTime: data.startTime,
      endTime: data.endTime,
      reportingTime: data.reportingTime,
      roomName: data.roomName,
      instructions: data.instructions,
      createdById: request.userId,
      updatedById: request.userId
    }
  });
}

export async function publishExamSchedule(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.schedule.publish", feature: "configuration" });
  const { examId } = examIdSchema.parse(input);
  const exam = await loadScopedExam(request, examId);
  return db.$transaction(async (tx) => {
    const updated = await tx.gradebookExamSchedule.updateMany({
      where: { tenantId: request.tenantId, examId: exam.id, status: "DRAFT" },
      data: { status: "PUBLISHED", publishedAt: new Date(), updatedById: request.userId }
    });
    if (updated.count === 0) throw conflict("GRADEBOOK_SCHEDULE_EMPTY");
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.SCHEDULE_PUBLISHED,
      entityType: "GradebookExam",
      entityId: exam.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { publishedScheduleCount: updated.count },
      metadata: { correlationId: request.correlationId }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: "gradebook.exam.schedule_published.v1",
      aggregateType: "GradebookExam",
      aggregateId: exam.id,
      payload: { examId: exam.id, scheduleCount: updated.count },
      idempotencyKey: `exam:${exam.id}:schedule-published:${exam.version}`
    });
    return { examId: exam.id, publishedCount: updated.count };
  });
}

export async function cancelExam(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.cancel", feature: "configuration" });
  const data = cancelExamSchema.parse(input);
  const exam = await loadScopedExam(request, data.examId);
  if (["PUBLISHED", "ARCHIVED", "CANCELLED"].includes(exam.status)) throw conflict("GRADEBOOK_EXAM_CANNOT_CANCEL");
  return db.$transaction(async (tx) => {
    const updated = await tx.gradebookExam.update({
      where: { id: exam.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: request.userId, cancellationReason: data.reason, updatedById: request.userId, version: { increment: 1 } }
    });
    await tx.gradebookExamSchedule.updateMany({ where: { tenantId: request.tenantId, examId: exam.id, status: { in: ["DRAFT", "PUBLISHED"] } }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.gradebookMarkEntryBatch.updateMany({ where: { tenantId: request.tenantId, examId: exam.id, status: { in: ["NOT_STARTED", "IN_PROGRESS", "RETURNED"] } }, data: { status: "CANCELLED", version: { increment: 1 } } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.EXAM_CANCELLED,
      entityType: "GradebookExam",
      entityId: exam.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: exam.status },
      after: { status: updated.status },
      metadata: { correlationId: request.correlationId, reason: data.reason }
    }, tx);
    return updated;
  });
}
