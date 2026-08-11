import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import {
  deactivateStaffAttendanceQrAction,
  generateStaffAttendanceQrAction
} from "@/modules/staffboard-lite/actions/staff-qr.actions";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const getTenantContext = vi.fn();
  const generateStaffAttendanceQrToken = vi.fn();
  const deactivateStaffAttendanceQrToken = vi.fn();
  const revalidatePath = vi.fn();
  return { deactivateStaffAttendanceQrToken, generateStaffAttendanceQrToken, getTenantContext, revalidatePath };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/tenant/context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@/modules/staffboard-lite/services/staff-qr.service", () => ({
  deactivateStaffAttendanceQrToken: mocks.deactivateStaffAttendanceQrToken,
  generateStaffAttendanceQrToken: mocks.generateStaffAttendanceQrToken
}));

const branchId = "00000000-0000-0000-0000-000000000003";

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
};

const serviceResult = {
  qrTokenId: "00000000-0000-0000-0000-000000000005",
  purpose: "CHECK_IN",
  branchId,
  validFrom: "2026-05-05T04:30:00.000Z",
  validUntil: "2026-05-05T09:30:00.000Z",
  expiresInSeconds: 18000,
  status: "ACTIVE" as const,
  qrPayload: "{\"type\":\"STAFF_ATTENDANCE_QR\",\"token\":\"raw-token\"}",
  tokenHash: "server-only-token-hash"
};

beforeEach(() => {
  mocks.getTenantContext.mockReset();
  mocks.getTenantContext.mockResolvedValue(ctx);
  mocks.generateStaffAttendanceQrToken.mockReset();
  mocks.generateStaffAttendanceQrToken.mockResolvedValue(serviceResult);
  mocks.deactivateStaffAttendanceQrToken.mockReset();
  mocks.deactivateStaffAttendanceQrToken.mockResolvedValue({
    qrTokenId: serviceResult.qrTokenId,
    status: "DEACTIVATED",
    deactivatedAt: "2026-05-05T04:35:00.000Z"
  });
  mocks.revalidatePath.mockReset();
});

describe("staff QR server action", () => {
  it("generates a QR token through the service using server-derived tenant context", async () => {
    const result = await generateStaffAttendanceQrAction({ branchId, purpose: "CHECK_IN" });

    expect(result).toEqual({
      ok: true,
      data: {
        qrTokenId: serviceResult.qrTokenId,
        purpose: serviceResult.purpose,
        branchId,
        validFrom: serviceResult.validFrom,
        validUntil: serviceResult.validUntil,
        expiresInSeconds: serviceResult.expiresInSeconds,
        status: serviceResult.status,
        qrPayload: serviceResult.qrPayload
      }
    });
    expect(mocks.generateStaffAttendanceQrToken).toHaveBeenCalledWith(ctx, { branchId, purpose: "CHECK_IN" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/staffboard/attendance/qr");
  });

  it("rejects client-supplied tenantId and createdById before service execution", async () => {
    const result = await generateStaffAttendanceQrAction({
      branchId,
      purpose: "CHECK_IN",
      tenantId: "00000000-0000-0000-0000-000000000099",
      createdById: "00000000-0000-0000-0000-000000000098"
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.generateStaffAttendanceQrToken).not.toHaveBeenCalled();
  });

  it("rejects client-supplied permission hints before service execution", async () => {
    const result = await generateStaffAttendanceQrAction({
      branchId,
      purpose: "CHECK_IN",
      permission: "staffboard.attendance.qr.generate",
      permissions: ["staffboard.attendance.view"]
    });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.generateStaffAttendanceQrToken).not.toHaveBeenCalled();
  });

  it("does not return tokenHash even if a service implementation includes one", async () => {
    const result = await generateStaffAttendanceQrAction({ branchId, purpose: "CHECK_IN" });

    expect(JSON.stringify(result)).not.toContain("tokenHash");
    expect(JSON.stringify(result)).not.toContain(serviceResult.tokenHash);
  });

  it("returns safe QR generation errors without exposing internals", async () => {
    mocks.generateStaffAttendanceQrToken.mockRejectedValueOnce(new AppError("STAFF_QR_ATTENDANCE_DISABLED"));
    const disabled = await generateStaffAttendanceQrAction({ branchId, purpose: "CHECK_IN" });
    expect(disabled).toMatchObject({
      ok: false,
      code: "STAFF_QR_ATTENDANCE_DISABLED",
      error: "Staff QR attendance is disabled for this branch."
    });

    mocks.generateStaffAttendanceQrToken.mockRejectedValueOnce(
      new Error("FORBIDDEN_PERMISSION:staffboard.attendance.qr.generate")
    );
    const forbidden = await generateStaffAttendanceQrAction({ branchId, purpose: "CHECK_IN" });
    expect(forbidden).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      error: "You do not have permission to perform this action."
    });
    expect(JSON.stringify(forbidden)).not.toContain("staffboard.attendance.qr.generate");
  });

  it("does not leak QR secrets or internal IDs from unexpected generation errors", async () => {
    mocks.generateStaffAttendanceQrToken.mockRejectedValueOnce(
      new Error("Prisma tokenHash=server-token-hash rawToken=raw-token tenantId=tenant-secret branchId=branch-secret")
    );

    const result = await generateStaffAttendanceQrAction({ branchId, purpose: "CHECK_IN" });

    expect(result).toMatchObject({
      ok: false,
      code: "UNKNOWN_ERROR",
      error: "Unable to generate staff attendance QR. Please try again."
    });
    expect(JSON.stringify(result)).not.toMatch(/tokenHash|rawToken|raw-token|tenantId|branchId|Prisma|tenant-secret|branch-secret/);
  });

  it("deactivates a QR through server-derived context and rejects client scope fields", async () => {
    const deactivated = await deactivateStaffAttendanceQrAction({ qrTokenId: serviceResult.qrTokenId });

    expect(deactivated).toMatchObject({
      ok: true,
      data: { qrTokenId: serviceResult.qrTokenId, status: "DEACTIVATED" }
    });
    expect(mocks.deactivateStaffAttendanceQrToken).toHaveBeenCalledWith(ctx, {
      qrTokenId: serviceResult.qrTokenId
    });

    const rejected = await deactivateStaffAttendanceQrAction({
      qrTokenId: serviceResult.qrTokenId,
      tenantId: "00000000-0000-0000-0000-000000000099"
    });
    expect(rejected).toMatchObject({ ok: false, code: "VALIDATION_ERROR" });
  });
});
