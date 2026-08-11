import { describe, expect, it } from "vitest";
import {
  correctStaffAttendanceSchema,
  createStaffProfileSchema,
  generateStaffQrSchema,
  scanStaffQrPayloadSchema,
  scanStaffQrSchema,
  staffCorrectionReportFilterSchema,
  staffDailyAttendanceReportFilterSchema,
  staffDateRangeAttendanceReportFilterSchema,
  staffMonthlyAttendanceSummaryFilterSchema,
  updateStaffProfileSchema,
  type CreateStaffProfileInput
} from "@/modules/staffboard-lite/schemas";

const branchId = "00000000-0000-0000-0000-000000000001";
const staffId = "00000000-0000-0000-0000-000000000002";
const attendanceRecordId = "00000000-0000-0000-0000-000000000003";

describe("StaffBoard Lite schemas", () => {
  it("accepts valid create staff profile input", () => {
    const parsed: CreateStaffProfileInput = createStaffProfileSchema.parse({
      branchId,
      employeeCode: " EMP-1001 ",
      firstName: " Meera ",
      lastName: "Sharma",
      staffType: "TEACHER",
      designation: "Mathematics Teacher",
      department: "Academics",
      phone: "+91 98765-43210",
      email: "MEERA.SHARMA@SCHOOL.EXAMPLE",
      joiningDate: "2026-04-01"
    });

    expect(parsed.employeeCode).toBe("EMP-1001");
    expect(parsed.firstName).toBe("Meera");
    expect(parsed.phone).toBe("+919876543210");
    expect(parsed.email).toBe("meera.sharma@school.example");
  });

  it("rejects create staff profile input without employeeCode", () => {
    const result = createStaffProfileSchema.safeParse({
      branchId,
      firstName: "Meera",
      staffType: "TEACHER"
    });

    expect(result.success).toBe(false);
  });

  it("rejects create staff profile input without firstName", () => {
    const result = createStaffProfileSchema.safeParse({
      branchId,
      employeeCode: "EMP-1001",
      staffType: "TEACHER"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid staffType", () => {
    const result = createStaffProfileSchema.safeParse({
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "PAYROLL_MANAGER"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid staff email", () => {
    const result = createStaffProfileSchema.safeParse({
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER",
      email: "not-an-email"
    });

    expect(result.success).toBe(false);
  });

  it("allows safe partial staff profile updates", () => {
    const result = updateStaffProfileSchema.safeParse({
      staffId,
      designation: "Senior Teacher",
      employmentStatus: "ACTIVE"
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty staff profile updates", () => {
    const result = updateStaffProfileSchema.safeParse({ staffId });

    expect(result.success).toBe(false);
  });

  it("rejects sensitive staff profile fields", () => {
    const result = createStaffProfileSchema.safeParse({
      tenantId: "00000000-0000-0000-0000-000000000099",
      userId: "00000000-0000-0000-0000-000000000098",
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    });

    expect(result.success).toBe(false);
  });

  it("accepts CHECK_IN and CHECK_OUT QR generation input", () => {
    expect(generateStaffQrSchema.safeParse({ purpose: "CHECK_IN" }).success).toBe(true);
    expect(generateStaffQrSchema.safeParse({ branchId, purpose: "CHECK_OUT" }).success).toBe(true);
  });

  it("rejects client-controlled QR validity", () => {
    expect(generateStaffQrSchema.safeParse({ purpose: "CHECK_IN", validForSeconds: 180 }).success).toBe(false);
  });

  it("rejects invalid QR purpose", () => {
    const result = generateStaffQrSchema.safeParse({ purpose: "BREAK" });

    expect(result.success).toBe(false);
  });

  it("rejects sensitive QR generation fields", () => {
    const result = generateStaffQrSchema.safeParse({
      purpose: "CHECK_IN",
      tenantId: "00000000-0000-0000-0000-000000000099",
      createdById: "00000000-0000-0000-0000-000000000098",
      tokenHash: "server-owned-hash",
      rawToken: "server-owned-raw-token",
      qrPayload: "{\"token\":\"server-owned-raw-token\"}"
    });

    expect(result.success).toBe(false);
  });

  it("requires a QR scan token", () => {
    expect(scanStaffQrSchema.safeParse({}).success).toBe(false);
  });

  it("rejects blank QR scan token", () => {
    expect(scanStaffQrSchema.safeParse({ token: "   " }).success).toBe(false);
  });

  it("rejects sensitive QR scan fields", () => {
    const result = scanStaffQrSchema.safeParse({
      token: "secure-raw-token-12345",
      tokenHash: "server-owned-hash",
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId,
      staffId,
      actorUserId: "00000000-0000-0000-0000-000000000098"
    });

    expect(result.success).toBe(false);
  });

  it("accepts a raw QR scan payload for the browser action", () => {
    const result = scanStaffQrPayloadSchema.safeParse({
      qrPayload: "{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\"secure-raw-token-12345\"}"
    });

    expect(result.success).toBe(true);
  });

  it("rejects blank and sensitive raw QR scan payload fields", () => {
    expect(scanStaffQrPayloadSchema.safeParse({ qrPayload: "   " }).success).toBe(false);
    const result = scanStaffQrPayloadSchema.safeParse({
      qrPayload: "{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\"secure-raw-token-12345\"}",
      token: "secure-raw-token-12345",
      tokenHash: "server-owned-hash",
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId,
      staffId,
      actorUserId: "00000000-0000-0000-0000-000000000098"
    });

    expect(result.success).toBe(false);
  });

  it("requires a staff correction reason", () => {
    const result = correctStaffAttendanceSchema.safeParse({
      attendanceRecordId,
      status: "PRESENT"
    });

    expect(result.success).toBe(false);
  });

  it("rejects blank or short staff correction reasons", () => {
    expect(correctStaffAttendanceSchema.safeParse({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "   "
    }).success).toBe(false);

    expect(correctStaffAttendanceSchema.safeParse({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "fix"
    }).success).toBe(false);
  });

  it("rejects NOT_MARKED as a staff correction status", () => {
    const result = correctStaffAttendanceSchema.safeParse({
      attendanceRecordId,
      status: "NOT_MARKED",
      correctionReason: "Admin verified source record"
    });

    expect(result.success).toBe(false);
  });

  it("rejects sensitive staff correction fields", () => {
    const result = correctStaffAttendanceSchema.safeParse({
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Admin verified source record",
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId,
      actorUserId: "00000000-0000-0000-0000-000000000098",
      updatedById: "00000000-0000-0000-0000-000000000097"
    });

    expect(result.success).toBe(false);
  });

  it("accepts strict staff attendance report filters", () => {
    expect(staffDailyAttendanceReportFilterSchema.safeParse({
      branchId,
      date: "2026-05-05",
      staffType: "TEACHER",
      status: "LATE",
      department: "Academics",
      search: "Meera"
    }).success).toBe(true);

    expect(staffDateRangeAttendanceReportFilterSchema.safeParse({
      branchId,
      fromDate: "2026-05-01",
      toDate: "2026-05-31",
      staffType: "ADMIN",
      status: "PRESENT"
    }).success).toBe(true);

    expect(staffMonthlyAttendanceSummaryFilterSchema.safeParse({
      branchId,
      month: 5,
      year: 2026,
      department: "Transport"
    }).success).toBe(true);

    expect(staffCorrectionReportFilterSchema.safeParse({
      branchId,
      fromDate: "2026-05-01",
      toDate: "2026-05-31"
    }).success).toBe(true);
  });

  it("rejects sensitive staff report fields", () => {
    const result = staffDailyAttendanceReportFilterSchema.safeParse({
      branchId,
      date: "2026-05-05",
      tenantId: "00000000-0000-0000-0000-000000000099",
      actorUserId: "00000000-0000-0000-0000-000000000098"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid staff report date ranges and month values", () => {
    expect(staffDateRangeAttendanceReportFilterSchema.safeParse({
      fromDate: "2026-05-31",
      toDate: "2026-05-01"
    }).success).toBe(false);

    expect(staffMonthlyAttendanceSummaryFilterSchema.safeParse({
      month: 13,
      year: 2026
    }).success).toBe(false);
  });
});
