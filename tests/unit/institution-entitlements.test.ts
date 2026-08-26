import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isFeatureNavigationEnabled } from "@/components/app-shell/navigation";
import {
  updateInstitutionEntitlementsSchema,
  updateTenantSubscriptionSchema
} from "@/modules/campus-core/administrator-schemas";
import {
  ATTENDANCE_ENTITLEMENT_DEFINITIONS,
  GRADEBOOK_ENTITLEMENT_DEFINITIONS,
  INSTITUTION_ENTITLEMENT_DEFINITIONS
} from "@/modules/campus-core/entitlements/catalog";
import {
  assertInstitutionEntitlement,
  entitlementAllows,
  isSubscriptionOperational,
  type InstitutionModuleEntitlementState
} from "@/modules/campus-core/entitlements/service";

const tenantId = "00000000-0000-0000-0000-000000000001";
const institutionId = "00000000-0000-0000-0000-000000000002";

function entitlementPayload(): {
  tenantId: string;
  institutionId: string;
  entitlements: Array<{
    moduleKey: string;
    featureKey: string;
    access: "DISABLED" | "READ_ONLY" | "FULL";
  }>;
} {
  return {
    tenantId,
    institutionId,
    entitlements: INSTITUTION_ENTITLEMENT_DEFINITIONS.map((definition) => ({
      moduleKey: definition.moduleKey,
      featureKey: definition.featureKey,
      access: definition.defaultAccess
    }))
  };
}

function state(overrides: Partial<InstitutionModuleEntitlementState> = {}): InstitutionModuleEntitlementState {
  return {
    schemaAvailable: true,
    institutionId,
    subscriptionActive: true,
    subscriptionStatus: "ACTIVE",
    moduleAccess: "FULL",
    featureAccess: { reports: "READ_ONLY" },
    ...overrides
  };
}

describe("institution subscriptions and entitlements", () => {
  it("keeps attendance enabled by default and future GradeBook access disabled", () => {
    expect(ATTENDANCE_ENTITLEMENT_DEFINITIONS.every((item) => item.defaultAccess === "FULL")).toBe(true);
    expect(GRADEBOOK_ENTITLEMENT_DEFINITIONS.every((item) => item.defaultAccess === "DISABLED")).toBe(true);
  });

  it("accepts only the complete code-defined entitlement catalog", () => {
    expect(updateInstitutionEntitlementsSchema.safeParse(entitlementPayload()).success).toBe(true);

    const unsupported = entitlementPayload();
    unsupported.entitlements[0] = {
      moduleKey: "attendance",
      featureKey: "client_supplied_capability",
      access: "FULL"
    };
    expect(updateInstitutionEntitlementsSchema.safeParse(unsupported).success).toBe(false);

    const duplicate = entitlementPayload();
    duplicate.entitlements[1] = { ...duplicate.entitlements[0] };
    expect(updateInstitutionEntitlementsSchema.safeParse(duplicate).success).toBe(false);
  });

  it("enforces lifecycle dates and fail-closed subscription states", () => {
    const parsedTrial = updateTenantSubscriptionSchema.parse({
      tenantId,
      planCode: "pilot",
      status: "TRIAL",
      trialEndsAt: "2026-08-18",
      currentPeriodEndsAt: "",
      graceEndsAt: ""
    });
    expect(parsedTrial.planCode).toBe("PILOT");
    expect(parsedTrial.trialEndsAt?.toISOString()).toBe("2026-08-18T23:59:59.999Z");
    expect(updateTenantSubscriptionSchema.safeParse({
      tenantId,
      planCode: "TRIAL",
      status: "TRIAL",
      trialEndsAt: "",
      currentPeriodEndsAt: "",
      graceEndsAt: ""
    }).success).toBe(false);

    const now = new Date("2026-08-18T12:00:00.000Z");
    expect(isSubscriptionOperational({
      status: "ACTIVE",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      trialEndsAt: null,
      currentPeriodEndsAt: new Date("2026-08-17T00:00:00.000Z"),
      graceEndsAt: new Date("2026-08-20T00:00:00.000Z")
    }, now)).toBe(true);
    expect(isSubscriptionOperational({
      status: "SUSPENDED",
      startsAt: new Date("2026-01-01T00:00:00.000Z"),
      trialEndsAt: null,
      currentPeriodEndsAt: null,
      graceEndsAt: null
    }, now)).toBe(false);
  });

  it("separates read-only access from write authority", () => {
    const readOnly = state();
    expect(entitlementAllows(readOnly, "reports", "READ")).toBe(true);
    expect(entitlementAllows(readOnly, "reports", "WRITE")).toBe(false);
    expect(() => assertInstitutionEntitlement(readOnly, "reports", "READ")).not.toThrow();
    expect(() => assertInstitutionEntitlement(readOnly, "reports", "WRITE")).toThrow("MODULE_READ_ONLY");
  });

  it("removes disabled attendance capabilities from navigation without replacing RBAC", () => {
    const features = {
      gradebookEnabled: false,
      attendance: {
        studentAttendance: true,
        staffAttendance: false,
        marking: false,
        qr: false,
        reports: true
      }
    };
    expect(isFeatureNavigationEnabled("/academia/attendance", features)).toBe(true);
    expect(isFeatureNavigationEnabled("/academia/attendance/mark", features)).toBe(false);
    expect(isFeatureNavigationEnabled("/staffboard/attendance/scan", features)).toBe(false);
    expect(isFeatureNavigationEnabled("/gradebook", features)).toBe(false);
  });

  it("batches administrator entitlement writes inside a bounded transaction", () => {
    const service = readFileSync(
      path.join(process.cwd(), "src/modules/campus-core/entitlements/administrator.service.ts"),
      "utf8"
    );

    expect(service).toContain("institutionEntitlement.createMany");
    expect(service).toContain("institutionEntitlement.updateMany");
    expect(service).not.toContain("institutionEntitlement.upsert");
    expect(service).toContain("ENTITLEMENT_UPDATE_INCOMPLETE");
    expect(service).toContain("{ maxWait: 10_000, timeout: 30_000 }");
  });

  it("keeps the migration additive, tenant-safe, backfilled, and server-only", () => {
    const migration = readFileSync(
      path.join(process.cwd(), "prisma/migrations/20260818233000_add_institution_entitlements/migration.sql"),
      "utf8"
    );
    expect(migration).toContain('CREATE TABLE "tenant_subscriptions"');
    expect(migration).toContain('CREATE TABLE "institution_entitlements"');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "institutionId")');
    expect(migration).toContain("attendance_features");
    expect(migration).toContain("gradebook_features");
    expect(migration).toContain('ALTER TABLE "institution_entitlements" ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/);
    const studentAttendanceService = readFileSync(
      path.join(process.cwd(), "src/modules/academia/services/student-attendance.service.ts"),
      "utf8"
    );
    const scheduler = readFileSync(
      path.join(process.cwd(), "src/modules/notifications/jobs/attendance-notification-scheduler.job.ts"),
      "utf8"
    );
    expect(studentAttendanceService).toContain("ATTENDANCE_ENTITLEMENT_FEATURES.EXCEPTION_MANAGEMENT");
    expect(scheduler).toContain("ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS");
    expect(scheduler).toContain('operation: "WRITE"');
  });
});