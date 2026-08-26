import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateStaffAttendanceProjection,
  inferNextStaffAttendanceEvent,
  type StaffAttendanceProjectionPolicy
} from "@/modules/staffboard-lite/utils/staff-attendance-projection";
import { recordSupervisedStaffQrScanSchema } from "@/modules/staffboard-lite/schemas";

const policy: StaffAttendanceProjectionPolicy = {
  timeZone: "Asia/Kolkata",
  shiftStartTime: "08:00",
  expectedCheckOutTime: "16:00",
  graceMinutes: 10,
  halfDayMinimumMinutes: 240,
  fullDayMinimumMinutes: 480,
  earlyDepartureGraceMinutes: 10,
  checkInOnly: false
};

describe("Hybrid Staff Attendance domain", () => {
  it("derives Present for a complete on-time working day", () => {
    const result = calculateStaffAttendanceProjection({
      checkInAt: new Date("2026-05-05T02:25:00.000Z"),
      checkOutAt: new Date("2026-05-05T10:35:00.000Z"),
      policy
    });

    expect(result).toEqual({
      status: "PRESENT",
      flags: [],
      workingMinutes: 490,
      lateMinutes: 0,
      earlyDepartureMinutes: 0
    });
  });

  it("derives late, early-departure, and half-day outcomes from the versioned policy", () => {
    const result = calculateStaffAttendanceProjection({
      checkInAt: new Date("2026-05-05T02:45:00.000Z"),
      checkOutAt: new Date("2026-05-05T10:00:00.000Z"),
      policy
    });

    expect(result.status).toBe("HALF_DAY");
    expect(result.workingMinutes).toBe(435);
    expect(result.lateMinutes).toBe(5);
    expect(result.earlyDepartureMinutes).toBe(20);
    expect(result.flags).toEqual(expect.arrayContaining(["LATE", "EARLY_DEPARTURE"]));
  });

  it("flags an incomplete closed day without manufacturing a check-out", () => {
    const result = calculateStaffAttendanceProjection({
      checkInAt: new Date("2026-05-05T02:30:00.000Z"),
      checkOutAt: null,
      policy,
      dayClosed: true
    });

    expect(result.status).toBe("PRESENT");
    expect(result.workingMinutes).toBeNull();
    expect(result.flags).toContain("MISSING_CHECK_OUT");
  });

  it("infers check-in and check-out once and rejects duplicate attendance", () => {
    expect(inferNextStaffAttendanceEvent({ mode: "AUTO", hasCheckIn: false, hasCheckOut: false })).toBe("CHECK_IN");
    expect(inferNextStaffAttendanceEvent({ mode: "AUTO", hasCheckIn: true, hasCheckOut: false })).toBe("CHECK_OUT");
    expect(() => inferNextStaffAttendanceEvent({ mode: "AUTO", hasCheckIn: true, hasCheckOut: true })).toThrow(
      "STAFF_ATTENDANCE_ALREADY_RECORDED"
    );
  });

  it("rejects client-supplied tenant, branch, user, role, and status claims", () => {
    const result = recordSupervisedStaffQrScanSchema.safeParse({
      sessionId: "00000000-0000-0000-0000-000000000001",
      qrPayload: "opaque-credential-payload",
      clientRequestId: "00000000-0000-4000-8000-000000000002",
      tenantId: "00000000-0000-0000-0000-000000000003",
      branchId: "00000000-0000-0000-0000-000000000004",
      userId: "00000000-0000-0000-0000-000000000005",
      role: "PRINCIPAL",
      attendanceStatus: "PRESENT"
    });

    expect(result.success).toBe(false);
  });

  it("keeps idempotency, tenant scope, branch assignment, maker-checker, and legacy fail-closed guards server-side", () => {
    const scannerSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/services/staff-attendance-scanner.service.ts"),
      "utf8"
    );
    const adjustmentSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/services/staff-attendance-adjustments.service.ts"),
      "utf8"
    );
    const legacyActionSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/actions/staff-attendance.actions.ts"),
      "utf8"
    );
    const registerPageSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/page.tsx"),
      "utf8"
    );
    const reportsPageSource = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/staffboard/attendance/reports/page.tsx"),
      "utf8"
    );

    expect(scannerSource).toContain("tenantId_clientRequestId");
    expect(scannerSource).toContain("where: { tenantId: ctx.tenantId, tokenHash }");
    expect(scannerSource).toContain("staffBranchAssignment.findFirst");
    expect(scannerSource).toContain("STAFF_ATTENDANCE_WRONG_BRANCH");
    expect(scannerSource).toContain('permission: "staffboard.attendance.scan"');
    const sharedDomainSource = readFileSync(
      resolve(process.cwd(), "src/modules/staffboard-lite/services/staff-attendance-domain.shared.ts"),
      "utf8"
    );
    expect(sharedDomainSource).toContain("tx.$executeRaw");
    expect(sharedDomainSource).not.toContain("tx.$queryRaw(Prisma.sql");
    expect(adjustmentSource).toContain("adjustment.requestedByUserId === ctx.userId");
    expect(adjustmentSource).toContain("STAFF_ATTENDANCE_MAKER_CHECKER_REQUIRED");
    expect(adjustmentSource).toContain("scope.staffId !== ownStaffProfile?.id");
    expect(adjustmentSource).toContain('requireAdjustmentAccess(ctx, scope.branchId, "staffboard.attendance.correct")');
    expect(legacyActionSource).toContain("ATTENDANCE_CORRECTION_APPROVAL_REQUIRED");
    expect(registerPageSource).toContain("!ctx.accessibleBranchIds.includes(filters.branchId)");
    expect(reportsPageSource).toContain('activePermissions.has("staffboard.attendance.report")');
    expect(reportsPageSource).toContain("!ctx.accessibleBranchIds.includes(filters.branchId)");
    expect(reportsPageSource).toContain("return <PermissionState />");
  });
});