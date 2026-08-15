import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTenantSettings,
  listAttendanceSettings,
  listAuditLogs,
  listAssignableRoles,
  listRoles,
  listUsers
} from "@/modules/campus-core/queries";
import {
  createRoleService,
  createUserService,
  updateTenantSettingsService
} from "@/modules/campus-core/services";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    auditLog: { findMany: vi.fn() },
    attendanceSetting: { findMany: vi.fn() },
    permission: { findMany: vi.fn() },
    role: { create: vi.fn(), findMany: vi.fn() },
    rolePermission: { create: vi.fn() },
    tenantSettings: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { create: vi.fn(), findMany: vi.fn() },
    userBranchAccess: { create: vi.fn() },
    userRoleAssignment: { create: vi.fn() }
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

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: "00000000-0000-0000-0000-000000000003",
  accessibleBranchIds: ["00000000-0000-0000-0000-000000000003"],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
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
}

describe("CampusCore RBAC", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("requires campuscore.user.view before listing users", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.user.view"));

    await expect(listUsers(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.user.view");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.view" });
    expect(mocks.tx.user.findMany).not.toHaveBeenCalled();
  });

  it("does not let user view permission create users", async () => {
    mocks.requirePermission.mockRejectedValueOnce(new Error("FORBIDDEN_PERMISSION:campuscore.user.create"));

    await expect(createUserService(ctx, {
      email: "staff@example.com",
      firstName: "Staff",
      userType: "STAFF",
      branchIds: [],
      roleCodes: []
    })).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.user.create");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.create" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
  });

  it("requires user governance permission before assigning role codes during user creation", async () => {
    mocks.requirePermission.mockImplementation(({ permission }: { permission: string }) => {
      if (permission === "campuscore.user.manage") {
        return Promise.reject(new Error("FORBIDDEN_PERMISSION:campuscore.user.manage"));
      }
      return Promise.resolve(true);
    });

    await expect(createUserService(ctx, {
      email: "role-assignment@example.com",
      firstName: "Role",
      userType: "STAFF",
      branchIds: [],
      roleCodes: ["ADMIN"]
    })).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.user.manage");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.create" });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.manage" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("requires user update permission before assigning branch access during user creation", async () => {
    mocks.requirePermission.mockImplementation(({ permission }: { permission: string }) => {
      if (permission === "campuscore.user.update") {
        return Promise.reject(new Error("FORBIDDEN_PERMISSION:campuscore.user.update"));
      }
      return Promise.resolve(true);
    });

    await expect(createUserService(ctx, {
      email: "branch-access@example.com",
      firstName: "Branch",
      userType: "STAFF",
      branchIds: [ctx.activeBranchId ?? ""],
      roleCodes: []
    })).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.user.update");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.create" });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.user.update" });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.userBranchAccess.create).not.toHaveBeenCalled();
  });

  it("requires campuscore.role.view before listing roles", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.role.view"));

    await expect(listRoles(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.role.view");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.role.view" });
    expect(mocks.tx.role.findMany).not.toHaveBeenCalled();
  });

  it("requires campuscore.role.manage rather than role view to create roles", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.role.manage"));

    await expect(createRoleService(ctx, {
      code: "CUSTOM_ADMIN",
      name: "Custom Admin",
      scope: "TENANT",
      permissionCodes: ["campuscore.user.view"]
    })).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.role.manage");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.role.manage" });
    expect(mocks.tx.role.create).not.toHaveBeenCalled();
    expect(mocks.tx.rolePermission.create).not.toHaveBeenCalled();
  });

  it("filters assignable roles to the actor governance boundary", async () => {
    mocks.tx.role.findMany.mockResolvedValue([
      { id: "admin-role", code: "ADMIN", name: "Admin", scope: "TENANT" },
      { id: "teacher-role", code: "TEACHER", name: "Teacher", scope: "TENANT" }
    ]);

    const roles = await listAssignableRoles({ ...ctx, roleCodes: ["PRINCIPAL"] });

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx: { ...ctx, roleCodes: ["PRINCIPAL"] }, permission: "campuscore.user.manage" });
    expect(roles.map((role) => role.code)).toEqual(["TEACHER"]);
  });

  it("requires settings manage for tenant settings mutation", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.settings.manage"));

    await expect(updateTenantSettingsService(ctx, {
      brandName: "JinaCampus",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      dateFormat: "dd/MM/yyyy",
      currency: "INR",
      allowMultipleActiveAcademicYears: false
    })).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.settings.manage");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.settings.manage" });
    expect(mocks.tx.tenantSettings.upsert).not.toHaveBeenCalled();
  });

  it("keeps CampusCore settings compatible before optional module migrations", async () => {
    const input = {
      brandName: "JinaCampus",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      dateFormat: "dd/MM/yyyy",
      currency: "INR",
      allowMultipleActiveAcademicYears: false
    };
    const settings = {
      id: "settings-id",
      tenantId: ctx.tenantId,
      ...input,
      brandByline: null,
      primaryColor: null,
      logoUrl: null,
      createdById: ctx.userId,
      updatedById: ctx.userId,
      createdAt: new Date("2026-08-15T00:00:00.000Z"),
      updatedAt: new Date("2026-08-15T00:00:00.000Z")
    };
    mocks.tx.tenantSettings.findUnique.mockResolvedValue(settings);
    mocks.tx.tenantSettings.upsert.mockResolvedValue(settings);

    await expect(updateTenantSettingsService(ctx, input)).resolves.toEqual(settings);

    const readArgs = mocks.tx.tenantSettings.findUnique.mock.calls[0]?.[0];
    const writeArgs = mocks.tx.tenantSettings.upsert.mock.calls[0]?.[0];
    expect(readArgs.select).toEqual(expect.objectContaining({ id: true, timezone: true }));
    expect(writeArgs.select).toEqual(expect.objectContaining({ id: true, timezone: true }));
    expect(readArgs.select).not.toHaveProperty("schoolCastEnabled");
    expect(writeArgs.select).not.toHaveProperty("schoolCastEnabled");
  });

  it("requires settings manage before reading tenant or attendance settings", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.settings.manage"));

    await expect(getTenantSettings(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.settings.manage");
    await expect(listAttendanceSettings(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.settings.manage");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.settings.manage" });
    expect(mocks.tx.tenantSettings.findUnique).not.toHaveBeenCalled();
    expect(mocks.tx.attendanceSetting.findMany).not.toHaveBeenCalled();
  });

  it("requires campuscore.audit.view before listing audit logs", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:campuscore.audit.view"));

    await expect(listAuditLogs(ctx)).rejects.toThrow("FORBIDDEN_PERMISSION:campuscore.audit.view");

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx, permission: "campuscore.audit.view" });
    expect(mocks.tx.auditLog.findMany).not.toHaveBeenCalled();
  });
});
