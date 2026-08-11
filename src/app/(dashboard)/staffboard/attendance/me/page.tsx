import Link from "next/link";
import { Clock3, History, QrCode } from "lucide-react";
import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getUserSafeErrorMessage } from "@/lib/errors";
import { getMobileStaffAttendanceStatus } from "@/lib/mobile-api/staff-attendance";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import type { StaffQrScanActionData } from "@/modules/staffboard-lite/actions/staff-qr-scan.actions";
import { StaffQrScanResult } from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-result";
import {
  formatStaffAttendanceStatus,
  formatStaffScanDateTime
} from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-state";
import { StaffQrSelfNavigation } from "@/modules/staffboard-lite/components/attendance/staff-qr-self-navigation";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listMyStaffAttendanceHistory } from "@/modules/staffboard-lite/queries/staff-attendance.queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function confirmationResult(
  attendance: Awaited<ReturnType<typeof getMobileStaffAttendanceStatus>>["attendance"],
  scan: string | undefined,
  purpose: string | undefined
): StaffQrScanActionData | null {
  if (!attendance || scan !== "success" || (purpose !== "CHECK_IN" && purpose !== "CHECK_OUT")) return null;
  if (purpose === "CHECK_IN" && !attendance.checkInAt) return null;
  if (purpose === "CHECK_OUT" && !attendance.checkOutAt) return null;

  return {
    success: true,
    purpose,
    attendanceDate: attendance.attendanceDate,
    status: attendance.status,
    message: purpose === "CHECK_IN" ? "Check-in recorded successfully." : "Check-out recorded successfully.",
    ...(attendance.checkInAt ? { checkInAt: attendance.checkInAt } : {}),
    ...(attendance.checkOutAt ? { checkOutAt: attendance.checkOutAt } : {}),
    ...(typeof attendance.workingMinutes === "number" ? { workingMinutes: attendance.workingMinutes } : {})
  };
}

export default async function MyStaffAttendancePage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  const canScan = permissions.has("staffboard.attendance.self_scan");
  const canViewAttendance = permissions.has("staffboard.attendance.self_view");

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
        <StaffQrSelfNavigation active="today" canScan={canScan} canViewAttendance={canViewAttendance} />
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
  const userName = ctx.userName ?? ctx.userEmail;
  const confirmation = confirmationResult(
    attendance,
    stringParam(params.scan),
    stringParam(params.purpose)
  );

  return (
    <div className="space-y-6">
      <MobilePageHeader
        eyebrow="Staff attendance"
        title={confirmation ? "Attendance confirmed" : "My Attendance"}
        description="Review today's record and your recent attendance history."
      />
      <div className="hidden lg:block">
        <PageHeader title="My Attendance" description="Review today's record and your recent staff attendance history." />
      </div>

      <StaffQrSelfNavigation active="today" canScan={canScan} canViewAttendance={canViewAttendance} />

      {confirmation ? (
        <StaffQrScanResult
          result={confirmation}
          userName={userName}
          institutionName={institutionName}
          branchName={branchName}
          timeZone={ctx.timeZone}
        />
      ) : null}

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft sm:p-5" aria-labelledby="today-attendance-title">
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
            description="Scan the active school QR when you are ready to check in."
            actionLabel={canScan ? "Scan attendance QR" : undefined}
            actionHref={canScan ? "/staffboard/attendance/scan" : undefined}
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
        className="scroll-mt-24 rounded-lg border border-slate-200 bg-white p-4 shadow-soft sm:p-5"
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
              <article key={record.attendanceDate} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
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
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:flex">
        {canScan ? (
          <Link href="/staffboard/attendance/scan" className="premium-primary-button min-h-11 w-full premium-focus sm:w-auto">
            Scan another QR
          </Link>
        ) : null}
        <Link href="/account/change-password" className="premium-secondary-button min-h-11 w-full premium-focus sm:w-auto">
          Account and passkeys
        </Link>
      </div>
    </div>
  );
}
