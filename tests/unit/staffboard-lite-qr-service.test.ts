import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  deactivateStaffAttendanceQrToken,
  generateStaffAttendanceQrToken,
  hashStaffAttendanceQrToken,
  STAFF_QR_TOKEN_VALIDITY_SECONDS
} from "@/modules/staffboard-lite/services/staff-qr.service";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    auditLog: { create: vi.fn() },
    branch: { findFirst: vi.fn() },
    attendanceSetting: { findFirst: vi.fn() },
    staffAttendanceQrToken: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn()
    }
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

const branchId = "00000000-0000-0000-0000-000000000003";
const selectedBranchId = "00000000-0000-0000-0000-000000000006";
const qrTokenId = "00000000-0000-0000-0000-000000000005";

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004",
  roleCodes: ["PRINCIPAL"]
};

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
  mocks.tx.attendanceSetting.findFirst.mockResolvedValue(null);
  mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(null);
  mocks.tx.staffAttendanceQrToken.findMany.mockResolvedValue([]);
  mocks.tx.staffAttendanceQrToken.update.mockImplementation(({ data }) => ({
    id: qrTokenId,
    branchId,
    purpose: "CHECK_IN",
    status: data.status ?? "ACTIVE",
    validFrom: new Date("2026-05-05T04:30:00.000Z"),
    validUntil: new Date("2026-05-05T09:30:00.000Z"),
    consumedCount: 0,
    lastUsedAt: null,
    expiredAt: data.expiredAt ?? null,
    deactivatedAt: data.deactivatedAt ?? null,
    deactivationReason: data.deactivationReason ?? null,
    createdAt: new Date("2026-05-05T04:30:00.000Z"),
    updatedAt: new Date("2026-05-05T04:30:00.000Z")
  }));
  mocks.tx.staffAttendanceQrToken.create.mockImplementation(({ data }) => ({
    id: qrTokenId,
    purpose: data.purpose,
    branchId: data.branchId,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    status: data.status
  }));
}

function parseQrPayload(result: Awaited<ReturnType<typeof generateStaffAttendanceQrToken>>) {
  return JSON.parse(result.qrPayload) as { type: string; token: string };
}

function lifecycleToken(overrides: Record<string, unknown> = {}) {
  return {
    id: qrTokenId,
    branchId,
    purpose: "CHECK_IN",
    status: "ACTIVE",
    validFrom: new Date("2026-05-05T04:00:00.000Z"),
    validUntil: new Date("2026-05-05T09:00:00.000Z"),
    consumedCount: 0,
    lastUsedAt: null,
    expiredAt: null,
    deactivatedAt: null,
    deactivationReason: null,
    createdAt: new Date("2026-05-05T04:00:00.000Z"),
    updatedAt: new Date("2026-05-05T04:00:00.000Z"),
    ...overrides
  };
}

describe("StaffBoard Lite QR generation service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T04:30:00.000Z"));
    resetMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hashes QR tokens with deterministic SHA-256 without returning the raw token as the hash", () => {
    const rawToken = "phase-7-qr-security-token";
    const hash = hashStaffAttendanceQrToken(rawToken);

    expect(hash).toBe(createHash("sha256").update(rawToken).digest("hex"));
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(rawToken);
  });

  it("generates a secure CHECK_IN QR token", async () => {
    const result = await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });
    const payload = parseQrPayload(result);

    expect(result).toEqual(expect.objectContaining({
      qrTokenId,
      purpose: "CHECK_IN",
      branchId,
      expiresInSeconds: 18000,
      status: "ACTIVE",
      validFrom: "2026-05-05T04:30:00.000Z",
      validUntil: "2026-05-05T09:30:00.000Z"
    }));
    expect(payload.type).toBe("STAFF_ATTENDANCE_QR");
    expect(payload.token).toHaveLength(43);
  });

  it("generates a CHECK_OUT QR token", async () => {
    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_OUT" })).resolves.toMatchObject({
      purpose: "CHECK_OUT",
      expiresInSeconds: 18000
    });

    expect(mocks.tx.staffAttendanceQrToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ purpose: "CHECK_OUT" })
    }));
  });

  it("requires staffboard.attendance.qr.generate permission", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.attendance.qr.generate"));

    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).rejects.toThrow(
      "FORBIDDEN_PERMISSION:staffboard.attendance.qr.generate"
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.qr.generate",
      branchId
    });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("rejects non-operator roles even if a permission mock would allow generation", async () => {
    await expect(generateStaffAttendanceQrToken(
      { ...ctx, roleCodes: ["TEACHER"] },
      { purpose: "CHECK_IN" }
    )).rejects.toMatchObject({
      code: "STAFF_QR_OPERATOR_ACCESS_REQUIRED",
      status: 403
    });

    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("allows an Office Staff QR Operator with explicit permission", async () => {
    await expect(generateStaffAttendanceQrToken(
      { ...ctx, roleCodes: ["OFFICE_STAFF"] },
      { purpose: "CHECK_IN" }
    )).resolves.toMatchObject({ status: "ACTIVE", expiresInSeconds: 18_000 });

    expect(mocks.requirePermission).toHaveBeenCalledWith(expect.objectContaining({
      permission: "staffboard.attendance.qr.generate",
      branchId
    }));
  });

  it("uses tenantId and actor user from server context", async () => {
    await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });

    expect(mocks.tx.staffAttendanceQrToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        createdById: ctx.userId
      })
    }));
  });

  it("verifies branch access and active branch scope", async () => {
    await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.attendance.qr.generate",
      branchId
    });
    expect(mocks.tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
  });

  it("uses a verified branchId from QR generation input when provided", async () => {
    mocks.tx.branch.findFirst.mockResolvedValue({ id: selectedBranchId });

    await generateStaffAttendanceQrToken(
      { ...ctx, activeBranchId: null, accessibleBranchIds: [branchId, selectedBranchId] },
      { branchId: selectedBranchId, purpose: "CHECK_IN" }
    );

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx: { ...ctx, activeBranchId: null, accessibleBranchIds: [branchId, selectedBranchId] },
      permission: "staffboard.attendance.qr.generate",
      branchId: selectedBranchId
    });
    expect(mocks.tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: selectedBranchId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
    expect(mocks.tx.staffAttendanceQrToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ branchId: selectedBranchId })
    }));
  });

  it("rejects generation when StaffBoard QR attendance is disabled", async () => {
    mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
      staffQrAttendanceEnabled: false
    });

    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).rejects.toMatchObject({
      code: "STAFF_QR_ATTENDANCE_DISABLED",
      status: 403
    });

    expect(mocks.tx.staffAttendanceQrToken.create).not.toHaveBeenCalled();
  });

  it("uses the fixed five-hour validity even when legacy settings differ", async () => {
    mocks.tx.attendanceSetting.findFirst.mockResolvedValue({
      staffQrAttendanceEnabled: true
    });

    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).resolves.toMatchObject({
      expiresInSeconds: STAFF_QR_TOKEN_VALIDITY_SECONDS,
      validUntil: "2026-05-05T09:30:00.000Z"
    });
  });

  it("uses five-hour validity when no AttendanceSetting exists", async () => {
    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" })).resolves.toMatchObject({
      expiresInSeconds: 18000,
      validUntil: "2026-05-05T09:30:00.000Z"
    });
  });

  it("rejects client-controlled validity", async () => {
    await expect(generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN", validForSeconds: 10 })).rejects.toMatchObject({
      name: "ZodError"
    });

    expect(mocks.tx.staffAttendanceQrToken.create).not.toHaveBeenCalled();
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("stores tokenHash but never stores the raw token", async () => {
    const result = await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });
    const payload = parseQrPayload(result);
    const createArg = mocks.tx.staffAttendanceQrToken.create.mock.calls[0][0];

    expect(createArg.data.tokenHash).toBe(hashStaffAttendanceQrToken(payload.token));
    expect(createArg.data.tokenHash).toBe(createHash("sha256").update(payload.token).digest("hex"));
    expect(JSON.stringify(createArg.data)).not.toContain(payload.token);
    expect(createArg.data).not.toHaveProperty("rawToken");
  });

  it("returns raw token only inside qrPayload and never returns tokenHash", async () => {
    const result = await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });
    const payload = parseQrPayload(result);
    const serialized = JSON.stringify(result);

    expect(serialized).toContain(payload.token);
    expect(serialized.match(new RegExp(payload.token, "g"))).toHaveLength(1);
    expect(result).not.toHaveProperty("tokenHash");
  });

  it("does not write raw token or tokenHash to audit metadata", async () => {
    const result = await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });
    const payload = parseQrPayload(result);
    const createArg = mocks.tx.staffAttendanceQrToken.create.mock.calls[0][0];
    const auditArg = mocks.writeAuditLog.mock.calls[0][0];
    const serializedAudit = JSON.stringify(auditArg);

    expect(auditArg).toEqual(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_GENERATED,
      entityType: "StaffAttendanceQrToken",
      entityId: qrTokenId,
      branchId,
      metadata: expect.objectContaining({
        purpose: "CHECK_IN",
        expiresInSeconds: 18000,
        replacedTokenCount: 0
      })
    }));
    expect(serializedAudit).not.toContain(payload.token);
    expect(serializedAudit).not.toContain(createArg.data.tokenHash);
    expect(serializedAudit).not.toContain("qrPayload");
  });

  it("creates validFrom and validUntil correctly", async () => {
    await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });

    expect(mocks.tx.staffAttendanceQrToken.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        validFrom: new Date("2026-05-05T04:30:00.000Z"),
        validUntil: new Date("2026-05-05T09:30:00.000Z"),
        consumedCount: 0
      })
    }));
  });

  it("deactivates the previous active token when regenerating the same purpose", async () => {
    const previous = lifecycleToken();
    mocks.tx.staffAttendanceQrToken.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([previous]);

    await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });

    expect(mocks.tx.staffAttendanceQrToken.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: qrTokenId },
      data: expect.objectContaining({
        status: "DEACTIVATED",
        deactivatedById: ctx.userId,
        deactivationReason: "REGENERATED"
      })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_REGENERATED,
      metadata: expect.objectContaining({ replacedTokenCount: 1 })
    }), mocks.tx);
  });

  it("reconciles stale active tokens as expired before generation", async () => {
    const stale = lifecycleToken({ validUntil: new Date("2026-05-05T04:29:59.000Z") });
    mocks.tx.staffAttendanceQrToken.findMany
      .mockResolvedValueOnce([stale])
      .mockResolvedValueOnce([]);

    await generateStaffAttendanceQrToken(ctx, { purpose: "CHECK_IN" });

    expect(mocks.tx.staffAttendanceQrToken.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: qrTokenId },
      data: {
        status: "EXPIRED",
        expiredAt: stale.validUntil
      }
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_EXPIRED
    }), mocks.tx);
  });

  it("deactivates a tenant-scoped token through the operator service", async () => {
    const current = lifecycleToken();
    mocks.tx.staffAttendanceQrToken.findFirst.mockResolvedValue(current);

    await expect(deactivateStaffAttendanceQrToken(ctx, { qrTokenId })).resolves.toMatchObject({
      qrTokenId,
      status: "DEACTIVATED"
    });

    expect(mocks.tx.staffAttendanceQrToken.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: qrTokenId, tenantId: ctx.tenantId })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_QR_DEACTIVATED,
      metadata: expect.objectContaining({ purpose: "CHECK_IN", reason: "OPERATOR_DEACTIVATED" })
    }), mocks.tx);
  });
});
