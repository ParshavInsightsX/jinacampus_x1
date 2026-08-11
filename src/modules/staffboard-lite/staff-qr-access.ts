import { AppError } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { hasPrincipalRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";

export function hasStaffQrOperatorRole(roleCodes: readonly string[] = []) {
  return hasPrincipalRole(roleCodes) || roleCodes.includes("OFFICE_STAFF");
}

export async function requireStaffQrOperatorAccess(ctx: TenantContext, branchId: string) {
  if (!hasStaffQrOperatorRole(ctx.roleCodes ?? [])) {
    throw new AppError("STAFF_QR_OPERATOR_ACCESS_REQUIRED", "STAFF_QR_OPERATOR_ACCESS_REQUIRED", 403);
  }

  await requirePermission({
    ctx,
    permission: "staffboard.attendance.qr.generate",
    branchId
  });
}
