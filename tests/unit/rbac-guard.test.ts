import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const db = {
    userRoleAssignment: { findMany: vi.fn() }
  };
  return { db };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";

const ctx: TenantContext = {
  tenantId,
  userId,
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

function assignment(permissionCodes: string[]) {
  return {
    role: {
      tenantId,
      isActive: true,
      rolePermissions: permissionCodes.map((code) => ({
        permission: { code, isActive: true }
      }))
    }
  };
}

describe("RBAC guard", () => {
  beforeEach(() => {
    mocks.db.userRoleAssignment.findMany.mockReset();
    mocks.db.userRoleAssignment.findMany.mockResolvedValue([]);
  });

  it("loads effective permissions from tenant, branch, and academic-year scoped assignments", async () => {
    mocks.db.userRoleAssignment.findMany.mockResolvedValue([
      assignment(["campuscore.user.view", "academia.attendance.mark"])
    ]);

    const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });

    expect(mocks.db.userRoleAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        userId,
        isActive: true,
        AND: expect.arrayContaining([
          {
            OR: [
              { scopeType: "TENANT", scopeId: "TENANT" },
              { scopeType: "BRANCH", scopeId: branchId },
              { scopeType: "ACADEMIC_YEAR", scopeId: academicYearId }
            ]
          }
        ])
      }),
      select: expect.objectContaining({
        role: expect.objectContaining({
          select: expect.objectContaining({
            rolePermissions: expect.objectContaining({ where: { tenantId } })
          })
        })
      })
    }));
    expect(permissions.has("campuscore.user.view")).toBe(true);
    expect(permissions.has("academia.attendance.mark")).toBe(true);
  });

  it("loads only authorization fields and rejects permissions outside this release catalog", async () => {
    mocks.db.userRoleAssignment.findMany.mockResolvedValue([
      assignment(["campuscore.user.view", "kinbridge.account.manage", "future_module.unrecognised"])
    ]);
    const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
    expect(mocks.db.userRoleAssignment.findMany.mock.calls[0][0].select).toEqual({
      role: { select: {
        tenantId: true,
        isActive: true,
        rolePermissions: {
          where: { tenantId },
          select: { permission: { select: { code: true, isActive: true } } } }
      } }
    });
    expect(permissions.has("campuscore.user.view")).toBe(true);
    expect([...permissions]).not.toContain("kinbridge.account.manage");
    expect([...permissions]).not.toContain("future_module.unrecognised");
  });

  it("fails closed if the permission database query fails", async () => {
    mocks.db.userRoleAssignment.findMany.mockRejectedValue(new Error("DATABASE_UNAVAILABLE"));
    await expect(requirePermission({ ctx, permission: "campuscore.user.view", branchId }))
      .rejects.toThrow("DATABASE_UNAVAILABLE");
  });

  it("preserves assignment validity windows", async () => {
    await getEffectivePermissions({ ctx, branchId, academicYearId });
    const filters = mocks.db.userRoleAssignment.findMany.mock.calls[0][0].where.AND;
    expect(filters).toEqual(expect.arrayContaining([
      { OR: [{ startsAt: null }, { startsAt: { lte: expect.any(Date) } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: expect.any(Date) } }] }
    ]));
  });

  it("rejects missing exact permissions even when a related weaker permission exists", async () => {
    mocks.db.userRoleAssignment.findMany.mockResolvedValue([
      assignment(["academia.attendance.view"])
    ]);

    await expect(requirePermission({
      ctx,
      permission: "academia.attendance.mark",
      branchId,
      academicYearId
    })).rejects.toThrow("FORBIDDEN_PERMISSION:academia.attendance.mark");
  });

  it("ignores inactive roles, inactive permissions, and other-tenant role assignments", async () => {
    mocks.db.userRoleAssignment.findMany.mockResolvedValue([
      {
        role: {
          tenantId: "00000000-0000-0000-0000-000000000099",
          isActive: true,
          rolePermissions: [
            { permission: { code: "staffboard.attendance.correct", isActive: true } }
          ]
        }
      },
      {
        role: {
          tenantId,
          isActive: false,
          rolePermissions: [
            { permission: { code: "staffboard.attendance.correct", isActive: true } }
          ]
        }
      },
      {
        role: {
          tenantId,
          isActive: true,
          rolePermissions: [
            { permission: { code: "staffboard.attendance.correct", isActive: false } }
          ]
        }
      }
    ]);

    const permissions = await getEffectivePermissions({ ctx, branchId });

    expect(permissions.has("staffboard.attendance.correct")).toBe(false);
    await expect(requirePermission({
      ctx,
      permission: "staffboard.attendance.correct",
      branchId
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.attendance.correct");
  });

  it("rejects branch scopes outside the actor accessible branch list before reading assignments", async () => {
    await expect(getEffectivePermissions({
      ctx,
      branchId: "00000000-0000-0000-0000-000000000099"
    })).rejects.toThrow("FORBIDDEN_BRANCH_ACCESS");

    expect(mocks.db.userRoleAssignment.findMany).not.toHaveBeenCalled();
  });

  it("does not grant legacy tenant administrators a cross-branch bypass", async () => {
    await expect(getEffectivePermissions({
      ctx: { ...ctx, accessibleBranchIds: [], roleCodes: ["ADMINISTRATOR"] },
      branchId
    })).rejects.toThrow("FORBIDDEN_BRANCH_ACCESS");

    expect(mocks.db.userRoleAssignment.findMany).not.toHaveBeenCalled();
  });
});
