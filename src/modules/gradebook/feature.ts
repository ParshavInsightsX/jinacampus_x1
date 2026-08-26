import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import {
  ENTITLEMENT_MODULE_KEYS,
  GRADEBOOK_ENTITLEMENT_FEATURES,
  type GradebookEntitlementFeature
} from "@/modules/campus-core/entitlements/catalog";
import {
  assertInstitutionEntitlement,
  entitlementAllows,
  loadInstitutionModuleEntitlements
} from "@/modules/campus-core/entitlements/service";

export const GRADEBOOK_SUBFEATURES = [
  "configuration",
  "marksEntry",
  "import",
  "resultCalculation",
  "coScholastic",
  "reportCards",
  "publication",
  "analytics",
  "portalResults"
] as const;

export type GradebookSubfeature = (typeof GRADEBOOK_SUBFEATURES)[number];
type GradebookFeatureContext = Pick<TenantContext, "tenantId"> &
  Partial<Pick<TenantContext, "institutionId" | "activeBranchId">>;

export type GradebookFeatureState = {
  enabled: boolean;
  configuration: boolean;
  marksEntry: boolean;
  import: boolean;
  resultCalculation: boolean;
  coScholastic: boolean;
  reportCards: boolean;
  publication: boolean;
  analytics: boolean;
  portalResults: boolean;
};

const FEATURE_KEY_BY_SUBFEATURE = {
  configuration: GRADEBOOK_ENTITLEMENT_FEATURES.CONFIGURATION,
  marksEntry: GRADEBOOK_ENTITLEMENT_FEATURES.MARKS_ENTRY,
  import: GRADEBOOK_ENTITLEMENT_FEATURES.IMPORT,
  resultCalculation: GRADEBOOK_ENTITLEMENT_FEATURES.RESULT_CALCULATION,
  coScholastic: GRADEBOOK_ENTITLEMENT_FEATURES.CO_SCHOLASTIC,
  reportCards: GRADEBOOK_ENTITLEMENT_FEATURES.REPORT_CARDS,
  publication: GRADEBOOK_ENTITLEMENT_FEATURES.PUBLICATION,
  analytics: GRADEBOOK_ENTITLEMENT_FEATURES.ANALYTICS,
  portalResults: GRADEBOOK_ENTITLEMENT_FEATURES.PORTAL_RESULTS
} as const satisfies Record<GradebookSubfeature, GradebookEntitlementFeature>;

const DISABLED_GRADEBOOK_FEATURE_STATE: GradebookFeatureState = {
  enabled: false,
  configuration: false,
  marksEntry: false,
  import: false,
  resultCalculation: false,
  coScholastic: false,
  reportCards: false,
  publication: false,
  analytics: false,
  portalResults: false
};

function isPendingGradebookFeatureMigration(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2022") return false;
  const column = typeof error.meta?.column === "string" ? error.meta.column : "";
  return column.startsWith("tenant_settings.gradebook");
}

async function loadLegacyGradebookFeatureState(tenantId: string): Promise<GradebookFeatureState> {
  const baseSettings = await db.tenantSettings.findUnique({
    where: { tenantId },
    select: { gradebookEnabled: true }
  });
  if (baseSettings?.gradebookEnabled !== true) return DISABLED_GRADEBOOK_FEATURE_STATE;

  try {
    const settings = await db.tenantSettings.findUnique({
      where: { tenantId },
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
    });

    return {
      enabled: true,
      configuration: settings?.gradebookConfigurationEnabled === true,
      marksEntry: settings?.gradebookMarksEntryEnabled === true,
      import: settings?.gradebookImportEnabled === true,
      resultCalculation: settings?.gradebookResultCalculationEnabled === true,
      coScholastic: settings?.gradebookCoScholasticEnabled === true,
      reportCards: settings?.gradebookReportCardsEnabled === true,
      publication: settings?.gradebookPublicationEnabled === true,
      analytics: settings?.gradebookAnalyticsEnabled === true,
      portalResults: settings?.gradebookPortalResultsEnabled === true
    };
  } catch (error) {
    if (isPendingGradebookFeatureMigration(error)) return DISABLED_GRADEBOOK_FEATURE_STATE;
    throw error;
  }
}

async function loadEntitledGradebookState(ctx: GradebookFeatureContext) {
  if (!ctx.institutionId) return null;
  const state = await loadInstitutionModuleEntitlements({
    ctx: { tenantId: ctx.tenantId, institutionId: ctx.institutionId },
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    institutionId: ctx.institutionId,
    branchId: ctx.activeBranchId
  });
  if (!state.schemaAvailable) return null;

  return {
    state,
    features: {
      enabled: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.MODULE, "READ"),
      configuration: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.CONFIGURATION, "READ"),
      marksEntry: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.MARKS_ENTRY, "READ"),
      import: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.IMPORT, "READ"),
      resultCalculation: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.RESULT_CALCULATION, "READ"),
      coScholastic: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.CO_SCHOLASTIC, "READ"),
      reportCards: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.REPORT_CARDS, "READ"),
      publication: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.PUBLICATION, "READ"),
      analytics: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.ANALYTICS, "READ"),
      portalResults: entitlementAllows(state, GRADEBOOK_ENTITLEMENT_FEATURES.PORTAL_RESULTS, "READ")
    } satisfies GradebookFeatureState
  };
}

async function loadGradebookFeatureState(ctx: GradebookFeatureContext): Promise<GradebookFeatureState> {
  const entitled = await loadEntitledGradebookState(ctx);
  return entitled?.features ?? loadLegacyGradebookFeatureState(ctx.tenantId);
}

export async function isGradebookEnabled(ctx: GradebookFeatureContext) {
  return (await loadGradebookFeatureState(ctx)).enabled;
}

export async function requireGradebookEnabled(
  ctx: GradebookFeatureContext,
  operation: "READ" | "WRITE" = "READ"
) {
  const entitled = await loadEntitledGradebookState(ctx);
  if (entitled) {
    assertInstitutionEntitlement(entitled.state, GRADEBOOK_ENTITLEMENT_FEATURES.MODULE, operation);
    return;
  }
  if (!(await loadLegacyGradebookFeatureState(ctx.tenantId)).enabled) {
    throw new AppError("GRADEBOOK_NOT_ENABLED", "GRADEBOOK_NOT_ENABLED", 404);
  }
}

export async function getGradebookFeatureState(ctx: GradebookFeatureContext) {
  return loadGradebookFeatureState(ctx);
}

export async function isGradebookSubfeatureEnabled(
  ctx: GradebookFeatureContext,
  feature: GradebookSubfeature
) {
  const state = await loadGradebookFeatureState(ctx);
  return state.enabled && state[feature];
}

export async function requireGradebookSubfeature(
  ctx: GradebookFeatureContext,
  feature: GradebookSubfeature,
  operation: "READ" | "WRITE" = "READ"
) {
  const entitled = await loadEntitledGradebookState(ctx);
  if (entitled) {
    assertInstitutionEntitlement(entitled.state, FEATURE_KEY_BY_SUBFEATURE[feature], operation);
    return;
  }

  const state = await loadLegacyGradebookFeatureState(ctx.tenantId);
  if (!state.enabled) {
    throw new AppError("GRADEBOOK_NOT_ENABLED", "GRADEBOOK_NOT_ENABLED", 404);
  }
  if (!state[feature]) {
    throw new AppError("GRADEBOOK_FEATURE_NOT_ENABLED", "GRADEBOOK_FEATURE_NOT_ENABLED", 404);
  }
}