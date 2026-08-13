import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import {
  approvePrincipalPasswordRecovery,
  completePrincipalPasswordReset,
  getPrincipalPasswordRecoveryRequests,
  hashPrincipalRecoveryToken,
  rejectPrincipalPasswordRecovery,
  requestPrincipalPasswordRecovery
} from "@/modules/campus-core/principal-password-recovery.service";

const mocks = vi.hoisted(() => {
  const tx = {
    auditLog: { create: vi.fn() },
    passkeyCredential: { deleteMany: vi.fn() },
    passwordCredential: { upsert: vi.fn() },
    platformAdministrator: { findFirst: vi.fn() },
    platformAuditLog: { create: vi.fn() },
    principalPasswordRecoveryAttempt: { count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
    principalPasswordResetRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn()
    },
    session: { updateMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    user: { findFirst: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const hashPassword = vi.fn();
  const writePlatformAuditLog = vi.fn();
  return { db, hashPassword, tx, writePlatformAuditLog };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/audit/platform-audit-log", () => ({
  writePlatformAuditLog: mocks.writePlatformAuditLog
}));

const tenantId = "00000000-0000-4000-8000-000000000001";
const institutionId = "00000000-0000-4000-8000-000000000002";
const branchId = "00000000-0000-4000-8000-000000000003";
const principalUserId = "00000000-0000-4000-8000-000000000004";
const requestId = "00000000-0000-4000-8000-000000000005";

const administratorContext: PlatformAdministratorContext = {
  administratorId: "00000000-0000-4000-8000-000000000006",
  sessionId: "00000000-0000-4000-8000-000000000007",
  email: "recovery-operator@jinacampus.test",
  displayName: "Recovery Operator",
  canManagePrincipalRecovery: true,
  passwordChangeRequired: false,
  ipAddress: "127.0.0.1",
  userAgent: "vitest"
};

const principal = {
  id: principalUserId,
  tenantId,
  principalId: "PRINCIPAL-001",
  email: "principal@school.test",
  phone: "+919999999999",
  userType: "STAFF",
  firstName: "School",
  lastName: "Principal",
  displayName: "School Principal",
  status: "ACTIVE",
  roleAssignments: [{
    tenantId,
    role: { tenantId, code: "PRINCIPAL" }
  }],
  branchAccesses: [{
    tenantId,
    branchId,
    isPrimary: true,
    branch: {
      tenantId,
      institutionId,
      status: "ACTIVE",
      institution: { id: institutionId, name: "School" }
    }
  }]
};

const recoveryRequest = {
  id: requestId,
  tenantId,
  institutionId,
  principalUserId,
  identifierType: "EMAIL",
  identifierHash: "identifier-hash",
  status: "PENDING",
  resetMethod: null,
  tenant: { id: tenantId, name: "School", slug: "school-a", status: "ACTIVE" },
  institution: {
    id: institutionId,
    tenantId,
    name: "School",
    displayName: "School",
    status: "ACTIVE"
  },
  principalUser: principal
};

function resetMocks() {
  for (const model of Object.values(mocks.tx)) {
    for (const method of Object.values(model)) method.mockReset();
  }
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.hashPassword.mockReset();
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.writePlatformAuditLog.mockReset();
  mocks.writePlatformAuditLog.mockResolvedValue({ id: "platform-audit-id" });
  mocks.tx.principalPasswordRecoveryAttempt.count.mockResolvedValue(0);
  mocks.tx.principalPasswordRecoveryAttempt.create.mockResolvedValue({ id: "attempt-id" });
  mocks.tx.principalPasswordRecoveryAttempt.deleteMany.mockResolvedValue({ count: 0 });
  mocks.tx.principalPasswordResetRequest.findMany.mockResolvedValue([]);
  mocks.tx.principalPasswordResetRequest.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.session.updateMany.mockResolvedValue({ count: 2 });
  mocks.tx.passkeyCredential.deleteMany.mockResolvedValue({ count: 1 });
  mocks.tx.platformAdministrator.findFirst.mockResolvedValue({ id: administratorContext.administratorId });
}

describe("Principal password recovery governance", () => {
  beforeEach(resetMocks);

  it("queues an eligible Principal request without storing the raw public identifier", async () => {
    mocks.tx.tenant.findUnique.mockResolvedValue({ id: tenantId, name: "School", status: "ACTIVE" });
    mocks.tx.user.findFirst.mockResolvedValue(principal);
    mocks.tx.principalPasswordResetRequest.findFirst.mockResolvedValue(null);
    mocks.tx.principalPasswordResetRequest.create.mockResolvedValue({ id: requestId });

    const result = await requestPrincipalPasswordRecovery(
      { tenantSlug: "school-a", email: "principal@school.test" },
      { ipAddress: "127.0.0.1", userAgent: "vitest" }
    );

    expect(result).toEqual({ requested: true });
    const createData = mocks.tx.principalPasswordResetRequest.create.mock.calls[0][0].data;
    expect(createData).toEqual(expect.objectContaining({
      tenantId,
      institutionId,
      principalUserId,
      identifierType: "EMAIL"
    }));
    expect(createData.identifierHash).not.toBe("principal@school.test");
    expect(JSON.stringify(createData)).not.toContain("principal@school.test");
    expect(mocks.tx.principalPasswordRecoveryAttempt.deleteMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ createdAt: { lt: expect.any(Date) } })
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId,
        actorUserId: null,
        action: "auth.password_recovery_requested"
      })
    }));
    expect(JSON.stringify(mocks.tx.auditLog.create.mock.calls)).not.toMatch(/passwordHash|raw password|resetToken/i);
  });

  it("returns the same public shape for a non-Principal and a rate-limited identifier", async () => {
    mocks.tx.tenant.findUnique.mockResolvedValue({ id: tenantId, name: "School", status: "ACTIVE" });
    mocks.tx.user.findFirst.mockResolvedValue(null);
    const nonPrincipal = await requestPrincipalPasswordRecovery({
      tenantSlug: "school-a",
      email: "staff@school.test"
    });

    resetMocks();
    mocks.tx.tenant.findUnique.mockResolvedValue({ id: tenantId, name: "School", status: "ACTIVE" });
    mocks.tx.principalPasswordRecoveryAttempt.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0);
    const rateLimited = await requestPrincipalPasswordRecovery({
      tenantSlug: "school-a",
      principalId: "PRINCIPAL-001"
    });

    expect(nonPrincipal).toEqual({ requested: true });
    expect(rateLimited).toEqual(nonPrincipal);
    expect(mocks.tx.user.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.principalPasswordResetRequest.create).not.toHaveBeenCalled();
  });

  it("denies review to a platform administrator without the explicit recovery capability", async () => {
    await expect(approvePrincipalPasswordRecovery(
      { ...administratorContext, canManagePrincipalRecovery: false },
      {
        requestId,
        resetMethod: "RESET_LINK",
        identityVerified: true,
        reviewRemarks: "Verified by approved support procedure."
      }
    )).rejects.toThrow("PRINCIPAL_RECOVERY_ADMIN_REQUIRED");

    expect(mocks.tx.principalPasswordResetRequest.updateMany).not.toHaveBeenCalled();
  });

  it("records administrator-triggered expiry in both tenant and platform audit ledgers", async () => {
    mocks.tx.principalPasswordResetRequest.findMany
      .mockResolvedValueOnce([{ id: requestId, tenantId, institutionId, principalUserId }])
      .mockResolvedValueOnce([]);

    await getPrincipalPasswordRecoveryRequests(administratorContext);

    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId,
        actorUserId: null,
        action: "auth.principal_password_recovery_expired",
        entityId: requestId,
        metadataJson: expect.objectContaining({
          authorizedAdministratorId: administratorContext.administratorId,
          institutionId,
          principalUserId,
          expirySource: "administrator_queue_refresh"
        })
      })
    });
    expect(mocks.writePlatformAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        ctx: administratorContext,
        action: "platform.principal_password_recovery.expired",
        entityId: requestId
      }),
      mocks.tx
    );
  });

  it("approves a fragment-protected reset link while storing only its hash", async () => {
    mocks.tx.principalPasswordResetRequest.findUnique.mockResolvedValue(recoveryRequest);

    const result = await approvePrincipalPasswordRecovery(administratorContext, {
      requestId,
      resetMethod: "RESET_LINK",
      identityVerified: true,
      reviewRemarks: "Verified registered contact and institution records."
    });

    expect(result.credentialType).toBe("RESET_LINK");
    expect(result.oneTimeCredential).toContain("/principal-password-reset#");
    expect(result.oneTimeCredential).toContain("request=");
    const updateData = mocks.tx.principalPasswordResetRequest.updateMany.mock.calls[0][0].data;
    expect(updateData.resetTokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.oneTimeCredential).not.toContain(updateData.resetTokenHash);
    expect(JSON.stringify(mocks.writePlatformAuditLog.mock.calls)).not.toContain(result.oneTimeCredential);
    expect(JSON.stringify(mocks.tx.auditLog.create.mock.calls)).not.toContain(result.oneTimeCredential);
  });

  it("assigns a one-time temporary password, requires change, and revokes active sessions and passkeys", async () => {
    mocks.tx.principalPasswordResetRequest.findUnique.mockResolvedValue(recoveryRequest);

    const result = await approvePrincipalPasswordRecovery(administratorContext, {
      requestId,
      resetMethod: "TEMPORARY_PASSWORD",
      identityVerified: true,
      reviewRemarks: "Verified registered contact and institution records."
    });

    expect(result.credentialType).toBe("TEMPORARY_PASSWORD");
    expect(result.oneTimeCredential).toMatch(/[A-Z]/);
    expect(result.oneTimeCredential).toMatch(/[a-z]/);
    expect(result.oneTimeCredential).toMatch(/[0-9]/);
    expect(result.oneTimeCredential).toMatch(/[^A-Za-z0-9]/);
    expect(mocks.hashPassword).toHaveBeenCalledWith(result.oneTimeCredential);
    expect(mocks.tx.passwordCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ passwordHash: "hashed-password", mustChange: true })
    }));
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, userId: principalUserId, revokedAt: null }
    }));
    expect(mocks.tx.passkeyCredential.deleteMany).toHaveBeenCalledWith({
      where: { tenantId, userId: principalUserId }
    });
    const auditJson = JSON.stringify([
      mocks.writePlatformAuditLog.mock.calls,
      mocks.tx.auditLog.create.mock.calls
    ]);
    expect(auditJson).not.toContain(result.oneTimeCredential);
    expect(auditJson).not.toContain("hashed-password");
  });

  it("rejects a request whose Principal no longer belongs to the recorded tenant", async () => {
    mocks.tx.principalPasswordResetRequest.findUnique.mockResolvedValue({
      ...recoveryRequest,
      principalUser: { ...principal, tenantId: "00000000-0000-4000-8000-000000000099" }
    });

    await expect(rejectPrincipalPasswordRecovery(administratorContext, {
      requestId,
      reviewRemarks: "Institution ownership could not be verified."
    })).rejects.toThrow("PRINCIPAL_RECOVERY_REQUEST_NOT_FOUND");

    expect(mocks.writePlatformAuditLog).not.toHaveBeenCalled();
  });

  it("consumes a reset token once, hashes the new password, and revokes sessions", async () => {
    const rawToken = "safe-test-token-with-more-than-thirty-two-characters";
    mocks.tx.principalPasswordResetRequest.findFirst.mockResolvedValue({
      ...recoveryRequest,
      status: "APPROVED",
      resetMethod: "RESET_LINK",
      tenant: { status: "ACTIVE" }
    });

    const result = await completePrincipalPasswordReset({
      requestId,
      token: rawToken,
      newPassword: "NewSecure@Password123",
      confirmNewPassword: "NewSecure@Password123"
    }, { ipAddress: "127.0.0.1", userAgent: "vitest" });

    expect(result).toEqual({ completed: true });
    expect(mocks.hashPassword).toHaveBeenCalledWith("NewSecure@Password123");
    expect(mocks.tx.principalPasswordResetRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: requestId,
        status: "APPROVED",
        resetTokenHash: hashPrincipalRecoveryToken(rawToken),
        resetTokenUsedAt: null
      }),
      data: expect.objectContaining({ status: "COMPLETED", resetTokenUsedAt: expect.any(Date) })
    }));
    expect(mocks.tx.passwordCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ passwordHash: "hashed-password", mustChange: false })
    }));
    const auditJson = JSON.stringify([
      mocks.tx.auditLog.create.mock.calls,
      mocks.tx.platformAuditLog.create.mock.calls
    ]);
    expect(auditJson).not.toContain(rawToken);
    expect(auditJson).not.toContain("NewSecure@Password123");
    expect(auditJson).not.toContain("hashed-password");

    mocks.tx.principalPasswordResetRequest.findFirst.mockResolvedValueOnce(null);
    await expect(completePrincipalPasswordReset({
      requestId,
      token: rawToken,
      newPassword: "AnotherSecure@Password123",
      confirmNewPassword: "AnotherSecure@Password123"
    })).rejects.toThrow("PRINCIPAL_RECOVERY_LINK_INVALID");
  });
});

describe("Principal recovery migration and provisioning guard", () => {
  it("keeps recovery authority disabled by default and requires an explicit protected grant", () => {
    const migration = readFileSync(resolve(
      process.cwd(),
      "prisma/migrations/20260812143000_add_principal_password_recovery/migration.sql"
    ), "utf8");
    const script = readFileSync(resolve(
      process.cwd(),
      "scripts/set-platform-principal-recovery-access.ts"
    ), "utf8");

    expect(migration).toContain('"canManagePrincipalRecovery" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).not.toMatch(/UPDATE "platform_administrators"[\\s\\S]*"canManagePrincipalRecovery" = true/);
    expect(migration).toContain('"principal_recovery_one_active_request_per_user_idx"');
    expect(migration).toContain('"resetTokenHash" TEXT');
    expect(migration).not.toContain("passwordHash");
    expect(script).toContain("PLATFORM_ADMIN_PRINCIPAL_RECOVERY_AUTHORIZATION_ENABLED");
    expect(script).toContain("CONFIRM_PRINCIPAL_RECOVERY_ACCESS_CHANGE");
    expect(script).toContain("sessionsRevoked");
  });
});
