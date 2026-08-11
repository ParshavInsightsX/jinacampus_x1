import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { hasStaffQrOperatorRole, requireStaffQrOperatorAccess } from "@/modules/staffboard-lite/staff-qr-access";

export type StaffQrBranchOption = {
  id: string;
  name: string;
  code: string;
  timezone: string;
};

function isForbiddenPermissionError(error: unknown) {
  return error instanceof Error && error.message.startsWith("FORBIDDEN_");
}

export async function listStaffQrBranchOptions(ctx: TenantContext): Promise<StaffQrBranchOption[]> {
  if (!hasStaffQrOperatorRole(ctx.roleCodes ?? []) || ctx.accessibleBranchIds.length === 0) return [];

  const branches = await db.branch.findMany({
    where: {
      tenantId: ctx.tenantId,
      id: { in: ctx.accessibleBranchIds },
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true
    },
    orderBy: [{ name: "asc" }, { code: "asc" }]
  });

  const allowedBranches: StaffQrBranchOption[] = [];
  for (const branch of branches) {
    try {
      await requireStaffQrOperatorAccess(ctx, branch.id);
      allowedBranches.push(branch);
    } catch (error) {
      if (isForbiddenPermissionError(error)) continue;
      throw error;
    }
  }

  return allowedBranches;
}
