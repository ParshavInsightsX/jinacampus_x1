import { beforeEach, describe, expect, it, vi } from "vitest";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import { STAFFBOARD_LITE_PERMISSIONS } from "@/modules/staffboard-lite/permissions";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { getStaffProfileById, listStaffProfiles } from "@/modules/staffboard-lite/queries/staff-profile.queries";
import {
  createStaffProfile,
  deactivateStaffProfile,
  disableStaffLoginAccess,
  reactivateStaffLoginAccess,
  updateStaffProfile
} from "@/modules/staffboard-lite/services/staff-profile.service";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    academicCalendarEntry: { findMany: vi.fn() },
    auditLog: { create: vi.fn() },
    branch: { findFirst: vi.fn() },
    passwordCredential: { create: vi.fn() },
    role: { findFirst: vi.fn() },
    session: { updateMany: vi.fn() },
    staffAttendanceRecord: { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    staffProfile: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    user: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    userBranchAccess: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn()
    },
    userRoleAssignment: { create: vi.fn(), findFirst: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const hashPassword = vi.fn();
  const requirePermission = vi.fn();
  const writeAuditLog = vi.fn();
  return { db, hashPassword, requirePermission, tx, writeAuditLog };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: mocks.hashPassword }));
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

const branchId = "00000000-0000-0000-0000-000000000003";
const otherBranchId = "00000000-0000-0000-0000-000000000004";
const staffId = "00000000-0000-0000-0000-000000000005";
const institutionId = "00000000-0000-0000-0000-000000000006";

function staffProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: staffId,
    tenantId: ctx.tenantId,
    branchId,
    userId: null,
    employeeCode: "EMP-1001",
    firstName: "Meera",
    middleName: null,
    lastName: "Sharma",
    staffType: "TEACHER",
    designation: "Teacher",
    department: "Academics",
    phone: "9876543210",
    email: "meera@example.com",
    joiningDate: new Date("2026-04-01T00:00:00.000Z"),
    employmentStatus: "ACTIVE",
    createdAt: new Date("2026-04-01T08:00:00.000Z"),
    updatedAt: new Date("2026-04-01T08:00:00.000Z"),
    ...overrides
  };
}

function calendarStaffProfile(profile = staffProfile()) {
  return { ...profile, branch: { institutionId } };
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
  mocks.hashPassword.mockReset();
  mocks.hashPassword.mockResolvedValue("hashed-password");
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
  mocks.tx.academicCalendarEntry.findMany.mockResolvedValue([]);
  mocks.tx.staffAttendanceRecord.findMany.mockResolvedValue([]);
  mocks.tx.staffAttendanceRecord.updateMany.mockResolvedValue({ count: 0 });
  mocks.tx.staffAttendanceRecord.createMany.mockResolvedValue({ count: 0 });
  mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId });
}

describe("StaffBoard Lite staff profile services and queries", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("createStaffProfile validates input before permission checks", async () => {
    await expect(createStaffProfile(ctx, {
      branchId,
      firstName: "Meera",
      staffType: "TEACHER"
    })).rejects.toThrow();

    expect(mocks.requirePermission).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("createStaffProfile uses tenant and actor context from the server", async () => {
    const created = staffProfile();
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(calendarStaffProfile(created));
    mocks.tx.staffProfile.create.mockResolvedValue(created);

    await expect(createStaffProfile(ctx, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    })).resolves.toBe(created);

    expect(mocks.tx.staffProfile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId,
        employeeCode: "EMP-1001",
        firstName: "Meera",
        staffType: "TEACHER"
      })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_CREATED,
      entityType: "StaffProfile",
      entityId: staffId,
      branchId,
      after: created
    }), mocks.tx);
  });

  it("createStaffProfile verifies branch access and requires create permission", async () => {
    const created = staffProfile();
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(calendarStaffProfile(created));
    mocks.tx.staffProfile.create.mockResolvedValue(created);

    await createStaffProfile(ctx, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.create",
      branchId
    });
    expect(mocks.tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, tenantId: ctx.tenantId, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
  });

  it("createStaffProfile can create linked login access with hashed password, branch access, and tenant role", async () => {
    const created = staffProfile({ userId: "00000000-0000-0000-0000-000000000099" });
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(calendarStaffProfile(created));
    mocks.tx.user.findUnique.mockResolvedValue(null);
    mocks.tx.role.findFirst.mockResolvedValue({ id: "00000000-0000-0000-0000-000000000088", code: "STAFF", name: "Staff" });
    mocks.tx.user.create.mockResolvedValue({
      id: "00000000-0000-0000-0000-000000000099",
      tenantId: ctx.tenantId,
      email: "meera@example.com",
      phone: "9876543210",
      firstName: "Meera",
      middleName: null,
      lastName: "Sharma",
      displayName: "Meera Sharma",
      userType: "STAFF",
      status: "ACTIVE",
      createdById: ctx.userId,
      createdAt: new Date("2026-04-01T08:00:00.000Z"),
      updatedAt: new Date("2026-04-01T08:00:00.000Z")
    });
    mocks.tx.userBranchAccess.create.mockResolvedValue({ id: "branch-access-id" });
    mocks.tx.userRoleAssignment.create.mockResolvedValue({ id: "role-assignment-id" });
    mocks.tx.staffProfile.create.mockResolvedValue(created);

    await expect(createStaffProfile({ ...ctx, roleCodes: ["PRINCIPAL"] }, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      lastName: "Sharma",
      staffType: "TEACHER",
      phone: "9876543210",
      email: "meera@example.com",
      createLoginAccess: true,
      loginRoleCode: "STAFF",
      initialPassword: "temporary-123",
      confirmInitialPassword: "temporary-123"
    })).resolves.toBe(created);

    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx: { ...ctx, roleCodes: ["PRINCIPAL"] }, permission: "staffboard.staff.create", branchId });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx: { ...ctx, roleCodes: ["PRINCIPAL"] }, permission: "campuscore.user.create" });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx: { ...ctx, roleCodes: ["PRINCIPAL"] }, permission: "campuscore.user.update", branchId });
    expect(mocks.requirePermission).toHaveBeenCalledWith({ ctx: { ...ctx, roleCodes: ["PRINCIPAL"] }, permission: "campuscore.user.manage" });
    expect(mocks.hashPassword).toHaveBeenCalledWith("temporary-123");
    expect(mocks.tx.passwordCredential.create).toHaveBeenCalledWith({
      data: { userId: "00000000-0000-0000-0000-000000000099", passwordHash: "hashed-password", mustChange: true }
    });
    expect(mocks.tx.userBranchAccess.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: ctx.tenantId, userId: "00000000-0000-0000-0000-000000000099", branchId, isPrimary: true })
    });
    expect(mocks.tx.userRoleAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: ctx.tenantId, userId: "00000000-0000-0000-0000-000000000099", roleId: "00000000-0000-0000-0000-000000000088", scopeType: "TENANT", scopeId: "TENANT" })
    });
    expect(mocks.tx.staffProfile.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ tenantId: ctx.tenantId, userId: "00000000-0000-0000-0000-000000000099" })
    }));
    expect(JSON.stringify(mocks.writeAuditLog.mock.calls)).not.toMatch(/temporary-123|passwordHash/);
  });

  it("createStaffProfile stops before writes when create permission is missing", async () => {
    mocks.requirePermission.mockRejectedValue(new Error("FORBIDDEN_PERMISSION:staffboard.staff.create"));

    await expect(createStaffProfile(ctx, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    })).rejects.toThrow("FORBIDDEN_PERMISSION:staffboard.staff.create");

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.tx.staffProfile.create).not.toHaveBeenCalled();
  });

  it("createStaffProfile handles duplicate employee codes per tenant", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue({ id: staffId });

    await expect(createStaffProfile(ctx, {
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Meera",
      staffType: "TEACHER"
    })).rejects.toMatchObject({ code: "STAFF_EMPLOYEE_CODE_EXISTS" });

    expect(mocks.tx.staffProfile.findFirst).toHaveBeenCalledWith({
      where: { tenantId: ctx.tenantId, employeeCode: "EMP-1001" },
      select: { id: true }
    });
    expect(mocks.tx.staffProfile.create).not.toHaveBeenCalled();
  });

  it("listStaffProfiles is tenant scoped and branch scoped", async () => {
    mocks.tx.staffProfile.findMany.mockResolvedValue([]);

    await listStaffProfiles(ctx, { search: "Meera" });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.view",
      branchId
    });
    expect(mocks.tx.staffProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId
      })
    }));
  });

  it("listStaffProfiles respects requested accessible branch filters", async () => {
    mocks.tx.staffProfile.findMany.mockResolvedValue([]);

    await listStaffProfiles(ctx, { branchId: otherBranchId, staffType: "ADMIN" });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.view",
      branchId: otherBranchId
    });
    expect(mocks.tx.staffProfile.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId: ctx.tenantId,
        branchId: otherBranchId,
        staffType: "ADMIN"
      })
    }));
  });

  it("getStaffProfileById does not leak cross-tenant or cross-branch records", async () => {
    mocks.tx.staffProfile.findFirst.mockResolvedValue(null);

    await expect(getStaffProfileById(ctx, staffId)).resolves.toBeNull();

    expect(mocks.tx.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: staffId,
        tenantId: ctx.tenantId,
        branchId: { in: ctx.accessibleBranchIds }
      }
    }));
    expect(mocks.requirePermission).not.toHaveBeenCalled();
  });

  it("updateStaffProfile writes audit before and after values", async () => {
    const before = staffProfile({ designation: "Teacher" });
    const after = staffProfile({ designation: "Senior Teacher" });
    mocks.tx.staffProfile.findFirst.mockResolvedValueOnce(before);
    mocks.tx.staffProfile.update.mockResolvedValue(after);

    await updateStaffProfile(ctx, {
      staffId,
      designation: "Senior Teacher"
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.update",
      branchId
    });
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_UPDATED,
      entityType: "StaffProfile",
      entityId: staffId,
      branchId,
      before,
      after
    }), mocks.tx);
  });

  it("deactivateStaffProfile soft-deactivates and does not hard delete", async () => {
    const before = staffProfile({ employmentStatus: "ACTIVE" });
    const after = staffProfile({ employmentStatus: "INACTIVE" });
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(calendarStaffProfile(after));
    mocks.tx.staffProfile.update.mockResolvedValue(after);

    await expect(deactivateStaffProfile(ctx, staffId)).resolves.toBe(after);

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.deactivate",
      branchId
    });
    expect(mocks.tx.staffProfile.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: staffId },
      data: { employmentStatus: "INACTIVE" }
    }));
    expect(mocks.tx.staffProfile.delete).not.toHaveBeenCalled();
  });

  it("deactivation writes an audit log", async () => {
    const before = staffProfile({ employmentStatus: "ACTIVE" });
    const after = staffProfile({ employmentStatus: "INACTIVE" });
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(calendarStaffProfile(after));
    mocks.tx.staffProfile.update.mockResolvedValue(after);

    await deactivateStaffProfile(ctx, staffId);

    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_DEACTIVATED,
      entityType: "StaffProfile",
      entityId: staffId,
      branchId,
      before,
      after,
      metadata: { previousStatus: "ACTIVE", newStatus: "INACTIVE" }
    }), mocks.tx);
  });

  it("disables login while preserving the StaffProfile/User link", async () => {
    const userId = "00000000-0000-0000-0000-000000000099";
    const before = staffProfile({
      userId,
      user: {
        id: userId,
        tenantId: ctx.tenantId,
        email: "meera@example.com",
        status: "ACTIVE"
      }
    });
    const after = staffProfile({ userId });
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(calendarStaffProfile(after));
    mocks.tx.user.update.mockResolvedValue({
      id: userId,
      tenantId: ctx.tenantId,
      email: "meera@example.com",
      status: "DEACTIVATED"
    });
    mocks.tx.staffProfile.findUniqueOrThrow.mockResolvedValue(after);

    await disableStaffLoginAccess(ctx, {
      staffId,
      confirmDisableLoginAccess: true
    });

    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: userId },
      data: expect.objectContaining({ status: "DEACTIVATED" })
    }));
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: ctx.tenantId, userId })
    }));
    expect(mocks.tx.staffProfile.update).not.toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: null })
    }));
    expect(after.userId).toBe(userId);
  });

  it("reactivates an eligible linked account without creating another user", async () => {
    const userId = "00000000-0000-0000-0000-000000000099";
    const before = staffProfile({
      userId,
      user: {
        id: userId,
        tenantId: ctx.tenantId,
        email: "meera@example.com",
        status: "DEACTIVATED",
        deactivatedAt: new Date("2026-05-01T00:00:00.000Z")
      }
    });
    const after = staffProfile({ userId });
    mocks.tx.staffProfile.findFirst.mockResolvedValue(before);
    mocks.tx.userBranchAccess.findFirst.mockResolvedValue({ id: "branch-access-id" });
    mocks.tx.userRoleAssignment.findFirst.mockResolvedValue({ id: "role-assignment-id" });
    mocks.tx.user.update.mockResolvedValue({
      id: userId,
      tenantId: ctx.tenantId,
      email: "meera@example.com",
      status: "ACTIVE"
    });
    mocks.tx.staffProfile.findUniqueOrThrow.mockResolvedValue(after);

    await reactivateStaffLoginAccess(ctx, {
      staffId,
      confirmReactivateLoginAccess: true
    });

    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: userId },
      data: expect.objectContaining({ status: "ACTIVE", deactivatedAt: null })
    }));
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LOGIN_ACCESS_REACTIVATED,
      metadata: { userId }
    }), mocks.tx);
  });

  it("deactivates the linked login and revokes sessions with employment", async () => {
    const userId = "00000000-0000-0000-0000-000000000099";
    const linkedUser = {
      id: userId,
      tenantId: ctx.tenantId,
      email: "meera@example.com",
      phone: "9876543210",
      firstName: "Meera",
      middleName: null,
      lastName: "Sharma",
      displayName: "Meera Sharma",
      status: "ACTIVE"
    };
    const before = staffProfile({
      userId,
      user: linkedUser
    });
    const after = staffProfile({ userId, employmentStatus: "INACTIVE" });
    mocks.tx.staffProfile.findFirst
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(calendarStaffProfile(after));
    mocks.tx.staffProfile.update.mockResolvedValue(after);
    mocks.tx.user.update.mockResolvedValue({
      ...linkedUser,
      status: "DEACTIVATED",
      deactivatedAt: new Date("2026-05-01T00:00:00.000Z")
    });

    await deactivateStaffProfile(ctx, staffId);

    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: userId },
      data: expect.objectContaining({ status: "DEACTIVATED" })
    }));
    expect(mocks.tx.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenantId: ctx.tenantId, userId, revokedAt: null })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_DEACTIVATED,
      metadata: expect.objectContaining({ sessionsRevoked: true })
    }), mocks.tx);
  });

  it("does not introduce payroll or appraisal permissions", () => {
    expect(STAFFBOARD_LITE_PERMISSIONS.join(" ")).not.toMatch(/payroll|appraisal/i);
  });
});
