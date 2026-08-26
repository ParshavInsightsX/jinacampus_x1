import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { formatEnumLabel } from "@/components/ui/table-primitives";
import { formatStaffAttendanceLabel } from "@/modules/staffboard-lite/components/attendance/staff-attendance-admin-state";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("table and filter polish", () => {
  it("keeps reusable table primitives responsive, accessible, and touch-friendly", () => {
    const primitives = source("src/components/ui/table-primitives.tsx");

    expect(primitives).toContain("ResponsiveTable");
    expect(primitives).toContain("TableToolbar");
    expect(primitives).toContain("PaginationControls");
    expect(primitives).toContain('data-responsive-table="true"');
    expect(primitives).toContain('data-mobile-table-shell="true"');
    expect(primitives).toContain("min-w-0 overflow-hidden");
    expect(primitives).not.toContain("Scroll sideways to view all columns.");
    expect(primitives).toContain("aria-disabled");
    expect(primitives).toContain("min-h-11");
  });

  it("formats enum and staff attendance labels for school users", () => {
    expect(formatEnumLabel("HALF_DAY")).toBe("Half Day");
    expect(formatEnumLabel("ON_LEAVE")).toBe("On Leave");
    expect(formatEnumLabel("NOT_MARKED")).toBe("Not Marked");
    expect(formatEnumLabel("CLEANING_STAFF")).toBe("Cleaning Staff");
    expect(formatEnumLabel("QR_SCAN")).toBe("QR Scan");
    expect(formatStaffAttendanceLabel("MANUAL_ADMIN")).toBe("Manual Admin");
    expect(formatStaffAttendanceLabel("QR_SCAN")).toBe("QR Scan");
  });

  it("renders useful labeled search controls on Academia and StaffBoard list shells", () => {
    const academiaShell = source("src/modules/academia/components/academia-page-shell.tsx");
    const staffShell = source("src/modules/staffboard-lite/components/staffboard-page-shell.tsx");
    const academiaConfig = source("src/modules/academia/ui-config.ts");
    const staffConfig = source("src/modules/staffboard-lite/ui-config.ts");

    expect(academiaShell).toContain('role="search"');
    expect(staffShell).toContain('role="search"');
    expect(academiaShell).toContain("Search {title}");
    expect(staffShell).toContain("Search {title}");
    expect(academiaConfig).toContain("Search students by name or admission number");
    expect(staffConfig).toContain("Search staff by name, employee code");
    expect(`${academiaShell}\n${staffShell}`).toContain("Clear search");
  });

  it("keeps attendance report and admin filters mobile-safe with clear reset actions", () => {
    const studentReports = source("src/app/(dashboard)/academia/attendance/reports/page.tsx");
    const staffAdminFilters = source("src/modules/staffboard-lite/components/attendance/staff-attendance-filters.tsx");
    const staffReportFilters = source("src/modules/staffboard-lite/components/attendance/staff-attendance-report-filters.tsx");

    expect(studentReports).toContain("Student attendance report filters");
    expect(studentReports).toContain("Clear filters");
    expect(studentReports).toContain("min-w-0 space-y-3");
    expect(studentReports).toContain("md:grid-cols-2 xl:grid-cols-4");
    expect(staffAdminFilters).toContain("Staff attendance filters");
    expect(staffAdminFilters).toContain("Clear filters");
    expect(staffAdminFilters).toContain("Search staff");
    expect(staffAdminFilters).toContain("lg:grid-cols");
    expect(staffReportFilters).toContain("Staff attendance report filters");
    expect(staffReportFilters).toContain("Search staff");
    expect(staffReportFilters).toContain("Clear filters");
    expect(staffReportFilters).toContain("md:grid-cols-2 xl:grid-cols-4");

    const staffReportTables = source("src/modules/staffboard-lite/components/attendance/staff-attendance-report-tables.tsx");
    expect(staffReportTables).toContain("min-w-0 space-y-3");
  });

  it("adds clear staff attendance pagination labels and preserves filters in page links", () => {
    const staffTable = source("src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx");
    const staffPage = source("src/app/(dashboard)/staffboard/attendance/page.tsx");
    const primitives = source("src/components/ui/table-primitives.tsx");

    expect(staffTable).toContain("PaginationControls");
    expect(staffTable).toContain('itemLabel="staff members"');
    expect(primitives).toContain("Page {page} of {totalPages}");
    expect(staffTable).toContain("params.set(\"staffType\", filterParams.staffType)");
    expect(staffTable).toContain("params.set(\"status\", filterParams.status)");
    expect(staffTable).toContain("params.set(\"search\", filterParams.search)");
    expect(staffPage).toContain("filterParams");
  });

  it("keeps edit and correction table actions accessible and tappable", () => {
    const combined = [
      "src/app/(dashboard)/academia/classes/page.tsx",
      "src/app/(dashboard)/academia/sections/page.tsx",
      "src/app/(dashboard)/academia/subjects/page.tsx",
      "src/app/(dashboard)/academia/students/page.tsx",
      "src/app/(dashboard)/academia/guardians/page.tsx",
      "src/app/(dashboard)/academia/enrollments/page.tsx",
      "src/app/(dashboard)/staffboard/staff/page.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-correction-form.tsx"
    ].map(source).join("\n");

    expect(combined).toContain("ariaLabel={`Edit");
    expect(combined).toContain("Correct");
    expect(combined).toContain("View Only");
    expect(combined).toContain("Use Manual Entry");
    expect(combined).toContain("Request Correction");
    expect(combined).not.toContain("min-h-10");
  });

  it("does not expose QR secrets or internal DB errors in table and filter UI output", () => {
    const combined = [
      "src/components/ui/table-primitives.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-report-tables.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-filters.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-report-filters.tsx",
      "src/app/(dashboard)/academia/attendance/reports/page.tsx"
    ].map(source).join("\n");

    expect(combined).not.toMatch(/tokenHash|rawToken|Prisma error|tenantId=.*secret/i);
  });
});
