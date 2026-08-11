import { beforeEach, describe, expect, it, vi } from "vitest";
import { listStaffAttendanceForDate } from "@/modules/staffboard-lite/queries/staff-attendance.queries";
import { getDailyStaffAttendanceReport } from "@/modules/staffboard-lite/queries/staff-attendance-reports.queries";
import {
  getStaffProfileById,
  listStaffProfiles
} from "@/modules/staffboard-lite/queries/staff-profile.queries";
import { correctStaffAttendance } from "@/modules/staffboard-lite/services/staff-attendance.service";
import {
  createStaffProfile,
  deactivateStaffProfile,
  updateStaffProfile
} from "@/modules/staffboard-lite/services/staff-profile.service";
import {
  generateStaffAttendanceQrToken,
  scanStaffAttendanceQr
} from "@/modules/staffboard-lite/services/staff-qr.service";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    attendanceSetting: { findFirst: vi.fn() },
    branch: { findFirst: vi.fn(), findMany: vi.fn() },
    staffAttendanceQrToken: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staffAttendanceRecord: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    staffProfile: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const requirePermission = vi.fn();
  const writeAuditLog = vi.fn();
  return { db, requirePermission, tx, writeAuditLog };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const staffId = "00000000-0000-0000-0000-000000000005";
const attendanceRecordId = "00000000-0000-0000-0000-000000000006";

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "staff@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

function staffProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: staffId,
    tenantId,
    branchId,
    employeeCode: "EMP-1001",
    firstName: "Meera",
    middleName: null,
    lastName: "Sharma",
    staffType: "TEACHER",
    designation: "Teacher",
    department: "Academics",
    employmentStatus: "ACTIVE",
    branch: { id: branchId, timezone: "Asia/Kolkata", status: "ACTIVE" },
    ...overrides
  };
}

function attendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: attendanceRecordId,
    tenantId,
    branchId,
    academicYearId,
    staffId,
    attendanceDate: new Date(Date.UTC(2026, 4, 7)),
    status: "LATE",
    checkInAt: new Date("2026-05-07T03:00:00.000Z"),
    checkOutAt: null,
    workingMinutes: null,
    checkInSource: "QR_SCAN",
    checkOutSource: null,
    correctionReason: null,
    branch: { id: branchId, timezone: "Asia/Kolkata", status: "ACTIVE" },
    ...overrides
  };
}

function resetMocks() {
  for (const model of Object.values(mocks.tx)) {
    for (const method of Object.values(model)) {
      method.mockReset();
    }
  }
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
  mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId });
  mocks.tx.branch.findMany.mockResolvedValue([{ id: branchId, name: "Main Branch", code: "MAIN" }]);
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
    staffQrAttendanceEnabled: true,
    staffLateAfterTime: "08:00",
    staffHalfDayBeforeMinutes: 240,
    staffMinimumWorkingMinutes: 480
  });
}

describe("StaffBoard Lite RBAC", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("requires staff view permission before listing staff profiles", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.staff.view"));

    await expect(listStaffProfiles(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.staff.view");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.view",
      branchId
    });
    expect(mocks.tx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it("requires staff view permission before returning a staff profile by id", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(staffProfile());
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.staff.view"));

    await expect(getStaffProfileById(ctx, staffId)).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.staff.view");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.view",
      branchId
    });
  });

  it("does not let staff view permission create staff profiles", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.staff.create"));

    await expect(createStaffProfile(ctx, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.staff.create");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.create",
      branchId
    });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.staffProfile.create).not.toHaveBeenCalled();
  });

  it("requires staff update permission before staff profile mutation", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(staffProfile());
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.staff.update"));

    await expect(updateStaffProfile(ctx, {
      staffId,
      designation: "Senior Teacher"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.staff.update");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.update",
      branchId
    });
    expect(mocks.tx.staffProfile.update).not.toHaveBeenCalled();
  });

  it("does not let staff update permission deactivate staff unless deactivate permission is present", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(staffProfile());
    mocks.requirePermission.mockImplementation(
      ({ permission }: { permission: string }) => permission === "staffboard.staff.deactivate"
        ? Promise.reject(new Error("FORBIDDEN_PERMISSION:staffboard.staff.deactivate"))
        : Promise.resolve()
    );

    await expect(deactivateStaffProfile(ctx, staffId)).rejects.toThrow(
      "FORBIDDEN_PERMISSION:staffboard.staff.deactivate"
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.deactivate",
      branchId
    });
    expect(mocks.tx.staffProfile.update).not.toHaveBeenCalled();
  });

  it("requires QR generate permission and does not accept attendance view/report as a substitute", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.qr.generate"));

    const operatorCtx = { ...ctx, roleCodes: ["OFFICE_STAFF"] };
    await expect(generateStaffAttendanceQrToken(operatorCtx, { purpose: "CHECK_IN" })).rejects.toThrow(
      "FORBIDDEN_PERMISSION:staffboard.attendance.qr.generate"
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx: operatorCtx,
      permission: "staffboard.attendance.qr.generate",
      branchId
    });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceQrToken.create).not.toHaveBeenCalled();
  });

  it("requires self-scan permission before QR scan can read or write attendance records", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(staffProfile());
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.self_scan"));

    await expect(scanStaffAttendanceQr(ctx, {
      token: "raw-staff-qr-token-12345"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.attendance.self_scan");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.self_scan",
      branchId
    });
    expect(mocks.tx.staffAttendanceQrToken.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("does not let self-scan-only staff view the staff attendance admin table", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.view"));

    const result = await listStaffAttendanceForDate(ctx, { date: "2026-05-07" });

    expect(result.rows).toEqual([]);
    expect(result.branchOptions).toEqual([]);
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.view",
      branchId
    });
    expect(mocks.tx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it("does not let report-only users view the staff attendance admin table", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.view"));

    const result = await listStaffAttendanceForDate(ctx, { date: "2026-05-07" });

    expect(result.rows).toEqual([]);
    expect(result.branchOptions).toEqual([]);
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.view",
      branchId
    });
    expect(mocks.tx.staffProfile.findMany).not.toHaveBeenCalled();
  });

  it("requires staff attendance correction permission before correction writes", async () => {
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(attendanceRecord());
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.correct"));

    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Office register verified"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.attendance.correct");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.correct",
      branchId
    });
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("requires report permission before reading staff attendance reports", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.report"));

    const result = await getDailyStaffAttendanceReport(ctx, { date: "2026-05-07" });

    expect(result.rows).toEqual([]);
    expect(result.branchOptions).toEqual([]);
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.report",
      branchId
    });
    expect(mocks.tx.staffAttendanceRecord.findMany).not.toHaveBeenCalled();
  });
});
