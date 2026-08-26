import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import { getStaffProfileByUserId } from "@/modules/staffboard-lite/queries/staff-profile.queries";
import { correctStaffAttendance } from "@/modules/staffboard-lite/services/staff-attendance.service";
import { updateStaffProfile } from "@/modules/staffboard-lite/services/staff-profile.service";
import {
  generateStaffAttendanceQrToken,
  hashStaffAttendanceQrToken,
  scanStaffAttendanceQr
} from "@/modules/staffboard-lite/services/staff-qr.service";

const mocks = vi.hoisted(() => {
  const tx = {
    academicCalendarEntry: { findFirst: vi.fn() },
    attendanceSetting: { findFirst: vi.fn() },
    branch: { findFirst: vi.fn() },
    staffAttendanceQrToken: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    staffAttendanceRecord: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    staffProfile: { findFirst: vi.fn(), update: vi.fn() },
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
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const staffId = "00000000-0000-0000-0000-000000000005";
const qrTokenId = "00000000-0000-0000-0000-000000000006";
const attendanceRecordId = "00000000-0000-0000-0000-000000000007";
const institutionId = "00000000-0000-0000-0000-000000000008";
const rawToken = "raw-staff-qr-token-tenant-check";
const attendanceDate = new Date(Date.UTC(2026, 4, 5));

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "teacher@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId,
  roleCodes: ["PRINCIPAL"]
};

function staffProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: staffId,
    tenantId,
    branchId,
    userId: actorUserId,
    employeeCode: "EMP-1001",
    firstName: "Meera",
    middleName: null,
    lastName: "Sharma",
    staffType: "TEACHER",
    designation: "Teacher",
    department: "Academics",
    employmentStatus: "ACTIVE",
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

function attendanceRecord(overrides: Record<string, unknown> = {}) {
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
    markedById: actorUserId,
    updatedById: null,
    leaveApplicationId: null,
    calendarEntryId: null,
    correctionReason: null,
    createdAt: new Date("2026-05-05T02:30:00.000Z"),
    updatedAt: new Date("2026-05-05T02:30:00.000Z"),
    branch: { id: branchId, timezone: "Asia/Kolkata", status: "ACTIVE" },
    ...overrides
  };
}

function resetMocks() {
  mocks.tx.academicCalendarEntry.findFirst.mockReset();
  mocks.tx.attendanceSetting.findFirst.mockReset();
  mocks.tx.branch.findFirst.mockReset();
  mocks.tx.staffAttendanceQrToken.create.mockReset();
  mocks.tx.staffAttendanceQrToken.findFirst.mockReset();
  mocks.tx.staffAttendanceQrToken.findMany.mockReset();
  mocks.tx.staffAttendanceQrToken.update.mockReset();
  mocks.tx.staffAttendanceRecord.create.mockReset();
  mocks.tx.staffAttendanceRecord.findFirst.mockReset();
  mocks.tx.staffAttendanceRecord.update.mockReset();
  mocks.tx.staffProfile.findFirst.mockReset();
  mocks.tx.staffProfile.update.mockReset();
  mocks.tx.tenantSettings.findUnique.mockReset();
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
  mocks.tx.academicCalendarEntry.findFirst.mockResolvedValue(null);
  mocks.tx.staffAttendanceQrToken.findMany.mockResolvedValue([]);
  mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId });
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
    staffQrAttendanceEnabled: true,
    staffAttendanceCaptureMode: "HYBRID",
    staffSelfScanEnabled: true,
    staffLateAfterTime: "08:00",
    staffHalfDayBeforeMinutes: 240,
    staffMinimumWorkingMinutes: 480
  });
}

describe("StaffBoard Lite tenant isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T02:20:00.000Z"));
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks up staff profiles by user within tenant and accessible branch scope", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(null);

    await expect(getStaffProfileByUserId(ctx, actorUserId)).resolves.toBeNull();

    expect(mocks.tx.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: actorUserId,
        tenantId,
        branchId: { in: [branchId] }
      }
    }));
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("does not update a staff profile when the scoped tenant lookup returns nothing", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(null);

    await expect(updateStaffProfile(ctx, {
      staffId,
      designation: "Senior Teacher"
    })).rejects.toMatchObject({ code: "STAFF_PROFILE_NOT_FOUND" });

    expect(mocks.tx.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: staffId, tenantId }
    }));
    expect(mocks.tx.staffProfile.update).not.toHaveBeenCalled();
  });

  it("retires shared and self-scan QR entry points before tenant data access", async () => {
    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).rejects.toMatchObject({
      code: "STAFF_SHARED_QR_RETIRED",
      status: 410
    });
    await expect(scanStaffAttendanceQr(ctx, { token: "opaque-card-payload" })).rejects.toMatchObject({
      code: "STAFF_SELF_SCAN_DISABLED",
      status: 403
    });

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceQrToken.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });
  it("does not correct another tenant or inaccessible staff attendance record", async () => {
    mocks.tx.staffAttendanceRecord.findFirst.mockResolvedValue(null);

    await expect(correctStaffAttendance(ctx, {
      attendanceRecordId,
      status: "PRESENT",
      correctionReason: "Admin verified register"
    })).rejects.toMatchObject({ code: "STAFF_ATTENDANCE_RECORD_NOT_FOUND" });

    expect(mocks.tx.staffAttendanceRecord.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: attendanceRecordId,
        tenantId,
        branchId: { in: [branchId] }
      }
    }));
    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.tx.staffAttendanceRecord.update).not.toHaveBeenCalled();
  });
});
