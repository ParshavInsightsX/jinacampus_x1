import Link from "next/link";
import { NoResultsState } from "@/components/ui/empty-state";
import { MobileFilterSheet } from "@/components/mobile/mobile-filter-sheet";
import {
  AbsentStudentsMobileList,
  ClassStatusMobileList,
  DailySummaryMobileList,
  LateStudentsMobileList,
  MonthlyPercentageMobileList,
  StudentHistoryMobileList
} from "@/modules/academia/components/attendance/mobile-attendance-report-lists";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import { forbidden } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/require-auth";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import {
  formatDateTime,
  PageHeader,
  TableShell,
  type RouteSearchParams
} from "@/modules/academia/components/academia-page-shell";
import {
  getDailyStudentAttendanceSummary,
  getMonthlyAttendancePercentageByClassSection,
  getStudentAttendanceHistory,
  listAbsentStudentsForDate,
  listClassSectionsAttendanceStatusForDate,
  listClassSectionsForAttendanceReports,
  listLateStudentsForDate
} from "@/modules/academia/queries";
import { academiaAttendanceRoutes } from "@/modules/academia/ui-config";
import { getZonedDateTimeParts } from "@/lib/dates/time-zone";

const attendanceStatuses = ["", "PRESENT", "ABSENT", "LATE", "HALF_DAY", "ON_LEAVE", "EXCUSED", "NOT_MARKED"] as const;

function institutionalDateParts(timeZone?: string, date = new Date()) {
  const parts = getZonedDateTimeParts(date, timeZone);
  return {
    year: String(parts.year),
    month: String(parts.month).padStart(2, "0"),
    day: String(parts.day).padStart(2, "0")
  };
}

function todayInstitutionDateString(timeZone?: string) {
  const parts = institutionalDateParts(timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function monthStartDateString(timeZone?: string) {
  const parts = institutionalDateParts(timeZone);
  return `${parts.year}-${parts.month}-01`;
}

function getSearchValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function statusLabel(value: string) {
  return formatEnumLabel(value);
}

function ReportSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  rowCount,
  children
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  rowCount: number;
  children: React.ReactNode;
}) {
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

export default async function StudentAttendanceReportsPage({ searchParams }: { searchParams?: RouteSearchParams }) {
  const ctx = await requireAuth();
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS, operation: "READ" }
  ], { branchId: ctx.activeBranchId });
  const permissions = await getEffectivePermissions({
    ctx,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  });
  if (!permissions.has("academia.attendance.report")) {
    throw forbidden("FORBIDDEN_ATTENDANCE_REPORT_ACCESS");
  }

  const params = searchParams ? await searchParams : {};
  const date = getSearchValue(params, "date") ?? todayInstitutionDateString(ctx.timeZone);
  const classSectionId = getSearchValue(params, "classSectionId");
  const status = getSearchValue(params, "status");
  const studentId = getSearchValue(params, "studentId");
  const fromDate = getSearchValue(params, "fromDate") ?? monthStartDateString(ctx.timeZone);
  const toDate = getSearchValue(params, "toDate") ?? date;
  const currentParts = institutionalDateParts(ctx.timeZone);
  const month = Number(getSearchValue(params, "month") ?? currentParts.month);
  const year = Number(getSearchValue(params, "year") ?? currentParts.year);

  const classSections = await listClassSectionsForAttendanceReports(ctx);
  const monthlyClassSectionId =
    getSearchValue(params, "monthlyClassSectionId") ??
    classSectionId ??
    classSections[0]?.id;

  const [
    dailySummary,
    absentStudents,
    lateStudents,
    classSectionStatuses,
    studentHistory,
    monthlyPercentages
  ] = await Promise.all([
    getDailyStudentAttendanceSummary(ctx, {
      attendanceDate: date,
      classSectionId,
      status: status || undefined
    }),
    listAbsentStudentsForDate(ctx, {
      attendanceDate: date,
      classSectionId,
      status: "ABSENT"
    }),
    listLateStudentsForDate(ctx, {
      attendanceDate: date,
      classSectionId
    }),
    listClassSectionsAttendanceStatusForDate(ctx, {
      attendanceDate: date,
      classSectionId
    }),
    getStudentAttendanceHistory(ctx, {
      studentId,
      fromDate,
      toDate
    }),
    getMonthlyAttendancePercentageByClassSection(ctx, {
      classSectionId: monthlyClassSectionId,
      month,
      year
    })
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Student Attendance Reports"
          description="Review daily, class-wise, student-wise, absence, late, pending, and monthly attendance reports."
        />
        <Link
          href={academiaAttendanceRoutes.overview}
          className="premium-secondary-button w-full sm:w-auto premium-focus"
        >
          Attendance Overview
        </Link>
      </div>

      <MobileFilterSheet title="Attendance report filters">
        <form method="get" className="premium-card p-4" aria-label="Student attendance report filters">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="text-sm font-semibold text-slate-950">Report filters</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Filter daily reports, student history, and monthly percentage tables using school-friendly date and status fields.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label htmlFor="attendance-report-date" className="text-sm font-medium text-slate-700">
              Report date
            </label>
            <input id="attendance-report-date" name="date" type="date" defaultValue={date} className="mt-2 min-h-11 w-full" />
          </div>
          <div>
            <label htmlFor="attendance-report-class-section" className="text-sm font-medium text-slate-700">
              Class-section
            </label>
            <select id="attendance-report-class-section" name="classSectionId" defaultValue={classSectionId ?? ""} className="mt-2 min-h-11 w-full">
              <option value="">All available class-sections</option>
              {classSections.map((classSection) => (
                <option key={classSection.id} value={classSection.id}>
                  {classSection.displayName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="attendance-report-status" className="text-sm font-medium text-slate-700">
              Daily status filter
            </label>
            <select id="attendance-report-status" name="status" defaultValue={status ?? ""} className="mt-2 min-h-11 w-full">
              {attendanceStatuses.map((attendanceStatus) => (
                <option key={attendanceStatus || "all"} value={attendanceStatus}>
                  {attendanceStatus ? statusLabel(attendanceStatus) : "All statuses"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="attendance-report-student" className="text-sm font-medium text-slate-700">
              Student ID for history
            </label>
            <input
              id="attendance-report-student"
              name="studentId"
              defaultValue={studentId ?? ""}
              placeholder="Paste student ID for history"
              className="mt-2 min-h-11 w-full"
            />
          </div>
          <div>
            <label htmlFor="attendance-report-from" className="text-sm font-medium text-slate-700">
              History from
            </label>
            <input id="attendance-report-from" name="fromDate" type="date" defaultValue={fromDate} className="mt-2 min-h-11 w-full" />
          </div>
          <div>
            <label htmlFor="attendance-report-to" className="text-sm font-medium text-slate-700">
              History to
            </label>
            <input id="attendance-report-to" name="toDate" type="date" defaultValue={toDate} className="mt-2 min-h-11 w-full" />
          </div>
          <div>
            <label htmlFor="attendance-report-monthly-class-section" className="text-sm font-medium text-slate-700">
              Monthly class-section
            </label>
            <select
              id="attendance-report-monthly-class-section"
              name="monthlyClassSectionId"
              defaultValue={monthlyClassSectionId ?? ""}
              className="mt-2 min-h-11 w-full"
            >
              <option value="">Select class-section</option>
              {classSections.map((classSection) => (
                <option key={classSection.id} value={classSection.id}>
                  {classSection.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[1fr_1.2fr] gap-3">
            <div>
              <label htmlFor="attendance-report-month" className="text-sm font-medium text-slate-700">
                Month
              </label>
              <input id="attendance-report-month" name="month" type="number" min={1} max={12} defaultValue={month} className="mt-2 min-h-11 w-full" />
            </div>
            <div>
              <label htmlFor="attendance-report-year" className="text-sm font-medium text-slate-700">
                Year
              </label>
              <input id="attendance-report-year" name="year" type="number" min={2000} max={2100} defaultValue={year} className="mt-2 min-h-11 w-full" />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
          <Link
            href={academiaAttendanceRoutes.reports}
            className="premium-secondary-button w-full sm:w-auto"
          >
            Clear filters
          </Link>
          <button type="submit" className="premium-primary-button w-full sm:w-auto">
            Apply Filters
          </button>
        </div>
        </form>
      </MobileFilterSheet>

      <ReportSection
        title="Daily Summary"
        description="Full-day attendance counts grouped by class-section for the selected date."
        emptyTitle="No daily attendance found"
        emptyDescription="Marked attendance records for the selected date and class-section will appear here."
        rowCount={dailySummary.length}
      >
        <DailySummaryMobileList rows={dailySummary} />
        <div className="hidden md:block">
          <TableShell columns={["Class Section", "Total Marked", "Present", "Absent", "Late", "Half Day", "On Leave", "Excused", "Locked"]}>
          {dailySummary.map((summary) => (
            <tr key={summary.classSectionId}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{summary.classSectionName}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.totalMarked}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.presentCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.absentCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.lateCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.halfDayCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.onLeaveCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.excusedCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{summary.isLocked ? `Yes (${summary.lockedCount})` : "No"}</td>
            </tr>
          ))}
        </TableShell>
        </div>
      </ReportSection>

      <div className="grid min-w-0 gap-6 xl:grid-cols-2">
        <ReportSection
          title="Absent Students"
          description="Students marked absent for the selected attendance date."
          emptyTitle="No absent students"
          emptyDescription="Absent records for the selected filters will appear here."
          rowCount={absentStudents.length}
        >
          <AbsentStudentsMobileList rows={absentStudents} />
          <div className="hidden md:block">
            <TableShell columns={["Admission No.", "Student Name", "Class Section", "Status", "Remarks"]}>
            {absentStudents.map((record) => (
              <tr key={record.attendanceRecordId}>
                <td className="whitespace-nowrap px-4 py-3">{record.admissionNo}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.studentName}</td>
                <td className="whitespace-nowrap px-4 py-3">{record.classSectionName}</td>
                <td className="whitespace-nowrap px-4 py-3"><StatusBadge value={record.status} /></td>
                <td className="px-4 py-3">{record.remarks ?? "-"}</td>
              </tr>
            ))}
          </TableShell>
        </div>
        </ReportSection>

        <ReportSection
          title="Late Students"
          description="Students marked late for the selected attendance date."
          emptyTitle="No late students"
          emptyDescription="Late records for the selected filters will appear here."
          rowCount={lateStudents.length}
        >
          <LateStudentsMobileList rows={lateStudents} />
          <div className="hidden md:block">
            <TableShell columns={["Admission No.", "Student Name", "Class Section", "Remarks"]}>
            {lateStudents.map((record) => (
              <tr key={record.attendanceRecordId}>
                <td className="whitespace-nowrap px-4 py-3">{record.admissionNo}</td>
                <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.studentName}</td>
                <td className="whitespace-nowrap px-4 py-3">{record.classSectionName}</td>
                <td className="px-4 py-3">{record.remarks ?? "-"}</td>
              </tr>
            ))}
          </TableShell>
        </div>
        </ReportSection>
      </div>

      <ReportSection
        title="Classes Not Marked"
        description="Active class-sections compared against active enrollment counts for the selected date."
        emptyTitle="No class-sections available"
        emptyDescription="Active class-sections for your reporting scope will appear here."
        rowCount={classSectionStatuses.length}
      >
        <ClassStatusMobileList rows={classSectionStatuses} />
        <div className="hidden md:block">
          <TableShell columns={["Class Section", "Class Teacher", "Active Students", "Marked", "Pending", "Status"]}>
          {classSectionStatuses.map((record) => (
            <tr key={record.classSectionId}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.classSectionName}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.classTeacherName ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.activeEnrollmentCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.markedCount}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.pendingCount}</td>
              <td className="whitespace-nowrap px-4 py-3">
                <StatusBadge value={record.status} />
              </td>
            </tr>
          ))}
        </TableShell>
        </div>
      </ReportSection>

      <ReportSection
        title="Student History"
        description="Full-day attendance history for one student over the selected date range."
        emptyTitle={studentId ? "No student attendance history" : "Select a student ID"}
        emptyDescription={studentId ? "No records matched this student and date range." : "Enter a student ID in the filters to load history."}
        rowCount={studentHistory.length}
      >
        <StudentHistoryMobileList rows={studentHistory} />
        <div className="hidden md:block">
          <TableShell columns={["Date", "Class Section", "Status", "Remarks", "Locked"]}>
          {studentHistory.map((record) => (
            <tr key={record.attendanceRecordId}>
              <td className="whitespace-nowrap px-4 py-3">{formatDateTime(record.attendanceDate)}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.classSectionName}</td>
              <td className="whitespace-nowrap px-4 py-3"><StatusBadge value={record.status} /></td>
              <td className="px-4 py-3">{record.remarks ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.lockedAt ? formatDateTime(record.lockedAt) : "No"}</td>
            </tr>
          ))}
        </TableShell>
        </div>
      </ReportSection>

      <ReportSection
        title="Monthly Percentage"
        description="MVP percentage uses PRESENT, LATE, and EXCUSED as 1 day, HALF_DAY as 0.5, and ABSENT or ON_LEAVE as 0."
        emptyTitle="No monthly percentage rows"
        emptyDescription="Select a class-section with marked attendance records for the selected month."
        rowCount={monthlyPercentages.length}
      >
        <MonthlyPercentageMobileList rows={monthlyPercentages} />
        <div className="hidden md:block">
          <TableShell columns={["Roll No.", "Admission No.", "Student Name", "Present Equivalent", "Marked Days", "Absent", "Late", "Half Day", "Percentage"]}>
          {monthlyPercentages.map((record) => (
            <tr key={record.studentId}>
              <td className="whitespace-nowrap px-4 py-3">{record.rollNumber ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.admissionNo}</td>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{record.studentName}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.presentEquivalentDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.markedDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.absentDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.lateDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.halfDayDays}</td>
              <td className="whitespace-nowrap px-4 py-3">{record.attendancePercentage}%</td>
            </tr>
          ))}
        </TableShell>
        </div>
      </ReportSection>
    </div>
  );
}
