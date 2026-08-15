import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import {
  constrainSchoolCastFeatureSettings,
  getSchoolCastDeploymentPolicy
} from "@/modules/schoolcast/deployment-policy";

export const SCHOOLCAST_SUBFEATURES = [
  "inApp",
  "notices",
  "homework",
  "approvals",
  "email",
  "whatsApp",
  "automation",
  "analytics"
] as const;

export type SchoolCastSubfeature = (typeof SCHOOLCAST_SUBFEATURES)[number];

export type SchoolCastFeatureState = {
  enabled: boolean;
  inApp: boolean;
  notices: boolean;
  homework: boolean;
  approvals: boolean;
  email: boolean;
  whatsApp: boolean;
  automation: boolean;
  analytics: boolean;
  deliveryMode: "DRY_RUN" | "TEST" | "LIVE";
  teacherDirectPublish: boolean;
};

export const SCHOOLCAST_DISABLED_FEATURE_STATE: SchoolCastFeatureState = {
  enabled: false,
  inApp: false,
  notices: false,
  homework: false,
  approvals: false,
  email: false,
  whatsApp: false,
  automation: false,
  analytics: false,
  deliveryMode: "DRY_RUN",
  teacherDirectPublish: false
};

function isPendingSchoolCastMigration(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2022") return false;
  const column = typeof error.meta?.column === "string" ? error.meta.column : "";
  return column.toLowerCase().includes("schoolcast");
}

async function loadFeatureState(tenantId: string): Promise<SchoolCastFeatureState> {
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  if (!deploymentPolicy.workspace) return SCHOOLCAST_DISABLED_FEATURE_STATE;
  try {
    const settings = await db.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        schoolCastEnabled: true,
        schoolCastInAppEnabled: true,
        schoolCastNoticesEnabled: true,
        schoolCastHomeworkEnabled: true,
        schoolCastApprovalsEnabled: true,
        schoolCastEmailEnabled: true,
        schoolCastWhatsAppEnabled: true,
        schoolCastAutomationEnabled: true,
        schoolCastAnalyticsEnabled: true,
        schoolCastDeliveryMode: true,
        schoolCastTeacherDirectPublish: true
      }
    });

    if (settings?.schoolCastEnabled !== true) return SCHOOLCAST_DISABLED_FEATURE_STATE;

    return constrainSchoolCastFeatureSettings({
      enabled: true,
      inApp: settings.schoolCastInAppEnabled,
      notices: settings.schoolCastNoticesEnabled,
      homework: settings.schoolCastHomeworkEnabled,
      approvals: settings.schoolCastApprovalsEnabled,
      email: settings.schoolCastEmailEnabled,
      whatsApp: settings.schoolCastWhatsAppEnabled,
      automation: settings.schoolCastAutomationEnabled,
      analytics: settings.schoolCastAnalyticsEnabled,
      deliveryMode: settings.schoolCastDeliveryMode,
      teacherDirectPublish: settings.schoolCastTeacherDirectPublish
    }, deploymentPolicy);
  } catch (error) {
    if (isPendingSchoolCastMigration(error)) return SCHOOLCAST_DISABLED_FEATURE_STATE;
    throw error;
  }
}

export async function getSchoolCastFeatureState(ctx: Pick<TenantContext, "tenantId">) {
  return loadFeatureState(ctx.tenantId);
}

export async function isSchoolCastEnabled(ctx: Pick<TenantContext, "tenantId">) {
  return (await loadFeatureState(ctx.tenantId)).enabled;
}

export async function requireSchoolCastEnabled(ctx: Pick<TenantContext, "tenantId">) {
  if (!(await isSchoolCastEnabled(ctx))) {
    throw new AppError("SCHOOLCAST_NOT_ENABLED", "SCHOOLCAST_NOT_ENABLED", 404);
  }
}

export async function requireSchoolCastSubfeature(
  ctx: Pick<TenantContext, "tenantId">,
  feature: SchoolCastSubfeature
) {
  const state = await loadFeatureState(ctx.tenantId);
  if (!state.enabled) throw new AppError("SCHOOLCAST_NOT_ENABLED", "SCHOOLCAST_NOT_ENABLED", 404);
  if (!state[feature]) throw new AppError("SCHOOLCAST_FEATURE_NOT_ENABLED", "SCHOOLCAST_FEATURE_NOT_ENABLED", 404);
  return state;
}