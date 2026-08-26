import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");

function getEnumValues(enumName: string) {
  const match = new RegExp(`enum ${enumName} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match) throw new Error(`Missing Prisma enum: ${enumName}`);
  return match[1]
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getModelBlock(modelName: string) {
  const match = new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`).exec(schema);
  if (!match) throw new Error(`Missing Prisma model: ${modelName}`);
  return match[1];
}

describe("StaffBoard Lite Prisma schema", () => {
  it("defines MVP staff enums exactly", () => {
    expect(getEnumValues("StaffType")).toEqual([
      "TEACHER",
      "ADMIN",
      "ACCOUNTANT",
      "LIBRARIAN",
      "DRIVER",
      "HELPER",
      "SECURITY",
      "PEON",
      "CLEANING_STAFF",
      "MANAGEMENT",
      "OTHER"
    ]);
    expect(getEnumValues("EmploymentStatus")).toEqual(["ACTIVE", "INACTIVE", "RESIGNED", "TERMINATED"]);
    expect(getEnumValues("StaffAttendanceStatus")).toEqual([
      "PRESENT",
      "ABSENT",
      "LATE",
      "HALF_DAY",
      "ON_LEAVE",
      "OFFICIAL_DUTY",
      "WEEK_OFF",
      "HOLIDAY",
      "INCOMPLETE",
      "NOT_MARKED"
    ]);
    expect(getEnumValues("StaffAttendanceSource")).toEqual(["QR_SCAN", "MANUAL_ADMIN", "IMPORT", "BIOMETRIC"]);
    expect(getEnumValues("StaffQrPurpose")).toEqual(["CHECK_IN", "CHECK_OUT"]);
    expect(getEnumValues("StaffQrTokenStatus")).toEqual(["ACTIVE", "DEACTIVATED", "EXPIRED"]);
  });

  it("defines tenant-safe staff profile constraints and indexes", () => {
    const model = getModelBlock("StaffProfile");

    expect(model).toContain("tenantId");
    expect(model).toContain("branchId");
    expect(model).toContain("employeeCode");
    expect(model).toContain("staffType        StaffType");
    expect(model).toContain("employmentStatus EmploymentStatus @default(ACTIVE)");
    expect(model).toContain("@@unique([tenantId, employeeCode])");
    expect(model).toContain("@@index([tenantId, branchId])");
    expect(model).toContain("@@index([tenantId, staffType])");
    expect(model).toContain("@@index([tenantId, employmentStatus])");
  });

  it("defines daily staff attendance uniqueness, sources, and correction fields", () => {
    const model = getModelBlock("StaffAttendanceRecord");

    expect(model).toMatch(/attendanceDate\s+DateTime/);
    expect(model).toMatch(/status\s+StaffAttendanceStatus/);
    expect(model).toMatch(/checkInSource\s+StaffAttendanceSource\?/);
    expect(model).toMatch(/checkOutSource\s+StaffAttendanceSource\?/);
    expect(model).toMatch(/correctionReason\s+String\?/);
    expect(model).toMatch(/leaveApplicationId\s+String\?/);
    expect(model).toContain("@@unique([tenantId, branchId, staffId, attendanceDate])");
    expect(model).toContain("@@index([tenantId, branchId, attendanceDate])");
    expect(model).toContain("@@index([tenantId, staffId])");
    expect(model).toContain("@@index([tenantId, status, attendanceDate])");
  });

  it("stores only QR token hashes and indexes token lookup windows", () => {
    const model = getModelBlock("StaffAttendanceQrToken");

    expect(model).toMatch(/tokenHash\s+String\s+@unique/);
    expect(model).not.toMatch(/\brawToken\b/i);
    expect(model).not.toMatch(/\btoken\s+String\b/);
    expect(model).toMatch(/purpose\s+StaffQrPurpose/);
    expect(model).toMatch(/status\s+StaffQrTokenStatus\s+@default\(ACTIVE\)/);
    expect(model).toMatch(/consumedCount\s+Int\s+@default\(0\)/);
    expect(model).toMatch(/lastUsedAt\s+DateTime\?/);
    expect(model).toMatch(/deactivatedById\s+String\?/);
    expect(model).toContain("@@index([tenantId, branchId, validFrom, validUntil])");
    expect(model).toContain("@@index([tenantId, branchId, status, purpose, validUntil]");
  });

  it("does not introduce out-of-scope HR models", () => {
    expect(schema).not.toMatch(/\bmodel\s+Payroll\b/);
    expect(schema).not.toMatch(/\bmodel\s+LeaveBalance\b/);
    expect(schema).not.toMatch(/\bmodel\s+Appraisal\b/);
    expect(schema).not.toMatch(/\bmodel\s+HrDocument\b/);
  });

  it("does not introduce out-of-scope HR enums", () => {
    expect(schema).not.toMatch(/\benum\s+Payroll/i);
    expect(schema).not.toMatch(/\benum\s+Leave/i);
    expect(schema).not.toMatch(/\benum\s+Appraisal/i);
    expect(schema).not.toMatch(/\benum\s+Shift/i);
  });
});
