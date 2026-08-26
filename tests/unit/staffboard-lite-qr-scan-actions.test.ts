import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import { scanStaffAttendanceQrAction } from "@/modules/staffboard-lite/actions/staff-qr-scan.actions";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const getTenantContext = vi.fn();
  const revalidatePath = vi.fn();
  const scanStaffAttendanceQr = vi.fn();
  return { getTenantContext, revalidatePath, scanStaffAttendanceQr };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/tenant/context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@/modules/staffboard-lite/services/staff-qr.service", () => ({
  scanStaffAttendanceQr: mocks.scanStaffAttendanceQr
}));

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "teacher@example.com",
  userType: "STAFF",
  activeBranchId: "00000000-0000-0000-0000-000000000003",
  accessibleBranchIds: ["00000000-0000-0000-0000-000000000003"],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
};

const serviceResult = {
  success: true,
  purpose: "CHECK_IN",
  attendanceDate: "2026-05-05",
  checkInAt: "2026-05-05T03:30:00.000Z",
  status: "PRESENT",
  message: "Check-in successful",
  tokenHash: "server-only-token-hash"
};

function qrPayload(token = "raw-staff-qr-token-12345") {
  return JSON.stringify({ type: "STAFF_ATTENDANCE_QR", token });
}

beforeEach(() => {
  mocks.getTenantContext.mockReset();
  mocks.getTenantContext.mockResolvedValue(ctx);
  mocks.revalidatePath.mockReset();
  mocks.scanStaffAttendanceQr.mockReset();
  mocks.scanStaffAttendanceQr.mockResolvedValue(serviceResult);
});

describe("staff QR scan server action", () => {
  it("submits scan through the service using server-derived tenant context", async () => {
    const result = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });

    expect(result).toEqual({
      ok: true,
      data: {
        success: true,
        purpose: "CHECK_IN",
        attendanceDate: "2026-05-05",
        checkInAt: "2026-05-05T03:30:00.000Z",
        checkOutAt: undefined,
        workingMinutes: undefined,
        status: "PRESENT",
        message: "Check-in successful"
      }
    });
    expect(mocks.scanStaffAttendanceQr).toHaveBeenCalledWith(ctx, { token: "raw-staff-qr-token-12345" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/staffboard/attendance/scan");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/staffboard/attendance");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/staffboard/attendance/me");
  });

  it("rejects blank token before resolving tenant context", async () => {
    const result = await scanStaffAttendanceQrAction({ qrPayload: " " });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.scanStaffAttendanceQr).not.toHaveBeenCalled();
  });

  it("rejects client-supplied tenantId, branchId, and staffId before service execution", async () => {
    const result = await scanStaffAttendanceQrAction({
      qrPayload: qrPayload(),
      tenantId: "00000000-0000-0000-0000-000000000099",
      branchId: "00000000-0000-0000-0000-000000000098",
      staffId: "00000000-0000-0000-0000-000000000097"
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.scanStaffAttendanceQr).not.toHaveBeenCalled();
  });

  it("rejects client-supplied actor and permission hints before service execution", async () => {
    const result = await scanStaffAttendanceQrAction({
      qrPayload: qrPayload(),
      actorUserId: "00000000-0000-0000-0000-000000000099",
      permission: "staffboard.attendance.correct",
      permissions: ["staffboard.attendance.credential.self_view"]
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.scanStaffAttendanceQr).not.toHaveBeenCalled();
  });

  it("does not return tokenHash even if the service includes one", async () => {
    const result = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });

    expect(JSON.stringify(result)).not.toContain("tokenHash");
    expect(JSON.stringify(result)).not.toContain(serviceResult.tokenHash);
  });

  it("maps expired QR, duplicate scan, and permission failures to safe messages", async () => {
    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(new AppError("STAFF_QR_EXPIRED"));
    const expired = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });
    expect(expired).toMatchObject({
      ok: false,
      code: "STAFF_QR_EXPIRED",
      error: "This QR code has expired. Please scan a fresh QR code."
    });

    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(new AppError("STAFF_ALREADY_CHECKED_IN"));
    const duplicate = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });
    expect(duplicate).toMatchObject({
      ok: false,
      code: "STAFF_ALREADY_CHECKED_IN",
      error: "You have already checked in today."
    });

    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.credential.self_view"));
    const forbidden = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });
    expect(forbidden).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      error: "You do not have permission to perform this action."
    });
    expect(JSON.stringify(forbidden)).not.toContain("staffboard.attendance.credential.self_view");
  });

  it("maps wrong-branch and missing-staff scan failures to safe messages", async () => {
    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(new AppError("STAFF_QR_BRANCH_MISMATCH", "branchId=secret"));
    const wrongBranch = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });
    expect(wrongBranch).toMatchObject({
      ok: false,
      code: "STAFF_QR_BRANCH_MISMATCH",
      error: "This QR code belongs to a different branch."
    });
    expect(JSON.stringify(wrongBranch)).not.toMatch(/branchId|raw-staff-qr-token-12345|secret/);

    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(new AppError("ACTIVE_STAFF_PROFILE_NOT_FOUND", "staffId=secret"));
    const missingStaff = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });
    expect(missingStaff).toMatchObject({
      ok: false,
      code: "ACTIVE_STAFF_PROFILE_NOT_FOUND",
      error: "An active staff profile was not found for your account."
    });
    expect(JSON.stringify(missingStaff)).not.toMatch(/staffId|raw-staff-qr-token-12345|secret/);
  });

  it("does not leak raw token, tokenHash, tenantId, or DB details in errors", async () => {
    mocks.scanStaffAttendanceQr.mockRejectedValueOnce(
      new Error("Prisma tokenHash=server-token-hash rawToken=raw-staff-qr-token-12345 tenantId=tenant-secret")
    );

    const result = await scanStaffAttendanceQrAction({ qrPayload: qrPayload() });

    expect(result).toMatchObject({
      ok: false,
      code: "UNKNOWN_ERROR",
      error: "Unable to submit staff QR scan. Please try again."
    });
    expect(JSON.stringify(result)).not.toMatch(/tokenHash|rawToken|raw-staff-qr-token-12345|tenantId|Prisma|tenant-secret/);
  });

  it("parses raw QR payload server-side before service execution", async () => {
    await scanStaffAttendanceQrAction({
      qrPayload: "{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\" raw-token-from-json \"}"
    });

    expect(mocks.scanStaffAttendanceQr).toHaveBeenCalledWith(ctx, { token: "raw-token-from-json" });
  });

  it("rejects malformed raw QR payload without resolving tenant context", async () => {
    const result = await scanStaffAttendanceQrAction({ qrPayload: "{\"type\":\"OTHER_QR\",\"token\":\"raw-token\"}" });

    expect(result).toMatchObject({
      ok: false,
      code: "INVALID_STAFF_QR",
      error: "This QR code is invalid or no longer available."
    });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.scanStaffAttendanceQr).not.toHaveBeenCalled();
  });
});
