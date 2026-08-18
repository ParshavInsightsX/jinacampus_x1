import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { hasPrincipalRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { listStaffLeaveApplicationsSchema, staffLeaveApplicationParamsSchema } from "@/modules/staffboard-lite/schemas";

async function selfStaff(ctx: TenantContext) {
  const staff = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE"
    },
    select: { id: true, branchId: true, employeeCode: true, firstName: true, middleName: true, lastName: true }
  });
  if (!staff) throw notFound("ACTIVE_STAFF_PROFILE_NOT_FOUND");
  await requirePermission({ ctx, permission: "staffboard.leave.self_view", branchId: staff.branchId });
  return staff;
}
async function requireReviewAccess(ctx: TenantContext, branchId: string) {
  await requirePermission({ ctx, permission: "staffboard.leave.view", branchId });
  if (hasPrincipalRole(ctx.roleCodes ?? [])) return;
  const designated = await db.staffLeaveApprover.findFirst({
    where: { tenantId: ctx.tenantId, branchId, userId: ctx.userId, isActive: true },
    select: { id: true }
  });
  if (!designated) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
}

const applicationInclude = {
  leaveType: {
    select: {
      id: true,
      code: true,
      name: true,
      isPaid: true,
      balanceTracked: true,
      supportingDocumentRequired: true,
      documentRequiredAfterDays: true
    }
  },
  staff: {
    select: {
      id: true,
      userId: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      designation: true,
      department: true
    }
  },
  actionedBy: { select: { displayName: true, firstName: true, lastName: true } },
  actions: {
    select: {
      id: true,
      action: true,
      previousStatus: true,
      nextStatus: true,
      remarks: true,
      createdAt: true,
      actor: { select: { displayName: true, firstName: true, lastName: true } }
    },
    orderBy: { createdAt: "desc" as const }
  },
  documents: {
    where: { deletedAt: null },
    select: { id: true, title: true, originalFileName: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "desc" as const }
  }
} as const;

export async function getMyStaffLeaveWorkspace(ctx: TenantContext, input: unknown = {}) {
  const params = listStaffLeaveApplicationsSchema.parse(input);
  const staff = await selfStaff(ctx);
  const year = params.year ?? new Date().getUTCFullYear();
  const [applications, leaveTypes, balances] = await Promise.all([
    db.staffLeaveApplication.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: staff.branchId,
        staffId: staff.id,
        status: params.status,
        startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) }
      },
      include: { leaveType: { select: { id: true, code: true, name: true, isPaid: true } } },
      orderBy: [{ submittedAt: "desc" }, { startDate: "desc" }],
      take: 100
    }),
    db.staffLeaveType.findMany({
      where: { tenantId: ctx.tenantId, branchId: staff.branchId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        isPaid: true,
        balanceTracked: true,
        annualLimit: true,
        allowHalfDay: true,
        supportingDocumentRequired: true,
        documentRequiredAfterDays: true
      },
      orderBy: { name: "asc" }
    }),
    db.staffLeaveBalance.findMany({
      where: { tenantId: ctx.tenantId, branchId: staff.branchId, staffId: staff.id, year },
      select: { leaveTypeId: true, allocatedDays: true, adjustedDays: true, usedDays: true }
    })
  ]);

  const balanceByType = new Map(balances.map((balance) => [balance.leaveTypeId, balance]));
  return {
    staff,
    year,
    applications,
    leaveTypes,
    balances: leaveTypes.map((leaveType) => {
      const balance = balanceByType.get(leaveType.id);
      const allocated = balance?.allocatedDays ?? leaveType.annualLimit;
      const adjusted = balance?.adjustedDays ?? 0;
      const used = balance?.usedDays ?? 0;
      const available = Number(allocated) + Number(adjusted) - Number(used);
      return { leaveTypeId: leaveType.id, name: leaveType.name, balanceTracked: leaveType.balanceTracked, allocated, adjusted, used, available };
    })
  };
}

export async function listReviewableStaffLeaveApplications(ctx: TenantContext, input: unknown = {}) {
  const params = listStaffLeaveApplicationsSchema.parse(input);
  const branchId = params.branchId ?? ctx.activeBranchId ?? (ctx.accessibleBranchIds.length === 1 ? ctx.accessibleBranchIds[0] : null);
  if (!branchId) return [];
  await requireReviewAccess(ctx, branchId);
  const year = params.year ?? new Date().getUTCFullYear();
  return db.staffLeaveApplication.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      status: params.status,
      startDate: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 31)) }
    },
    include: {
      leaveType: { select: { name: true, code: true } },
      staff: { select: { employeeCode: true, firstName: true, middleName: true, lastName: true, designation: true } }
    },
    orderBy: [{ status: "asc" }, { submittedAt: "desc" }],
    take: 200
  });
}

export async function getStaffLeaveApplicationDetail(ctx: TenantContext, applicationId: string) {
  const params = staffLeaveApplicationParamsSchema.parse({ applicationId });
  const application = await db.staffLeaveApplication.findFirst({
    where: { id: params.applicationId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
    include: applicationInclude
  });
  if (!application) throw notFound("STAFF_LEAVE_APPLICATION_NOT_FOUND");
  const ownApplication = application.staff.userId === ctx.userId;
  if (ownApplication) {
    await requirePermission({ ctx, permission: "staffboard.leave.self_view", branchId: application.branchId });
  } else {
    await requireReviewAccess(ctx, application.branchId);
  }
  return { application, ownApplication };
}

export async function getStaffLeaveSettingsWorkspace(ctx: TenantContext, branchId?: string) {
  const selectedBranchId = branchId ?? ctx.activeBranchId ?? (ctx.accessibleBranchIds.length === 1 ? ctx.accessibleBranchIds[0] : null);
  if (!selectedBranchId) return null;
  await requirePermission({ ctx, permission: "staffboard.leave.settings.manage", branchId: selectedBranchId });
  const [branch, setting, leaveTypes, approvers, candidates, staff] = await Promise.all([
    db.branch.findFirst({ where: { id: selectedBranchId, tenantId: ctx.tenantId }, select: { id: true, name: true, timezone: true } }),
    db.staffLeaveSetting.findFirst({ where: { tenantId: ctx.tenantId, branchId: selectedBranchId } }),
    db.staffLeaveType.findMany({ where: { tenantId: ctx.tenantId, branchId: selectedBranchId }, orderBy: { name: "asc" } }),
    db.staffLeaveApprover.findMany({
      where: { tenantId: ctx.tenantId, branchId: selectedBranchId },
      include: { user: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: "asc" }
    }),
    db.user.findMany({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        branchAccesses: { some: { tenantId: ctx.tenantId, branchId: selectedBranchId, isActive: true } },
        roleAssignments: { some: { tenantId: ctx.tenantId, isActive: true, role: { code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TENANT_OWNER", "SUPER_ADMIN", "ADMIN"] } } } }
      },
      select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
      orderBy: { firstName: "asc" }
    }),
    db.staffProfile.findMany({
      where: { tenantId: ctx.tenantId, branchId: selectedBranchId, employmentStatus: "ACTIVE" },
      select: { id: true, employeeCode: true, firstName: true, middleName: true, lastName: true },
      orderBy: [{ firstName: "asc" }, { employeeCode: "asc" }]
    })
  ]);
  if (!branch) throw notFound("BRANCH_NOT_FOUND");
  return { branch, setting, leaveTypes, approvers, candidates, staff };
}
