import type { Prisma, TenantPlan } from "@prisma/client";
import type { z } from "zod";

import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import { writePlatformAuditLog } from "@/lib/audit/platform-audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import {
  GRADEBOOK_ENTITLEMENT_DEFINITIONS,
  GRADEBOOK_ENTITLEMENT_FEATURES
} from "@/modules/campus-core/entitlements/catalog";
import {
  isInstitutionEntitlementSchemaAvailable,
  isSubscriptionOperational
} from "@/modules/campus-core/entitlements/service";
import { PLATFORM_ADMINISTRATOR_AUDIT_EVENTS } from "@/modules/campus-core/platform-administrator-audit-events";
import type {
  updateInstitutionEntitlementsSchema,
  updateTenantSubscriptionSchema
} from "@/modules/campus-core/administrator-schemas";
import { ensureTenantSettingsRow } from "@/modules/campus-core/services/tenant-settings-compat";

const LEGACY_TENANT_PLANS = new Set<TenantPlan>(["TRIAL", "STARTER", "GROWTH", "ENTERPRISE"]);

async function assertCommercialAccessSchemaAvailable() {
  if (!(await isInstitutionEntitlementSchemaAvailable())) {
    throw new AppError(
      "ENTITLEMENT_CONFIGURATION_REQUIRED",
      "ENTITLEMENT_CONFIGURATION_REQUIRED",
      503
    );
  }
}

const GRADEBOOK_LEGACY_FIELDS = {
  module: "gradebookEnabled",
  configuration: "gradebookConfigurationEnabled",
  marks_entry: "gradebookMarksEntryEnabled",
  import: "gradebookImportEnabled",
  result_calculation: "gradebookResultCalculationEnabled",
  co_scholastic: "gradebookCoScholasticEnabled",
  report_cards: "gradebookReportCardsEnabled",
  publication: "gradebookPublicationEnabled",
  analytics: "gradebookAnalyticsEnabled",
  portal_results: "gradebookPortalResultsEnabled"
} as const;

export async function updateTenantSubscriptionForAdministrator(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof updateTenantSubscriptionSchema>
) {
  await assertCommercialAccessSchemaAvailable();
  return db.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: input.tenantId },
      select: {
        id: true,
        plan: true,
        subscription: {
          select: {
            id: true,
            planCode: true,
            status: true,
            startsAt: true,
            trialEndsAt: true,
            currentPeriodStartsAt: true,
            currentPeriodEndsAt: true,
            graceEndsAt: true,
            cancelledAt: true
          }
        }
      }
    });
    if (!tenant) throw notFound("SCHOOL_NOT_FOUND");

    const now = new Date();
    const after = await tx.tenantSubscription.upsert({
      where: { tenantId: input.tenantId },
      create: {
        tenantId: input.tenantId,
        planCode: input.planCode,
        status: input.status,
        startsAt: now,
        trialEndsAt: input.trialEndsAt,
        currentPeriodStartsAt: input.status === "ACTIVE" ? now : null,
        currentPeriodEndsAt: input.currentPeriodEndsAt,
        graceEndsAt: input.graceEndsAt,
        cancelledAt: input.status === "CANCELLED" ? now : null
      },
      update: {
        planCode: input.planCode,
        status: input.status,
        trialEndsAt: input.trialEndsAt,
        currentPeriodStartsAt:
          input.status === "ACTIVE"
            ? tenant.subscription?.currentPeriodStartsAt ?? now
            : tenant.subscription?.currentPeriodStartsAt,
        currentPeriodEndsAt: input.currentPeriodEndsAt,
        graceEndsAt: input.graceEndsAt,
        cancelledAt:
          input.status === "CANCELLED"
            ? tenant.subscription?.cancelledAt ?? now
            : null
      },
      select: {
        id: true,
        planCode: true,
        status: true,
        startsAt: true,
        trialEndsAt: true,
        currentPeriodStartsAt: true,
        currentPeriodEndsAt: true,
        graceEndsAt: true,
        cancelledAt: true
      }
    });

    if (LEGACY_TENANT_PLANS.has(input.planCode as TenantPlan)) {
      await tx.tenant.update({
        where: { id: input.tenantId },
        data: { plan: input.planCode as TenantPlan },
        select: { id: true }
      });
    }

    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.SUBSCRIPTION_UPDATED,
      entityType: "TenantSubscription",
      entityId: after.id,
      before: tenant.subscription,
      after,
      metadata: {
        targetTenantId: input.tenantId,
        providerConnected: false,
        billingMutationPerformed: false
      }
    }, tx);

    return after;
  });
}

async function syncLegacyGradebookFlags(tx: Prisma.TransactionClient, tenantId: string) {
  const [subscription, institutions, gradebookEntitlements] = await Promise.all([
    tx.tenantSubscription.findUnique({
      where: { tenantId },
      select: {
        status: true,
        startsAt: true,
        trialEndsAt: true,
        currentPeriodEndsAt: true,
        graceEndsAt: true
      }
    }),
    tx.institution.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: { id: true }
    }),
    tx.institutionEntitlement.findMany({
      where: { tenantId, moduleKey: "gradebook" },
      select: { institutionId: true, featureKey: true, access: true, startsAt: true, endsAt: true }
    })
  ]);

  const now = new Date();
  const subscriptionActive = isSubscriptionOperational(subscription, now);
  const byInstitution = new Map<string, Map<string, string>>();
  for (const entitlement of gradebookEntitlements) {
    if ((entitlement.startsAt && entitlement.startsAt > now) || (entitlement.endsAt && entitlement.endsAt < now)) {
      continue;
    }
    const features = byInstitution.get(entitlement.institutionId) ?? new Map<string, string>();
    features.set(entitlement.featureKey, entitlement.access);
    byInstitution.set(entitlement.institutionId, features);
  }

  const hasEnabledAccess = (institutionId: string, featureKey: string) => {
    const access = byInstitution.get(institutionId)?.get(featureKey);
    return access === "READ_ONLY" || access === "FULL";
  };
  const moduleEnabled = subscriptionActive && institutions.length > 0 && institutions.every(
    (institution) => hasEnabledAccess(institution.id, GRADEBOOK_ENTITLEMENT_FEATURES.MODULE)
  );
  const legacyData = Object.fromEntries(
    GRADEBOOK_ENTITLEMENT_DEFINITIONS.map((definition) => {
      const field = GRADEBOOK_LEGACY_FIELDS[definition.featureKey as keyof typeof GRADEBOOK_LEGACY_FIELDS];
      const enabled = moduleEnabled && institutions.every(
        (institution) => hasEnabledAccess(institution.id, definition.featureKey)
      );
      return [field, enabled];
    })
  ) as Prisma.TenantSettingsUpdateInput;

  await ensureTenantSettingsRow(tx, { tenantId });
  await tx.tenantSettings.update({
    where: { tenantId },
    data: legacyData,
    select: { id: true }
  });
}

export async function updateInstitutionEntitlementsForAdministrator(
  ctx: PlatformAdministratorContext,
  input: z.infer<typeof updateInstitutionEntitlementsSchema>
) {
  await assertCommercialAccessSchemaAvailable();
  return db.$transaction(async (tx) => {
    const institution = await tx.institution.findFirst({
      where: {
        id: input.institutionId,
        tenantId: input.tenantId,
        status: { not: "ARCHIVED" }
      },
      select: { id: true, name: true }
    });
    if (!institution) throw notFound("INSTITUTION_NOT_FOUND");

    const before = await tx.institutionEntitlement.findMany({
      where: {
        tenantId: input.tenantId,
        institutionId: input.institutionId,
        moduleKey: { in: ["attendance", "gradebook"] }
      },
      select: {
        moduleKey: true,
        featureKey: true,
        access: true,
        source: true,
        startsAt: true,
        endsAt: true
      },
      orderBy: [{ moduleKey: "asc" }, { featureKey: "asc" }]
    });

    await tx.institutionEntitlement.createMany({
      data: input.entitlements.map((entitlement) => ({
        tenantId: input.tenantId,
        institutionId: input.institutionId,
        moduleKey: entitlement.moduleKey,
        featureKey: entitlement.featureKey,
        access: entitlement.access,
        source: "MANUAL" as const
      })),
      skipDuplicates: true
    });

    const accessUpdates = await Promise.all(
      (["DISABLED", "READ_ONLY", "FULL"] as const).map(async (access) => {
        const entitlements = input.entitlements.filter((entitlement) => entitlement.access === access);
        if (entitlements.length === 0) return 0;

        const result = await tx.institutionEntitlement.updateMany({
          where: {
            tenantId: input.tenantId,
            institutionId: input.institutionId,
            OR: entitlements.map((entitlement) => ({
              moduleKey: entitlement.moduleKey,
              featureKey: entitlement.featureKey
            }))
          },
          data: {
            access,
            source: "MANUAL"
          }
        });
        return result.count;
      })
    );

    if (accessUpdates.reduce((total, count) => total + count, 0) !== input.entitlements.length) {
      throw new AppError("ENTITLEMENT_UPDATE_INCOMPLETE", "ENTITLEMENT_UPDATE_INCOMPLETE", 500);
    }

    await syncLegacyGradebookFlags(tx, input.tenantId);

    const after = await tx.institutionEntitlement.findMany({
      where: {
        tenantId: input.tenantId,
        institutionId: input.institutionId,
        moduleKey: { in: ["attendance", "gradebook"] }
      },
      select: {
        moduleKey: true,
        featureKey: true,
        access: true,
        source: true,
        startsAt: true,
        endsAt: true
      },
      orderBy: [{ moduleKey: "asc" }, { featureKey: "asc" }]
    });

    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.INSTITUTION_ENTITLEMENTS_UPDATED,
      entityType: "InstitutionEntitlement",
      entityId: institution.id,
      before,
      after,
      metadata: {
        targetTenantId: input.tenantId,
        institutionName: institution.name,
        billingMutationPerformed: false,
        historicalDataDeleted: false
      }
    }, tx);

    return after;
  }, { maxWait: 10_000, timeout: 30_000 });
}
