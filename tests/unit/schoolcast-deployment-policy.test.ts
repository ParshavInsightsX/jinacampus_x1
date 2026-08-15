import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

async function loadDeploymentPolicy() {
  process.env.DATABASE_URL ??= "postgresql://user:password@localhost:5432/jinacampus_test";
  process.env.PASSWORD_PEPPER ??= "schoolcast-policy-test-pepper";
  return import("@/modules/schoolcast/deployment-policy");
}

const requestedFullState = {
  enabled: true,
  inApp: true,
  notices: true,
  homework: true,
  approvals: true,
  email: true,
  whatsApp: true,
  automation: true,
  analytics: true,
  deliveryMode: "LIVE" as const,
  teacherDirectPublish: true
};

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("SchoolCast deployment policy", () => {
  it("keeps production-safe disabled and in-app scopes fail closed", async () => {
    const { resolveSchoolCastDeploymentPolicy } = await loadDeploymentPolicy();
    const disabled = resolveSchoolCastDeploymentPolicy("DISABLED");
    const inAppCore = resolveSchoolCastDeploymentPolicy("IN_APP_CORE");

    expect(Object.entries(disabled).filter(([key]) => key !== "scope").every(([, value]) => value === false)).toBe(true);
    expect(inAppCore).toMatchObject({
      workspace: true,
      inApp: true,
      notices: true,
      approvals: true,
      analytics: true,
      homework: false,
      externalChannels: false,
      sourceAutomation: false,
      attachments: false,
      scheduling: false,
      providerConfiguration: false
    });
  });

  it("fails closed when the runtime release scope is invalid", async () => {
    const previous = process.env.SCHOOLCAST_RELEASE_SCOPE;
    process.env.SCHOOLCAST_RELEASE_SCOPE = "UNSUPPORTED";
    try {
      const { getSchoolCastDeploymentPolicy } = await loadDeploymentPolicy();
      expect(getSchoolCastDeploymentPolicy().scope).toBe("DISABLED");
    } finally {
      if (previous === undefined) delete process.env.SCHOOLCAST_RELEASE_SCOPE;
      else process.env.SCHOOLCAST_RELEASE_SCOPE = previous;
    }
  });

  it("clamps stale tenant flags to the approved in-app core capabilities", async () => {
    const { constrainSchoolCastFeatureSettings, resolveSchoolCastDeploymentPolicy } = await loadDeploymentPolicy();
    expect(constrainSchoolCastFeatureSettings(
      requestedFullState,
      resolveSchoolCastDeploymentPolicy("IN_APP_CORE")
    )).toEqual({
      enabled: true,
      inApp: true,
      notices: true,
      homework: false,
      approvals: true,
      email: false,
      whatsApp: false,
      automation: false,
      analytics: true,
      deliveryMode: "DRY_RUN",
      teacherDirectPublish: false
    });
  });

  it("guards premium entry points and hides their deployed routes", () => {
    const communication = source("src/modules/schoolcast/services/communication.service.ts");
    const attachments = source("src/modules/schoolcast/services/attachment.service.ts");
    const providers = source("src/modules/schoolcast/services/provider-adapters.ts");
    const queries = source("src/modules/schoolcast/queries.ts");

    expect(communication).toContain('requireSchoolCastDeploymentCapability("scheduling")');
    expect(communication).toContain("assertSchoolCastChannelsDeployed(data.channels)");
    expect(source("src/modules/schoolcast/deployment-policy.ts")).toContain('["ALL_USERS", "ROLE"]');
    expect(attachments).toContain('requireSchoolCastDeploymentCapability("attachments")');
    expect(source("src/modules/schoolcast/services/domain-event.service.ts")).toContain(
      "getSchoolCastDeploymentPolicy().sourceAutomation"
    );
    expect(providers).toContain("SCHOOLCAST_EXTERNAL_DELIVERY_DISABLED");
    expect(queries).toContain('deploymentPolicy.deliveryOperations && scope.permissions.has("schoolcast.outbox.view")');
    expect(queries).toContain("deploymentPolicy.classSectionAudience");
    expect(queries).toContain("deploymentPolicy.providerConfiguration");
  });

  it("keeps shared TenantSettings operations compatible before the SchoolCast migration", () => {
    const campusCoreServices = source("src/modules/campus-core/services/index.ts");
    const administratorServices = source("src/modules/campus-core/administrator-services.ts");

    expect(campusCoreServices).toContain("select: { allowMultipleActiveAcademicYears: true }");
    expect(campusCoreServices).toContain("select: campusCoreTenantSettingsSelect");
    expect(campusCoreServices).not.toContain(
      "tenantSettings.findUnique({ where: { tenantId: ctx.tenantId } })"
    );
    expect(administratorServices.match(/select: \{ id: true \}/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
