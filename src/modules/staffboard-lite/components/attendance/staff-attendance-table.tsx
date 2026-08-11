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
  filterParams?: {
    branchId?: string | null;
    staffType?: string;
    status?: string;
    search?: string;
  };
};

const columns = [
  "Employee Code",
  "Staff Name",
  "Staff Type",
  "Department",
  "Status",
  "Check-in Time",
  "Check-out Time",
  "Working Minutes",
  "Source",
  "Correction Reason",
  "Actions"
] as const;

function CorrectionAction({
  row,
  canCorrect,
  selectedDate,
  timeZone
}: {
  row: StaffAttendanceAdminRow;
  canCorrect: boolean;
  selectedDate: string;
  timeZone: string;
}) {
  if (!canCorrect) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
        View only
      </span>
    );
  }

  if (!row.attendanceRecordId) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500">
        No record yet
      </span>
    );
  }

  if (row.calendarManaged) {
    return (
      <span className="inline-flex min-h-11 items-center rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-800">
        Calendar managed
      </span>
    );
  }

  return (
    <StaffAttendanceCorrectionForm
      attendanceRecordId={row.attendanceRecordId}
      employeeCode={row.employeeCode}
      staffName={row.staffName}
      attendanceDate={selectedDate}
      currentStatus={row.status}
      checkInAt={row.checkInAt}
      checkOutAt={row.checkOutAt}
      workingMinutes={row.workingMinutes}
      correctionReason={row.correctionReason}
      timeZone={timeZone}
    />
  );
}

export function StaffAttendanceTable({
  rows,
  canCorrect,
  selectedDate,
  totalRows,
  page,
  pageSize,
  timeZone,
  filterParams
}: StaffAttendanceTableProps) {
  if (rows.length === 0) {
    return (
      <NoResultsState
        title="No staff attendance rows found"
        description="Try another date, status, staff type, branch, or search term."
      />
    );
  }

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
      <TableToolbar
        id="staff-attendance-table-title"
        title="Staff attendance table"
        description={`Showing page ${page} of ${totalPages} for ${totalRows} matching staff rows.`}
      >
        <p className="text-xs text-slate-500">
          Corrections are available only for users with staffboard.attendance.correct.
        </p>
      </TableToolbar>

      <TableShell columns={columns}>
        {rows.map((row) => (
          <tr key={row.staffId} className="align-top">
            <td className="whitespace-nowrap px-4 py-4 font-medium text-slate-950">{row.employeeCode}</td>
            <td className="whitespace-nowrap px-4 py-4">{row.staffName}</td>
            <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceLabel(row.staffType)}</td>
            <td className="whitespace-nowrap px-4 py-4">{row.department ?? "-"}</td>
            <td className="whitespace-nowrap px-4 py-4">
              <StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} />
            </td>
            <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceDateTime(row.checkInAt, timeZone)}</td>
            <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceDateTime(row.checkOutAt, timeZone)}</td>
            <td className="whitespace-nowrap px-4 py-4">{formatWorkingMinutes(row.workingMinutes)}</td>
            <td className="whitespace-nowrap px-4 py-4">{formatStaffAttendanceLabel(row.source)}</td>
            <td className="max-w-64 px-4 py-4 text-sm leading-6 text-slate-600">
              {row.correctionReason ? row.correctionReason : "-"}
            </td>
            <td className="px-4 py-4">
              <CorrectionAction row={row} canCorrect={canCorrect} selectedDate={selectedDate} timeZone={timeZone} />
            </td>
          </tr>
        ))}
      </TableShell>
      <PaginationControls
        page={page}
        pageSize={pageSize}
        totalRows={totalRows}
        itemLabel="staff rows"
        hrefForPage={hrefForPage}
      />
    </section>
  );
}
