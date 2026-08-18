import { InAppNotificationCategory, InAppNotificationPriority, Prisma, type InAppNotificationSourceModule, type PrismaClient } from "@prisma/client";

import { db } from "@/lib/db";

type DbClient = PrismaClient | Prisma.TransactionClient;

const ALLOWED_NOTIFICATION_PATHS = [
  "/dashboard",
  "/account",
  "/campus-core",
  "/academia",
  "/staffboard",
  "/gradebook",
  "/notifications"
] as const;

const PRIORITY_RANK: Record<InAppNotificationPriority, number> = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

export type InAppNotificationFeatureState = {
  enabled: boolean;
  schedulingEnabled: boolean;
  acknowledgementsEnabled: boolean;
  realtimeEnabled: boolean;
  browserPushEnabled: boolean;
  gradebookEnabled: boolean;
};

export function priorityMeetsMinimum(
  priority: InAppNotificationPriority,
  minimum: InAppNotificationPriority | null | undefined
) {
  return minimum === null || minimum === undefined || PRIORITY_RANK[priority] >= PRIORITY_RANK[minimum];
}

export function normalizeNotificationDeepLink(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.includes("\\")) {
    throw new Error("INVALID_NOTIFICATION_DEEP_LINK");
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, "https://jinacampus.invalid");
  } catch {
    throw new Error("INVALID_NOTIFICATION_DEEP_LINK");
  }

  if (parsed.origin !== "https://jinacampus.invalid" || parsed.username || parsed.password) {
    throw new Error("INVALID_NOTIFICATION_DEEP_LINK");
  }
  if (!ALLOWED_NOTIFICATION_PATHS.some((path) => parsed.pathname === path || parsed.pathname.startsWith(`${path}/`))) {
    throw new Error("INVALID_NOTIFICATION_DEEP_LINK");
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function sanitizeNotificationText(value: string, maximumLength: number) {
  const normalized = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new Error("INVALID_NOTIFICATION_CONTENT");
  }
  return normalized;
}

export function sanitizeNotificationFailure(error: unknown) {
  if (!(error instanceof Error)) return "Notification processing failed.";
  if (error.name === "ZodError") return "Notification event payload is invalid.";
  const message = error.message
    .replace(/(?:token|secret|password|authorization|cookie)\s*[=:]\s*[^\s,;]+/gi, "[redacted]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[database-url-redacted]")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 240)
    .trim();
  return message || "Notification processing failed.";
}

export function sourceModuleIsEnabled(
  sourceModule: InAppNotificationSourceModule,
  state: InAppNotificationFeatureState
) {
  if (!state.enabled) return false;
  if (sourceModule === "GRADEBOOK") return state.gradebookEnabled;
  return true;
}


export async function getEffectiveInAppNotificationSetting(
  tenantId: string,
  scope: { institutionId: string | null; branchId: string | null },
  client: DbClient = db
) {
  const orderedKeys = [
    ...(scope.branchId ? [`BRANCH:${scope.branchId}`] : []),
    ...(scope.institutionId ? [`INSTITUTION:${scope.institutionId}`] : []),
    "TENANT"
  ];
  const settings = await client.inAppNotificationSetting.findMany({
    where: { tenantId, scopeKey: { in: orderedKeys } },
    select: {
      scopeKey: true,
      featureEnabled: true,
      defaultPriority: true,
      mandatoryCategoriesJson: true
    }
  });
  const byScope = new Map(settings.map((setting) => [setting.scopeKey, setting]));
  const selected = orderedKeys.map((key) => byScope.get(key)).find(Boolean);
  const mandatoryCategories = new Set<InAppNotificationCategory>();
  if (selected && Array.isArray(selected.mandatoryCategoriesJson)) {
    for (const value of selected.mandatoryCategoriesJson) {
      if (typeof value === "string" && Object.values(InAppNotificationCategory).includes(value as InAppNotificationCategory)) {
        mandatoryCategories.add(value as InAppNotificationCategory);
      }
    }
  }

  return {
    featureEnabled: selected?.featureEnabled ?? true,
    defaultPriority: selected?.defaultPriority ?? InAppNotificationPriority.NORMAL,
    mandatoryCategories
  };
}export async function getInAppNotificationFeatureState(
  tenantId: string,
  client: DbClient = db
): Promise<InAppNotificationFeatureState> {
  try {
    const settings = await client.tenantSettings.findUnique({
      where: { tenantId },
      select: {
        inAppNotificationsEnabled: true,
        inAppNotificationSchedulingEnabled: true,
        inAppNotificationAcknowledgementsEnabled: true,
        inAppNotificationRealtimeEnabled: true,
        inAppNotificationBrowserPushEnabled: true,
        gradebookEnabled: true
      }
    });

    return {
      enabled: settings?.inAppNotificationsEnabled ?? true,
      schedulingEnabled: settings?.inAppNotificationSchedulingEnabled ?? true,
      acknowledgementsEnabled: settings?.inAppNotificationAcknowledgementsEnabled ?? true,
      realtimeEnabled: settings?.inAppNotificationRealtimeEnabled ?? false,
      browserPushEnabled: settings?.inAppNotificationBrowserPushEnabled ?? false,
      gradebookEnabled: settings?.gradebookEnabled ?? false
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2022") {
      return {
        enabled: false,
        schedulingEnabled: false,
        acknowledgementsEnabled: false,
        realtimeEnabled: false,
        browserPushEnabled: false,
        gradebookEnabled: false
      };
    }
    throw error;
  }
}
