import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { promotionWorkspaceSchema } from "@/modules/academia/schemas";

export async function getStudentPromotionWorkspace(ctx: TenantContext, input: unknown = {}) {
  const params = promotionWorkspaceSchema.parse(input);
  const branchId = ctx.activeBranchId;
  if (!branchId || !ctx.accessibleBranchIds.includes(branchId)) return null;
  await requirePermission({ ctx, permission: "academia.promotion.manage", branchId });

  const branch = await db.branch.findFirst({
    where: { id: branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true, name: true, institutionId: true }
  });
  if (!branch) return null;

  const academicYears = await db.academicYear.findMany({
    where: {
      tenantId: ctx.tenantId,
      institutionId: branch.institutionId,
      status: { not: "ARCHIVED" }
    },
    select: { id: true, name: true, startDate: true, endDate: true, status: true, isActive: true },
    orderBy: { startDate: "asc" }
  });
  const sourceAcademicYear = params.sourceAcademicYearId
    ? academicYears.find((year) => year.id === params.sourceAcademicYearId)
    : academicYears.find((year) => year.id === ctx.activeAcademicYearId) ?? academicYears.at(-1);
  if (params.sourceAcademicYearId && !sourceAcademicYear) throw notFound("PROMOTION_SOURCE_ACADEMIC_YEAR_NOT_FOUND");

  const targetAcademicYear = params.targetAcademicYearId
    ? academicYears.find((year) => year.id === params.targetAcademicYearId)
    : academicYears.find((year) => sourceAcademicYear && year.startDate > sourceAcademicYear.startDate);
  if (params.targetAcademicYearId && !targetAcademicYear) throw notFound("PROMOTION_TARGET_ACADEMIC_YEAR_NOT_FOUND");

  const academicYearIds = academicYears.map((year) => year.id);
  const classSections = academicYearIds.length > 0
    ? await db.classSection.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId,
          academicYearId: { in: academicYearIds },
          status: "ACTIVE"
        },
        select: {
          id: true,
          academicYearId: true,
          classId: true,
          sectionId: true,
          displayName: true,
          capacity: true,
          academicClass: { select: { name: true, sortOrder: true } },
          section: { select: { name: true, sortOrder: true } }
        },
        orderBy: [
          { academicClass: { sortOrder: "asc" } },
          { section: { sortOrder: "asc" } },
          { displayName: "asc" }
        ]
      })
    : [];
  const sourceClassSections = classSections.filter(
    (classSection) => classSection.academicYearId === sourceAcademicYear?.id
  );
  const sourceClassSection = params.sourceClassSectionId
    ? sourceClassSections.find((classSection) => classSection.id === params.sourceClassSectionId)
    : undefined;
  if (params.sourceClassSectionId && !sourceClassSection) {
    throw notFound("PROMOTION_SOURCE_CLASS_SECTION_NOT_FOUND");
  }

  const roster = sourceClassSection
    ? await db.enrollment.findMany({
        where: {
          tenantId: ctx.tenantId,
          branchId,
          academicYearId: sourceAcademicYear?.id,
          classSectionId: sourceClassSection.id,
          status: "ACTIVE",
          student: { status: "ACTIVE" }
        },
        select: {
          id: true,
          studentId: true,
          rollNumber: true,
          student: {
            select: {
              admissionNumber: true,
              displayName: true,
              fullName: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: [{ rollNumber: "asc" }, { student: { displayName: "asc" } }]
      })
    : [];
  const processedItems = roster.length > 0
    ? await db.studentPromotionItem.findMany({
        where: {
          tenantId: ctx.tenantId,
          sourceEnrollmentId: { in: roster.map((enrollment) => enrollment.id) },
          selected: true,
          batch: { status: "COMPLETED" }
        },
        select: { sourceEnrollmentId: true, outcome: true }
      })
    : [];
  const processedByEnrollment = new Map(processedItems.map((item) => [item.sourceEnrollmentId, item.outcome]));

  const recentBatches = await db.studentPromotionBatch.findMany({
    where: { tenantId: ctx.tenantId, branchId },
    select: {
      id: true,
      status: true,
      effectiveDate: true,
      selectedCount: true,
      excludedCount: true,
      outcomeSummary: true,
      createdAt: true,
      reversedAt: true,
      sourceAcademicYear: { select: { name: true } },
      targetAcademicYear: { select: { name: true } },
      sourceClassSection: { select: { displayName: true } },
      defaultTargetClassSection: { select: { displayName: true } },
      createdBy: { select: { displayName: true, firstName: true, lastName: true, email: true } },
      reversedBy: { select: { displayName: true, firstName: true, lastName: true, email: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return {
    branch,
    academicYears,
    sourceAcademicYearId: sourceAcademicYear?.id ?? null,
    targetAcademicYearId: targetAcademicYear?.id ?? null,
    allClassSections: classSections,
    sourceClassSection: sourceClassSection ?? null,
    roster: roster.map((enrollment) => ({
      ...enrollment,
      studentName: enrollment.student.displayName ?? enrollment.student.fullName ??
        [enrollment.student.firstName, enrollment.student.lastName].filter(Boolean).join(" "),
      processedOutcome: processedByEnrollment.get(enrollment.id) ?? null
    })),
    recentBatches
  };
}

export type StudentPromotionWorkspace = NonNullable<Awaited<ReturnType<typeof getStudentPromotionWorkspace>>>;
