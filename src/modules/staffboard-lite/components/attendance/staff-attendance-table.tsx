import { NoResultsState } from "@/components/ui/empty-state";
import { PaginationControls, StatusBadge, TableToolbar } from "@/components/ui/table-primitives";
import { TableShell } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import type { StaffAttendanceAdminRow } from "@/modules/staffboard-lite/queries";
import {
  formatStaffAttendanceDateTime,
  formatStaffAttendanceLabel,
  formatWorkingMinutes
} from "./staff-attendance-admin-state";
import { StaffAttendanceCorrectionForm } from "./staff-attendance-correction-form";

type StaffAttendanceTableProps = {
  rows: StaffAttendanceAdminRow[];
  canCorrect: boolean;
  selectedDate: string;
  totalRows: number;
  page: number;
  pageSize: number;
  timeZone: string;
  filterParams?: { branchId?: string | null; staffType?: string; status?: string; search?: string };
};

const columns = ["Employee", "Staff Member", "Category", "Status", "Check-In", "Check-Out", "Working Time", "Review", "Actions"] as const;

function CorrectionAction({ row, canCorrect, selectedDate, timeZone }: { row: StaffAttendanceAdminRow; canCorrect: boolean; selectedDate: string; timeZone: string }) {
  if (!canCorrect) return <span className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500">View Only</span>;
  if (!row.attendanceRecordId) return <span className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-500">Use Manual Entry</span>;
  if (row.calendarManaged) return <span className="inline-flex min-h-11 items-center rounded-lg border border-cyan-200 bg-cyan-50 px-3 text-xs font-medium text-cyan-800">Calendar Managed</span>;
  return <StaffAttendanceCorrectionForm attendanceRecordId={row.attendanceRecordId} employeeCode={row.employeeCode} staffName={row.staffName} attendanceDate={selectedDate} currentStatus={row.status} checkInAt={row.checkInAt} checkOutAt={row.checkOutAt} workingMinutes={row.workingMinutes} correctionReason={row.correctionReason} timeZone={timeZone} />;
}

function ReviewState({ row }: { row: StaffAttendanceAdminRow }) {
  if (row.reviewState === "PENDING" || row.lifecycle === "REVIEW_REQUIRED") return <span className="inline-flex min-h-8 items-center rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-semibold text-amber-800">Pending Review</span>;
  if (row.reviewState === "APPROVED") return <span className="inline-flex min-h-8 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-800">Approved</span>;
  if (row.lifecycle === "LOCKED") return <span className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-slate-100 px-3 text-xs font-semibold text-slate-700">Locked</span>;
  return <span className="text-xs font-medium text-slate-500">No Review Needed</span>;
}

export function StaffAttendanceTable({ rows, canCorrect, selectedDate, totalRows, page, pageSize, timeZone, filterParams }: StaffAttendanceTableProps) {
  if (rows.length === 0) return <NoResultsState title="No staff attendance found" description="Try another date, status, staff category, branch, or search term." />;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  function hrefForPage(nextPage: number) {
    const params = new URLSearchParams();
    params.set("date", selectedDate);
    if (filterParams?.branchId) params.set("branchId", filterParams.branchId);
    if (filterParams?.staffType) params.set("staffType", filterParams.staffType);
    if (filterParams?.status) params.set("status", filterParams.status);
    if (filterParams?.search) params.set("search", filterParams.search);
    params.set("page", String(nextPage));
    params.set("pageSize", String(pageSize));
    return `/staffboard/attendance?${params.toString()}`;
  }

  return (
    <section className="space-y-3" aria-labelledby="staff-attendance-table-title">
      <TableToolbar id="staff-attendance-table-title" title="Daily Attendance Register" description={`Page ${page} of ${totalPages} · ${totalRows} staff members`}><p className="text-xs text-slate-500">Corrections are sent for approval and do not overwrite the original attendance event.</p></TableToolbar>

      <div className="grid gap-3 md:hidden" data-mobile-attendance-cards="true">
        {rows.map((row) => (
          <article key={row.staffId} className="attendance-glass-panel p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold text-slate-950">{row.staffName}</p><p className="mt-1 text-sm text-slate-600">{row.employeeCode} · {formatStaffAttendanceLabel(row.staffType)}</p></div><StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} /></div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Check-In</dt><dd className="mt-1 font-medium text-slate-900">{formatStaffAttendanceDateTime(row.checkInAt, timeZone)}</dd></div>
              <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Check-Out</dt><dd className="mt-1 font-medium text-slate-900">{formatStaffAttendanceDateTime(row.checkOutAt, timeZone)}</dd></div>
              <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Working Time</dt><dd className="mt-1 font-medium text-slate-900">{formatWorkingMinutes(row.workingMinutes)}</dd></div>
              <div className="attendance-glass-inset p-3"><dt className="text-xs font-semibold text-slate-500">Source</dt><dd className="mt-1 font-medium text-slate-900">{formatStaffAttendanceLabel(row.source)}</dd></div>
            </dl>
            {row.flags.length > 0 ? <p className="mt-3 text-xs font-medium text-amber-800">{row.flags.map(formatStaffAttendanceLabel).join(" · ")}</p> : null}
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200/80 pt-4"><ReviewState row={row} /><CorrectionAction row={row} canCorrect={canCorrect} selectedDate={selectedDate} timeZone={timeZone} /></div>
          </article>
        ))}
      </div>

      <div className="hidden md:block">
        <TableShell columns={columns}>
          {rows.map((row) => (
            <tr key={row.staffId} className="align-top">
              <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-950">{row.employeeCode}</td>
              <td className="px-4 py-4"><p className="whitespace-nowrap font-medium text-slate-950">{row.staffName}</p><p className="mt-1 text-xs text-slate-500">{row.department ?? row.branchName}</p></td>
              <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceLabel(row.staffType)}</td>
              <td className="whitespace-nowrap px-4 py-4"><StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} />{row.flags.length > 0 ? <p className="mt-2 max-w-48 text-xs text-amber-800">{row.flags.map(formatStaffAttendanceLabel).join(" · ")}</p> : null}</td>
              <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceDateTime(row.checkInAt, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceDateTime(row.checkOutAt, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-4">{formatWorkingMinutes(row.workingMinutes)}</td>
              <td className="px-4 py-4"><ReviewState row={row} /></td>
              <td className="px-4 py-4"><CorrectionAction row={row} canCorrect={canCorrect} selectedDate={selectedDate} timeZone={timeZone} /></td>
            </tr>
          ))}
        </TableShell>
      </div>
      <PaginationControls page={page} pageSize={pageSize} totalRows={totalRows} itemLabel="staff members" hrefForPage={hrefForPage} />
    </section>
  );
}