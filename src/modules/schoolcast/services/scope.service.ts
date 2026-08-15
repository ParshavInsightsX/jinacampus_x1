import { db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";

export async function resolveSchoolCastScope(
  ctx: TenantContext,
  requestedBranchId?: string | null,
  requestedAcademicYearId?: string | null
) {
  const branchId = requestedBranchId ?? ctx.activeBranchId;
  const academicYearId = requestedAcademicYearId ?? ctx.activeAcademicYearId;
  if (!branchId || !academicYearId || !ctx.institutionId) throw notFound("SCHOOLCAST_SCOPE_NOT_READY");
  if (!ctx.accessibleBranchIds.includes(branchId)) throw forbidden("FORBIDDEN_BRANCH_ACCESS");

  const [branch, academicYear] = await Promise.all([
    db.branch.findFirst({
      where: {
        id: branchId,
        tenantId: ctx.tenantId,
        institutionId: ctx.institutionId,
        status: "ACTIVE"
      },
      select: { id: true, institutionId: true, timezone: true, name: true }
    }),
    db.academicYear.findFirst({
      where: {
        id: academicYearId,
        tenantId: ctx.tenantId,
        institutionId: ctx.institutionId
      },
      select: { id: true, institutionId: true, name: true, isActive: true }
    })
  ]);

  if (!branch || !academicYear || academicYear.institutionId !== branch.institutionId) {
    throw notFound("SCHOOLCAST_SCOPE_NOT_FOUND");
  }

  return {
    tenantId: ctx.tenantId,
    institutionId: branch.institutionId,
    branchId: branch.id,
    academicYearId: academicYear.id,
    timeZone: branch.timezone || ctx.timeZone,
    branchName: branch.name,
    academicYearName: academicYear.name
  };
}