import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminResetUserPasswordService,
  changeOwnPasswordService,
  deactivateUserService,
  requestPasswordRecoveryService,
  updateBranchService,
  updateInstitutionService,
  updateUserService
} from "@/modules/campus-core/services";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    branch: { findFirst: vi.fn(), update: vi.fn() },
    institution: { findFirst: vi.fn(), update: vi.fn() },
    passkeyCredential: { deleteMany: vi.fn() },
    passwordCredential: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
    session: { updateMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    user: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    userRoleAssignment: { findMany: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const hashPassword = vi.fn();
  const requirePermission = vi.fn();
  const verifyPassword = vi.fn();
  const writeAuditLog = vi.fn();
  const requestPrincipalPasswordRecovery = vi.fn();

  return {
    db,
    hashPassword,
    requestPrincipalPasswordRecovery,
    requirePermission,
    tx,
    verifyPassword,
    writeAuditLog
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/modules/campus-core/principal-password-recovery.service", () => ({
  requestPrincipalPasswordRecovery: mocks.requestPrincipalPasswordRecovery
}));

const tenantId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const institutionId = "00000000-0000-0000-0000-000000000004";
const userId = "00000000-0000-0000-0000-000000000005";

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "admin@example.test",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000006"
};

function resetMocks() {
  for (const model of Object.values(mocks.tx)) {
    for (const method of Object.values(model)) {
      method.mockReset();
    }
  }
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.hashPassword.mockReset();
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.requestPrincipalPasswordRecovery.mockReset();
  mocks.requestPrincipalPasswordRecovery.mockResolvedValue({ requested: true });
  mocks.verifyPassword.mockReset();
  mocks.verifyPassword.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
}

describe("CampusCore institution/profile and account repair", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("updates institution profiles with tenant scope and audit before/after snapshots", async () => {
    const before = { id: institutionId, tenantId, name: "Old School", status: "ACTIVE" };
    const after = { id: institutionId, tenantId, name: "New School", status: "ACTIVE" };
    mocks.tx.institution.findFirst.mockResolvedValue(before);
    mocks.tx.institution.update.mockResolvedValue(after);

    await updateInstitutionService(ctx, {
      institutionId,
      name: "New School"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.institution.manage" });
    expect(mocks.tx.institution.findFirst).toHaveBeenCalledWith({
      where: {
        id: institutionId,
        tenantId,
        status: { not: "ARCHIVED" },
        branches: {
          some: {
            tenantId,
            id: { in: [branchId] },
            status: { not: "ARCHIVED" }
          }
        }
      }
    });
    expect(mocks.tx.institution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: institutionId },
      data: expect.objectContaining({ name: "New School", updatedById: actorUserId })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.institution.updated",
      entityType: "Institution",
      entityId: institutionId,
      before,
      after
    }), mocks.tx);
  });

  it("audits institution branding updates without storing secrets", async () => {
    const before = {
      id: institutionId,
      tenantId,
      name: "Old School",
      displayName: "Old School",
      logoUrl: null,
      logoObjectKey: null,
      status: "ACTIVE"
    };
    const after = {
      ...before,
      displayName: "Demo Public School",
      logoUrl: "https://demo.jinacampus.test/logo.png"
    };
    mocks.tx.institution.findFirst.mockResolvedValue(before);
    mocks.tx.institution.update.mockResolvedValue(after);

    await updateInstitutionService(ctx, {
      institutionId,
      displayName: "Demo Public School",
      logoUrl: "https://demo.jinacampus.test/logo.png"
    });

    expect(mocks.tx.institution.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        displayName: "Demo Public School",
        logoUrl: "https://demo.jinacampus.test/logo.png"
      })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.institution.branding_updated",
      entityType: "Institution",
      entityId: institutionId,
      before: {
        displayName: "Old School",
        logoUrl: null,
        logoObjectKey: null
      },
      after: {
        displayName: "Demo Public School",
        logoUrl: "https://demo.jinacampus.test/logo.png",
        logoObjectKey: null
      }
    }), mocks.tx);
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toMatch(/tokenHash|raw QR/i);
  });

  it("updates branch profiles only for accessible tenant branches", async () => {
    const before = { id: branchId, tenantId, institutionId, name: "Old Branch", status: "ACTIVE" };
    const after = { id: branchId, tenantId, institutionId, name: "Main Branch", status: "ACTIVE" };
    mocks.tx.branch.findFirst.mockResolvedValue(before);
    mocks.tx.branch.update.mockResolvedValue(after);
    mocks.tx.institution.findFirst.mockResolvedValue({ id: institutionId });

    await updateBranchService(ctx, {
      branchId,
      institutionId,
      name: "Main Branch"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.branch.manage", branchId });
    expect(mocks.tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, tenantId, status: { not: "ARCHIVED" } }
    });
    expect(mocks.tx.institution.findFirst).toHaveBeenCalledWith({
      where: {
        id: institutionId,
        tenantId,
        status: { not: "ARCHIVED" },
        branches: {
          some: {
            tenantId,
            id: { in: [branchId] },
            status: { not: "ARCHIVED" }
          }
        }
      }
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.branch.updated",
      branchId,
      before,
      after
    }), mocks.tx);
  });

  it("rejects branch profile updates outside accessible branches before writes", async () => {
    await expect(updateBranchService({
      ...ctx,
      accessibleBranchIds: []
    }, {
      branchId,
      name: "Blocked"
    })).rejects.toThrow("FORBIDDEN_BRANCH_ACCESS");

    expect(mocks.tx.branch.findFirst).not.toHaveBeenCalled();
    expect(mocks.tx.branch.update).not.toHaveBeenCalled();
  });

  it("updates user profiles without accepting password hashes from input", async () => {
    const before = { id: userId, tenantId, firstName: "Old", lastName: "User", status: "ACTIVE" };
    const after = { id: userId, tenantId, firstName: "New", lastName: "User", status: "ACTIVE" };
    mocks.tx.user.findFirst.mockResolvedValue(before);
    mocks.tx.user.update.mockResolvedValue(after);

    await updateUserService(ctx, {
      userId,
      firstName: "New",
      passwordHash: "raw-client-hash"
    } as unknown as Parameters<typeof updateUserService>[1]);

    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: userId, tenantId, status: { not: "DEACTIVATED" } })
    });
    expect(JSON.stringify(mocks.tx.user.update.mock.calls[0][0])).not.toContain("raw-client-hash");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.user.updated",
      before,
      after
    }), mocks.tx);
  });

  it("deactivates users with a dedicated permission, audit event, and session revocation", async () => {
    const before = { id: userId, tenantId, firstName: "Target", lastName: "User", status: "ACTIVE" };
    const after = { ...before, status: "DEACTIVATED", deactivatedAt: new Date("2026-06-02T00:00:00.000Z") };
    mocks.tx.user.findFirst.mockResolvedValue(before);
    mocks.tx.userRoleAssignment.findMany.mockResolvedValue([{ role: { code: "TEACHER" } }]);
    mocks.tx.user.update.mockResolvedValue(after);
    mocks.tx.session.updateMany.mockResolvedValue({ count: 1 });

    await deactivateUserService(ctx, { userId, confirmDeactivation: true });

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.deactivate" });
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: userId, tenantId, status: { not: "DEACTIVATED" } })
    });
    expect(mocks.tx.userRoleAssignment.findMany).toHaveBeenCalledWith({
      where: { tenantId, userId, isActive: true },
      select: { role: { select: { code: true } } }
    });
    expect(mocks.tx.user.update).toHaveBeenCalledWith({
      where: { id: userId },
      data: expect.objectContaining({ status: "DEACTIVATED", updatedById: actorUserId })
    });
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith({
      where: { tenantId, userId, revokedAt: null },
      data: expect.objectContaining({ revokedAt: expect.any(Date) })
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.user.deactivated",
      entityType: "User",
      entityId: userId,
      metadata: { sessionsRevoked: true }
    }), mocks.tx);
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toMatch(/passwordHash|tokenHash|raw password/i);
  });

  it("blocks self-deactivation before lifecycle writes", async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: actorUserId, tenantId, status: "ACTIVE" });

    await expect(deactivateUserService(ctx, {
      userId: actorUserId,
      confirmDeactivation: true
    })).rejects.toThrow("USER_SELF_DEACTIVATE_BLOCKED");

    expect(mocks.tx.user.update).not.toHaveBeenCalled();
    expect(mocks.tx.session.updateMany).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("admin reset password is permissioned, tenant scoped, hashed, and audit-safe", async () => {
    mocks.tx.user.findFirst.mockResolvedValue({ id: userId, tenantId, email: "teacher@example.test", status: "INVITED" });
    mocks.tx.passwordCredential.upsert.mockResolvedValue({ id: "credential-id" });
    mocks.tx.session.updateMany.mockResolvedValue({ count: 2 });
    mocks.tx.passkeyCredential.deleteMany.mockResolvedValue({ count: 1 });
    mocks.tx.user.update.mockResolvedValue({ id: userId, status: "ACTIVE" });

    await adminResetUserPasswordService(ctx, {
      userId,
      newPassword: "new-password",
      confirmNewPassword: "new-password"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.reset_password" });
    expect(mocks.tx.user.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: userId, tenantId, status: { not: "DEACTIVATED" } }),
      select: { id: true, tenantId: true, email: true, status: true }
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith("new-password");
    expect(mocks.tx.passwordCredential.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId },
      create: expect.objectContaining({ userId, passwordHash: "hashed-password" }),
      update: expect.objectContaining({ passwordHash: "hashed-password", mustChange: true })
    }));
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith({
      where: { tenantId, userId, revokedAt: null },
      data: { revokedAt: expect.any(Date) }
    });
    expect(mocks.tx.passkeyCredential.deleteMany).toHaveBeenCalledWith({
      where: { tenantId, userId }
    });
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain("new-password");
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toContain("hashed-password");
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "campuscore.user.password_reset",
      metadata: expect.objectContaining({
        targetUserId: userId,
        passwordUpdated: true,
        sessionsRevoked: 2,
        passkeysRemoved: 1,
        mustChange: true
      })
    }), mocks.tx);
  });

  it("change own password verifies the current password before hashing the replacement", async () => {
    mocks.tx.passwordCredential.findUnique.mockResolvedValue({ userId: actorUserId, passwordHash: "stored-hash" });
    mocks.tx.passwordCredential.update.mockResolvedValue({ userId: actorUserId });
    mocks.tx.session.updateMany.mockResolvedValue({ count: 1 });

    await changeOwnPasswordService(ctx, {
      currentPassword: "old-password",
      newPassword: "new-password",
      confirmNewPassword: "new-password"
    });

    expect(mocks.verifyPassword).toHaveBeenCalledWith("old-password", "stored-hash");
    expect(mocks.hashPassword).toHaveBeenCalledWith("new-password");
    expect(mocks.tx.passwordCredential.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: actorUserId },
      data: expect.objectContaining({ passwordHash: "hashed-password", mustChange: false })
    }));
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId,
        userId: actorUserId,
        revokedAt: null
      },
      data: { revokedAt: expect.any(Date) }
    });
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toMatch(/old-password|new-password|stored-hash|hashed-password/);
  });

  it("change own password rejects an incorrect current password safely", async () => {
    mocks.tx.passwordCredential.findUnique.mockResolvedValue({ userId: actorUserId, passwordHash: "stored-hash" });
    mocks.verifyPassword.mockResolvedValue(false);

    await expect(changeOwnPasswordService(ctx, {
      currentPassword: "wrong-password",
      newPassword: "new-password",
      confirmNewPassword: "new-password"
    })).rejects.toThrow("CURRENT_PASSWORD_INCORRECT");

    expect(mocks.tx.passwordCredential.update).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("delegates public password recovery without selecting or returning credential data", async () => {
    const result = await requestPasswordRecoveryService(
      { tenantSlug: "school-a", email: "principal@example.test" },
      { ipAddress: "127.0.0.1", userAgent: "vitest" }
    );

    expect(result).toEqual({ requested: true });
    expect(mocks.requestPrincipalPasswordRecovery).toHaveBeenCalledWith(
      { tenantSlug: "school-a", email: "principal@example.test" },
      { ipAddress: "127.0.0.1", userAgent: "vitest" }
    );
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|reset token|raw password/i);
  });

  it("returns the same wrapper result for an unknown public recovery identifier", async () => {
    const result = await requestPasswordRecoveryService({
      tenantSlug: "school-a",
      email: "unknown@example.test"
    });

    expect(result).toEqual({ requested: true });
    expect(mocks.requestPrincipalPasswordRecovery).toHaveBeenCalledWith(
      { tenantSlug: "school-a", email: "unknown@example.test" },
      {}
    );
  });
});
