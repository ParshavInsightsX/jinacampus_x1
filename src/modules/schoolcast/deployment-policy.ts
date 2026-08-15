import { AppError } from "@/lib/errors";

export const SCHOOLCAST_RELEASE_SCOPES = ["DISABLED", "IN_APP_CORE", "FULL"] as const;

export type SchoolCastReleaseScope = (typeof SCHOOLCAST_RELEASE_SCOPES)[number];

export type SchoolCastDeploymentCapability =
  | "attachments"
  | "classSectionAudience"
  | "deliveryOperations"
  | "externalChannels"
  | "homework"
  | "providerConfiguration"
  | "scheduling"
  | "sourceAutomation"
  | "templates";

export type SchoolCastDeploymentPolicy = {
  scope: SchoolCastReleaseScope;
  workspace: boolean;
  inApp: boolean;
  notices: boolean;
  approvals: boolean;
  analytics: boolean;
  calendar: boolean;
  homework: boolean;
  externalChannels: boolean;
  sourceAutomation: boolean;
  attachments: boolean;
  scheduling: boolean;
  templates: boolean;
  providerConfiguration: boolean;
  deliveryOperations: boolean;
  classSectionAudience: boolean;
};

const DISABLED_POLICY: SchoolCastDeploymentPolicy = {
  scope: "DISABLED",
  workspace: false,
  inApp: false,
  notices: false,
  approvals: false,
  analytics: false,
  calendar: false,
  homework: false,
  externalChannels: false,
  sourceAutomation: false,
  attachments: false,
  scheduling: false,
  templates: false,
  providerConfiguration: false,
  deliveryOperations: false,
  classSectionAudience: false
};

const IN_APP_CORE_POLICY: SchoolCastDeploymentPolicy = {
  scope: "IN_APP_CORE",
  workspace: true,
  inApp: true,
  notices: true,
  approvals: true,
  analytics: true,
  calendar: true,
  homework: false,
  externalChannels: false,
  sourceAutomation: false,
  attachments: false,
  scheduling: false,
  templates: false,
  providerConfiguration: false,
  deliveryOperations: false,
  classSectionAudience: false
};

const FULL_POLICY: SchoolCastDeploymentPolicy = {
  scope: "FULL",
  workspace: true,
  inApp: true,
  notices: true,
  approvals: true,
  analytics: true,
  calendar: true,
  homework: true,
  externalChannels: true,
  sourceAutomation: true,
  attachments: true,
  scheduling: true,
  templates: true,
  providerConfiguration: true,
  deliveryOperations: true,
  classSectionAudience: true
};

export function resolveSchoolCastDeploymentPolicy(scope: SchoolCastReleaseScope): SchoolCastDeploymentPolicy {
  if (scope === "FULL") return FULL_POLICY;
  if (scope === "IN_APP_CORE") return IN_APP_CORE_POLICY;
  return DISABLED_POLICY;
}

function configuredSchoolCastReleaseScope(): SchoolCastReleaseScope {
  const configured = process.env.SCHOOLCAST_RELEASE_SCOPE;
  if (configured === "DISABLED" || configured === "IN_APP_CORE" || configured === "FULL") {
    return configured;
  }
  if (configured !== undefined) return "DISABLED";
  return process.env.NODE_ENV === "production" ? "DISABLED" : "FULL";
}

export function getSchoolCastDeploymentPolicy() {
  return resolveSchoolCastDeploymentPolicy(configuredSchoolCastReleaseScope());
}

export function requireSchoolCastDeploymentCapability(capability: SchoolCastDeploymentCapability) {
  const policy = getSchoolCastDeploymentPolicy();
  if (!policy[capability]) {
    throw new AppError("SCHOOLCAST_CAPABILITY_NOT_DEPLOYED", "SCHOOLCAST_CAPABILITY_NOT_DEPLOYED", 404);
  }
  return policy;
}

export function assertSchoolCastAudienceRulesDeployed(ruleTypes: readonly string[]) {
  const policy = getSchoolCastDeploymentPolicy();
  if (policy.classSectionAudience) return;
  if (ruleTypes.some((ruleType) => !["ALL_USERS", "ROLE"].includes(ruleType))) {
    throw new AppError("SCHOOLCAST_AUDIENCE_NOT_DEPLOYED", "SCHOOLCAST_AUDIENCE_NOT_DEPLOYED", 400);
  }
}

export function assertSchoolCastChannelsDeployed(channels: readonly string[]) {
  const policy = getSchoolCastDeploymentPolicy();
  if (policy.externalChannels) return;
  if (channels.some((channel) => channel !== "IN_APP")) {
    throw new AppError("SCHOOLCAST_CHANNEL_NOT_DEPLOYED", "SCHOOLCAST_CHANNEL_NOT_DEPLOYED", 400);
  }
}

type RequestedFeatureSettings = {
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

export function constrainSchoolCastFeatureSettings(
  input: RequestedFeatureSettings,
  policy = getSchoolCastDeploymentPolicy()
): RequestedFeatureSettings {
  if (!policy.workspace) {
    return {
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
  }

  if (policy.scope === "IN_APP_CORE") {
    const enabled = input.enabled && input.inApp;
    return {
      enabled,
      inApp: enabled,
      notices: enabled && input.notices,
      homework: false,
      approvals: enabled && input.approvals,
      email: false,
      whatsApp: false,
      automation: false,
      analytics: enabled && input.analytics,
      deliveryMode: "DRY_RUN",
      teacherDirectPublish: false
    };
  }

  return input;
}

export function assertSchoolCastFeatureRequestDeployed(input: Partial<RequestedFeatureSettings>) {
  const policy = getSchoolCastDeploymentPolicy();
  if (!policy.workspace && Object.values(input).some((value) => value !== undefined)) {
    throw new AppError("SCHOOLCAST_RELEASE_SCOPE_DISABLED", "SCHOOLCAST_RELEASE_SCOPE_DISABLED", 409);
  }
  if (policy.scope !== "IN_APP_CORE") return;
  if (
    input.homework === true
    || input.email === true
    || input.whatsApp === true
    || input.automation === true
    || input.teacherDirectPublish === true
    || (input.deliveryMode !== undefined && input.deliveryMode !== "DRY_RUN")
  ) {
    throw new AppError("SCHOOLCAST_RELEASE_SCOPE_BLOCKS_FEATURE", "SCHOOLCAST_RELEASE_SCOPE_BLOCKS_FEATURE", 409);
  }
}
