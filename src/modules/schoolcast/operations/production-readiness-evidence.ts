import { z } from "zod";

const evidenceStatusSchema = z.enum(["PASS", "FAIL", "NOT_RUN", "BLOCKED"]);
const evidenceReferenceSchema = z.string()
  .trim()
  .min(3)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]+$/);

const evidenceGateSchema = z.object({
  status: evidenceStatusSchema,
  evidenceRef: evidenceReferenceSchema.optional()
}).strict();

const senderEvidenceSchema = evidenceGateSchema.extend({
  accountOwnershipVerified: z.boolean(),
  senderIdentityVerified: z.boolean(),
  productionCredentialStoredServerSide: z.boolean(),
  credentialRotationOwnerAssigned: z.boolean()
}).strict();

const templateEvidenceSchema = evidenceGateSchema.extend({
  approvedTemplateCount: z.number().int().nonnegative(),
  allProviderApproved: z.boolean(),
  variableContractsValidated: z.boolean(),
  versionAndLanguageMappingValidated: z.boolean()
}).strict();

const consentEvidenceSchema = evidenceGateSchema.extend({
  noticeVersion: z.string().trim().min(1).max(64).optional(),
  purposeSpecificConsentRecorded: z.boolean(),
  guardianAuthorityReviewed: z.boolean(),
  optOutFlowPassed: z.boolean(),
  withdrawalSuppressionPassed: z.boolean(),
  retentionPolicyApproved: z.boolean(),
  legalPrivacyReviewPassed: z.boolean()
}).strict();

const billingEvidenceSchema = evidenceGateSchema.extend({
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  monthlyCapMinorUnits: z.number().int().nonnegative(),
  alertThresholdPercent: z.number().int().min(1).max(100),
  providerQuotaConfigured: z.boolean(),
  applicationRateLimitValidated: z.boolean(),
  billingOwnerAssigned: z.boolean(),
  overageDisabledOrApproved: z.boolean()
}).strict();

const webhookEvidenceSchema = evidenceGateSchema.extend({
  productionEndpointVerified: z.boolean(),
  signatureVerificationPassed: z.boolean(),
  replayAndDuplicateProtectionPassed: z.boolean(),
  deliveryTransitionsReconciled: z.boolean(),
  invalidSignatureDenied: z.boolean(),
  providerDisableDrillPassed: z.boolean()
}).strict();

const recipientPilotEvidenceSchema = evidenceGateSchema.extend({
  consentedRecipientCount: z.number().int().nonnegative(),
  messagesAttempted: z.number().int().nonnegative(),
  messagesDelivered: z.number().int().nonnegative(),
  messagesPermanentlyFailed: z.number().int().nonnegative(),
  duplicateDeliveries: z.number().int().nonnegative(),
  unconsentedDeliveries: z.number().int().nonnegative(),
  crossTenantDeliveries: z.number().int().nonnegative(),
  rawRecipientDataStoredInEvidence: z.boolean()
}).strict();

const emailProviderEvidenceSchema = z.object({
  provider: z.literal("RESEND"),
  sender: senderEvidenceSchema,
  templates: templateEvidenceSchema,
  consent: consentEvidenceSchema,
  billing: billingEvidenceSchema,
  webhook: webhookEvidenceSchema,
  recipientPilot: recipientPilotEvidenceSchema
}).strict();

const whatsAppProviderEvidenceSchema = z.object({
  provider: z.literal("META_CLOUD"),
  businessAccountVerified: z.boolean(),
  phoneNumberVerified: z.boolean(),
  sender: senderEvidenceSchema,
  templates: templateEvidenceSchema,
  consent: consentEvidenceSchema,
  billing: billingEvidenceSchema,
  webhook: webhookEvidenceSchema,
  recipientPilot: recipientPilotEvidenceSchema
}).strict();

const approvalEvidenceSchema = z.object({
  decision: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  approverName: z.string().trim().min(3).max(120).optional(),
  decidedAt: z.string().datetime().optional(),
  evidenceRef: evidenceReferenceSchema.optional(),
  conditions: z.array(z.string().trim().min(3).max(240)).max(20).default([])
}).strict();

const recoveryEvidenceSchema = evidenceGateSchema.extend({
  strategy: z.enum(["UNRESOLVED", "SUPABASE_PITR", "SELF_MANAGED_WAL"]),
  architectureApproved: z.boolean(),
  fundingApproved: z.boolean(),
  backupAvailable: z.boolean(),
  continuousRecoveryEnabled: z.boolean(),
  recoveryMonitoringEnabled: z.boolean(),
  independentRecoveryCopies: z.number().int().nonnegative(),
  restoreRehearsalPassed: z.boolean(),
  storageRecoveryPassed: z.boolean(),
  measuredRpoMinutes: z.number().nonnegative(),
  measuredRtoMinutes: z.number().nonnegative(),
  recoveryOwnerAssigned: z.boolean()
}).strict();

export const schoolCastProductionReadinessEvidenceSchema = z.object({
  version: z.literal(1),
  environment: z.literal("PRODUCTION"),
  releaseId: evidenceReferenceSchema,
  commitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  migrationHead: evidenceReferenceSchema,
  databaseTargetFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  evaluatedAt: z.string().datetime(),
  providers: z.object({
    email: emailProviderEvidenceSchema,
    whatsapp: whatsAppProviderEvidenceSchema
  }).strict(),
  recovery: recoveryEvidenceSchema,
  approvals: z.object({
    operations: approvalEvidenceSchema,
    securityPrivacy: approvalEvidenceSchema,
    technicalEngineering: approvalEvidenceSchema,
    businessProduct: approvalEvidenceSchema
  }).strict()
}).strict();

export type SchoolCastProductionReadinessEvidence = z.infer<typeof schoolCastProductionReadinessEvidenceSchema>;

function isPlaceholder(value: string | undefined) {
  return !value || /^(?:not supplied|pending|tbd|todo|unknown|n\/a)$/i.test(value.trim());
}

export function evaluateSchoolCastProductionReadinessEvidence(input: unknown) {
  const value = schoolCastProductionReadinessEvidenceSchema.parse(input);
  const blockers: string[] = [];
  const requirePass = (code: string, gate: { status: z.infer<typeof evidenceStatusSchema>; evidenceRef?: string }) => {
    if (gate.status !== "PASS" || !gate.evidenceRef) blockers.push(code);
  };

  const evaluateProvider = (
    prefix: "EMAIL" | "WHATSAPP",
    provider: typeof value.providers.email | typeof value.providers.whatsapp
  ) => {
    requirePass(`${prefix}_SENDER`, provider.sender);
    if (
      !provider.sender.accountOwnershipVerified
      || !provider.sender.senderIdentityVerified
      || !provider.sender.productionCredentialStoredServerSide
      || !provider.sender.credentialRotationOwnerAssigned
    ) blockers.push(`${prefix}_SENDER_CONTROLS`);

    requirePass(`${prefix}_TEMPLATES`, provider.templates);
    if (
      provider.templates.approvedTemplateCount < 1
      || !provider.templates.allProviderApproved
      || !provider.templates.variableContractsValidated
      || !provider.templates.versionAndLanguageMappingValidated
    ) blockers.push(`${prefix}_TEMPLATE_CONTROLS`);

    requirePass(`${prefix}_CONSENT`, provider.consent);
    if (
      !provider.consent.noticeVersion
      || !provider.consent.purposeSpecificConsentRecorded
      || !provider.consent.guardianAuthorityReviewed
      || !provider.consent.optOutFlowPassed
      || !provider.consent.withdrawalSuppressionPassed
      || !provider.consent.retentionPolicyApproved
      || !provider.consent.legalPrivacyReviewPassed
    ) blockers.push(`${prefix}_CONSENT_CONTROLS`);

    requirePass(`${prefix}_BILLING`, provider.billing);
    if (
      !provider.billing.currency
      || provider.billing.monthlyCapMinorUnits < 1
      || !provider.billing.providerQuotaConfigured
      || !provider.billing.applicationRateLimitValidated
      || !provider.billing.billingOwnerAssigned
      || !provider.billing.overageDisabledOrApproved
    ) blockers.push(`${prefix}_BILLING_CONTROLS`);

    requirePass(`${prefix}_WEBHOOK`, provider.webhook);
    if (
      !provider.webhook.productionEndpointVerified
      || !provider.webhook.signatureVerificationPassed
      || !provider.webhook.replayAndDuplicateProtectionPassed
      || !provider.webhook.deliveryTransitionsReconciled
      || !provider.webhook.invalidSignatureDenied
      || !provider.webhook.providerDisableDrillPassed
    ) blockers.push(`${prefix}_WEBHOOK_CONTROLS`);

    requirePass(`${prefix}_RECIPIENT_PILOT`, provider.recipientPilot);
    if (
      provider.recipientPilot.consentedRecipientCount < 1
      || provider.recipientPilot.messagesAttempted < 1
      || provider.recipientPilot.messagesDelivered < 1
      || provider.recipientPilot.messagesDelivered + provider.recipientPilot.messagesPermanentlyFailed !== provider.recipientPilot.messagesAttempted
      || provider.recipientPilot.duplicateDeliveries > 0
      || provider.recipientPilot.unconsentedDeliveries > 0
      || provider.recipientPilot.crossTenantDeliveries > 0
      || provider.recipientPilot.rawRecipientDataStoredInEvidence
    ) blockers.push(`${prefix}_RECIPIENT_PILOT_CONTROLS`);
  };

  evaluateProvider("EMAIL", value.providers.email);
  evaluateProvider("WHATSAPP", value.providers.whatsapp);
  if (!value.providers.whatsapp.businessAccountVerified || !value.providers.whatsapp.phoneNumberVerified) {
    blockers.push("WHATSAPP_BUSINESS_IDENTITY");
  }

  requirePass("PRODUCTION_RECOVERY", value.recovery);
  if (
    value.recovery.strategy === "UNRESOLVED"
    || !value.recovery.architectureApproved
    || !value.recovery.fundingApproved
    || !value.recovery.backupAvailable
    || !value.recovery.continuousRecoveryEnabled
    || !value.recovery.recoveryMonitoringEnabled
    || value.recovery.independentRecoveryCopies < 1
    || !value.recovery.restoreRehearsalPassed
    || !value.recovery.storageRecoveryPassed
    || value.recovery.measuredRpoMinutes > 15
    || value.recovery.measuredRtoMinutes > 240
    || !value.recovery.recoveryOwnerAssigned
  ) blockers.push("PRODUCTION_RECOVERY_TARGETS");

  for (const [name, approval] of Object.entries(value.approvals)) {
    if (
      approval.decision !== "APPROVED"
      || isPlaceholder(approval.approverName)
      || !approval.decidedAt
      || !approval.evidenceRef
      || approval.conditions.length > 0
    ) blockers.push(`${name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}_APPROVAL`);
  }

  return {
    ok: blockers.length === 0,
    environment: value.environment,
    releaseId: value.releaseId,
    blockerCodes: Array.from(new Set(blockers)),
    providerGateComplete: !blockers.some((code) => code.startsWith("EMAIL_") || code.startsWith("WHATSAPP_")),
    recoveryGateComplete: !blockers.some((code) => code.startsWith("PRODUCTION_RECOVERY")),
    approvalGateComplete: !blockers.some((code) => code.endsWith("_APPROVAL")),
    productionMigrationAuthorized: false,
    productionCodeDeploymentAuthorized: false,
    productionWorkerActivationAuthorized: false,
    productionProviderActivationAuthorized: false,
    productionFeatureEnablementAuthorized: false,
    inAppCorePilotAuthorized: false,
    liveDeliveryAuthorized: false
  };
}
