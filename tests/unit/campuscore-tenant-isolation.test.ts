import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listAuditLogs,
  listAttendanceSettings,
  listRoles,
  listUsers
} from "@/modules/campus-core/queries";
import {
  createUserService,
  updateAttendanceSettingsService
} from "@/modules/campus-core/services";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const tx = {
    attendanceSetting: { create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
    auditLog: { findMany: vi.fn() },
    branch: { count: vi.fn(), findFirst: vi.fn() },
    role: { findMany: vi.fn() },
    user: { create: vi.fn(), findMany: vi.fn() },
    userBranchAccess: { create: vi.fn(), upsert: vi.fn() },
    userRoleAssignment: { create: vi.fn() }
  };
  const db = {
    ...tx,
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  const getEffectivePermissions = vi.fn();
  const requirePermission = vi.fn();
  const writeAuditLog = vi.fn();
  return { db, getEffectivePermissions, requirePermission, tx, writeAuditLog };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions,
  requirePermission: mocks.requirePermission
}));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const otherBranchId = "00000000-0000-0000-0000-000000000004";
const newUserId = "00000000-0000-0000-0000-000000000005";
const roleId = "00000000-0000-0000-0000-000000000006";
const otherTenantId = "00000000-0000-0000-0000-000000000099";

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "admin@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000007",
  roleCodes: ["PRINCIPAL"]
};

function resetMocks() {
  mocks.tx.attendanceSetting.create.mockReset();
  mocks.tx.attendanceSetting.findFirst.mockReset();
  mocks.tx.attendanceSetting.findMany.mockReset();
  mocks.tx.attendanceSetting.upsert.mockReset();
  mocks.tx.auditLog.findMany.mockReset();
  mocks.tx.branch.count.mockReset();
  mocks.tx.branch.findFirst.mockReset();
  mocks.tx.role.findMany.mockReset();
  mocks.tx.user.create.mockReset();
  mocks.tx.user.findMany.mockReset();
  mocks.tx.userBranchAccess.create.mockReset();
  mocks.tx.userBranchAccess.upsert.mockReset();
  mocks.tx.userRoleAssignment.create.mockReset();
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.getEffectivePermissions.mockReset();
  mocks.getEffectivePermissions.mockResolvedValue(new Set(["notifications.settings.manage"]));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
}

describe("CampusCore tenant isolation", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("lists users, roles, attendance settings, and audit logs only within the current tenant", async () => {
    mocks.tx.user.findMany.mockResolvedValue([]);
    mocks.tx.role.findMany.mockResolvedValue([]);
    mocks.tx.attendanceSetting.findMany.mockResolvedValue([]);
    mocks.tx.auditLog.findMany.mockResolvedValue([]);

    await listUsers(ctx);
    await listRoles(ctx);
    await listAttendanceSettings(ctx);
    await listAuditLogs(ctx);

    expect(mocks.tx.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        tenantId,
        OR: expect.arrayContaining([
          expect.objectContaining({
            branchAccesses: {
              some: expect.objectContaining({
                tenantId,
                branchId: { in: [branchId] }
              })
            }
          })
        ])
      }),
      select: expect.objectContaining({
        roleAssignments: expect.objectContaining({
          where: expect.objectContaining({
            tenantId,
            isActive: true,
            AND: expect.arrayContaining([
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { startsAt: null },
                  expect.objectContaining({ startsAt: expect.objectContaining({ lte: expect.any(Date) }) })
                ])
              }),
              expect.objectContaining({
                OR: expect.arrayContaining([
                  { endsAt: null },
                  expect.objectContaining({ endsAt: expect.objectContaining({ gt: expect.any(Date) }) })
                ])
              })
            ])
          }),
          select: expect.objectContaining({
            role: { select: { code: true } }
          })
        })
      })
    }));
    expect(mocks.tx.role.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId,
        isActive: true,
        code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TEACHER", "STAFF"] }
      },
      select: expect.objectContaining({
        rolePermissions: expect.objectContaining({
          where: { tenantId },
          select: { id: true }
        })
      })
    }));
    expect(mocks.tx.attendanceSetting.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId, branchId: { in: [branchId] } }
    }));
    expect(mocks.tx.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        tenantId,
        OR: [{ branchId: null }, { branchId: { in: [branchId] } }]
      }
    }));
  });

  it("creates users with tenantId from context, ignoring client-like tenant fields", async () => {
    mocks.tx.branch.count.mockResolvedValue(1);
    mocks.tx.role.findMany.mockResolvedValue([]);
    mocks.tx.user.create.mockResolvedValue({ id: newUserId, tenantId });

    const unsafeInput = {
      tenantId: otherTenantId,
      actorUserId: otherTenantId,
      email: "office@example.com",
      firstName: "Office",
      branchIds: [branchId],
      roleCodes: []
    } as unknown as Parameters<typeof createUserService>[1];

    await createUserService(ctx, unsafeInput);

    expect(mocks.tx.branch.count).toHaveBeenCalledWith({
      where: { tenantId, id: { in: [branchId] }, status: { not: "ARCHIVED" } }
    });
    expect(mocks.tx.role.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenantId,
        email: "office@example.com",
        createdById: actorUserId
      })
    }));
    expect(mocks.tx.userBranchAccess.create).toHaveBeenCalledWith({
      data: { tenantId, userId: newUserId, branchId, grantedById: actorUserId }
    });
    expect(mocks.tx.userRoleAssignment.create).not.toHaveBeenCalled();
    expect(JSON.stringify(mocks.tx.user.create.mock.calls[0][0])).not.toContain(otherTenantId);
  });

  it("rejects branch access outside the actor tenant/branch scope before role assignment writes", async () => {
    const wrongBranchInput = {
      email: "wrong-branch@example.com",
      firstName: "Wrong",
      branchIds: [otherBranchId],
      roleCodes: ["ADMIN"]
    } as unknown as Parameters<typeof createUserService>[1];

    await expect(createUserService(ctx, wrongBranchInput)).rejects.toThrow("FORBIDDEN_BRANCH_ACCESS");

    expect(mocks.tx.branch.count).not.toHaveBeenCalled();
    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("requires principals and other institution-scoped actors to create users inside an assigned branch", async () => {
    await expect(createUserService({ ...ctx, roleCodes: ["PRINCIPAL"] }, {
      email: "branchless@example.com",
      firstName: "Branchless",
      userType: "STAFF",
      branchIds: [],
      roleCodes: ["TEACHER"]
    })).rejects.toThrow("USER_BRANCH_ACCESS_REQUIRED");

    expect(mocks.tx.user.create).not.toHaveBeenCalled();
    expect(mocks.tx.userBranchAccess.create).not.toHaveBeenCalled();
    expect(mocks.tx.userRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("updates attendance settings only after tenant-scoped branch verification", async () => {
    const after = { id: "attendance-setting-id", tenantId, branchId };
    mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId });
    mocks.tx.attendanceSetting.findFirst.mockResolvedValue(null);
    mocks.tx.attendanceSetting.upsert.mockResolvedValue(after);

    await updateAttendanceSettingsService(ctx, {
      branchId,
      studentAttendanceMode: "DAILY",
      studentDefaultSessionType: "FULL_DAY",
      studentAutoLockEnabled: true,
      studentAutoLockTime: "15:00",
      sendStudentAbsentAlert: true,
      sendStudentLateAlert: false,
      studentAttendanceWhatsAppEnabled: false,
      studentAttendanceNotificationMode: "EXCEPTION_ONLY",
      minimumAttendancePercentage: 75,
      staffQrAttendanceEnabled: true,
      staffAttendanceCaptureMode: "SUPERVISED_QR",
      staffSelfScanEnabled: false,
      staffManualAttendanceEnabled: true,
      staffCorrectionApprovalRequired: true,
      staffScanSessionValidityMinutes: 60,
      staffCredentialValidityDays: 365,
      staffCheckInStartTime: "07:30",
      staffLateAfterTime: "08:00",
      staffHalfDayBeforeMinutes: 240,
      staffMinimumWorkingMinutes: 360,
      staffQrTokenValiditySeconds: 18000,
      staffWeeklySummaryWhatsAppEnabled: false,
      staffWeeklySummarySendDay: 1,
      staffWeeklySummarySendTime: "09:00",
      staffMonthlySummaryWhatsAppEnabled: false,
      staffMonthlySummarySendDay: 1,
      staffMonthlySummarySendTime: "09:00"
    });

    expect(mocks.tx.branch.findFirst).toHaveBeenCalledWith({
      where: { id: branchId, tenantId, status: { not: "ARCHIVED" } },
      select: { id: true }
    });
    expect(mocks.tx.attendanceSetting.findFirst).toHaveBeenCalledWith({
      where: { tenantId, branchId }
    });
    expect(mocks.tx.attendanceSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { branchId },
      create: expect.objectContaining({ tenantId, branchId, createdById: actorUserId }),
      update: expect.objectContaining({ updatedById: actorUserId })
    }));
  });
});
