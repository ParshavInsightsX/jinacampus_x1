import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";

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

async function loadGradebookFeatureState(tenantId: string): Promise<GradebookFeatureState> {
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

export async function isGradebookEnabled(ctx: Pick<TenantContext, "tenantId">) {
  return (await loadGradebookFeatureState(ctx.tenantId)).enabled;
}

export async function requireGradebookEnabled(ctx: Pick<TenantContext, "tenantId">) {
  if (!(await isGradebookEnabled(ctx))) {
    throw new AppError("GRADEBOOK_NOT_ENABLED", "GRADEBOOK_NOT_ENABLED", 404);
  }
}

export async function getGradebookFeatureState(ctx: Pick<TenantContext, "tenantId">) {
  return loadGradebookFeatureState(ctx.tenantId);
}

export async function isGradebookSubfeatureEnabled(
  ctx: Pick<TenantContext, "tenantId">,
  feature: GradebookSubfeature
) {
  const state = await loadGradebookFeatureState(ctx.tenantId);
  return state.enabled && state[feature];
}

export async function requireGradebookSubfeature(
  ctx: Pick<TenantContext, "tenantId">,
  feature: GradebookSubfeature
) {
  const state = await loadGradebookFeatureState(ctx.tenantId);
  if (!state.enabled) {
    throw new AppError("GRADEBOOK_NOT_ENABLED", "GRADEBOOK_NOT_ENABLED", 404);
  }
  if (!state[feature]) {
    throw new AppError("GRADEBOOK_FEATURE_NOT_ENABLED", "GRADEBOOK_FEATURE_NOT_ENABLED", 404);
  }
}
