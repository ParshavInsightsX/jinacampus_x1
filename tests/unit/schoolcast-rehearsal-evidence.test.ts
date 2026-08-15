import { describe, expect, it } from "vitest";

import { evaluateSchoolCastRehearsalEvidence } from "@/modules/schoolcast/operations/rehearsal-evidence";

function pass(status = "PASS") {
  return { status, evidenceRef: "EVIDENCE-001" };
}

function validEvidence() {
  return {
    version: 1,
    environment: "STAGING",
    runId: "schoolcast-rehearsal-001",
    commitSha: "abcdef1234567890",
    migrationHead: "20260814120000_add_schoolcast_mvp_foundation",
    inventoryDigest: "a".repeat(64),
    executedAt: "2026-08-14T12:00:00.000Z",
    load: {
      ...pass(), recipients: 5_000, durationSeconds: 600, workerReplicas: 2,
      maxConcurrency: 10, queueP95Seconds: 180, duplicateDeliveries: 0, workerErrors: 0
    },
    hostFailover: {
      ...pass(), survivingWorkerContinued: true, recoverySeconds: 90, lostJobs: 0, duplicateDeliveries: 0
    },
    alerts: {
      ...pass(), primaryDelivered: true, backupDelivered: true,
      externalMonitorDetectedHostA: true, externalMonitorDetectedHostB: true,
      maximumDetectionSeconds: 120, maximumAcknowledgementSeconds: 300
    },
    deadLetter: {
      ...pass(), created: true, reviewed: true, replayed: true, resolved: true,
      unauthorizedReplays: 0, crossTenantMutations: 0
    },
    restartRecovery: {
      ...pass(), automaticRestart: true, recoverySeconds: 60,
      leaseRecoveryVerified: true, duplicateDeliveries: 0
    },
    database: {
      ...pass(), approvedConnectionLimit: 20, observedPeakConnections: 12,
      poolTimeouts: 0, databaseErrors: 0, sustainedLoadStable: true
    },
    malwareScanning: {
      ...pass(), cleanFilePromoted: true, malwareRejected: true,
      outageFailedClosed: true, signatureAgeHours: 2
    },
    logRetention: {
      ...pass(), retentionDays: 30, offHostRecoveryPassed: true, unauthorizedAccessDenied: true
    },
    backupRecovery: {
      ...pass(), backupAvailable: true, pointInTimeRecoveryAvailable: true,
      restoreRehearsalPassed: true, measuredRpoMinutes: 10, measuredRtoMinutes: 120
    },
    providers: {
      email: { ...pass(), controlledRecipientPilotPassed: true },
      whatsapp: { ...pass(), controlledRecipientPilotPassed: true }
    },
    approvals: {
      operations: pass(), securityPrivacy: pass(), technical: pass(), businessProduct: pass()
    }
  };
}

describe("SchoolCast staging rehearsal evidence", () => {
  it("accepts complete evidence but never authorizes production actions", () => {
    expect(evaluateSchoolCastRehearsalEvidence(validEvidence())).toEqual({
      ok: true,
      environment: "STAGING",
      runId: "schoolcast-rehearsal-001",
      blockerCodes: [],
      productionMigrationAuthorized: false,
      productionWorkerActivationAuthorized: false
    });
  });

  it("identifies load, failover, database, provider, and approval blockers", () => {
    const evidence = validEvidence();
    evidence.load.recipients = 4_999;
    evidence.hostFailover.lostJobs = 1;
    evidence.database.poolTimeouts = 1;
    evidence.providers.whatsapp = { ...pass("BLOCKED"), controlledRecipientPilotPassed: false };
    evidence.approvals.securityPrivacy = pass("NOT_RUN");

    const result = evaluateSchoolCastRehearsalEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.blockerCodes).toEqual(expect.arrayContaining([
      "LOAD_TARGETS",
      "HOST_FAILOVER_TARGETS",
      "DATABASE_TARGETS",
      "WHATSAPP_PROVIDER",
      "WHATSAPP_PILOT",
      "SECURITY_PRIVACY_APPROVAL"
    ]));
  });
});
