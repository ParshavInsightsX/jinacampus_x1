import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../src/lib/db";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const SOURCE_MARKERS = [
  "enqueueSchoolCastDomainEvent",
  "enqueueStaffAttendanceSchoolCastEvent",
  "enqueueStaffLeaveSchoolCastEvent",
  "enqueueCalendarSchoolCastEvents",
  "enqueueGradebookDomainEvent"
];

function assertStagingTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("SCHOOLCAST_READINESS_PRODUCTION_MODE_REFUSED");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) {
    throw new Error("SCHOOLCAST_READINESS_STAGING_REF_INVALID");
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[name] ?? "";
    if (!value.includes(STAGING_REF) || value.includes(PRODUCTION_REF)) {
      throw new Error(`SCHOOLCAST_READINESS_${name}_TARGET_INVALID`);
    }
  }
}

async function sourceFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  }));
  return files.flat();
}

async function findExternalSourceProducers() {
  const modulesRoot = path.join(process.cwd(), "src", "modules");
  const files = await sourceFiles(modulesRoot);
  const matches: string[] = [];
  for (const file of files) {
    if (file.includes(`${path.sep}schoolcast${path.sep}`)) continue;
    const content = await readFile(file, "utf8");
    if (SOURCE_MARKERS.some((marker) => content.includes(marker))) {
      matches.push(path.relative(process.cwd(), file).replaceAll("\\", "/"));
    }
  }
  return matches.sort();
}

function sourceProducerCoverage(files: readonly string[]) {
  return {
    studentAttendance: files.some((file) => file.endsWith("academia/services/student-attendance.service.ts")),
    staffAttendance: files.some((file) =>
      file.endsWith("staffboard-lite/services/staff-attendance.service.ts")
      || file.endsWith("staffboard-lite/services/staff-qr.service.ts")),
    staffLeave: files.some((file) => file.endsWith("staffboard-lite/services/staff-leave.service.ts")),
    calendar: files.some((file) => file.endsWith("campus-core/calendar/calendar-service.ts")),
    gradebook: files.some((file) =>
      file.endsWith("gradebook/services/domain-event.service.ts")
      || file.endsWith("gradebook/services/report-card.service.ts"))
  };
}

async function main() {
  assertStagingTarget();

  const tenant = await db.tenant.findUnique({
    where: { slug: PILOT_SLUG },
    select: {
      id: true,
      tenantSettings: {
        select: {
          schoolCastEnabled: true,
          schoolCastInAppEnabled: true,
          schoolCastEmailEnabled: true,
          schoolCastWhatsAppEnabled: true,
          schoolCastAutomationEnabled: true,
          schoolCastDeliveryMode: true
        }
      }
    }
  });
  assert(tenant?.tenantSettings, "Synthetic SchoolCast pilot settings are missing.");

  const [
    enabledTenantCount,
    externalProviders,
    approvedExternalTemplates,
    externalConsentRecords,
    externalDeliveryRows,
    domainEvents,
    latestLoadCertification,
    latestStorageCertification,
    latestSourceCertification,
    externalSourceProducers
  ] = await Promise.all([
    db.tenantSettings.count({ where: { schoolCastEnabled: true } }),
    db.schoolCastProviderConfiguration.findMany({
      where: { tenantId: tenant.id, channel: { in: ["EMAIL", "WHATSAPP"] } },
      select: { channel: true, mode: true, status: true, isDefault: true, healthStatus: true }
    }),
    db.schoolCastTemplateVersion.groupBy({
      by: ["channel", "status"],
      where: { tenantId: tenant.id, channel: { in: ["EMAIL", "WHATSAPP"] }, status: "APPROVED" },
      _count: { _all: true }
    }),
    db.schoolCastConsentRecord.groupBy({
      by: ["channel", "status"],
      where: { tenantId: tenant.id, channel: { in: ["EMAIL", "WHATSAPP"] } },
      _count: { _all: true }
    }),
    db.notificationOutbox.count({
      where: {
        tenantId: tenant.id,
        schoolCastCommunicationId: { not: null },
        channel: { in: ["EMAIL", "WHATSAPP"] },
        mode: { not: "DRY_RUN" }
      }
    }),
    db.schoolCastDomainEvent.groupBy({
      by: ["sourceModule", "status"],
      where: { tenantId: tenant.id },
      _count: { _all: true }
    }),
    db.auditLog.findFirst({
      where: { tenantId: tenant.id, action: "schoolcast.qa.worker_load_certified" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    db.auditLog.findFirst({
      where: { tenantId: tenant.id, action: "schoolcast.qa.storage_probe_completed" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    db.auditLog.findFirst({
      where: { tenantId: tenant.id, action: "schoolcast.qa.source_cutover_certified" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true }
    }),
    findExternalSourceProducers()
  ]);

  const producerCoverage = sourceProducerCoverage(externalSourceProducers);
  const allRequiredProducersImplemented = Object.values(producerCoverage).every(Boolean);
  const state = tenant.tenantSettings;
  assert.equal(state.schoolCastEnabled, true);
  assert.equal(state.schoolCastInAppEnabled, true);
  assert.equal(state.schoolCastEmailEnabled, false);
  assert.equal(state.schoolCastWhatsAppEnabled, false);
  assert.equal(state.schoolCastAutomationEnabled, false);
  assert.equal(state.schoolCastDeliveryMode, "DRY_RUN");
  assert.equal(externalDeliveryRows, 0, "Staging contains non-DRY_RUN external delivery rows.");

  return {
    ok: true,
    target: "gradebook-mvp-staging",
    pilotTenant: PILOT_SLUG,
    pilotIsolation: {
      enabledTenantCount,
      deliveryMode: state.schoolCastDeliveryMode,
      inAppOnly: !state.schoolCastEmailEnabled && !state.schoolCastWhatsAppEnabled,
      sourceAutomationDisabled: !state.schoolCastAutomationEnabled
    },
    workerEvidence: {
      loadCertificationPresent: Boolean(latestLoadCertification),
      loadCertifiedAt: latestLoadCertification?.createdAt.toISOString() ?? null
    },
    storageEvidence: {
      certificationPresent: Boolean(latestStorageCertification),
      certifiedAt: latestStorageCertification?.createdAt.toISOString() ?? null
    },
    externalDelivery: {
      providerConfigurations: externalProviders,
      approvedTemplates: approvedExternalTemplates,
      consentRecords: externalConsentRecords,
      nonDryRunOutboxRows: externalDeliveryRows,
      status: "BLOCKED_PENDING_PROVIDER_AND_BUSINESS_APPROVAL"
    },
    sourceCutover: {
      producerCoverage,
      externalProducerFiles: externalSourceProducers,
      stagedDomainEvents: domainEvents,
      certificationPresent: Boolean(latestSourceCertification),
      certifiedAt: latestSourceCertification?.createdAt.toISOString() ?? null,
      feeDesk: "EXCLUDED_MODULE_NOT_AVAILABLE",
      status: allRequiredProducersImplemented && latestSourceCertification
        ? "STAGING_CUTOVER_CERTIFIED_PRODUCTION_CUTOVER_PENDING"
        : allRequiredProducersImplemented
          ? "IMPLEMENTED_PENDING_DB_BACKED_CUTOVER_CERTIFICATION"
          : "BLOCKED_MISSING_REQUIRED_SOURCE_PRODUCER"
    },
    hostedOperations: {
      durableWorkerEntrypoint: "IMPLEMENTED",
      schedulerProvisioning: "BLOCKED_EXTERNAL_HOSTED_SERVICE_NOT_PROVISIONED",
      monitoringAndAlerts: "BLOCKED_EXTERNAL_DESTINATION_AND_ON_CALL_APPROVAL",
      hostedMalwareScanner: "BLOCKED_EXTERNAL_PRIVATE_SCANNER_NOT_PROVISIONED"
    },
    productionRecovery: "BLOCKED_PENDING_BACKUP_PITR_AND_RESTORE_EVIDENCE",
    formalApprovals: "BLOCKED_PENDING_OPERATIONS_TECHNICAL_SECURITY_AND_BUSINESS_SIGN_OFF",
    productionReadiness: "BLOCKED"
  };
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "SCHOOLCAST_READINESS_AUDIT_FAILED"
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });