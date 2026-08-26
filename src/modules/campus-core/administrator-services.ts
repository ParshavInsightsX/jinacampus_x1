import { Prisma } from "@prisma/client";
import type { z } from "zod";

import { writePlatformAuditLog } from "@/lib/audit/platform-audit-log";
import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { ROLE_PERMISSION_MAP, SCHOOL_OPERATIONAL_ROLE_CODES } from "@/lib/rbac/roles";
import type {
  createSchoolSchema,
  deactivateSchoolSchema,
  deleteSchoolSchema,
  reactivateSchoolSchema,
  updateSchoolIdSchema,
  updateSchoolSchema
} from "@/modules/campus-core/administrator-schemas";
import { initializeInstitutionCommercialAccess } from "@/modules/campus-core/entitlements/provisioning";
import { isInstitutionEntitlementSchemaAvailable } from "@/modules/campus-core/entitlements/service";
import { PLATFORM_ADMINISTRATOR_AUDIT_EVENTS } from "@/modules/campus-core/platform-administrator-audit-events";
import { ensureTenantSettingsRow } from "@/modules/campus-core/services/tenant-settings-compat";
import type { changeOwnPasswordSchema } from "@/modules/campus-core/schemas";
import {
  SCHOOL_ID_ERROR_MESSAGES,
  validateSchoolId
} from "@/modules/campus-core/tenant-login-policy";

type SchoolDbClient = typeof db | Prisma.TransactionClient;

export type SchoolDependencySummary = {
  institutions: number;
  branches: number;
  users: number;
  students: number;
  staffProfiles: number;
  studentAttendanceRecords: number;
  staffAttendanceRecords: number;
  auditLogs: number;
  notificationOutboxItems: number;
  roles: number;
  classSectionSubjects: number;
  gradebookAssessments: number;
  gradebookMarks: number;
};

type SchoolDependencyCounts = SchoolDependencySummary;

const schoolDependencyCountSelect = {
  institutions: true,
  branches: true,
  users: true,
  students: true,
  staffProfiles: true,
  studentAttendanceRecords: true,
  staffAttendanceRecords: true,
  auditLogs: true,
  notificationOutboxItems: true,
  roles: true,
  classSectionSubjects: true,
  gradebookAssessments: true,
  gradebookMarks: true
} as const;

const emptySchoolDependencySummary: SchoolDependencySummary = {
  institutions: 0,
  branches: 0,
  users: 0,
  students: 0,
  staffProfiles: 0,
  studentAttendanceRecords: 0,
  staffAttendanceRecords: 0,
  auditLogs: 0,
  notificationOutboxItems: 0,
  roles: 0,
  classSectionSubjects: 0,
  gradebookAssessments: 0,
  gradebookMarks: 0
};

function toSchoolDependencySummary(counts: SchoolDependencyCounts): SchoolDependencySummary {
  return { ...counts };
}

export async function assertSchoolIdAvailable(
  client: SchoolDbClient,
  schoolId: string,
  excludeTenantId?: string
) {
  const validation = validateSchoolId(schoolId);
  if (!validation.ok) throw new AppError("INVALID_SCHOOL_ID", validation.message, 400);

  const existing = await client.tenant.findUnique({
    where: { slug: validation.schoolId },
    select: { id: true }
  });
  if (existing && existing.id !== excludeTenantId) {
    throw new AppError("SCHOOL_ID_ALREADY_EXISTS", SCHOOL_ID_ERROR_MESSAGES.duplicate, 409);
  }
}

async function ensureDefaultRolesForTenant(tx: Prisma.TransactionClient, tenantId: string) {
  const roleCodes = [...SCHOOL_OPERATIONAL_ROLE_CODES];
  await tx.role.createMany({
    data: roleCodes.map((roleCode) => ({
      tenantId,
      code: roleCode,
      name: roleCode
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      isSystem: true,
      isMutable: false
    })),
    skipDuplicates: true
  });
  await tx.role.updateMany({
    where: { tenantId, code: { in: roleCodes } },
    data: { isActive: true }
  });

  const permissionCodes = Array.from(new Set(
    roleCodes.flatMap((roleCode) => ROLE_PERMISSION_MAP[roleCode])
  ));
  const [roles, permissions] = await Promise.all([
    tx.role.findMany({
      where: { tenantId, code: { in: roleCodes } },
      select: { id: true, code: true }
    }),
    tx.permission.findMany({
      where: { code: { in: permissionCodes } },
      select: { id: true, code: true }
    })
  ]);
  const roleIdByCode = new Map(roles.map((role) => [role.code, role.id]));
  const permissionIdByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const rolePermissions = roleCodes.flatMap((roleCode) => {
    const roleId = roleIdByCode.get(roleCode);
    if (!roleId) return [];
    return ROLE_PERMISSION_MAP[roleCode].flatMap((permissionCode) => {
      const permissionId = permissionIdByCode.get(permissionCode);
      return permissionId ? [{ tenantId, roleId, permissionId }] : [];
    });
  });

  if (rolePermissions.length > 0) {
    await tx.rolePermission.createMany({ data: rolePermissions, skipDuplicates: true });
  }
}

export async function getAdministratorDashboard(_ctx: PlatformAdministratorContext) {
  const [totalSchools, activeSchools, inactiveSchools, recentlyCreatedSchools, schoolsNeedingSetup] = await Promise.all([
    db.tenant.count(),
    db.tenant.count({ where: { status: "ACTIVE" } }),
    db.tenant.count({ where: { status: { not: "ACTIVE" } } }),
    db.tenant.findMany({
      select: { id: true, name: true, slug: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5
    }),
    db.tenant.count({
      where: {
        OR: [
          { institutions: { none: {} } },
          { branches: { none: {} } },
          { users: { none: {} } }
        ]
      }
    })
  ]);

  return { totalSchools, activeSchools, inactiveSchools, recentlyCreatedSchools, schoolsNeedingSetup };
}

export async function getAdministratorProfile(ctx: PlatformAdministratorContext) {
  return db.platformAdministrator.findUnique({
    where: { id: ctx.administratorId },
    select: {
      id: true,
      email: true,
      displayName: true,
      status: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function listSchoolsForAdministrator(
  _ctx: PlatformAdministratorContext,
  filters: { search?: string; status?: "ACTIVE" | "SUSPENDED" | "ARCHIVED" | "ALL" } = {}
) {
  const search = filters.search?.trim();
  return db.tenant.findMany({
    where: {
      ...(filters.status && filters.status !== "ALL" ? { status: filters.status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" as const } },
              { slug: { contains: search.toLowerCase(), mode: "insensitive" as const } },
              { supportEmail: { contains: search, mode: "insensitive" as const } }
            ]
          }
        : {})
    },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      supportEmail: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { institutions: true, branches: true, users: true } }
    },
    orderBy: { name: "asc" },
    take: 100
  });
}

export async function getSchoolDependencySummary(tenantId: string): Promise<SchoolDependencySummary> {
  const school = await db.tenant.findUnique({
    where: { id: tenantId },
    select: { _count: { select: schoolDependencyCountSelect } }
  });
  return school ? toSchoolDependencySummary(school._count) : { ...emptySchoolDependencySummary };
}

export async function getSchoolByIdForAdministrator(
  _ctx: PlatformAdministratorContext,
  tenantId: string
) {
  const commercialAccessSchemaAvailable = await isInstitutionEntitlementSchemaAvailable();
  const school = await db.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      legalName: true,
      supportEmail: true,
      phone: true,
      website: true,
      createdAt: true,
      updatedAt: true,
      tenantSettings: {
        select: {
          gradebookEnabled: true,
          gradebookConfigurationEnabled: true,
          gradebookMarksEntryEnabled: true,
          gradebookImportEnabled: true,
          gradebookResultCalculationEnabled: true,
          gradebookCoScholasticEnabled: true,
          gradebookReportCardsEnabled: true,
          gradebookPublicationEnabled: true,
          gradebookAnalyticsEnabled: true,
          gradebookPortalResultsEnabled: true
        }
      },
      institutions: {
        select: {
          id: true,
          name: true,
          displayName: true,
          code: true,
          status: true,
          logoUrl: true
        },
        orderBy: { name: "asc" },
        take: 10
      },
      branches: {
        select: { id: true, name: true, code: true, status: true },
        orderBy: { name: "asc" },
        take: 10
      },
      users: {
        where: {
          status: { not: "DEACTIVATED" },
          roleAssignments: { some: { isActive: true, role: { code: "PRINCIPAL" } } }
        },
        select: {
          id: true,
          principalId: true,
          email: true,
          displayName: true,
          firstName: true,
          lastName: true,
          status: true
        },
        orderBy: { firstName: "asc" },
        take: 10
      },
      _count: { select: schoolDependencyCountSelect }
    }
  });
  if (!school) return null;

  const [subscription, entitlements] = commercialAccessSchemaAvailable
    ? await Promise.all([
        db.tenantSubscription.findUnique({
          where: { tenantId },
          select: {
            id: true,
            planCode: true,
            status: true,
            startsAt: true,
            trialEndsAt: true,
            currentPeriodStartsAt: true,
            currentPeriodEndsAt: true,
            graceEndsAt: true
          }
        }),
        db.institutionEntitlement.findMany({
          where: {
            tenantId,
            moduleKey: { in: ["attendance", "gradebook"] }
          },
          select: {
            institutionId: true,
            moduleKey: true,
            featureKey: true,
            access: true,
            source: true,
            startsAt: true,
            endsAt: true
          },
          orderBy: [{ moduleKey: "asc" }, { featureKey: "asc" }]
        })
      ])
    : [null, []] as const;

  const { _count, ...schoolDetails } = school;
  return {
    ...schoolDetails,
    commercialAccessSchemaAvailable,
    subscription,
    institutions: schoolDetails.institutions.map((institution) => ({
      ...institution,
      entitlements: entitlements
        .filter((entitlement) => entitlement.institutionId === institution.id)
        .map(({ institutionId: _institutionId, ...entitlement }) => entitlement)
    })),
    dependencySummary: toSchoolDependencySummary(_count)
  };
}
export async function createSchool(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof createSchoolSchema>
) {
  await assertSchoolIdAvailable(db, input.schoolId);

  return db.$transaction(async (tx) => {
    await assertSchoolIdAvailable(tx, input.schoolId);
    const tenant = await tx.tenant.create({
      data: {
        name: input.name,
        slug: input.schoolId,
        legalName: input.name,
        supportEmail: input.supportEmail,
        status: input.status
      }
    });
    await ensureTenantSettingsRow(tx, {
      tenantId: tenant.id,
      brandName: input.institutionDisplayName ?? input.name
    });
    const institution = await tx.institution.create({
      data: {
        tenantId: tenant.id,
        name: input.name,
        displayName: input.institutionDisplayName,
        code: "MAIN",
        status: "ACTIVE"
      }
    });
    await initializeInstitutionCommercialAccess(tx, {
      tenantId: tenant.id,
      institutionId: institution.id,
      planCode: tenant.plan
    });
    const branch = await tx.branch.create({
      data: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: "Main Branch",
        code: "MAIN",
        status: "ACTIVE"
      }
    });
    await tx.attendanceSetting.create({ data: { tenantId: tenant.id, branchId: branch.id } });
    await ensureDefaultRolesForTenant(tx, tenant.id);

    if (input.principalFirstName && input.principalEmail && input.principalInitialPassword) {
      const principalRole = await tx.role.findUnique({
        where: { tenantId_code: { tenantId: tenant.id, code: "PRINCIPAL" } },
        select: { id: true }
      });
      if (!principalRole) throw new AppError("PRINCIPAL_ROLE_NOT_FOUND", "PRINCIPAL_ROLE_NOT_FOUND", 500);

      const principal = await tx.user.create({
        data: {
          tenantId: tenant.id,
          principalId: "PRINCIPAL-001",
          email: input.principalEmail,
          firstName: input.principalFirstName,
          lastName: input.principalLastName,
          displayName: [input.principalFirstName, input.principalLastName].filter(Boolean).join(" "),
          userType: "STAFF",
          status: "ACTIVE",
          activatedAt: new Date()
        }
      });
      await tx.passwordCredential.create({
        data: {
          userId: principal.id,
          passwordHash: await hashPassword(input.principalInitialPassword),
          mustChange: true
        }
      });
      await tx.userRoleAssignment.create({
        data: { tenantId: tenant.id, userId: principal.id, roleId: principalRole.id }
      });
      await tx.userBranchAccess.create({
        data: { tenantId: tenant.id, userId: principal.id, branchId: branch.id, isPrimary: true }
      });
      await writePlatformAuditLog({
        ctx,
        action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_CREATED,
        entityType: "User",
        entityId: principal.id,
        metadata: {
          targetTenantId: tenant.id,
          schoolId: tenant.slug,
          principalId: principal.principalId,
          principalEmail: principal.email,
          initialPasswordSet: true,
          mustChange: true
        }
      }, tx);
    }

    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_CREATED,
      entityType: "Tenant",
      entityId: tenant.id,
      after: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
      metadata: {
        schoolId: tenant.slug,
        defaultInstitutionCreated: true,
        defaultBranchCreated: true
      }
    }, tx);
    return tenant;
  }, { maxWait: 10_000, timeout: 60_000 });
}

export async function updateSchool(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof updateSchoolSchema>
) {
  return db.$transaction(async (tx) => {
    const gradebookSettingsData = {
      gradebookEnabled: input.gradebookEnabled,
      gradebookConfigurationEnabled: input.gradebookConfigurationEnabled,
      gradebookMarksEntryEnabled: input.gradebookMarksEntryEnabled,
      gradebookImportEnabled: input.gradebookImportEnabled,
      gradebookResultCalculationEnabled: input.gradebookResultCalculationEnabled,
      gradebookCoScholasticEnabled: input.gradebookCoScholasticEnabled,
      gradebookReportCardsEnabled: input.gradebookReportCardsEnabled,
      gradebookPublicationEnabled: input.gradebookPublicationEnabled,
      gradebookAnalyticsEnabled: input.gradebookAnalyticsEnabled,
      gradebookPortalResultsEnabled: input.gradebookPortalResultsEnabled
    };
    const before = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      include: {
        tenantSettings: {
          select: {
            gradebookEnabled: true,
            gradebookConfigurationEnabled: true,
            gradebookMarksEntryEnabled: true,
            gradebookImportEnabled: true,
            gradebookResultCalculationEnabled: true,
            gradebookCoScholasticEnabled: true,
            gradebookReportCardsEnabled: true,
            gradebookPublicationEnabled: true,
            gradebookAnalyticsEnabled: true,
            gradebookPortalResultsEnabled: true,
          }
        }
      }
    });
    if (!before) throw notFound("SCHOOL_NOT_FOUND");

    const after = await tx.tenant.update({
      where: { id: input.tenantId },
      data: {
        name: input.name,
        legalName: input.legalName,
        supportEmail: input.supportEmail,
        status: input.status
      }
    });
    if (input.institutionDisplayName !== undefined || input.institutionLogoUrl !== undefined) {
      const primaryInstitution = await tx.institution.findFirst({
        where: { tenantId: input.tenantId, status: { not: "ARCHIVED" } },
        orderBy: { name: "asc" },
        select: { id: true }
      });
      if (primaryInstitution) {
        await tx.institution.update({
          where: { id: primaryInstitution.id },
          data: { displayName: input.institutionDisplayName, logoUrl: input.institutionLogoUrl }
        });
      }
    }
    if (Object.values(gradebookSettingsData).some((value) => value !== undefined)) {
      await ensureTenantSettingsRow(tx, { tenantId: input.tenantId });
      await tx.tenantSettings.update({
        where: { tenantId: input.tenantId },
        data: gradebookSettingsData,
        select: { id: true }
      });
    }
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_UPDATED,
      entityType: "Tenant",
      entityId: after.id,
      before: {
        id: before.id,
        name: before.name,
        slug: before.slug,
        status: before.status,
        supportEmail: before.supportEmail,
        gradebook: before.tenantSettings,
      },
      after: {
        id: after.id,
        name: after.name,
        slug: after.slug,
        status: after.status,
        supportEmail: after.supportEmail,
        gradebook: { ...before.tenantSettings, ...gradebookSettingsData },
      }
    }, tx);
    return after;
  });
}
export async function updateSchoolId(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof updateSchoolIdSchema>
) {
  return db.$transaction(async (tx) => {
    const before = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!before) throw notFound("SCHOOL_NOT_FOUND");
    if (before.slug !== input.currentSchoolId) {
      throw new AppError("CURRENT_SCHOOL_ID_MISMATCH", "CURRENT_SCHOOL_ID_MISMATCH", 400);
    }
    await assertSchoolIdAvailable(tx, input.newSchoolId, input.tenantId);
    const after = await tx.tenant.update({
      where: { id: input.tenantId },
      data: { slug: input.newSchoolId }
    });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_ID_UPDATED,
      entityType: "Tenant",
      entityId: after.id,
      before: { schoolId: before.slug },
      after: { schoolId: after.slug },
      metadata: { oldSchoolId: before.slug, newSchoolId: after.slug, loginUrlChanged: true }
    }, tx);
    return after;
  });
}

export async function deactivateSchool(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof deactivateSchoolSchema>
) {
  return db.$transaction(async (tx) => {
    const before = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!before) throw notFound("SCHOOL_NOT_FOUND");
    const after = await tx.tenant.update({
      where: { id: input.tenantId },
      data: { status: "SUSPENDED" }
    });
    const revokedSessions = await tx.session.updateMany({
      where: { tenantId: input.tenantId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_DEACTIVATED,
      entityType: "Tenant",
      entityId: after.id,
      before: { status: before.status },
      after: { status: after.status },
      metadata: { schoolId: after.slug, sessionsRevoked: revokedSessions.count }
    }, tx);
    return after;
  });
}

export async function reactivateSchool(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof reactivateSchoolSchema>
) {
  return db.$transaction(async (tx) => {
    const before = await tx.tenant.findUnique({ where: { id: input.tenantId } });
    if (!before) throw notFound("SCHOOL_NOT_FOUND");
    const after = await tx.tenant.update({
      where: { id: input.tenantId },
      data: { status: "ACTIVE" }
    });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_REACTIVATED,
      entityType: "Tenant",
      entityId: after.id,
      before: { status: before.status },
      after: { status: after.status },
      metadata: { schoolId: after.slug }
    }, tx);
    return after;
  });
}

export async function deleteSchoolPermanently(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof deleteSchoolSchema>
) {
  return db.$transaction(async (tx) => {
    const school = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        _count: { select: schoolDependencyCountSelect }
      }
    });
    if (!school) throw notFound("SCHOOL_NOT_FOUND");

    const dependencySummary = toSchoolDependencySummary(school._count);

    // Version chains are nullable only to support immutable supersession. Clear
    // their tenant-local links before deleting the complete tenant dataset.
    await tx.gradebookExamSchedule.updateMany({
      where: { tenantId: school.id, supersedesScheduleId: { not: null } },
      data: { supersedesScheduleId: null }
    });
    await tx.gradebookResultRun.updateMany({
      where: { tenantId: school.id, supersedesResultRunId: { not: null } },
      data: { supersedesResultRunId: null }
    });
    await tx.gradebookReportCard.updateMany({
      where: { tenantId: school.id, supersedesReportCardId: { not: null } },
      data: { supersedesReportCardId: null }
    });
    await tx.gradebookResultPublication.updateMany({
      where: { tenantId: school.id, supersedesPublicationId: { not: null } },
      data: { supersedesPublicationId: null }
    });

    const deletedRows = {
      notificationDeliveryLogs: (await tx.notificationDeliveryLog.deleteMany({ where: { tenantId: school.id } })).count,
      notificationOutboxItems: (await tx.notificationOutbox.deleteMany({ where: { tenantId: school.id } })).count,
      whatsAppSettings: (await tx.whatsAppIntegrationSetting.deleteMany({ where: { tenantId: school.id } })).count,
      notificationTemplates: (await tx.notificationTemplate.deleteMany({ where: { tenantId: school.id } })).count,
      communicationPreferences: (await tx.communicationPreference.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveDocuments: (await tx.staffLeaveDocument.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveActions: (await tx.staffLeaveApplicationAction.deleteMany({ where: { tenantId: school.id } })).count,
      inAppNotifications: (await tx.inAppNotification.deleteMany({ where: { tenantId: school.id } })).count,
      studentAttendanceRecords: (await tx.studentAttendanceRecord.deleteMany({ where: { tenantId: school.id } })).count,
      staffAttendanceRecords: (await tx.staffAttendanceRecord.deleteMany({ where: { tenantId: school.id } })).count,
      academicCalendarEntries: (await tx.academicCalendarEntry.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveApplications: (await tx.staffLeaveApplication.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveBalances: (await tx.staffLeaveBalance.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveApprovers: (await tx.staffLeaveApprover.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveTypes: (await tx.staffLeaveType.deleteMany({ where: { tenantId: school.id } })).count,
      staffLeaveSettings: (await tx.staffLeaveSetting.deleteMany({ where: { tenantId: school.id } })).count,
      staffAttendanceQrTokens: (await tx.staffAttendanceQrToken.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookStudentResultPublications: (await tx.gradebookStudentResultPublication.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookResultPublications: (await tx.gradebookResultPublication.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookReportCards: (await tx.gradebookReportCard.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookAttendanceSnapshots: (await tx.gradebookAttendanceSummarySnapshot.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookReportCardTemplateVersions: (await tx.gradebookReportCardTemplateVersion.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookReportCardTemplates: (await tx.gradebookReportCardTemplate.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookMarkAdjustments: (await tx.gradebookMarkAdjustment.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCorrectionRequests: (await tx.gradebookCorrectionRequest.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookStudentSubjectResults: (await tx.gradebookStudentSubjectResult.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookStudentOverallResults: (await tx.gradebookStudentOverallResult.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookResultRuns: (await tx.gradebookResultRun.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookTeacherRemarks: (await tx.gradebookTeacherRemark.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCoScholasticEntries: (await tx.gradebookCoScholasticEntry.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCoScholasticIndicators: (await tx.gradebookCoScholasticIndicator.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCoScholasticAreas: (await tx.gradebookCoScholasticArea.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCoScholasticSchemeVersions: (await tx.gradebookCoScholasticSchemeVersion.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookRemarkTemplates: (await tx.gradebookRemarkTemplate.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamImportRows: (await tx.gradebookExamImportRow.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamImportJobs: (await tx.gradebookExamImportJob.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookStudentMarkRevisions: (await tx.gradebookStudentMarkRevision.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookMarkWorkflowEvents: (await tx.gradebookMarkWorkflowEvent.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookStudentMarks: (await tx.gradebookStudentMark.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookMarkEntryBatches: (await tx.gradebookMarkEntryBatch.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookTeacherAssignments: (await tx.gradebookTeacherMarkAssignment.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamSchedules: (await tx.gradebookExamSchedule.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamSubjectComponents: (await tx.gradebookExamSubjectComponent.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamSubjects: (await tx.gradebookExamSubject.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamClassSections: (await tx.gradebookExamClassSection.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookAssessmentComponents: (await tx.gradebookAssessmentComponent.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExams: (await tx.gradebookExam.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamTerms: (await tx.gradebookExamTerm.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookAssessmentSchemeVersions: (await tx.gradebookAssessmentSchemeVersion.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookAssessmentSchemes: (await tx.gradebookAssessmentScheme.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookGradeRules: (await tx.gradebookGradeRule.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookGradeScaleVersions: (await tx.gradebookGradeScaleVersion.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookGradeScales: (await tx.gradebookGradeScale.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCalculationRuleSetVersions: (await tx.gradebookCalculationRuleSetVersion.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookCalculationRuleSets: (await tx.gradebookCalculationRuleSet.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookExamTypes: (await tx.gradebookExamType.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookJobs: (await tx.gradebookJob.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookDomainEvents: (await tx.gradebookDomainEventOutbox.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookMarks: (await tx.gradebookMark.deleteMany({ where: { tenantId: school.id } })).count,
      gradebookAssessments: (await tx.gradebookAssessment.deleteMany({ where: { tenantId: school.id } })).count,
      classSectionSubjects: (await tx.classSectionSubject.deleteMany({ where: { tenantId: school.id } })).count,
      studentPromotionItems: (await tx.studentPromotionItem.deleteMany({ where: { tenantId: school.id } })).count,
      studentPromotionBatches: (await tx.studentPromotionBatch.deleteMany({ where: { tenantId: school.id } })).count,
      enrollments: (await tx.enrollment.deleteMany({ where: { tenantId: school.id } })).count,
      studentGuardianLinks: (await tx.studentGuardianLink.deleteMany({ where: { tenantId: school.id } })).count,
      classSections: (await tx.classSection.deleteMany({ where: { tenantId: school.id } })).count,
      students: (await tx.student.deleteMany({ where: { tenantId: school.id } })).count,
      guardians: (await tx.guardian.deleteMany({ where: { tenantId: school.id } })).count,
      staffProfiles: (await tx.staffProfile.deleteMany({ where: { tenantId: school.id } })).count,
      subjects: (await tx.subject.deleteMany({ where: { tenantId: school.id } })).count,
      classes: (await tx.class.deleteMany({ where: { tenantId: school.id } })).count,
      sections: (await tx.section.deleteMany({ where: { tenantId: school.id } })).count,
      attendanceSettings: (await tx.attendanceSetting.deleteMany({ where: { tenantId: school.id } })).count,
      auditLogs: (await tx.auditLog.deleteMany({ where: { tenantId: school.id } })).count,
      passkeyChallenges: (await tx.passkeyChallenge.deleteMany({ where: { tenantId: school.id } })).count,
      passkeyCredentials: (await tx.passkeyCredential.deleteMany({ where: { tenantId: school.id } })).count,
      loginOtps: (await tx.loginOtp.deleteMany({ where: { tenantId: school.id } })).count,
      sessions: (await tx.session.deleteMany({ where: { tenantId: school.id } })).count,
      branchAccesses: (await tx.userBranchAccess.deleteMany({ where: { tenantId: school.id } })).count,
      roleAssignments: (await tx.userRoleAssignment.deleteMany({ where: { tenantId: school.id } })).count,
      rolePermissions: (await tx.rolePermission.deleteMany({ where: { tenantId: school.id } })).count,
      users: (await tx.user.deleteMany({ where: { tenantId: school.id } })).count,
      roles: (await tx.role.deleteMany({ where: { tenantId: school.id } })).count,
      tenantSettings: (await tx.tenantSettings.deleteMany({ where: { tenantId: school.id } })).count,
      academicYears: (await tx.academicYear.deleteMany({ where: { tenantId: school.id } })).count,
      branches: (await tx.branch.deleteMany({ where: { tenantId: school.id } })).count,
      institutions: (await tx.institution.deleteMany({ where: { tenantId: school.id } })).count
    };

    await tx.tenant.delete({ where: { id: school.id } });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SCHOOL_DELETED,
      entityType: "Tenant",
      entityId: school.id,
      before: { id: school.id, name: school.name, slug: school.slug, status: school.status },
      metadata: { schoolId: school.slug, dependencySummary, deletedRows, permanent: true }
    }, tx);

    return { tenantId: school.id, deletedRows };
  }, { maxWait: 10_000, timeout: 60_000 });
}

export async function changePlatformAdministratorPassword(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof changeOwnPasswordSchema>
) {
  return db.$transaction(async (tx) => {
    const credential = await tx.platformAdministratorCredential.findUnique({
      where: { administratorId: ctx.administratorId },
      select: { passwordHash: true }
    });
    if (!credential) throw new AppError("ADMINISTRATOR_PASSWORD_NOT_SET", "ADMINISTRATOR_PASSWORD_NOT_SET", 400);
    if (!(await verifyPassword(input.currentPassword, credential.passwordHash))) {
      throw new AppError("CURRENT_PASSWORD_INCORRECT", "CURRENT_PASSWORD_INCORRECT", 400);
    }

    await tx.platformAdministratorCredential.update({
      where: { administratorId: ctx.administratorId },
      data: {
        passwordHash: await hashPassword(input.newPassword),
        passwordUpdatedAt: new Date(),
        mustChange: false
      }
    });
    const revokedSessions = await tx.platformAdministratorSession.updateMany({
      where: {
        administratorId: ctx.administratorId,
        revokedAt: null,
        id: { not: ctx.sessionId }
      },
      data: { revokedAt: new Date() }
    });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PASSWORD_CHANGED,
      entityType: "PlatformAdministrator",
      entityId: ctx.administratorId,
      metadata: { passwordUpdated: true, mustChange: false, sessionsRevoked: revokedSessions.count }
    }, tx);
    return { administratorId: ctx.administratorId };
  });
}
