import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatStaffAttendanceDateTime,
  formatStaffAttendanceDate,
  formatStaffAttendanceLabel,
  formatWorkingMinutes,
  STAFF_ATTENDANCE_CORRECTION_STATUS_OPTIONS,
  STAFF_ATTENDANCE_STATUS_OPTIONS,
  staffAttendanceCorrectionErrorMessage,
  validateStaffAttendanceCorrectionDraft
} from "@/modules/staffboard-lite/components/attendance/staff-attendance-admin-state";

describe("StaffBoard Lite attendance admin UI", () => {
  it("wires the staff attendance route to live admin attendance data", () => {
    const routeSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/page.tsx"),
      "utf8"
    );

    expect(routeSource).toContain("listStaffAttendanceForDate");
    expect(routeSource).toContain("StaffAttendanceFilters");
    expect(routeSource).toContain("StaffAttendanceSummaryCards");
    expect(routeSource).toContain("StaffAttendanceTable");
    expect(routeSource).toContain("staffboard.attendance.adjustment.request");
    expect(routeSource).toContain("PermissionState");
    expect(routeSource).not.toContain("FORBIDDEN_STAFF_ATTENDANCE_ACCESS");
    expect(routeSource).not.toContain("StaffboardComingSoon");
  });

  it("renders the required filters and summary cards", () => {
    const filterSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-filters.tsx"),
      "utf8"
    );
    const summarySource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-summary-cards.tsx"),
      "utf8"
    );

    expect(filterSource).toContain('name="date"');
    expect(filterSource).toContain('name="branchId"');
    expect(filterSource).toContain('name="staffType"');
    expect(filterSource).toContain('name="status"');
    expect(filterSource).toContain('name="search"');
    expect(summarySource).toContain("Total Staff");
    expect(summarySource).toContain("Checked In");
    expect(summarySource).toContain("Present");
    expect(summarySource).toContain("Late");
    expect(summarySource).toContain("Half Day");
    expect(summarySource).toContain("Absent / Not Marked");
    expect(summarySource).toContain("On Leave / Paid Holiday");
  });

  it("renders table columns and permission-gated correction behavior", () => {
    const tableSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx"),
      "utf8"
    );
    const correctionSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-correction-form.tsx"),
      "utf8"
    );

    for (const column of [
      "Employee",
      "Staff Member",
      "Category",
      "Status",
      "Check-In",
      "Check-Out",
      "Working Time",
      "Review",
      "Actions"
    ]) {
      expect(tableSource).toContain(column);
    }
    expect(tableSource).toContain("canCorrect");
    expect(tableSource).toContain("View Only");
    expect(tableSource).toContain("Use Manual Entry");
    expect(tableSource).toContain("selectedDate");
    expect(tableSource).toContain("employeeCode={row.employeeCode}");
    expect(tableSource).toContain("staffName={row.staffName}");
    expect(tableSource).toContain("workingMinutes={row.workingMinutes}");
    expect(tableSource).toContain("correctionReason={row.correctionReason}");
    expect(correctionSource).toContain("requestStaffAttendanceAdjustmentAction");
    expect(correctionSource).toContain("Correction reason");
  });

  it("renders the correction form summary, editable fields, and warning copy", () => {
    const correctionSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/components/attendance/staff-attendance-correction-form.tsx"),
      "utf8"
    );

    for (const label of [
      "Staff",
      "Date and Status",
      "Recorded Time",
      "Previous Note",
      "Requested change",
      "Attendance time",
      "Reason category",
      "Correction reason"
    ]) {
      expect(correctionSource).toContain(label);
    }

    expect(correctionSource).toContain('type="datetime-local"');
    expect(correctionSource).toContain("Your request will not change attendance until another authorised user verifies and approves it.");
    expect(correctionSource).toContain("Send for Approval");
    expect(correctionSource).toContain("Request Correction");
    expect(correctionSource).toContain("Sending...");
  });

  it("keeps NOT_MARKED visible for filtering but unavailable for correction submission", () => {
    expect(STAFF_ATTENDANCE_STATUS_OPTIONS).toContain("NOT_MARKED");
    expect(Array.from(STAFF_ATTENDANCE_CORRECTION_STATUS_OPTIONS as readonly string[])).not.toContain("NOT_MARKED");
  });

  it("validates blank correction reasons and check-out before check-in in the correction draft", () => {
    expect(validateStaffAttendanceCorrectionDraft({
      correctionReason: "   ",
      checkInAt: "",
      checkOutAt: ""
    })).toBe("Enter a correction reason with at least 5 characters.");

    expect(validateStaffAttendanceCorrectionDraft({
      correctionReason: "Approved correction",
      checkInAt: "2026-05-05T11:00",
      checkOutAt: "2026-05-05T10:00"
    })).toBe("Check-out time must be after check-in time.");
  });

  it("maps correction UI errors safely", () => {
    expect(staffAttendanceCorrectionErrorMessage("FORBIDDEN", "FORBIDDEN_PERMISSION:staffboard.attendance.adjustment.request")).toContain("permission");
    expect(staffAttendanceCorrectionErrorMessage("STAFF_ATTENDANCE_RECORD_NOT_FOUND", "tenantId tokenHash")).not.toMatch(/tenantId|tokenHash/);
    expect(staffAttendanceCorrectionErrorMessage("STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN", "raw")).toBe(
      "Check-out time must be after check-in time."
    );
  });

  it("formats status, date-time, and working minutes for table display", () => {
    expect(formatStaffAttendanceLabel("HALF_DAY")).toBe("Half Day");
    expect(formatWorkingMinutes(360)).toBe("6h 00m");
    expect(formatWorkingMinutes(45)).toBe("45 min");
    expect(formatWorkingMinutes(null)).toBe("-");
    expect(formatStaffAttendanceDate("2026-05-30")).toBe("30 May 2026");
    expect(formatStaffAttendanceDateTime("2026-05-05T03:45:00.000Z")).toBe("05 May, 09:15");
  });

  it("does not expose raw QR token or tokenHash text in admin UI components", () => {
    const combinedSource = [
      "src/app/(dashboard)/staffboard/attendance/page.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-table.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-correction-form.tsx",
      "src/modules/staffboard-lite/components/attendance/staff-attendance-filters.tsx"
    ].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");

    expect(combinedSource).not.toMatch(/tokenHash|rawToken/);
  });
});
