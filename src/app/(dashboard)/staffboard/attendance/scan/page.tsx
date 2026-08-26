import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { StaffAttendanceOperatorScanner } from "@/modules/staffboard-lite/components/attendance/staff-attendance-operator-scanner";
import { StaffAttendanceWorkspaceNav } from "@/modules/staffboard-lite/components/attendance/staff-attendance-workspace-nav";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listStaffAttendanceOperatorBranchOptions } from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";

export default async function StaffQrScanPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.scan")) {
    return (
      <PermissionState
        title="Supervised scanner access required"
        description="Staff cannot scan their own attendance. Present your staff card to an authorised attendance operator."
      />
    );
  }

  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.QR, operation: "WRITE" }
  ], { branchId: ctx.activeBranchId });

  const branchOptions = await listStaffAttendanceOperatorBranchOptions(ctx);
  if (branchOptions.length === 0) return <PermissionState />;
  const defaultBranchId =
    ctx.activeBranchId && branchOptions.some((branch) => branch.id === ctx.activeBranchId)
      ? ctx.activeBranchId
      : branchOptions[0].id;

  return (
    <div data-mobile-qr-scan-page="true" className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader
          eyebrow="Staff Attendance"
          title="Mark Attendance"
          description="Scan each staff card to record check-in or check-out."
        />
      </div>
      <div data-desktop-qr-scan-page="true" className="hidden lg:block">
        <PageHeader
          title="Mark Staff Attendance"
          description="Start a supervised branch session, then scan each staff attendance card."
        />
      </div>
      <StaffAttendanceWorkspaceNav
        active="scan"
        canViewRegister={permissions.has("staffboard.attendance.view")}
        canScan
        canManageCredentials={permissions.has("staffboard.attendance.credential.manage")}
        canReviewAdjustments={permissions.has("staffboard.attendance.adjustment.approve")}
        canViewReports={permissions.has("staffboard.attendance.report")}
        canViewMine={permissions.has("staffboard.attendance.self_view")}
        canViewCard={permissions.has("staffboard.attendance.credential.self_view")}
      />
      <StaffAttendanceOperatorScanner branchOptions={branchOptions} defaultBranchId={defaultBranchId} />
    </div>
  );
}
