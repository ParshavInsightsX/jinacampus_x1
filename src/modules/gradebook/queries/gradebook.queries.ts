import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import { LEGACY_TEACHER_ROLE_CODES } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { requireGradebookEnabled } from "@/modules/gradebook/feature";

function assignedTeacherFilter(userId: string): Prisma.GradebookAssessmentWhereInput {
  return {
    OR: [
      { classSection: { classTeacherUserId: userId } },
      { classSectionSubject: { teacherUserId: userId } }
    ]
  };
}

async function activeGradebookScope(ctx: TenantContext) {
  await requireGradebookEnabled(ctx);
  const branchId = ctx.activeBranchId;
  const academicYearId = ctx.activeAcademicYearId;
  if (!branchId || !academicYearId || !ctx.accessibleBranchIds.includes(branchId)) return null;

  await requirePermission({ ctx, permission: "gradebook.view", branchId, academicYearId });
  const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
  return { branchId, academicYearId, permissions };
}

export async function getGradebookWorkspace(ctx: TenantContext) {
  const scope = await activeGradebookScope(ctx);
  if (!scope) return null;
  const { branchId, academicYearId, permissions } = scope;
  const canManageSetup = permissions.has("gradebook.setup.manage");
  const canManageAssessments = permissions.has("gradebook.assessment.manage");
  const canPublish = permissions.has("gradebook.publish");
  const canViewAll = canManageSetup || canManageAssessments || canPublish;
  const now = new Date();

  const classSections = await db.classSection.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      status: "ACTIVE",
      ...(canViewAll
        ? {}
        : {
            OR: [
              { classTeacherUserId: ctx.userId },
              { classSectionSubjects: { some: { teacherUserId: ctx.userId, status: "ACTIVE" } } }
            ]
          })
    },
    select: {
      id: true,
      displayName: true,
      academicClass: { select: { name: true, sortOrder: true } },
      section: { select: { name: true, sortOrder: true } }
    },
    orderBy: [
      { academicClass: { sortOrder: "asc" } },
      { section: { sortOrder: "asc" } },
      { displayName: "asc" }
    ]
  });
  const visibleClassSectionIds = classSections.map((classSection) => classSection.id);

  const [subjects, teachers, assignments, assessments] = await Promise.all([
    canManageSetup
      ? db.subject.findMany({
          where: { tenantId: ctx.tenantId, status: "ACTIVE" },
          select: { id: true, code: true, name: true, type: true },
          orderBy: [{ name: "asc" }, { code: "asc" }]
        })
      : Promise.resolve([]),
    canManageSetup
      ? db.user.findMany({
          where: {
            tenantId: ctx.tenantId,
            status: "ACTIVE",
            branchAccesses: { some: { tenantId: ctx.tenantId, branchId, isActive: true } },
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
          select: { id: true, email: true, displayName: true, firstName: true, lastName: true },
          orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
        })
      : Promise.resolve([]),
    visibleClassSectionIds.length > 0
      ? db.classSectionSubject.findMany({
          where: {
            tenantId: ctx.tenantId,
            branchId,
            academicYearId,
            classSectionId: { in: visibleClassSectionIds },
            ...(canViewAll ? {} : { teacherUserId: ctx.userId })
          },
          select: {
            id: true,
            classSectionId: true,
            teacherUserId: true,
            status: true,
            classSection: { select: { displayName: true } },
            subject: { select: { id: true, code: true, name: true, type: true } },
            teacherUser: { select: { displayName: true, firstName: true, lastName: true, email: true } },
            _count: { select: { assessments: true } }
          },
          orderBy: [{ classSection: { displayName: "asc" } }, { subject: { name: "asc" } }]
        })
      : Promise.resolve([]),
    db.gradebookAssessment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        ...(canViewAll ? {} : assignedTeacherFilter(ctx.userId))
      },
      select: {
        id: true,
        code: true,
        title: true,
        type: true,
        assessmentDate: true,
        maxMarks: true,
        passMarks: true,
        status: true,
        publishedAt: true,
        classSection: { select: { displayName: true } },
        classSectionSubject: { select: { subject: { select: { code: true, name: true } } } },
        _count: { select: { marks: true } }
      },
      orderBy: [{ assessmentDate: "desc" }, { createdAt: "desc" }],
      take: 100
    })
  ]);

  return {
    branch: { id: branchId, name: ctx.activeBranchName ?? "Active branch" },
    academicYear: { id: academicYearId, name: ctx.activeAcademicYearName ?? "Active academic year" },
    capabilities: {
      canManageSetup,
      canManageAssessments,
      canEnterMarks: permissions.has("gradebook.marks.enter"),
      canPublish,
      canViewReports: permissions.has("gradebook.report")
    },
    classSections,
    subjects,
    teachers,
    assignments,
    assessments
  };
}

export async function getGradebookAssessmentWorkspace(ctx: TenantContext, assessmentId: string) {
  const scope = await activeGradebookScope(ctx);
  if (!scope) return null;
  const { branchId, academicYearId, permissions } = scope;
  const canManageAny = permissions.has("gradebook.assessment.manage") || permissions.has("gradebook.publish");

  const assessment = await db.gradebookAssessment.findFirst({
    where: {
      id: assessmentId,
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      ...(canManageAny ? {} : assignedTeacherFilter(ctx.userId))
    },
    select: {
      id: true,
      code: true,
      title: true,
      type: true,
      assessmentDate: true,
      maxMarks: true,
      passMarks: true,
      status: true,
      publishedAt: true,
      reopenReason: true,
      cancellationReason: true,
      classSection: { select: { id: true, displayName: true } },
      classSectionSubject: { select: { subject: { select: { code: true, name: true } } } }
    }
  });
  if (!assessment) throw notFound("GRADEBOOK_ASSESSMENT_NOT_FOUND");

  const roster = await db.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      classSectionId: assessment.classSection.id,
      status: "ACTIVE",
      student: { tenantId: ctx.tenantId, branchId, status: "ACTIVE" }
    },
    select: {
      id: true,
      rollNumber: true,
      student: {
        select: {
          admissionNumber: true,
          displayName: true,
          fullName: true,
          firstName: true,
          lastName: true
        }
      },
      gradebookMarks: {
        where: { tenantId: ctx.tenantId, assessmentId: assessment.id },
        select: { status: true, marksObtained: true, remarks: true, enteredAt: true },
        take: 1
      }
    },
    orderBy: [{ rollNumber: "asc" }, { student: { displayName: "asc" } }]
  });

  return {
    assessment,
    roster,
    capabilities: {
      canEnterMarks: permissions.has("gradebook.marks.enter") && assessment.status === "OPEN",
      canPublish: permissions.has("gradebook.publish"),
      canManageAssessment: permissions.has("gradebook.assessment.manage")
    }
  };
}

export async function getGradebookPublishedReports(ctx: TenantContext) {
  const scope = await activeGradebookScope(ctx);
  if (!scope) return null;
  const { branchId, academicYearId, permissions } = scope;
  await requirePermission({ ctx, permission: "gradebook.report", branchId, academicYearId });
  const canViewAll = permissions.has("gradebook.assessment.manage") || permissions.has("gradebook.publish");

  const assessments = await db.gradebookAssessment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      status: "PUBLISHED",
      ...(canViewAll ? {} : assignedTeacherFilter(ctx.userId))
    },
    select: {
      id: true,
      code: true,
      title: true,
      type: true,
      assessmentDate: true,
      maxMarks: true,
      passMarks: true,
      publishedAt: true,
      classSection: { select: { displayName: true } },
      classSectionSubject: { select: { subject: { select: { code: true, name: true } } } },
      marks: {
        where: { tenantId: ctx.tenantId },
        select: { status: true, marksObtained: true }
      }
    },
    orderBy: [{ assessmentDate: "desc" }, { title: "asc" }],
    take: 100
  });

  return assessments;
}

export type GradebookWorkspace = NonNullable<Awaited<ReturnType<typeof getGradebookWorkspace>>>;
export type GradebookAssessmentWorkspace = NonNullable<Awaited<ReturnType<typeof getGradebookAssessmentWorkspace>>>;
