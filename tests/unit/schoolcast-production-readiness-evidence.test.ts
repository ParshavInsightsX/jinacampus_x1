import { describe, expect, it } from "vitest";

import { evaluateSchoolCastProductionReadinessEvidence } from "@/modules/schoolcast/operations/production-readiness-evidence";

function pass() {
  return { status: "PASS", evidenceRef: "EVIDENCE-001" } as const;
}

function providerEvidence() {
  return {
    sender: {
      ...pass(), accountOwnershipVerified: true, senderIdentityVerified: true,
      productionCredentialStoredServerSide: true, credentialRotationOwnerAssigned: true
    },
    templates: {
      ...pass(), approvedTemplateCount: 4, allProviderApproved: true,
      variableContractsValidated: true, versionAndLanguageMappingValidated: true
    },
    consent: {
      ...pass(), noticeVersion: "2026-08", purposeSpecificConsentRecorded: true,
      guardianAuthorityReviewed: true, optOutFlowPassed: true,
      withdrawalSuppressionPassed: true, retentionPolicyApproved: true,
      legalPrivacyReviewPassed: true
    },
    billing: {
      ...pass(), currency: "INR", monthlyCapMinorUnits: 100_000,
      alertThresholdPercent: 80, providerQuotaConfigured: true,
      applicationRateLimitValidated: true, billingOwnerAssigned: true,
      overageDisabledOrApproved: true
    },
    webhook: {
      ...pass(), productionEndpointVerified: true, signatureVerificationPassed: true,
      replayAndDuplicateProtectionPassed: true, deliveryTransitionsReconciled: true,
      invalidSignatureDenied: true, providerDisableDrillPassed: true
    },
    recipientPilot: {
      ...pass(), consentedRecipientCount: 2, messagesAttempted: 2,
      messagesDelivered: 2, messagesPermanentlyFailed: 0,
      duplicateDeliveries: 0, unconsentedDeliveries: 0,
      crossTenantDeliveries: 0, rawRecipientDataStoredInEvidence: false
    }
  };
}

function approved() {
  return {
    decision: "APPROVED",
    approverName: "Accountable Owner",
    decidedAt: "2026-08-15T10:00:00.000Z",
    evidenceRef: "APPROVAL-001",
    conditions: []
  } as const;
}

function validEvidence() {
  return {
    version: 1,
    environment: "PRODUCTION",
    releaseId: "schoolcast-production-001",
    commitSha: "abcdef1234567890",
    migrationHead: "20260814120000_add_schoolcast_mvp_foundation",
    databaseTargetFingerprint: "a".repeat(64),
    evaluatedAt: "2026-08-15T10:30:00.000Z",
    providers: {
      email: { provider: "RESEND", ...providerEvidence() },
      whatsapp: {
        provider: "META_CLOUD", businessAccountVerified: true,
        phoneNumberVerified: true, ...providerEvidence()
      }
    },
    recovery: {
      ...pass(), strategy: "SUPABASE_PITR", architectureApproved: true,
      fundingApproved: true, backupAvailable: true,
      continuousRecoveryEnabled: true, recoveryMonitoringEnabled: true,
      independentRecoveryCopies: 1, restoreRehearsalPassed: true,
      storageRecoveryPassed: true, measuredRpoMinutes: 10,
      measuredRtoMinutes: 120, recoveryOwnerAssigned: true
    },
    approvals: {
      operations: approved(), securityPrivacy: approved(),
      technicalEngineering: approved(), businessProduct: approved()
    }
  };
}

describe("SchoolCast production readiness evidence", () => {
  it("accepts complete evidence but never authorizes production actions", () => {
    expect(evaluateSchoolCastProductionReadinessEvidence(validEvidence())).toEqual({
      ok: true,
      environment: "PRODUCTION",
      releaseId: "schoolcast-production-001",
      blockerCodes: [],
      providerGateComplete: true,
      recoveryGateComplete: true,
      approvalGateComplete: true,
      productionMigrationAuthorized: false,
      productionCodeDeploymentAuthorized: false,
      productionWorkerActivationAuthorized: false,
      productionProviderActivationAuthorized: false,
      productionFeatureEnablementAuthorized: false,
      inAppCorePilotAuthorized: false,
      liveDeliveryAuthorized: false
    });
  });

  it("blocks missing consent, webhook, billing, pilot, recovery, and approval evidence", () => {
    const evidence = validEvidence();
    evidence.providers.email.consent.optOutFlowPassed = false;
    evidence.providers.whatsapp.webhook.invalidSignatureDenied = false;
    evidence.providers.whatsapp.billing.monthlyCapMinorUnits = 0;
    evidence.providers.email.recipientPilot.unconsentedDeliveries = 1;
    evidence.recovery.strategy = "UNRESOLVED";
    evidence.recovery.measuredRpoMinutes = 1_440;
    evidence.approvals.securityPrivacy = {
      decision: "PENDING",
      conditions: []
    } as unknown as ReturnType<typeof approved>;

    const result = evaluateSchoolCastProductionReadinessEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      "EMAIL_CONSENT_CONTROLS",
      "EMAIL_RECIPIENT_PILOT_CONTROLS",
      "WHATSAPP_BILLING_CONTROLS",
      "WHATSAPP_WEBHOOK_CONTROLS",
      "PRODUCTION_RECOVERY_TARGETS",
      "SECURITY_PRIVACY_APPROVAL"
    ]));
  });

  it("rejects raw recipient or credential fields from the evidence contract", () => {
    const evidence = validEvidence() as Record<string, unknown>;
    evidence.apiKey = "must-not-be-recorded";
    expect(() => evaluateSchoolCastProductionReadinessEvidence(evidence)).toThrow();
  });
});
