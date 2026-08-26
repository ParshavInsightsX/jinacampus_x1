import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  currentIndiaMonthYear,
  formatStaffAttendanceReportDate,
  monthStartIndiaDateString,
  STAFF_ATTENDANCE_REPORT_STATUS_OPTIONS,
  todayIndiaDateString
} from "@/modules/staffboard-lite/components/attendance/staff-attendance-report-state";

describe("StaffBoard Lite attendance reports UI", () => {
  it("wires the reports route to the report query and components", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/reports/page.tsx"),
      "utf8"
    );

    expect(routeSource).toContain("Staff Attendance Reports");
    expect(routeSource).toContain("getStaffAttendanceReportsPageData");
    expect(routeSource).toContain("StaffAttendanceReportFilters");
    expect(routeSource).toContain("NamedStaffAttendanceRowsTable");
    expect(routeSource).toContain("StaffMonthlySummaryTable");
    expect(routeSource).toContain("StaffCorrectionReportTable");
  });

  it("renders required report filters", () => {
    const filterSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-report-filters.tsx"),
      "utf8"
    );

    expect(filterSource).toContain('name="branchId"');
    expect(filterSource).toContain('name="date"');
    expect(filterSource).toContain('name="fromDate"');
    expect(filterSource).toContain('name="toDate"');
    expect(filterSource).toContain('name="staffType"');
    expect(filterSource).toContain('name="status"');
    expect(filterSource).toContain('name="department"');
    expect(filterSource).toContain('name="month"');
    expect(filterSource).toContain('name="year"');
  });

  it("renders table-first report sections and empty states", () => {
    const tableSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-report-tables.tsx"),
      "utf8"
    );

    for (const column of [
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
    ]) {
      expect(tableSource).toContain(column);
    }
    expect(tableSource).toContain("Monthly Attendance Report");
    expect(tableSource).toContain("Attendance Correction History");
    expect(tableSource).toContain("NoResultsState");
  });

  it("keeps NOT_MARKED filterable without adding file exports, charts, or QR secrets", () => {
    expect(STAFF_ATTENDANCE_REPORT_STATUS_OPTIONS).toContain("NOT_MARKED");

    const combinedSource = [
      "src/app/(dashboard)/staffboard/attendance/reports/page.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-report-filters.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-report-tables.tsx",
      "src/modules/staffboard-lite/queries/staff-attendance-reports.queries.ts"
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");

    expect(combinedSource).not.toMatch(/tokenHash|rawToken/);
    expect(combinedSource).not.toMatch(/QRCodeSVG|chart|csv|pdf/i);
  });

  it("formats report dates and defaults for India-local report filters", () => {
    expect(todayIndiaDateString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(monthStartIndiaDateString()).toMatch(/^\d{4}-\d{2}-01$/);
    expect(currentIndiaMonthYear()).toMatchObject({
      month: expect.any(Number),
      year: expect.any(Number)
    });
    expect(formatStaffAttendanceReportDate("2026-05-05")).toMatch(/05[- ]May[- ]2026/);
  });
});
