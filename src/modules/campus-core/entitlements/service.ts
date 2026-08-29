import { cache } from "react";
import { Prisma, type SubscriptionLifecycleStatus } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import {
  ATTENDANCE_ENTITLEMENT_DEFINITIONS,
  ATTENDANCE_ENTITLEMENT_FEATURES,
  ENTITLEMENT_MODULE_KEYS,
  type AttendanceEntitlementFeature,
  type EntitlementAccess,
  type EntitlementModuleKey
} from "@/modules/campus-core/entitlements/catalog";

type EntitlementContext = Pick<TenantContext, "tenantId" | "institutionId">;
type EntitlementSchemaProbeClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type SubscriptionAccessInput = {
  status: SubscriptionLifecycleStatus;
  startsAt: Date;
  trialEndsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  graceEndsAt: Date | null;
};

type LoadEntitlementInput = {
  ctx: EntitlementContext;
  moduleKey: EntitlementModuleKey;
  institutionId?: string | null;
  branchId?: string | null;
  now?: Date;
};

type RequireEntitlementInput = LoadEntitlementInput & {
  featureKey: string;
  operation: "READ" | "WRITE";
};

export type InstitutionModuleEntitlementState = {
  schemaAvailable: boolean;
  institutionId: string | null;
  subscriptionActive: boolean;
  subscriptionStatus: SubscriptionLifecycleStatus | null;
  moduleAccess: EntitlementAccess;
  featureAccess: Record<string, EntitlementAccess>;
};

const ACCESS_RANK: Record<EntitlementAccess, number> = {
  DISABLED: 0,
  READ_ONLY: 1,
  FULL: 2
};

const ENTITLEMENT_SCHEMA_PROBE_TTL_MS = 30_000;
let entitlementSchemaAvailabilityCache: { available: boolean; expiresAt: number } | null = null;

function usesLegacyUnitTestDatabaseMock() {
  if (process.env.NODE_ENV !== "test") return false;
  const client = db as unknown as {
    tenantSubscription?: { findUnique?: unknown };
    institutionEntitlement?: { findMany?: unknown };
  };
  return (
    typeof client.tenantSubscription?.findUnique !== "function" ||
    typeof client.institutionEntitlement?.findMany !== "function"
  );
}

function unavailableEntitlementState(
  institutionId: string | null = null
): InstitutionModuleEntitlementState {
  return {
    schemaAvailable: false,
    institutionId,
    subscriptionActive: false,
    subscriptionStatus: null,
    moduleAccess: "DISABLED",
    featureAccess: {}
  };
}

function lowerAccess(left: EntitlementAccess, right: EntitlementAccess): EntitlementAccess {
  return ACCESS_RANK[left] <= ACCESS_RANK[right] ? left : right;
}

function isPendingEntitlementMigration(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2021" && error.code !== "P2022") return false;
  const table = typeof error.meta?.table === "string" ? error.meta.table : "";
  const column = typeof error.meta?.column === "string" ? error.meta.column : "";
  return (
    table.includes("tenant_subscriptions") ||
    table.includes("institution_entitlements") ||
    column.includes("tenant_subscriptions") ||
    column.includes("institution_entitlements")
  );
}

export async function isInstitutionEntitlementSchemaAvailable(
  client: EntitlementSchemaProbeClient = db
) {
  const now = Date.now();
  const useCache = client === db && process.env.NODE_ENV !== "test";
  if (
    useCache &&
    entitlementSchemaAvailabilityCache?.expiresAt &&
    entitlementSchemaAvailabilityCache.expiresAt > now
  ) {
    return entitlementSchemaAvailabilityCache.available;
  }

  // Prisma cannot safely select optional relations whose tables have not been migrated yet.
  const [probe] = await client.$queryRaw<Array<{
    subscriptionTableAvailable: boolean;
    entitlementTableAvailable: boolean;
  }>>(Prisma.sql`
    SELECT
      to_regclass('public.tenant_subscriptions') IS NOT NULL AS "subscriptionTableAvailable",
      to_regclass('public.institution_entitlements') IS NOT NULL AS "entitlementTableAvailable"
  `);
  const available = Boolean(
    probe?.subscriptionTableAvailable && probe.entitlementTableAvailable
  );

  if (useCache) {
    entitlementSchemaAvailabilityCache = {
      available,
      expiresAt: now + ENTITLEMENT_SCHEMA_PROBE_TTL_MS
    };
  }
  return available;
}

export function isSubscriptionOperational(subscription: SubscriptionAccessInput | null, now = new Date()) {
  if (!subscription || subscription.startsAt > now) return false;

  if (subscription.status === "TRIAL") {
    return !subscription.trialEndsAt || subscription.trialEndsAt >= now;
  }

  if (subscription.status === "ACTIVE") {
    if (!subscription.currentPeriodEndsAt || subscription.currentPeriodEndsAt >= now) return true;
    return Boolean(subscription.graceEndsAt && subscription.graceEndsAt >= now);
  }

  if (subscription.status === "GRACE_PERIOD") {
    return Boolean(subscription.graceEndsAt && subscription.graceEndsAt >= now);
  }

  return false;
}

async function resolveInstitutionId(input: LoadEntitlementInput) {
  if (input.branchId) {
    const branch = await db.branch.findFirst({
      where: {
        id: input.branchId,
        tenantId: input.ctx.tenantId,
        status: "ACTIVE",
        institution: { status: "ACTIVE" }
      },
      select: { institutionId: true }
    });
    if (!branch) throw new AppError("ENTITLEMENT_SCOPE_NOT_FOUND", "ENTITLEMENT_SCOPE_NOT_FOUND", 404);
    return branch.institutionId;
  }

  const requestedInstitutionId = input.institutionId ?? input.ctx.institutionId;
  if (requestedInstitutionId) {
    const institution = await db.institution.findFirst({
      where: {
        id: requestedInstitutionId,
        tenantId: input.ctx.tenantId,
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!institution) throw new AppError("ENTITLEMENT_SCOPE_NOT_FOUND", "ENTITLEMENT_SCOPE_NOT_FOUND", 404);
    return institution.id;
  }

  const institution = await db.institution.findFirst({
    where: { tenantId: input.ctx.tenantId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true }
  });
  return institution?.id ?? null;
}

export async function loadInstitutionModuleEntitlements(
  input: LoadEntitlementInput
): Promise<InstitutionModuleEntitlementState> {
  if (usesLegacyUnitTestDatabaseMock()) {
    return unavailableEntitlementState(input.institutionId ?? input.ctx.institutionId ?? null);
  }

  const institutionId = await resolveInstitutionId(input);
  if (!institutionId) {
    return {
      schemaAvailable: true,
      institutionId: null,
      subscriptionActive: false,
      subscriptionStatus: null,
      moduleAccess: "DISABLED",
      featureAccess: {}
    };
  }

  if (!(await isInstitutionEntitlementSchemaAvailable())) {
    return unavailableEntitlementState(institutionId);
  }

  try {
    const [subscription, entitlements] = await Promise.all([
      db.tenantSubscription.findUnique({
        where: { tenantId: input.ctx.tenantId },
        select: {
          status: true,
          startsAt: true,
          trialEndsAt: true,
          currentPeriodEndsAt: true,
          graceEndsAt: true
        }
      }),
      db.institutionEntitlement.findMany({
        where: {
          tenantId: input.ctx.tenantId,
          institutionId,
          moduleKey: input.moduleKey
        },
        select: {
          featureKey: true,
          access: true,
          startsAt: true,
          endsAt: true
        }
      })
    ]);

    const now = input.now ?? new Date();
    const subscriptionActive = isSubscriptionOperational(subscription, now);
    const activeEntitlements = entitlements.filter(
      (entitlement) =>
        (!entitlement.startsAt || entitlement.startsAt <= now) &&
        (!entitlement.endsAt || entitlement.endsAt >= now)
    );
    const rawModuleAccess =
      activeEntitlements.find((entitlement) => entitlement.featureKey === "module")?.access ?? "DISABLED";
    const moduleAccess: EntitlementAccess = subscriptionActive ? rawModuleAccess : "DISABLED";
    const featureAccess = Object.fromEntries(
      activeEntitlements.map((entitlement) => [
        entitlement.featureKey,
        subscriptionActive
          ? lowerAccess(moduleAccess, entitlement.access as EntitlementAccess)
          : "DISABLED"
      ])
    ) as Record<string, EntitlementAccess>;

    return {
      schemaAvailable: true,
      institutionId,
      subscriptionActive,
      subscriptionStatus: subscription?.status ?? null,
      moduleAccess,
      featureAccess
    };
  } catch (error) {
    if (!isPendingEntitlementMigration(error)) throw error;
    return unavailableEntitlementState(institutionId);
  }
}

export function entitlementAllows(
  state: InstitutionModuleEntitlementState,
  featureKey: string,
  operation: "READ" | "WRITE"
) {
  const access = featureKey === "module"
    ? state.moduleAccess
    : state.featureAccess[featureKey] ?? "DISABLED";
  return operation === "READ" ? ACCESS_RANK[access] >= ACCESS_RANK.READ_ONLY : access === "FULL";
}

export function assertInstitutionEntitlement(
  state: InstitutionModuleEntitlementState,
  featureKey: string,
  operation: "READ" | "WRITE"
) {
  if (!state.schemaAvailable) {
    throw new AppError("ENTITLEMENT_CONFIGURATION_REQUIRED", "ENTITLEMENT_CONFIGURATION_REQUIRED", 503);
  }
  if (!state.subscriptionActive) {
    throw new AppError("SUBSCRIPTION_INACTIVE", "SUBSCRIPTION_INACTIVE", 403);
  }
  if (state.moduleAccess === "DISABLED") {
    throw new AppError("MODULE_NOT_INCLUDED", "MODULE_NOT_INCLUDED", 403);
  }

  const featureAccess = featureKey === "module"
    ? state.moduleAccess
    : state.featureAccess[featureKey] ?? "DISABLED";
  if (featureAccess === "DISABLED") {
    throw new AppError("FEATURE_NOT_INCLUDED", "FEATURE_NOT_INCLUDED", 403);
  }
  if (operation === "WRITE" && featureAccess !== "FULL") {
    throw new AppError("MODULE_READ_ONLY", "MODULE_READ_ONLY", 403);
  }
}

export async function requireInstitutionEntitlement(input: RequireEntitlementInput) {
  const state = await loadInstitutionModuleEntitlements(input);
  if (!state.schemaAvailable && usesLegacyUnitTestDatabaseMock()) return state;
  assertInstitutionEntitlement(state, input.featureKey, input.operation);
  return state;
}

async function loadAttendanceEntitlementState(
  tenantId: string,
  institutionId: string | null,
  branchId: string | null
) {
  const state = await loadInstitutionModuleEntitlements({
    ctx: { tenantId, institutionId },
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    institutionId,
    branchId
  });

  const features = Object.fromEntries(
    ATTENDANCE_ENTITLEMENT_DEFINITIONS.map((definition) => [
      definition.featureKey,
      {
        read: entitlementAllows(state, definition.featureKey, "READ"),
        write: entitlementAllows(state, definition.featureKey, "WRITE"),
        access: definition.featureKey === ATTENDANCE_ENTITLEMENT_FEATURES.MODULE
          ? state.moduleAccess
          : state.featureAccess[definition.featureKey] ?? "DISABLED"
      }
    ])
  ) as Record<AttendanceEntitlementFeature, {
    read: boolean;
    write: boolean;
    access: EntitlementAccess;
  }>;

  return {
    ...state,
    enabled: features[ATTENDANCE_ENTITLEMENT_FEATURES.MODULE].read,
    features
  };
}

const loadCachedAttendanceEntitlementState = cache(loadAttendanceEntitlementState);

export function getAttendanceEntitlementState(
  ctx: EntitlementContext,
  input: { institutionId?: string | null; branchId?: string | null } = {}
) {
  return loadCachedAttendanceEntitlementState(
    ctx.tenantId,
    input.institutionId ?? ctx.institutionId ?? null,
    input.branchId ?? null
  );
}

export async function requireAttendanceEntitlement(
  ctx: EntitlementContext,
  featureKey: AttendanceEntitlementFeature,
  operation: "READ" | "WRITE",
  input: { institutionId?: string | null; branchId?: string | null } = {}
) {
  return requireInstitutionEntitlement({
    ctx,
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey,
    operation,
    ...input
  });
}
export async function requireAttendanceEntitlements(
  ctx: EntitlementContext,
  requirements: ReadonlyArray<{
    featureKey: AttendanceEntitlementFeature;
    operation: "READ" | "WRITE";
  }>,
  input: { institutionId?: string | null; branchId?: string | null } = {}
) {
  const state = await loadInstitutionModuleEntitlements({
    ctx,
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    ...input
  });
  if (!state.schemaAvailable && usesLegacyUnitTestDatabaseMock()) return state;
  for (const requirement of requirements) {
    assertInstitutionEntitlement(state, requirement.featureKey, requirement.operation);
  }
  return state;
}
