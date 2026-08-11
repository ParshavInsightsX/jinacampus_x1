import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { calendarDateKey } from "./calendar-utils";

export async function getAcademicCalendarPageData(ctx: TenantContext) {
  await requirePermission({
    ctx,
    permission: "campuscore.calendar.manage",
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  });
  if (!ctx.accessibleBranchIds.length) return { institutions: [], entries: [] };

  const [institutions, entries] = await Promise.all([
    db.institution.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: { not: "ARCHIVED" },
        branches: {
          some: {
            tenantId: ctx.tenantId,
            id: { in: ctx.accessibleBranchIds },
            status: "ACTIVE"
          }
        }
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        branches: {
          where: { tenantId: ctx.tenantId, status: "ACTIVE" },
          select: { id: true, name: true, code: true },
          orderBy: { name: "asc" }
        },
        academicYears: {
          where: { tenantId: ctx.tenantId, status: { not: "ARCHIVED" } },
          select: { id: true, name: true, startDate: true, endDate: true, isActive: true },
          orderBy: { startDate: "desc" }
        }
      },
      orderBy: { name: "asc" }
    }),
    db.academicCalendarEntry.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { branchId: { in: ctx.accessibleBranchIds } },
          {
            branchId: null,
            institution: {
              tenantId: ctx.tenantId,
              branches: {
                some: {
                  tenantId: ctx.tenantId,
                  id: { in: ctx.accessibleBranchIds },
                  status: "ACTIVE"
                }
              }
            }
          }
        ]
      },
      select: {
        id: true,
        institutionId: true,
        branchId: true,
        academicYearId: true,
        entryType: true,
        name: true,
        description: true,
        startDate: true,
        endDate: true,
        audiences: true,
        status: true,
        cancellationReason: true,
        cancelledAt: true,
        institution: { select: { name: true, displayName: true } },
        branch: { select: { name: true, code: true } },
        academicYear: { select: { name: true } },
        _count: { select: { staffAttendanceRecords: true } }
      },
      orderBy: [{ startDate: "desc" }, { name: "asc" }],
      take: 500
    })
  ]);

  return {
    institutions: institutions.map((institution) => {
      const accessibleBranches = institution.branches.filter((branch) => ctx.accessibleBranchIds.includes(branch.id));
      return {
        id: institution.id,
        name: institution.displayName ?? institution.name,
        branches: accessibleBranches,
        canManageAllBranches: accessibleBranches.length === institution.branches.length,
        academicYears: institution.academicYears.map((year) => ({
          ...year,
          startDate: calendarDateKey(year.startDate),
          endDate: calendarDateKey(year.endDate)
        }))
      };
    }),
    entries: entries.map((entry) => ({
      ...entry,
      canManage: entry.branchId
        ? ctx.accessibleBranchIds.includes(entry.branchId)
        : institutions.find((institution) => institution.id === entry.institutionId)?.branches
          .every((branch) => ctx.accessibleBranchIds.includes(branch.id)) ?? false,
      institutionName: entry.institution.displayName ?? entry.institution.name,
      branchName: entry.branch ? `${entry.branch.name} (${entry.branch.code})` : "All branches",
      academicYearName: entry.academicYear.name,
      startDate: calendarDateKey(entry.startDate),
      endDate: calendarDateKey(entry.endDate),
      cancelledAt: entry.cancelledAt?.toISOString() ?? null,
      generatedStaffRecordCount: entry._count.staffAttendanceRecords
    }))
  };
}
