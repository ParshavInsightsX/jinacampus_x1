import Link from "next/link";
import { Clock3, History, IdCard, QrCode } from "lucide-react";
import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { getUserSafeErrorMessage } from "@/lib/errors";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { getMobileStaffAttendanceStatus } from "@/lib/mobile-api/staff-attendance";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { StaffAttendanceCorrectionForm } from "@/modules/staffboard-lite/components/attendance/staff-attendance-correction-form";
import {
  formatStaffAttendanceStatus,
  formatStaffScanDateTime
} from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-state";
import { StaffQrSelfNavigation } from "@/modules/staffboard-lite/components/attendance/staff-qr-self-navigation";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listMyStaffAttendanceHistory } from "@/modules/staffboard-lite/queries/staff-attendance.queries";

export default async function MyStaffAttendancePage() {
  const ctx = await requireAuth();
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" }
  ], { branchId: ctx.activeBranchId });
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  const canViewCard = permissions.has("staffboard.attendance.credential.self_view");
  const canViewAttendance = permissions.has("staffboard.attendance.self_view");
  const canRequestCorrection = permissions.has("staffboard.attendance.adjustment.request");

  let result;
  let history;
  try {
    [result, history] = await Promise.all([
      getMobileStaffAttendanceStatus(ctx),
      listMyStaffAttendanceHistory(ctx)
    ]);
  } catch (error) {
    return (
      <div className="space-y-6">
        <MobilePageHeader eyebrow="Staff attendance" title="My Attendance" description="Your own attendance records." />
        <div className="hidden lg:block">
          <PageHeader title="My Attendance" description="Your own staff attendance records." />
        </div>
        <StaffQrSelfNavigation active="today" canViewCard={canViewCard} canViewAttendance={canViewAttendance} />
        <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-900">
          {getUserSafeErrorMessage(error, "Unable to load your attendance.")}
        </p>
      </div>
    );
  }

  const attendance = result.attendance;
  const institutionName =
    ctx.institutionDisplayName ?? ctx.institutionName ?? ctx.tenantName ?? "Your institution";
  const branchName = ctx.activeBranchName ?? ctx.activeBranchCode ?? "Assigned branch";


  return (
    <div className="attendance-page-wash space-y-6 rounded-lg p-1 sm:p-2">
      <MobilePageHeader
        eyebrow="Staff attendance"
        title="My Attendance"
        description="Review today's record and your recent attendance history."
      />
      <div className="hidden lg:block">
        <PageHeader title="My Attendance" description="Review today's record and your recent staff attendance history." />
      </div>

      <StaffQrSelfNavigation active="today" canViewCard={canViewCard} canViewAttendance={canViewAttendance} />


      <section className="attendance-glass-panel p-4 sm:p-5" aria-labelledby="today-attendance-title">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
            <QrCode className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="today-attendance-title" className="font-semibold text-slate-950">Today's attendance</h2>
            <p className="text-sm text-slate-500">{branchName} · {institutionName}</p>
          </div>
        </div>

        {!attendance ? (
          <EmptyState
            title="No attendance recorded yet today"
            description="Your record will appear after an authorised attendance operator scans your staff card or marks attendance."
            actionLabel={canViewCard ? "Open My Staff Card" : undefined}
            actionHref={canViewCard ? "/staffboard/attendance/card" : undefined}
          />
        ) : (
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
              <dd className="mt-2 text-lg font-semibold text-slate-950">
                {formatStaffAttendanceStatus(attendance.status)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <dt className="text-xs font-semibold uppercase text-slate-500">Check in</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">
                {formatStaffScanDateTime(attendance.checkInAt, ctx.timeZone)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <dt className="text-xs font-semibold uppercase text-slate-500">Check out</dt>
              <dd className="mt-2 text-sm font-semibold text-slate-950">
                {formatStaffScanDateTime(attendance.checkOutAt, ctx.timeZone)}
              </dd>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
              <dt className="text-xs font-semibold uppercase text-slate-500">Working minutes</dt>
              <dd className="mt-2 text-lg font-semibold text-slate-950">
                {attendance.workingMinutes ?? "Pending"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <section
        id="attendance-history"
        className="attendance-glass-panel scroll-mt-24 p-4 sm:p-5"
        aria-labelledby="attendance-history-title"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-cyan-50 text-cyan-700">
            <History className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="attendance-history-title" className="font-semibold text-slate-950">Recent attendance</h2>
            <p className="text-sm text-slate-500">Your latest 14 attendance records.</p>
          </div>
        </div>

        {history.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-600">
            No attendance history is available yet.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {history.map((record) => (
              <article key={record.attendanceRecordId} className="attendance-glass-inset p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">{record.attendanceDate}</p>
                    <p className="mt-1 text-sm text-slate-600">{formatStaffAttendanceStatus(record.status)}</p>
                  </div>
                  <Clock3 className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Check in</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {formatStaffScanDateTime(record.checkInAt, ctx.timeZone)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase text-slate-500">Check out</dt>
                    <dd className="mt-1 font-medium text-slate-800">
                      {formatStaffScanDateTime(record.checkOutAt, ctx.timeZone)}
                    </dd>
                  </div>
                </dl>
                {record.reviewState === "PENDING" || record.lifecycle === "REVIEW_REQUIRED" ? (
                  <p className="mt-3 text-sm font-semibold text-amber-800">Correction pending review</p>
                ) : null}
                {canRequestCorrection && !record.calendarManaged && record.lifecycle !== "LOCKED" ? (
                  <div className="mt-4 border-t border-slate-200/80 pt-4">
                    <StaffAttendanceCorrectionForm
                      attendanceRecordId={record.attendanceRecordId}
                      employeeCode={record.employeeCode}
                      staffName={record.staffName}
                      attendanceDate={record.attendanceDate}
                      currentStatus={record.status}
                      checkInAt={record.checkInAt}
                      checkOutAt={record.checkOutAt}
                      workingMinutes={record.workingMinutes}
                      correctionReason={record.correctionReason}
                      timeZone={safeTimeZone(ctx.timeZone)}
                    />
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:flex">
        {canViewCard ? (
          <Link href="/staffboard/attendance/card" className="premium-primary-button min-h-11 w-full gap-2 premium-focus sm:w-auto">
            <IdCard className="h-4 w-4" aria-hidden="true" />
            Open My Staff Card
          </Link>
        ) : null}
        <Link href="/account/change-password" className="premium-secondary-button min-h-11 w-full premium-focus sm:w-auto">
          Account and passkeys
        </Link>
      </div>
    </div>
  );
}
