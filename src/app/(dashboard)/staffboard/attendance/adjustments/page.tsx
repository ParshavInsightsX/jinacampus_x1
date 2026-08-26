import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { StaffAttendanceAdjustmentReview } from "@/modules/staffboard-lite/components/attendance/staff-attendance-adjustment-review";
import { StaffAttendanceWorkspaceNav } from "@/modules/staffboard-lite/components/attendance/staff-attendance-workspace-nav";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listStaffAttendanceBranchOptions } from "@/modules/staffboard-lite/queries";
import { listPendingStaffAttendanceAdjustments } from "@/modules/staffboard-lite/services/staff-attendance-adjustments.service";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function StaffAttendanceAdjustmentsPage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.adjustment.approve")) return <PermissionState />;
  const params = searchParams ? await searchParams : {};
  const requestedBranchId = typeof params.branchId === "string" ? params.branchId : undefined;
  const branches = await listStaffAttendanceBranchOptions(ctx);
  const selectedBranch = branches.find((branch) => branch.id === requestedBranchId)
    ?? branches.find((branch) => branch.id === ctx.activeBranchId)
    ?? branches[0];
  if (!selectedBranch) return <PermissionState />;
  const rows = await listPendingStaffAttendanceAdjustments(ctx, { branchId: selectedBranch.id });
  const timeZone = safeTimeZone(selectedBranch.timezone ?? ctx.timeZone);

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden"><MobilePageHeader eyebrow="Staff Attendance" title="Attendance Corrections" description="Review and decide pending attendance requests." /></div>
      <div className="hidden lg:block"><PageHeader title="Attendance Corrections" description="Verify manual attendance and correction requests. The requester cannot approve their own request." /></div>
      <StaffAttendanceWorkspaceNav
        active="adjustments"
        canViewRegister={permissions.has("staffboard.attendance.view")}
        canScan={permissions.has("staffboard.attendance.scan")}
        canManageCredentials={permissions.has("staffboard.attendance.credential.manage")}
        canViewCard={permissions.has("staffboard.attendance.credential.self_view")}
        canReviewAdjustments
        canViewReports={permissions.has("staffboard.attendance.report")}
        canViewMine={permissions.has("staffboard.attendance.self_view")}
      />
      {branches.length > 1 ? (
        <form method="get" className="attendance-glass-bar flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-2 text-sm font-medium text-slate-800">Branch<select name="branchId" defaultValue={selectedBranch.id} className="min-h-11">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}</select></label>
          <button type="submit" className="premium-secondary-button min-h-11 w-full premium-focus sm:w-auto">View Requests</button>
        </form>
      ) : null}
      <StaffAttendanceAdjustmentReview rows={rows} timeZone={timeZone} />
    </div>
  );
}