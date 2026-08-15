import { z } from "zod";

const status = z.enum(["PASS", "FAIL", "NOT_RUN", "BLOCKED"]);
const reference = z.string().trim().min(3).max(160).regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]+$/);
const evidence = z.object({ status, evidenceRef: reference.optional() });

export const schoolCastRehearsalEvidenceSchema = z.object({
  version: z.literal(1),
  environment: z.literal("STAGING"),
  runId: reference,
  commitSha: z.string().regex(/^[a-f0-9]{7,40}$/),
  migrationHead: reference,
  inventoryDigest: z.string().regex(/^[a-f0-9]{64}$/),
  executedAt: z.string().datetime(),
  load: evidence.extend({
    recipients: z.number().int().nonnegative(),
    durationSeconds: z.number().nonnegative(),
    workerReplicas: z.number().int().nonnegative(),
    maxConcurrency: z.number().int().nonnegative(),
    queueP95Seconds: z.number().nonnegative(),
    duplicateDeliveries: z.number().int().nonnegative(),
    workerErrors: z.number().int().nonnegative()
  }),
  hostFailover: evidence.extend({
    survivingWorkerContinued: z.boolean(),
    recoverySeconds: z.number().nonnegative(),
    lostJobs: z.number().int().nonnegative(),
    duplicateDeliveries: z.number().int().nonnegative()
  }),
  alerts: evidence.extend({
    primaryDelivered: z.boolean(),
    backupDelivered: z.boolean(),
    externalMonitorDetectedHostA: z.boolean(),
    externalMonitorDetectedHostB: z.boolean(),
    maximumDetectionSeconds: z.number().nonnegative(),
    maximumAcknowledgementSeconds: z.number().nonnegative()
  }),
  deadLetter: evidence.extend({
    created: z.boolean(),
    reviewed: z.boolean(),
    replayed: z.boolean(),
    resolved: z.boolean(),
    unauthorizedReplays: z.number().int().nonnegative(),
    crossTenantMutations: z.number().int().nonnegative()
  }),
  restartRecovery: evidence.extend({
    automaticRestart: z.boolean(),
    recoverySeconds: z.number().nonnegative(),
    leaseRecoveryVerified: z.boolean(),
    duplicateDeliveries: z.number().int().nonnegative()
  }),
  database: evidence.extend({
    approvedConnectionLimit: z.number().int().positive(),
    observedPeakConnections: z.number().int().nonnegative(),
    poolTimeouts: z.number().int().nonnegative(),
    databaseErrors: z.number().int().nonnegative(),
    sustainedLoadStable: z.boolean()
  }),
  malwareScanning: evidence.extend({
    cleanFilePromoted: z.boolean(),
    malwareRejected: z.boolean(),
    outageFailedClosed: z.boolean(),
    signatureAgeHours: z.number().nonnegative()
  }),
  logRetention: evidence.extend({
    retentionDays: z.number().int().nonnegative(),
    offHostRecoveryPassed: z.boolean(),
    unauthorizedAccessDenied: z.boolean()
  }),
  backupRecovery: evidence.extend({
    backupAvailable: z.boolean(),
    pointInTimeRecoveryAvailable: z.boolean(),
    restoreRehearsalPassed: z.boolean(),
    measuredRpoMinutes: z.number().nonnegative(),
    measuredRtoMinutes: z.number().nonnegative()
  }),
  providers: z.object({
    email: evidence.extend({ controlledRecipientPilotPassed: z.boolean() }),
    whatsapp: evidence.extend({ controlledRecipientPilotPassed: z.boolean() })
  }),
  approvals: z.object({
    operations: evidence,
    securityPrivacy: evidence,
    technical: evidence,
    businessProduct: evidence
  })
}).strict();

export type SchoolCastRehearsalEvidence = z.infer<typeof schoolCastRehearsalEvidenceSchema>;

export function evaluateSchoolCastRehearsalEvidence(input: unknown) {
  const value = schoolCastRehearsalEvidenceSchema.parse(input);
  const blockers: string[] = [];
  const requirePass = (code: string, gate: { status: z.infer<typeof status>; evidenceRef?: string }) => {
    if (gate.status !== "PASS" || !gate.evidenceRef) blockers.push(code);
  };

  requirePass("LOAD_CERTIFICATION", value.load);
  if (
    value.load.recipients < 5_000
    || value.load.durationSeconds > 900
    || value.load.workerReplicas < 2
    || value.load.queueP95Seconds > 300
    || value.load.duplicateDeliveries > 0
    || value.load.workerErrors > 0
  ) blockers.push("LOAD_TARGETS");

  requirePass("HOST_FAILOVER", value.hostFailover);
  if (
    !value.hostFailover.survivingWorkerContinued
    || value.hostFailover.recoverySeconds > 300
    || value.hostFailover.lostJobs > 0
    || value.hostFailover.duplicateDeliveries > 0
  ) blockers.push("HOST_FAILOVER_TARGETS");

  requirePass("ALERT_DRILLS", value.alerts);
  if (
    !value.alerts.primaryDelivered
    || !value.alerts.backupDelivered
    || !value.alerts.externalMonitorDetectedHostA
    || !value.alerts.externalMonitorDetectedHostB
    || value.alerts.maximumDetectionSeconds > 300
    || value.alerts.maximumAcknowledgementSeconds > 900
  ) blockers.push("ALERT_TARGETS");

  requirePass("DEAD_LETTER_DRILL", value.deadLetter);
  if (
    !value.deadLetter.created
    || !value.deadLetter.reviewed
    || !value.deadLetter.replayed
    || !value.deadLetter.resolved
    || value.deadLetter.unauthorizedReplays > 0
    || value.deadLetter.crossTenantMutations > 0
  ) blockers.push("DEAD_LETTER_TARGETS");

  requirePass("RESTART_RECOVERY", value.restartRecovery);
  if (
    !value.restartRecovery.automaticRestart
    || !value.restartRecovery.leaseRecoveryVerified
    || value.restartRecovery.recoverySeconds > 300
    || value.restartRecovery.duplicateDeliveries > 0
  ) blockers.push("RESTART_TARGETS");

  requirePass("DATABASE_STABILITY", value.database);
  if (
    value.database.observedPeakConnections > value.database.approvedConnectionLimit
    || value.database.poolTimeouts > 0
    || value.database.databaseErrors > 0
    || !value.database.sustainedLoadStable
  ) blockers.push("DATABASE_TARGETS");

  requirePass("MALWARE_SCANNER", value.malwareScanning);
  if (
    !value.malwareScanning.cleanFilePromoted
    || !value.malwareScanning.malwareRejected
    || !value.malwareScanning.outageFailedClosed
    || value.malwareScanning.signatureAgeHours > 6
  ) blockers.push("MALWARE_SCANNER_TARGETS");

  requirePass("LOG_RETENTION", value.logRetention);
  if (
    value.logRetention.retentionDays < 30
    || !value.logRetention.offHostRecoveryPassed
    || !value.logRetention.unauthorizedAccessDenied
  ) blockers.push("LOG_RETENTION_TARGETS");

  requirePass("BACKUP_RECOVERY", value.backupRecovery);
  if (
    !value.backupRecovery.backupAvailable
    || !value.backupRecovery.pointInTimeRecoveryAvailable
    || !value.backupRecovery.restoreRehearsalPassed
    || value.backupRecovery.measuredRpoMinutes > 15
    || value.backupRecovery.measuredRtoMinutes > 240
  ) blockers.push("BACKUP_RECOVERY_TARGETS");

  requirePass("EMAIL_PROVIDER", value.providers.email);
  if (!value.providers.email.controlledRecipientPilotPassed) blockers.push("EMAIL_PILOT");
  requirePass("WHATSAPP_PROVIDER", value.providers.whatsapp);
  if (!value.providers.whatsapp.controlledRecipientPilotPassed) blockers.push("WHATSAPP_PILOT");

  requirePass("OPERATIONS_APPROVAL", value.approvals.operations);
  requirePass("SECURITY_PRIVACY_APPROVAL", value.approvals.securityPrivacy);
  requirePass("TECHNICAL_APPROVAL", value.approvals.technical);
  requirePass("BUSINESS_PRODUCT_APPROVAL", value.approvals.businessProduct);

  return {
    ok: blockers.length === 0,
    environment: value.environment,
    runId: value.runId,
    blockerCodes: Array.from(new Set(blockers)),
    productionMigrationAuthorized: false,
    productionWorkerActivationAuthorized: false
  };
}
