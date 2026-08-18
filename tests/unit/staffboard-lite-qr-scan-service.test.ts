import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  hashStaffAttendanceQrToken,
  scanStaffAttendanceQr
} from "@/modules/staffboard-lite/services/staff-qr.service";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    academicCalendarEntry: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
    attendanceSetting: { findFirst: vi.fn() },
    staffAttendanceQrToken: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staffAttendanceRecord: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staffProfile: { findFirst: vi.fn() },
    tenantSettings: { findUnique: vi.fn() }
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
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const staffId = "00000000-0000-0000-0000-000000000004";
const secondUserId = "00000000-0000-0000-0000-000000000014";
const secondStaffId = "00000000-0000-0000-0000-000000000024";
const qrTokenId = "00000000-0000-0000-0000-000000000005";
const attendanceRecordId = "00000000-0000-0000-0000-000000000006";
const academicYearId = "00000000-0000-0000-0000-000000000007";
const institutionId = "00000000-0000-0000-0000-000000000008";
const rawToken = "raw-staff-qr-token-12345";
const attendanceDate = new Date(Date.UTC(2026, 4, 5));

const ctx: TenantContext = {
  tenantId,
  userId,
  userEmail: "teacher@example.com",
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
    staffType: "ADMIN",
    branch: { id: branchId, institutionId, timezone: "Asia/Kolkata", status: "ACTIVE" },
    ...overrides
  };
}

function qrToken(overrides: Record<string, unknown> = {}) {
  return {
    id: qrTokenId,
    tenantId,
    branchId,
    purpose: "CHECK_IN",
    status: "ACTIVE",
    validFrom: new Date("2026-05-05T00:00:00.000Z"),
    validUntil: new Date("2026-05-05T18:00:00.000Z"),
    ...overrides
  };
}

function existingRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: attendanceRecordId,
    tenantId,
    branchId,
    academicYearId,
    staffId,
    attendanceDate,
    status: "PRESENT",
    checkInAt: new Date("2026-05-05T02:30:00.000Z"),
    checkOutAt: null,
    workingMinutes: null,
    checkInSource: "QR_SCAN",
    checkOutSource: null,
    checkInQrTokenId: qrTokenId,
    checkOutQrTokenId: null,
    markedById: userId,
    updatedById: null,
    leaveApplicationId: null,
    calendarEntryId: null,
    correctionReason: null,
    createdAt: new Date("2026-05-05T02:30:00.000Z"),
    updatedAt: new Date("2026-05-05T02:30:00.000Z"),
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
  mocks.tx.staffProfile.findFirst.mockResolvedValue(staffProfile());
  mocks.tx.academicCalendarEntry.findFirst.mockResolvedValue(null);
  mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken());
  mocks.tx.staffAttendanceQrToken.update.mockResolvedValue({ id: qrTokenId });
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
    staffQrAttendanceEnabled: true,
    staffLateAfterTime: "08:00",
    staffHalfDayBeforeMinutes: 240,
    staffMinimumWorkingMinutes: 480
  });
  mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(null);
  mocks.tx.staffAttendanceRecord.create.mockImplementation(({ data }) => ({
    id: attendanceRecordId,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...data
  }));
  mocks.tx.staffAttendanceRecord.update.mockImplementation(({ data }) => ({
    ...existingRecord(),
    ...data,
    updatedAt: new Date()
  }));
}

describe("StaffBoard Lite QR scan service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T02:20:00.000Z"));
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects client-supplied tenant, branch, staff, and actor fields before opening a transaction", async () => {
    await expect(scanStaffAttendanceQr(ctx, {
      token: rawToken,
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId: "00000000-0000-0000-0000-000000000098",
      staffId: "00000000-0000-0000-0000-000000000097",
      actorUserId: "00000000-0000-0000-0000-000000000096"
    })).rejects.toThrow();

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.staffProfile.findFirst).not.toHaveBeenCalled();
  });

  it("creates a valid CHECK_IN attendance record", async () => {
    const result = await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(result).toEqual({
      success: true,
      purpose: "CHECK_IN",
      attendanceDate: "2026-05-05",
      checkInAt: "2026-05-05T02:20:00.000Z",
      checkOutAt: undefined,
      status: "PRESENT",
      message: "Check-in successful"
    });
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.self_scan",
      branchId
    });
    expect(mocks.tx.staffProfile.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId,
        userId,
        employmentStatus: "ACTIVE"
      },
      select: expect.any(Object)
    });
    expect(mocks.tx.staffAttendanceQrToken.findFirst).toHaveBeenCalledWith({
      where: { tenantId, tokenHash: hashStaffAttendanceQrToken(rawToken) },
      select: expect.any(Object)
    });
    expect(mocks.tx.staffAttendanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        branchId,
        academicYearId,
        staffId,
        attendanceDate,
        status: "PRESENT",
        checkInAt: new Date("2026-05-05T02:20:00.000Z"),
        checkInSource: "QR_SCAN",
        checkInQrTokenId: qrTokenId,
        markedById: userId
      })
    });
    const createArg = mocks.tx.staffAttendanceRecord.create.mock.calls[0][0];
    expect(JSON.stringify(createArg.data)).not.toContain(rawToken);
    expect(JSON.stringify(createArg.data)).not.toContain(hashStaffAttendanceQrToken(rawToken));
    expect(createArg.data).not.toHaveProperty("tokenHash");
    expect(createArg.data).not.toHaveProperty("rawToken");
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(result)).not.toContain(hashStaffAttendanceQrToken(rawToken));
  });

  it("rejects QR attendance on an applicable institution holiday", async () => {
    mocks.tx.academicCalendarEntry.findFirst.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000088",
      name: "Paid holiday",
      entryType: "HOLIDAY",
      startDate: attendanceDate,
      endDate: attendanceDate
    });

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_ATTENDANCE_HOLIDAY"
    });

    expect(mocks.tx.academicCalendarEntry.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        tenantId,
        institutionId,
        academicYearId,
        audiences: { has: "NON_TEACHING_STAFF" },
        OR: [{ branchId: null }, { branchId }]
      }),
      select: expect.any(Object),
      orderBy: expect.any(Array)
    });
    expect(mocks.tx.staffAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("does not overwrite an existing calendar-managed paid holiday row", async () => {
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({
      status: "HOLIDAY",
      checkInAt: null,
      calendarEntryId: "00000000-0000-0000-0000-000000000088"
    }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_ATTENDANCE_HOLIDAY"
    });

    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });

  it("records valid CHECK_OUT and calculates working minutes", async () => {
    vi.setSystemTime(new Date("2026-05-05T10:30:00.000Z"));
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ purpose: "CHECK_OUT" }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({
      checkInAt: new Date("2026-05-05T02:30:00.000Z")
    }));

    const result = await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(result).toMatchObject({
      success: true,
      purpose: "CHECK_OUT",
      attendanceDate: "2026-05-05",
      checkInAt: "2026-05-05T02:30:00.000Z",
      checkOutAt: "2026-05-05T10:30:00.000Z",
      status: "PRESENT",
      message: "Check-out successful"
    });
    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: attendanceRecordId },
      data: expect.objectContaining({
        status: "PRESENT",
        checkOutAt: new Date("2026-05-05T10:30:00.000Z"),
        checkOutSource: "QR_SCAN",
        checkOutQrTokenId: qrTokenId,
        workingMinutes: 480,
        updatedById: userId
      })
    });
  });

  it("rejects duplicate check-in", async () => {
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord());

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_ALREADY_CHECKED_IN"
    });
    expect(mocks.tx.staffAttendanceQrToken.update).not.toHaveBeenCalled();
  });

  it("rejects duplicate check-out", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ purpose: "CHECK_OUT" }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({
      checkOutAt: new Date("2026-05-05T10:30:00.000Z")
    }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_ALREADY_CHECKED_OUT"
    });
  });

  it("rejects check-out before check-in", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ purpose: "CHECK_OUT" }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({ checkInAt: null }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_CHECK_IN_REQUIRED"
    });
  });

  it("rejects invalid QR token", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(null);

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_STAFF_QR"
    });
  });

  it("rejects expired QR token", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({
      validUntil: new Date("2026-05-05T02:19:59.000Z")
    }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_QR_EXPIRED"
    });
    expect(mocks.tx.staffAttendanceQrToken.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: qrTokenId },
      data: {
        status: "EXPIRED",
        expiredAt: new Date("2026-05-05T02:19:59.000Z")
      }
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_EXPIRED
    }), mocks.tx);
  });

  it("rejects an operator-deactivated QR token", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ status: "DEACTIVATED" }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "INVALID_STAFF_QR"
    });
    expect(mocks.tx.staffAttendanceRecord.create).not.toHaveBeenCalled();
  });

  it("rejects a QR token that is not yet valid", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({
      validFrom: new Date("2026-05-05T02:20:01.000Z")
    }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_QR_EXPIRED"
    });

    expect(mocks.tx.staffAttendanceRecord.create).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceQrToken.update).not.toHaveBeenCalled();
  });

  it("rejects QR token for a different branch", async () => {
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({
      branchId: "00000000-0000-0000-0000-000000000099"
    }));

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "STAFF_QR_BRANCH_MISMATCH",
      status: 403
    });
  });

  it("rejects inactive or missing staff profile", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(null);

    await expect(scanStaffAttendanceQr(ctx, { token: rawToken })).rejects.toMatchObject({
      code: "ACTIVE_STAFF_PROFILE_NOT_FOUND"
    });
    expect(mocks.tx.staffAttendanceQrToken.findFirst).not.toHaveBeenCalled();
  });

  it("marks late check-in after branch late time", async () => {
    vi.setSystemTime(new Date("2026-05-05T02:40:00.000Z"));

    await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(mocks.tx.staffAttendanceRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: "LATE" })
    });
  });

  it("marks half-day when working minutes are below threshold", async () => {
    vi.setSystemTime(new Date("2026-05-05T04:00:00.000Z"));
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ purpose: "CHECK_OUT" }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({
      checkInAt: new Date("2026-05-05T02:30:00.000Z")
    }));

    await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: attendanceRecordId },
      data: expect.objectContaining({
        status: "HALF_DAY",
        workingMinutes: 90
      })
    });
  });

  it("keeps checkout status HALF_DAY until full-day working threshold is reached", async () => {
    vi.setSystemTime(new Date("2026-05-05T07:30:00.000Z"));
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(qrToken({ purpose: "CHECK_OUT" }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(existingRecord({
      checkInAt: new Date("2026-05-05T02:30:00.000Z")
    }));

    await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(mocks.tx.staffAttendanceRecord.update).toHaveBeenCalledWith({
      where: { id: attendanceRecordId },
      data: expect.objectContaining({
        status: "HALF_DAY",
        workingMinutes: 300
      })
    });
  });

  it("increments token consumedCount after successful scan", async () => {
    await scanStaffAttendanceQr(ctx, { token: rawToken });

    expect(mocks.tx.staffAttendanceQrToken.update).toHaveBeenCalledWith({
      where: { id: qrTokenId },
      data: {
        consumedCount: { increment: 1 },
        lastUsedAt: new Date("2026-05-05T02:20:00.000Z")
      }
    });
  });

  it("allows the same valid QR token to be used by different staff without invalidating it", async () => {
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(staffProfile({ id: staffId }))
      .mockResolvedValueOnce(staffProfile({ id: secondStaffId }));
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(null);

    await scanStaffAttendanceQr(ctx, { token: rawToken });
    await scanStaffAttendanceQr({ ...ctx, userId: secondUserId, userEmail: "second.teacher@example.com" }, { token: rawToken });

    expect(mocks.tx.staffAttendanceQrToken.findFirst).toHaveBeenCalledTimes(2);
    expect(mocks.tx.staffAttendanceQrToken.update).toHaveBeenCalledTimes(2);
    expect(mocks.tx.staffAttendanceRecord.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ staffId, markedById: userId })
    });
    expect(mocks.tx.staffAttendanceRecord.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ staffId: secondStaffId, markedById: secondUserId })
    });
  });

  it("writes audit log without raw token or tokenHash", async () => {
    await scanStaffAttendanceQr(ctx, { token: rawToken });

    const auditArg = mocks.writeAuditLog.mock.calls
      .map(([input]) => input)
      .find((input) => input.action === STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CHECK_IN);
    if (!auditArg) throw new Error("Expected staff attendance check-in audit event.");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_USED,
      entityType: "StaffAttendanceQrToken",
      entityId: qrTokenId
    }), mocks.tx);
    const serializedAudit = JSON.stringify(auditArg);
    expect(auditArg).toEqual(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CHECK_IN,
      entityType: "StaffAttendanceRecord",
      entityId: attendanceRecordId,
      branchId,
      academicYearId
    }));
    expect(auditArg.metadata).toEqual(expect.objectContaining({
      tenantId,
      branchId,
      staffId,
      actorUserId: userId,
      attendanceRecordId,
      purpose: "CHECK_IN",
      qrTokenId,
      checkInStatus: "PRESENT",
      checkOutStatus: null,
      workingMinutes: null,
      thresholds: {
        lateAfterTime: "08:00",
        halfDayBeforeMinutes: 240,
        fullDayMinutes: 480,
        timeZone: "Asia/Kolkata"
      }
    }));
    expect(serializedAudit).not.toContain(rawToken);
    expect(serializedAudit).not.toContain(hashStaffAttendanceQrToken(rawToken));
  });
});
