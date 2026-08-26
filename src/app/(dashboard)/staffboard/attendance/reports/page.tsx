import Link from "next/link";
import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { PermissionState } from "@/components/ui/empty-state";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { StaffAttendanceReportFilters } from "@/modules/staffboard-lite/components/attendance/staff-attendance-report-filters";
import {
  StaffCorrectionReportTable,
  StaffMonthlySummaryTable,
  NamedStaffAttendanceRowsTable
} from "@/modules/staffboard-lite/components/attendance/staff-attendance-report-tables";
import {
  currentIndiaMonthYear,
  monthStartIndiaDateString,
  todayIndiaDateString
} from "@/modules/staffboard-lite/components/attendance/staff-attendance-report-state";
import { StaffAttendanceWorkspaceNav } from "@/modules/staffboard-lite/components/attendance/staff-attendance-workspace-nav";
import { PageHeader, type RouteSearchParams } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { getStaffAttendanceReportsPageData } from "@/modules/staffboard-lite/queries";
import { staffboardRoutes } from "@/modules/staffboard-lite/ui-config";

type StaffAttendanceReportsPageProps = { searchParams?: RouteSearchParams };

function searchParamValue(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const trimmed = rawValue?.trim();
  return trimmed ? trimmed : undefined;
}

async function reportFilters(searchParams: RouteSearchParams | undefined, timeZone: string) {
  const params = searchParams ? await searchParams : {};
  const currentMonthYear = currentIndiaMonthYear(timeZone);
  return {
    branchId: searchParamValue(params.branchId),
    date: searchParamValue(params.date) ?? todayIndiaDateString(timeZone),
    fromDate: searchParamValue(params.fromDate) ?? monthStartIndiaDateString(timeZone),
    toDate: searchParamValue(params.toDate) ?? todayIndiaDateString(timeZone),
    staffType: searchParamValue(params.staffType),
    status: searchParamValue(params.status),
    department: searchParamValue(params.department),
    search: searchParamValue(params.search),
    month: searchParamValue(params.month) ?? String(currentMonthYear.month),
    year: searchParamValue(params.year) ?? String(currentMonthYear.year),
    page: searchParamValue(params.page),
    pageSize: searchParamValue(params.pageSize)
  };
}

export default async function StaffAttendanceReportsPage({ searchParams }: StaffAttendanceReportsPageProps) {
  const ctx = await requireAuth();
  await requireAttendanceEntitlements(
    ctx,
    [
      { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
      { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "READ" }
    ],
    { branchId: ctx.activeBranchId }
  );
  const activePermissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!activePermissions.has("staffboard.attendance.report")) return <PermissionState />;
  const filters = await reportFilters(searchParams, safeTimeZone(ctx.timeZone));
  if (filters.branchId && !ctx.accessibleBranchIds.includes(filters.branchId)) {
    return <PermissionState />;
  }
  const data = await getStaffAttendanceReportsPageData(ctx, filters);
  if (!data.selectedBranchId) return <PermissionState />;
  const permissions = await getEffectivePermissions({ ctx, branchId: data.selectedBranchId });
  const timeZone = safeTimeZone(
    data.branchOptions.find((branch) => branch.id === data.selectedBranchId)?.timezone ?? ctx.timeZone
  );

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader
          eyebrow="Staff Attendance"
          title="Attendance Reports"
          description="Review daily, monthly, late-arrival, half-day, and correction records."
        />
      </div>
      <div className="hidden lg:flex lg:items-start lg:justify-between lg:gap-4">
        <PageHeader
          title="Staff Attendance Reports"
          description="Review branch-scoped daily and monthly attendance, working time, exceptions, and approved corrections."
        />
        <Link href={staffboardRoutes.attendance} className="premium-secondary-button premium-focus">
          Attendance Register
        </Link>
      </div>
      <StaffAttendanceWorkspaceNav
        active="reports"
        canViewRegister={permissions.has("staffboard.attendance.view")}
        canScan={permissions.has("staffboard.attendance.scan")}
        canManageCredentials={permissions.has("staffboard.attendance.credential.manage")}
        canViewCard={permissions.has("staffboard.attendance.credential.self_view")}
        canReviewAdjustments={permissions.has("staffboard.attendance.adjustment.approve")}
        canViewReports
        canViewMine={permissions.has("staffboard.attendance.self_view")}
      />
      <StaffAttendanceReportFilters
        branchOptions={data.branchOptions}
        selectedBranchId={data.selectedBranchId}
        date={filters.date}
        fromDate={filters.fromDate}
        toDate={filters.toDate}
        staffType={filters.staffType}
        status={filters.status}
        department={filters.department}
        search={filters.search}
        month={Number(filters.month)}
        year={Number(filters.year)}
      />
      <NamedStaffAttendanceRowsTable
        title="Daily Attendance"
        description="Staff attendance records for the selected date."
        emptyTitle="No daily attendance records"
        emptyDescription="Recorded check-in, check-out, approved manual attendance, and leave or calendar statuses will appear here."
        rows={data.dailyRows}
        timeZone={timeZone}
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <NamedStaffAttendanceRowsTable
          title="Teaching Staff Attendance"
          description="Date-range attendance records for teachers."
          emptyTitle="No teaching staff attendance"
          emptyDescription="Teacher attendance records for the selected date range will appear here."
          rows={data.teacherRows}
          timeZone={timeZone}
        />
        <NamedStaffAttendanceRowsTable
          title="Other Staff Attendance"
          description="Date-range attendance records for non-teaching staff."
          emptyTitle="No other staff attendance"
          emptyDescription="Non-teaching staff attendance records for the selected date range will appear here."
          rows={data.nonTeachingRows}
          timeZone={timeZone}
        />
      </div>
      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <NamedStaffAttendanceRowsTable
          title="Late Arrival Report"
          description="Attendance records marked Late Arrival in the selected date range."
          emptyTitle="No late arrivals"
          emptyDescription="Late-arrival records for the selected filters will appear here."
          rows={data.lateRows}
          timeZone={timeZone}
        />
        <NamedStaffAttendanceRowsTable
          title="Half Day Report"
          description="Attendance records marked Half Day in the selected date range."
          emptyTitle="No half-day records"
          emptyDescription="Half-day records for the selected filters will appear here."
          rows={data.halfDayRows}
          timeZone={timeZone}
        />
      </div>
      <StaffMonthlySummaryTable rows={data.monthlyRows} />
      <StaffCorrectionReportTable rows={data.correctionRows} timeZone={timeZone} />
    </div>
  );
}
