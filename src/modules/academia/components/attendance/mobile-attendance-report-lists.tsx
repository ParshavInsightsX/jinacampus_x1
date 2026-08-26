import { MobileDataList, MobileDataRow } from "@/components/mobile/mobile-data-list";
import { StatusBadge } from "@/components/ui/table-primitives";
import { formatDateTime } from "@/modules/academia/components/academia-page-shell";
import type {
  getDailyStudentAttendanceSummary,
  getMonthlyAttendancePercentageByClassSection,
  getStudentAttendanceHistory,
  listAbsentStudentsForDate,
  listClassSectionsAttendanceStatusForDate,
  listLateStudentsForDate
} from "@/modules/academia/queries";

type DailySummary = Awaited<ReturnType<typeof getDailyStudentAttendanceSummary>>[number];
type AbsentStudent = Awaited<ReturnType<typeof listAbsentStudentsForDate>>[number];
type LateStudent = Awaited<ReturnType<typeof listLateStudentsForDate>>[number];
type ClassSectionStatus = Awaited<ReturnType<typeof listClassSectionsAttendanceStatusForDate>>[number];
type StudentHistory = Awaited<ReturnType<typeof getStudentAttendanceHistory>>[number];
type MonthlyPercentage = Awaited<ReturnType<typeof getMonthlyAttendancePercentageByClassSection>>[number];

export function DailySummaryMobileList({ rows }: { rows: readonly DailySummary[] }) {
  return (
    <MobileDataList label="Daily attendance summary">
      {rows.map((row) => (
        <MobileDataRow
          key={row.classSectionId}
          title={row.classSectionName}
          subtitle={`${row.totalMarked} students marked`}
          status={<StatusBadge value={row.isLocked ? "MARKED" : "NOT_MARKED"} label={row.isLocked ? "Locked" : "Open"} />}
          details={[
            { label: "Present", value: row.presentCount },
            { label: "Absent", value: row.absentCount },
            { label: "Late", value: row.lateCount },
            { label: "Half day", value: row.halfDayCount },
            { label: "On leave", value: row.onLeaveCount },
            { label: "Excused", value: row.excusedCount }
          ]}
        />
      ))}
    </MobileDataList>
  );
}

export function AbsentStudentsMobileList({ rows }: { rows: readonly AbsentStudent[] }) {
  return (
    <MobileDataList label="Absent students">
      {rows.map((row) => (
        <MobileDataRow
          key={row.attendanceRecordId}
          title={row.studentName}
          subtitle={`${row.admissionNo} · ${row.classSectionName}`}
          status={<StatusBadge value={row.status} />}
          details={[{ label: "Remarks", value: row.remarks ?? "No remarks" }]}
        />
      ))}
    </MobileDataList>
  );
}

export function LateStudentsMobileList({ rows }: { rows: readonly LateStudent[] }) {
  return (
    <MobileDataList label="Late students">
      {rows.map((row) => (
        <MobileDataRow
          key={row.attendanceRecordId}
          title={row.studentName}
          subtitle={`${row.admissionNo} · ${row.classSectionName}`}
          status={<StatusBadge value="LATE" />}
          details={[{ label: "Remarks", value: row.remarks ?? "No remarks" }]}
        />
      ))}
    </MobileDataList>
  );
}

export function ClassStatusMobileList({ rows }: { rows: readonly ClassSectionStatus[] }) {
  return (
    <MobileDataList label="Class attendance status">
      {rows.map((row) => (
        <MobileDataRow
          key={row.classSectionId}
          title={row.classSectionName}
          subtitle={row.classTeacherName ? `Class teacher: ${row.classTeacherName}` : "Class teacher not assigned"}
          status={<StatusBadge value={row.status} />}
          details={[
            { label: "Active students", value: row.activeEnrollmentCount },
            { label: "Marked", value: row.markedCount },
            { label: "Pending", value: row.pendingCount }
          ]}
        />
      ))}
    </MobileDataList>
  );
}

export function StudentHistoryMobileList({ rows }: { rows: readonly StudentHistory[] }) {
  return (
    <MobileDataList label="Student attendance history">
      {rows.map((row) => (
        <MobileDataRow
          key={row.attendanceRecordId}
          title={formatDateTime(row.attendanceDate)}
          subtitle={row.classSectionName}
          status={<StatusBadge value={row.status} />}
          details={[
            { label: "Remarks", value: row.remarks ?? "No remarks" },
            { label: "Locked", value: row.lockedAt ? formatDateTime(row.lockedAt) : "No" }
          ]}
        />
      ))}
    </MobileDataList>
  );
}

export function MonthlyPercentageMobileList({ rows }: { rows: readonly MonthlyPercentage[] }) {
  return (
    <MobileDataList label="Monthly attendance percentages">
      {rows.map((row) => (
        <MobileDataRow
          key={row.studentId}
          title={row.studentName}
          subtitle={`${row.admissionNo}${row.rollNumber ? ` · Roll ${row.rollNumber}` : ""}`}
          status={<span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700">{row.attendancePercentage}%</span>}
          details={[
            { label: "Present equivalent", value: row.presentEquivalentDays },
            { label: "Marked days", value: row.markedDays },
            { label: "Absent", value: row.absentDays },
            { label: "Late", value: row.lateDays },
            { label: "Half day", value: row.halfDayDays }
          ]}
        />
      ))}
    </MobileDataList>
  );
}
