import { NoResultsState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/table-primitives";
import { TableShell } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import type {
  MonthlyStaffAttendanceSummaryRow,
  StaffAttendanceReportRow,
  StaffManualCorrectionReportRow
} from "@/modules/staffboard-lite/queries";
import {
  formatStaffAttendanceDateTime,
  formatStaffAttendanceLabel,
  formatWorkingMinutes
} from "./staff-attendance-admin-state";
import { formatStaffAttendanceReportDate } from "./staff-attendance-report-state";

type ReportSectionProps = {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  rowCount: number;
  children: React.ReactNode;
};

type AttendanceRowsTableProps = {
  rows: StaffAttendanceReportRow[];
  timeZone: string;
};

type NamedAttendanceRowsTableProps = AttendanceRowsTableProps & {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
};

const attendanceColumns = [
  "Date",
  "Employee",
  "Staff Member",
  "Category",
  "Department",
  "Status",
  "Check-In",
  "Check-Out",
  "Working Time",
  "Source",
  "Correction Note"
] as const;

export function StaffAttendanceReportSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  rowCount,
  children
}: ReportSectionProps) {
  return (
    <section className="min-w-0 space-y-3" aria-label={title}>
      <div>
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {rowCount > 0 ? children : <NoResultsState title={emptyTitle} description={emptyDescription} />}
    </section>
  );
}

function AttendanceReportCard({ row, timeZone }: { row: StaffAttendanceReportRow; timeZone: string }) {
  return (
    <article className="attendance-glass-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-950">{row.staffName}</p>
          <p className="mt-1 text-sm text-slate-600">
            {row.employeeCode} · {formatStaffAttendanceReportDate(row.attendanceDate, timeZone)}
          </p>
        </div>
        <StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} />
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs font-semibold text-slate-500">Check-In</dt><dd className="mt-1 text-slate-900">{formatStaffAttendanceDateTime(row.checkInAt, timeZone)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Check-Out</dt><dd className="mt-1 text-slate-900">{formatStaffAttendanceDateTime(row.checkOutAt, timeZone)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Working Time</dt><dd className="mt-1 text-slate-900">{formatWorkingMinutes(row.workingMinutes)}</dd></div>
        <div><dt className="text-xs font-semibold text-slate-500">Recorded By</dt><dd className="mt-1 text-slate-900">{formatStaffAttendanceLabel(row.source)}</dd></div>
      </dl>
      <p className="mt-3 text-xs text-slate-600">
        {formatStaffAttendanceLabel(row.staffType)} · {row.department ?? "Department not set"}
      </p>
      {row.correctionReason ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{row.correctionReason}</p> : null}
    </article>
  );
}

export function StaffAttendanceRowsTable({ rows, timeZone }: AttendanceRowsTableProps) {
  return (
    <>
      <div className="grid gap-3 md:hidden" data-mobile-attendance-report-cards="true">
        {rows.map((row) => <AttendanceReportCard key={row.attendanceRecordId} row={row} timeZone={timeZone} />)}
      </div>
      <div className="hidden md:block">
        <TableShell columns={attendanceColumns}>
          {rows.map((row) => (
            <tr key={row.attendanceRecordId}>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceReportDate(row.attendanceDate, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.employeeCode}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{row.staffName}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceLabel(row.staffType)}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.department ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3"><StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} /></td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceDateTime(row.checkInAt, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceDateTime(row.checkOutAt, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatWorkingMinutes(row.workingMinutes)}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceLabel(row.source)}</td>
              <td className="max-w-72 px-4 py-3 text-sm leading-6 text-slate-600">{row.correctionReason ?? "-"}</td>
            </tr>
          ))}
        </TableShell>
      </div>
    </>
  );
}

export function NamedStaffAttendanceRowsTable({
  title,
  description,
  emptyTitle,
  emptyDescription,
  rows,
  timeZone
}: NamedAttendanceRowsTableProps) {
  return (
    <StaffAttendanceReportSection
      title={title}
      description={description}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      rowCount={rows.length}
    >
      <StaffAttendanceRowsTable rows={rows} timeZone={timeZone} />
    </StaffAttendanceReportSection>
  );
}

function MonthlySummaryCard({ row }: { row: MonthlyStaffAttendanceSummaryRow }) {
  const counts = [
    ["Present", row.presentDays],
    ["Late Arrival", row.lateDays],
    ["Half Day", row.halfDayDays],
    ["Absent", row.absentDays],
    ["On Leave", row.onLeaveDays],
    ["Paid Holiday / Weekly Off", row.holidayWeekOffDays],
    ["Official Duty", row.officialDutyDays],
    ["Incomplete", row.incompleteDays]
  ] as const;

  return (
    <article className="attendance-glass-panel p-4">
      <p className="font-semibold text-slate-950">{row.staffName}</p>
      <p className="mt-1 text-sm text-slate-600">{row.employeeCode} · {formatStaffAttendanceLabel(row.staffType)}</p>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {counts.map(([label, value]) => (
          <div key={label} className="attendance-glass-inset p-3">
            <dt className="text-xs font-semibold text-slate-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-950">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-slate-600">Marked days: {row.markedDays} · Working time: {formatWorkingMinutes(row.totalWorkingMinutes)}</p>
    </article>
  );
}

export function StaffMonthlySummaryTable({ rows }: { rows: MonthlyStaffAttendanceSummaryRow[] }) {
  return (
    <StaffAttendanceReportSection
      title="Monthly Attendance Report"
      description="Counts approved attendance records for the selected month. Missing days are not assumed to be absent."
      emptyTitle="No monthly attendance records"
      emptyDescription="Approved staff attendance records for the selected month will appear here."
      rowCount={rows.length}
    >
      <div className="grid gap-3 md:hidden" data-mobile-monthly-attendance-cards="true">
        {rows.map((row) => <MonthlySummaryCard key={row.staffId} row={row} />)}
      </div>
      <div className="hidden md:block">
        <TableShell columns={[
          "Employee",
          "Staff Member",
          "Category",
          "Department",
          "Present",
          "Late",
          "Half Day",
          "Absent",
          "On Leave",
          "Holiday / Off",
          "Official Duty",
          "Incomplete",
          "Marked Days",
          "Working Time"
        ]}>
          {rows.map((row) => (
            <tr key={row.staffId}>
              <td className="whitespace-nowrap px-4 py-3">{row.employeeCode}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{row.staffName}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceLabel(row.staffType)}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.department ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.presentDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.lateDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.halfDayDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.absentDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.onLeaveDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.holidayWeekOffDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.officialDutyDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.incompleteDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.markedDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatWorkingMinutes(row.totalWorkingMinutes)}</td>
            </tr>
          ))}
        </TableShell>
      </div>
    </StaffAttendanceReportSection>
  );
}

export function StaffCorrectionReportTable({ rows, timeZone }: { rows: StaffManualCorrectionReportRow[]; timeZone: string }) {
  return (
    <StaffAttendanceReportSection
      title="Attendance Correction History"
      description="Approved attendance corrections with the recorded reason and responsible user."
      emptyTitle="No attendance corrections"
      emptyDescription="Approved correction records for the selected date range will appear here."
      rowCount={rows.length}
    >
      <div className="grid gap-3 md:hidden" data-mobile-attendance-correction-cards="true">
        {rows.map((row) => (
          <article key={row.attendanceRecordId} className="attendance-glass-panel p-4">
            <div className="flex items-start justify-between gap-3">
              <div><p className="font-semibold text-slate-950">{row.staffName}</p><p className="mt-1 text-sm text-slate-600">{row.employeeCode} · {formatStaffAttendanceReportDate(row.attendanceDate, timeZone)}</p></div>
              <StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} />
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-700">{row.correctionReason}</p>
            <p className="mt-3 text-xs text-slate-500">Updated by {row.updatedByName ?? "Authorised user"} · {formatStaffAttendanceDateTime(row.updatedAt, timeZone)}</p>
          </article>
        ))}
      </div>
      <div className="hidden md:block">
        <TableShell columns={["Date", "Employee", "Staff Member", "Status", "Correction Reason", "Updated By", "Updated At"]}>
          {rows.map((row) => (
            <tr key={row.attendanceRecordId}>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceReportDate(row.attendanceDate, timeZone)}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.employeeCode}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{row.staffName}</td>
              <td className="whitespace-nowrap px-4 py-3"><StatusBadge value={row.status} label={formatStaffAttendanceLabel(row.status)} /></td>
              <td className="max-w-96 px-4 py-3 text-sm leading-6 text-slate-600">{row.correctionReason}</td>
              <td className="whitespace-nowrap px-4 py-3">{row.updatedByName ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{formatStaffAttendanceDateTime(row.updatedAt, timeZone)}</td>
            </tr>
          ))}
        </TableShell>
      </div>
    </StaffAttendanceReportSection>
  );
}