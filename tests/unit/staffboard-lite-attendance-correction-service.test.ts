import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import { correctStaffAttendance } from "@/modules/staffboard-lite/services/staff-attendance.service";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    attendanceSetting: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    tenantSettings: { findUnique: vi.fn() },
    staffAttendanceRecord: { findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() }
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
const staffId = "00000000-0000-0000-0000-000000000004";
const attendanceRecordId = "00000000-0000-0000-0000-000000000005";
const academicYearId = "00000000-0000-0000-0000-000000000006";
const rawToken = "raw-staff-qr-token-12345";
const tokenHash = "abcdef-token-hash";
const attendanceDate = new Date(Date.UTC(2026, 4, 5));

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

function attendanceRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: attendanceRecordId,
    tenantId,
    branchId,
    academicYearId,
    staffId,
    attendanceDate,
    status: "LATE",
    checkInAt: new Date("2026-05-05T02:45:00.000Z"),
    checkOutAt: new Date("2026-05-05T09:45:00.000Z"),
    workingMinutes: 420,
    checkInSource: "QR_SCAN",
    checkOutSource: "QR_SCAN",
    checkInQrTokenId: "00000000-0000-0000-0000-000000000007",
    checkOutQrTokenId: "00000000-0000-0000-0000-000000000008",
    markedById: staffId,
    updatedById: null,
    correctionReason: null,
    createdAt: new Date("2026-05-05T02:45:00.000Z"),
    updatedAt: new Date("2026-05-05T09:45:00.000Z"),
    branch: { id: branchId, timezone: "Asia/Kolkata", status: "ACTIVE" },
    ...overrides
  };
}

function persistedRecord(overrides: Record<string, unknown> = {}) {
  const { branch, ...record } = attendanceRecord(overrides);
  void branch;
  return record;
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
  mocks.tx.tenantSettings.findUnique.mockResolvedValue({ schoolCastEnabled: false, schoolCastAutomationEnabled: false });
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
    staffLateAfterTime: "08:00",
    staffHalfDayBeforeMinutes: 240,
    staffMinimumWorkingMinutes: 480
  });
  mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(attendanceRecord());
  mocks.tx.staffAttendanceRecord.update.mockImplementation(({ data }) => ({
    ...persistedRecord(),
    ...data,
    updatedAt: new Date("2026-05-05T10:00:00.000Z")
  }));
}

describe("StaffBoard Lite attendance correction service", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("updates status and reason for an authorized correction", async () => {
    const result = await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved by principal after staff verification"
    });

    expect(result).toEqual(expect.objectContaining({
      attendanceRecordId,
      staffId,
      branchId,
      attendanceDate: "2026-05-05",
      previousStatus: "LATE",
      newStatus: "PRESENT",
      correctionReason: "Approved by principal after staff verification",
      correctedById: actorUserId
    }));
    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: attendanceRecordId },
      data: expect.objectContaining({
        status: "PRESENT",
        correctionReason: "Approved by principal after staff verification",
        updatedById: actorUserId
      })
    });
  });

  it("requires staffboard.attendance.correct permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.correct"));

    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Approved correction by admin"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.attendance.correct");

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.correct",
      branchId
    });
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("uses tenantId and actorUserId from server context", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "HALF_DAY",
      correctionReason: "Half-day approved by admin"
    });

    expect(mocks.tx.staffAttendanceRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: attendanceRecordId,
        tenantId,
        branchId: { in: [branchId] }
      }
    }));
    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ updatedById: actorUserId })
    }));
  });

  it("verifies branch access before updating", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Branch admin verified record"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.correct",
      branchId
    });
  });

  it("rejects inaccessible cross-tenant or cross-branch records safely", async () => {
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(null);

    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Admin verified record"
    })).rejects.toMatchObject({ code: "STAFF_ATTENDANCE_RECORD_NOT_FOUND" });

    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("rejects NOT_MARKED as a manual correction status", async () => {
    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "NOT_MARKED",
      correctionReason: "Set back to unmarked"
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects blank or short correction reasons", async () => {
    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: " "
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("preserves QR token references during correction", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "QR record verified manually"
    });

    const updateData = mocks.tx.staffAttendanceRecord.update.mock.calls[0][0].data;
    expect(updateData).not.toHaveProperty("checkInQrTokenId");
    expect(updateData).not.toHaveProperty("checkOutQrTokenId");
  });

  it("recalculates workingMinutes when both final times exist", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      checkOutAt: new Date("2026-05-05T10:45:00.000Z"),
      correctionReason: "Corrected checkout time from office register"
    });

    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: attendanceRecordId },
      data: expect.objectContaining({
        checkOutAt: new Date("2026-05-05T10:45:00.000Z"),
        workingMinutes: 480
      })
    });
  });

  it("rejects corrected check-out before existing check-in", async () => {
    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      checkOutAt: new Date("2026-05-05T02:00:00.000Z"),
      correctionReason: "Invalid checkout adjustment"
    })).rejects.toMatchObject({ code: "STAFF_ATTENDANCE_CHECK_OUT_BEFORE_CHECK_IN" });

    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("writes audit log with before and after values", async () => {
    const before = attendanceRecord({ status: "LATE" });
    const after = persistedRecord({ status: "PRESENT", correctionReason: "Manual admin correction" });
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(before);
    mocks.tx.staffAttendanceRecord.update.mockResolvedValue(after);

    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Manual admin correction"
    });

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CORRECTED,
      entityType: "StaffAttendanceRecord",
      entityId: attendanceRecordId,
      branchId,
      academicYearId,
      before,
      after,
      metadata: expect.objectContaining({
        tenantId,
        branchId,
        actorUserId,
        attendanceRecordId,
        staffId,
        previousStatus: "LATE",
        newStatus: "PRESENT",
        correctionReason: "Manual admin correction",
        previousWorkingMinutes: 420,
        newWorkingMinutes: 420
      })
    }), mocks.tx);
  });

  it("does not log raw token or tokenHash", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Correction without token exposure"
    });

    const serializedAudit = JSON.stringify(mocks.writeAuditLog.mock.calls[0][0]);
    expect(serializedAudit).not.toContain(rawToken);
    expect(serializedAudit).not.toContain(tokenHash);
  });

  it("does not hard delete attendance records", async () => {
    await correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "ABSENT",
      correctionReason: "Staff was absent per manual verification"
    });

    expect(mocks.tx.staffAttendanceRecord.delete).not.toHaveBeenCalled();
  });

  it("returns a safe corrected attendance result", async () => {
    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "ON_LEAVE",
      correctionReason: "Approved leave entered manually"
    })).resolves.toEqual({
      attendanceRecordId,
      staffId,
      branchId,
      attendanceDate: "2026-05-05",
      previousStatus: "LATE",
      newStatus: "ON_LEAVE",
      checkInAt: "2026-05-05T02:45:00.000Z",
      checkOutAt: "2026-05-05T09:45:00.000Z",
      workingMinutes: 420,
      correctionReason: "Approved leave entered manually",
      correctedById: actorUserId
    });
  });
});
