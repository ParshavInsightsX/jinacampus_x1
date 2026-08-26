import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import {
  canAssignRole,
  SCHOOL_OPERATIONAL_ROLE_CODES
} from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";

const defaultListTake = 100;

function scopedBranchWhere(ctx: TenantContext) {
  return {
    tenantId: ctx.tenantId,
    id: { in: ctx.accessibleBranchIds },
    status: { not: "ARCHIVED" as const }
  };
}

function scopedInstitutionWhere(ctx: TenantContext, institutionId?: string) {
  const base = {
    ...(institutionId ? { id: institutionId } : {}),
    tenantId: ctx.tenantId,
    status: { not: "ARCHIVED" as const }
  };
  return {
    ...base,
    branches: {
      some: {
        tenantId: ctx.tenantId,
        id: { in: ctx.accessibleBranchIds },
        status: { not: "ARCHIVED" as const }
      }
    }
  };
}

function hasBranchScope(ctx: TenantContext) {
  return ctx.accessibleBranchIds.length > 0;
}

function scopedUserWhere(ctx: TenantContext, userId?: string) {
  const base = {
    ...(userId ? { id: userId } : {}),
    tenantId: ctx.tenantId,
    status: { not: "DEACTIVATED" as const }
  };
  return {
    ...base,
    OR: [
      { id: ctx.userId },
      {
        branchAccesses: {
          some: {
            tenantId: ctx.tenantId,
            isActive: true,
            branchId: { in: ctx.accessibleBranchIds }
          }
        }
      }
    ]
  };
}

export async function listInstitutions(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.institution.manage" });
  return db.institution.findMany({
    where: scopedInstitutionWhere(ctx),
    select: {
      id: true,
      name: true,
      displayName: true,
      code: true,
      logoUrl: true,
      status: true
    },
    orderBy: { name: "asc" },
    take: defaultListTake
  });
}

export async function getInstitutionById(ctx: TenantContext, institutionId: string) {
  await requirePermission({ ctx, permission: "campuscore.institution.manage" });
  return db.institution.findFirst({
    where: scopedInstitutionWhere(ctx, institutionId),
    select: {
      id: true,
      name: true,
      displayName: true,
      code: true,
      status: true,
      board: true,
      medium: true,
      logoUrl: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      createdAt: true,
      updatedAt: true,
      tenant: { select: { name: true, slug: true } },
      _count: { select: { branches: true } }
    }
  });
}

export async function listBranches(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.branch.manage" });
  if (!hasBranchScope(ctx)) return [];

  return db.branch.findMany({
    where: scopedBranchWhere(ctx),
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      institution: { select: { name: true } }
    },
    orderBy: { name: "asc" },
    take: defaultListTake
  });
}

export async function getBranchById(ctx: TenantContext, branchId: string) {
  await requirePermission({ ctx, permission: "campuscore.branch.manage", branchId });
  if (!ctx.accessibleBranchIds.includes(branchId)) return null;

  return db.branch.findFirst({
    where: {
      id: branchId,
      tenantId: ctx.tenantId,
      status: { not: "ARCHIVED" }
    },
    select: {
      id: true,
      institutionId: true,
      name: true,
      code: true,
      status: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      phone: true,
      email: true,
      timezone: true,
      createdAt: true,
      updatedAt: true,
      institution: { select: { name: true, code: true } }
    }
  });
}

export async function listAccessibleBranches(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.tenant.view" });
  if (!hasBranchScope(ctx)) return [];

  return db.branch.findMany({
    where: scopedBranchWhere(ctx),
    select: { id: true, name: true },
    orderBy: { name: "asc" },
    take: defaultListTake
  });
}

export async function listUserAssignableBranches(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.user.update" });
  if (!hasBranchScope(ctx)) return [];

  return db.branch.findMany({
    where: scopedBranchWhere(ctx),
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
    take: defaultListTake
  });
}

export async function listAcademicYears(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.academic_year.manage" });
  return db.academicYear.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: { not: "ARCHIVED" },
      institution: {
        branches: {
          some: {
            tenantId: ctx.tenantId,
            id: { in: ctx.accessibleBranchIds },
            status: { not: "ARCHIVED" }
          }
        }
      }
    },
    select: {
      id: true,
      name: true,
      status: true,
      isActive: true,
      institution: { select: { name: true } }
    },
    orderBy: { startDate: "desc" },
    take: defaultListTake
  });
}

export async function listUsers(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.user.view" });
  const now = new Date();

  return db.user.findMany({
    where: scopedUserWhere(ctx),
    select: {
      id: true,
      email: true,
      firstName: true,
      displayName: true,
      status: true,
      roleAssignments: {
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          AND: [
            { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
            { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
          ]
        },
        select: { role: { select: { code: true } } }
      }
    },
    orderBy: [{ firstName: "asc" }, { email: "asc" }],
    take: defaultListTake
  });
}

export async function getUserById(ctx: TenantContext, userId: string) {
  await requirePermission({ ctx, permission: "campuscore.user.view" });

  return db.user.findFirst({
    where: scopedUserWhere(ctx, userId),
    select: {
      id: true,
      email: true,
      phone: true,
      firstName: true,
      middleName: true,
      lastName: true,
      displayName: true,
      userType: true,
      status: true,
      invitedAt: true,
      activatedAt: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
      tenant: { select: { name: true, slug: true } },
      passwordCredential: { select: { mustChange: true, passwordUpdatedAt: true } },
      branchAccesses: {
        where: { tenantId: ctx.tenantId, isActive: true },
        select: { id: true, branchId: true, branch: { select: { id: true, name: true, code: true } }, isPrimary: true }
      },
      roleAssignments: {
        where: { tenantId: ctx.tenantId, isActive: true },
        select: { id: true, roleId: true, scopeType: true, scopeId: true, role: { select: { id: true, code: true, name: true } } }
      }
    }
  });
}

export async function listRoles(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.role.view" });
  return db.role.findMany({
    where: {
      tenantId: ctx.tenantId,
      isActive: true,
      code: { in: [...SCHOOL_OPERATIONAL_ROLE_CODES] }
    },
    select: {
      id: true,
      code: true,
      name: true,
      scope: true,
      rolePermissions: {
        where: { tenantId: ctx.tenantId },
        select: { id: true }
      }
    },
    orderBy: { code: "asc" },
    take: defaultListTake
  });
}

export async function listAssignableRoles(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.user.manage" });
  const roles = await db.role.findMany({
    where: { tenantId: ctx.tenantId, isActive: true },
    select: {
      id: true,
      code: true,
      name: true,
      scope: true
    },
    orderBy: { code: "asc" },
    take: defaultListTake
  });
  return roles.filter((role) => canAssignRole(ctx.roleCodes ?? [], role.code));
}

export async function listPermissions(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.role.view" });
  return db.permission.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, take: defaultListTake });
}

export async function getTenantSettings(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.settings.manage" });
  return db.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: {
      brandName: true,
      brandByline: true,
      timezone: true,
      locale: true,
      dateFormat: true,
      currency: true,
      allowMultipleActiveAcademicYears: true
    }
  });
}

export async function listAttendanceSettings(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.settings.manage" });
  if (!hasBranchScope(ctx)) return [];
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.SETTINGS, operation: "READ" }
  ], { branchId: ctx.activeBranchId });

  return db.attendanceSetting.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: {
      id: true,
      branchId: true,
      studentAutoLockEnabled: true,
      studentAutoLockTime: true,
      sendStudentAbsentAlert: true,
      sendStudentLateAlert: true,
      studentAttendanceWhatsAppEnabled: true,
      studentAttendanceNotificationMode: true,
      minimumAttendancePercentage: true,
      staffQrAttendanceEnabled: true,
      staffAttendanceCaptureMode: true,
      staffSelfScanEnabled: true,
      staffManualAttendanceEnabled: true,
      staffCorrectionApprovalRequired: true,
      staffScanSessionValidityMinutes: true,
      staffCredentialValidityDays: true,
      staffCheckInStartTime: true,
      staffLateAfterTime: true,
      staffHalfDayBeforeMinutes: true,
      staffMinimumWorkingMinutes: true,
      staffQrTokenValiditySeconds: true,
      staffWeeklySummaryWhatsAppEnabled: true,
      staffWeeklySummarySendDay: true,
      staffWeeklySummarySendTime: true,
      staffMonthlySummaryWhatsAppEnabled: true,
      staffMonthlySummarySendDay: true,
      staffMonthlySummarySendTime: true,
      branch: { select: { name: true } }
    },
    orderBy: { branch: { name: "asc" } },
    take: defaultListTake
  });
}

export async function getAttendanceNotificationStatus(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.settings.manage" });
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.SETTINGS, operation: "READ" }
  ], { branchId: ctx.activeBranchId });
  const scopedBranches = ctx.accessibleBranchIds;

  const [integrations, templates] = await Promise.all([
    db.whatsAppIntegrationSetting.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          { branchId: null },
          ...(scopedBranches.length ? [{ branchId: { in: scopedBranches } }] : [])
        ]
      },
      select: {
        branchId: true,
        provider: true,
        isEnabled: true,
        phoneNumberId: true,
        businessAccountId: true
      },
      take: defaultListTake
    }),
    db.notificationTemplate.findMany({
      where: {
        tenantId: ctx.tenantId,
        channel: "WHATSAPP",
        templateKey: { in: ["student_daily_attendance_alert", "staff_weekly_attendance_summary", "staff_monthly_attendance_summary"] },
        isActive: true
      },
      select: {
        templateKey: true,
        providerTemplateName: true,
        languageCode: true
      },
      orderBy: { templateKey: "asc" },
      take: 10
    })
  ]);

  const activeBranchIntegration = ctx.activeBranchId
    ? integrations.find((integration) => integration.branchId === ctx.activeBranchId)
    : undefined;
  const globalIntegration = integrations.find((integration) => integration.branchId === null);
  const integration = activeBranchIntegration ?? globalIntegration ?? null;

  return {
    provider: integration?.provider ?? "DRY_RUN",
    isEnabled: Boolean(integration?.isEnabled),
    hasProviderIdentity: Boolean(integration?.phoneNumberId || integration?.businessAccountId),
    templates: templates.map((template) => ({
      templateKey: template.templateKey,
      providerTemplateName: template.providerTemplateName,
      languageCode: template.languageCode
    }))
  };
}

export async function listAuditLogs(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "campuscore.audit.view" });
  return db.auditLog.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ branchId: null }, { branchId: { in: ctx.accessibleBranchIds } }]
    },
    include: {
      actor: { select: { firstName: true, lastName: true, email: true } },
      branch: { select: { name: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}
