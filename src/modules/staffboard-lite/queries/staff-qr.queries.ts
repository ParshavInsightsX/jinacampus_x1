import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { hasStaffQrOperatorRole, requireStaffQrOperatorAccess } from "@/modules/staffboard-lite/staff-qr-access";

export type StaffQrBranchOption = {
  id: string;
  name: string;
  code: string;
  timezone: string;
};

function isAccessDeniedError(error: unknown) {
  return (
    (error instanceof Error && error.message.startsWith("FORBIDDEN_")) ||
    (error instanceof AppError && error.status === 403)
  );
}

export async function listStaffQrBranchOptions(ctx: TenantContext): Promise<StaffQrBranchOption[]> {
  if (!hasStaffQrOperatorRole(ctx.roleCodes ?? []) || ctx.accessibleBranchIds.length === 0) return [];

  const branches = await db.branch.findMany({
    where: {
      tenantId: ctx.tenantId,
      institutionId: ctx.institutionId ?? undefined,
      id: { in: ctx.accessibleBranchIds },
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      name: true,
      code: true,
      timezone: true,
      attendanceSetting: {
        select: {
          staffQrAttendanceEnabled: true,
          staffAttendanceCaptureMode: true,
          staffSelfScanEnabled: true
        }
      }
    },
    orderBy: [{ name: "asc" }, { code: "asc" }]
  });

  const allowedBranches: StaffQrBranchOption[] = [];
  for (const branch of branches) {
    if (
      !branch.attendanceSetting?.staffQrAttendanceEnabled ||
      branch.attendanceSetting.staffAttendanceCaptureMode !== "HYBRID" ||
      !branch.attendanceSetting.staffSelfScanEnabled
    ) continue;
    try {
      await requireStaffQrOperatorAccess(ctx, branch.id);
      await requireAttendanceEntitlements(ctx, [
        { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
        { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.QR, operation: "WRITE" }
      ], { branchId: branch.id });
      allowedBranches.push(branch);
    } catch (error) {
      if (isAccessDeniedError(error)) continue;
      throw error;
    }
  }

  return allowedBranches;
}
