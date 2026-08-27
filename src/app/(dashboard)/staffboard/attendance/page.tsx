import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { AppError } from "@/lib/errors";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { ManualStaffAttendanceForm } from "@/modules/staffboard-lite/components/attendance/manual-staff-attendance-form";
import { StaffAttendanceFilters } from "@/modules/staffboard-lite/components/attendance/staff-attendance-filters";
import { StaffAttendanceSummaryCards } from "@/modules/staffboard-lite/components/attendance/staff-attendance-summary-cards";
import { StaffAttendanceTable } from "@/modules/staffboard-lite/components/attendance/staff-attendance-table";
import { StaffAttendanceWorkspaceNav } from "@/modules/staffboard-lite/components/attendance/staff-attendance-workspace-nav";
import { PageHeader, type RouteSearchParams } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listStaffAttendanceForDate } from "@/modules/staffboard-lite/queries";
import { listManualStaffAttendanceOptions } from "@/modules/staffboard-lite/services/staff-attendance-adjustments.service";
import { getStaffAttendanceCaptureSetting } from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";

type StaffAttendancePageProps = { searchParams?: RouteSearchParams };

function searchParamValue(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const trimmed = rawValue?.trim();
  return trimmed ? trimmed : undefined;
}

async function attendanceFilterInput(searchParams?: RouteSearchParams) {
  const params = searchParams ? await searchParams : {};
  return {
    branchId: searchParamValue(params.branchId),
    date: searchParamValue(params.date),
    staffType: searchParamValue(params.staffType),
    status: searchParamValue(params.status),
    search: searchParamValue(params.search),
    page: searchParamValue(params.page),
    pageSize: searchParamValue(params.pageSize)
  };
}

export default async function StaffAttendancePage({ searchParams }: StaffAttendancePageProps) {
  const ctx = await requireAuth();
  await requireAttendanceEntitlements(
    ctx,
    [{ featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }],
    { branchId: ctx.activeBranchId }
  );
  const filters = await attendanceFilterInput(searchParams);
  if (filters.branchId && !ctx.accessibleBranchIds.includes(filters.branchId)) {
    return <PermissionState />;
  }
  let data: Awaited<ReturnType<typeof listStaffAttendanceForDate>>;
  try {
    data = await listStaffAttendanceForDate(ctx, filters);
  } catch (error) {
    if (error instanceof AppError && error.code === "FORBIDDEN_STAFF_ATTENDANCE_BRANCH") {
      return <PermissionState />;
    }
    throw error;
  }
  if (!data.selectedBranchId) return <PermissionState />;

  const permissions = await getEffectivePermissions({ ctx, branchId: data.selectedBranchId });
  const captureSetting = await getStaffAttendanceCaptureSetting(ctx, data.selectedBranchId);
  const canRequestCorrection = permissions.has("staffboard.attendance.adjustment.request");
  const canRecordManually =
    permissions.has("staffboard.attendance.manual") &&
    captureSetting?.staffManualAttendanceEnabled === true;
  const manualOptions = canRecordManually
    ? await listManualStaffAttendanceOptions(ctx, data.selectedBranchId)
    : null;
  const timeZone = safeTimeZone(
    data.branchOptions.find((branch) => branch.id === data.selectedBranchId)?.timezone ?? ctx.timeZone
  );

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader
          eyebrow="Staff Attendance"
          title="Attendance Register"
          description="Review the daily register and submit controlled attendance corrections."
        />
      </div>
      <div className="hidden lg:block">
        <PageHeader
          title="Staff Attendance Register"
          description="Review daily check-in, check-out, working time, attendance status, and pending corrections."
        />
      </div>
      <StaffAttendanceWorkspaceNav
        active="register"
        canViewRegister
        canScan={permissions.has("staffboard.attendance.scan")}
        canManageCredentials={permissions.has("staffboard.attendance.credential.manage")}
        canViewCard={permissions.has("staffboard.attendance.credential.self_view")}
        canReviewAdjustments={permissions.has("staffboard.attendance.adjustment.approve")}
        canViewReports={permissions.has("staffboard.attendance.report")}
        canViewMine={permissions.has("staffboard.attendance.self_view")}
      />
      <StaffAttendanceFilters
        branchOptions={data.branchOptions}
        selectedBranchId={data.selectedBranchId}
        selectedDate={data.selectedDate}
        staffType={filters.staffType}
        status={filters.status}
        search={filters.search}
      />
      <StaffAttendanceSummaryCards summary={data.summary} />
      {manualOptions ? (
        <details className="attendance-glass-panel group p-4">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-950 premium-focus">
            <span>Manual Attendance</span>
            <span className="text-sm font-medium text-slate-500 group-open:hidden">Open form</span>
            <span className="hidden text-sm font-medium text-slate-500 group-open:inline">Close form</span>
          </summary>
          <div className="mt-4 border-t border-slate-200/80 pt-4">
            <ManualStaffAttendanceForm
              branch={manualOptions.branch}
              staff={manualOptions.staff}
              defaultDate={data.selectedDate}
            />
          </div>
        </details>
      ) : null}
      <StaffAttendanceTable
        rows={data.rows}
        canCorrect={canRequestCorrection}
        selectedDate={data.selectedDate}
        totalRows={data.totalRows}
        page={data.page}
        pageSize={data.pageSize}
        timeZone={timeZone}
        filterParams={{
          branchId: data.selectedBranchId,
          staffType: filters.staffType,
          status: filters.status,
          search: filters.search
        }}
      />
    </div>
  );
}
