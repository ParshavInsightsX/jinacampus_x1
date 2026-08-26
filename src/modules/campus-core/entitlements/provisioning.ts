import type { Prisma, TenantPlan } from "@prisma/client";

import { INSTITUTION_ENTITLEMENT_DEFINITIONS } from "@/modules/campus-core/entitlements/catalog";
import { isInstitutionEntitlementSchemaAvailable } from "@/modules/campus-core/entitlements/service";

export async function initializeInstitutionCommercialAccess(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    institutionId: string;
    planCode?: TenantPlan;
  }
) {
  if (!(await isInstitutionEntitlementSchemaAvailable(tx))) {
    return { schemaAvailable: false as const };
  }

  const planCode = input.planCode ?? "TRIAL";
  const trialEndsAt = planCode === "TRIAL"
    ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    : null;
  await tx.tenantSubscription.upsert({
    where: { tenantId: input.tenantId },
    create: {
      tenantId: input.tenantId,
      planCode,
      status: planCode === "TRIAL" ? "TRIAL" : "ACTIVE",
      trialEndsAt
    },
    update: {}
  });

  await tx.institutionEntitlement.createMany({
    data: INSTITUTION_ENTITLEMENT_DEFINITIONS.map((definition) => ({
      tenantId: input.tenantId,
      institutionId: input.institutionId,
      moduleKey: definition.moduleKey,
      featureKey: definition.featureKey,
      access: definition.defaultAccess,
      source: "SYSTEM" as const
    })),
    skipDuplicates: true
  });

  return { schemaAvailable: true as const };
}