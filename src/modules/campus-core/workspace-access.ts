import type { PermissionCode } from "@/lib/rbac/permissions";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { getAttendanceEntitlementState } from "@/modules/campus-core/entitlements/service";
import type { SchoolWorkspaceFeatures } from "@/modules/campus-core/workspaces";

function hasAttendancePermission(permissions: ReadonlySet<PermissionCode>) {
  return Array.from(permissions).some(
    (permission) =>
      permission.startsWith("academia.attendance.") ||
      permission.startsWith("staffboard.attendance.")
  );
}

export async function getSchoolWorkspaceAccess(ctx: TenantContext) {
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  const features: SchoolWorkspaceFeatures = {
    attendance: {
      studentAttendance: false,
      staffAttendance: false,
      marking: false,
      qrRead: false,
      qrWrite: false,
      reports: false
    }
  };

  if (hasAttendancePermission(permissions)) {
    const state = await getAttendanceEntitlementState(ctx, { branchId: ctx.activeBranchId });
    features.attendance = {
      studentAttendance: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE].read,
      staffAttendance: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE].read,
      marking: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.MARKING].write,
      qrRead: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.QR].read,
      qrWrite: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.QR].write,
      reports: state.features[ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS].read
    };
  }

  return { permissions, features };
}
