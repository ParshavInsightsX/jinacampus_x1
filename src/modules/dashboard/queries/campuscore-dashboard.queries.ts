import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { activeBranchFilter, resolveDashboardScope } from "./shared";

export type CampusCoreDashboardMetrics = {
  totalBranches: number;
  activeAcademicYearId: string | null;
  activeAcademicYearName: string | null;
  totalUsers: number;
  totalActiveRoles: number;
};

export async function getCampusCoreDashboardMetrics(
  ctx: TenantContext,
  input: unknown = {}
): Promise<CampusCoreDashboardMetrics> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);

  const [totalBranches, activeAcademicYear] = await Promise.all([
    db.branch.count({
      where: {
        tenantId: ctx.tenantId,
        id: branchFilter,
        status: "ACTIVE"
      }
    }),
    db.academicYear.findFirst({
      where: {
        tenantId: ctx.tenantId,
        isActive: true,
        status: "ACTIVE"
      },
      select: {
        id: true,
        name: true
      },
      orderBy: { startDate: "desc" }
    })
  ]);
  const [totalUsers, totalActiveRoles] = await Promise.all([
    db.user.count({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        OR: [
          { id: ctx.userId },
          {
            branchAccesses: {
              some: {
                tenantId: ctx.tenantId,
                isActive: true,
                branchId: branchFilter
              }
            }
          }
        ]
      }
    }),
    db.role.count({
      where: {
        tenantId: ctx.tenantId,
        isActive: true
      }
    })
  ]);

  return {
    totalBranches,
    activeAcademicYearId: activeAcademicYear?.id ?? null,
    activeAcademicYearName: activeAcademicYear?.name ?? null,
    totalUsers,
    totalActiveRoles
  };
}
