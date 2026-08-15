import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { getSchoolCastStorageClient } from "../src/lib/storage/supabase-storage";
import type { TenantContext } from "../src/lib/tenant/context";
import {
  deleteSchoolCastAttachment,
  uploadSchoolCastAttachment
} from "../src/modules/schoolcast/services/attachment.service";
import { processSchoolCastAttachmentScans } from "../src/modules/schoolcast/services/attachment-scan-worker.service";
import { createSchoolCastCommunication } from "../src/modules/schoolcast/services/communication.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const PRINCIPAL_EMAIL = "principal@demo.jinacampus.test";
const CATEGORY = "STAGING_SCANNER_RECOVERY_QA";

function assertStagingTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("SCHOOLCAST_SCANNER_RECOVERY_PRODUCTION_MODE_REFUSED");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("SCHOOLCAST_SCANNER_RECOVERY_STAGING_REF_INVALID");
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[name] ?? "";
    if (!value.includes(STAGING_REF) || value.includes(PRODUCTION_REF)) {
      throw new Error(`SCHOOLCAST_SCANNER_RECOVERY_${name}_TARGET_INVALID`);
    }
  }
}

async function loadPrincipalContext(): Promise<TenantContext> {
  const user = await db.user.findFirst({
    where: { tenant: { slug: PILOT_SLUG }, email: PRINCIPAL_EMAIL, status: "ACTIVE" },
    include: {
      tenant: true,
      branchAccesses: {
        where: { isActive: true, branch: { status: "ACTIVE" } },
        include: { branch: { include: { institution: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      },
      roleAssignments: { where: { isActive: true }, include: { role: true } }
    }
  });
  assert(user);
  const access = user.branchAccesses.find((candidate) => candidate.branch.code === "MAIN") ?? user.branchAccesses[0];
  assert(access);
  const year = await db.academicYear.findFirst({
    where: {
      tenantId: user.tenantId,
      institutionId: access.branch.institutionId,
      status: "ACTIVE",
      isActive: true
    },
    orderBy: { startDate: "desc" }
  });
  assert(year);
  return {
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantSlug: user.tenant.slug,
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    userType: user.userType,
    activeBranchId: access.branchId,
    activeBranchName: access.branch.name,
    activeBranchCode: access.branch.code,
    timeZone: access.branch.timezone,
    accessibleBranchIds: user.branchAccesses.map((candidate) => candidate.branchId),
    activeAcademicYearId: year.id,
    activeAcademicYearName: year.name,
    institutionId: access.branch.institution.id,
    institutionName: access.branch.institution.name,
    roleCodes: user.roleAssignments.map((assignment) => assignment.role.code),
    roleLabels: user.roleAssignments.map((assignment) => assignment.role.name),
    userAgent: "schoolcast-staging-scanner-recovery-qa",
    correlationId: `schoolcast-scanner-recovery:${randomUUID()}`
  };
}

async function activeFixture(ctx: TenantContext) {
  const fixture = await db.schoolCastAttachment.findFirst({
    where: {
      tenantId: ctx.tenantId,
      deletedAt: null,
      communication: { category: CATEGORY }
    },
    include: { communication: { select: { id: true } } },
    orderBy: { createdAt: "desc" }
  });
  assert(fixture, "Scanner recovery fixture is missing.");
  return fixture;
}

async function cleanupFixture(ctx: TenantContext) {
  const { client, bucket } = getSchoolCastStorageClient();
  const fixtures = await db.schoolCastAttachment.findMany({
    where: { tenantId: ctx.tenantId, deletedAt: null, communication: { category: CATEGORY } },
    select: { id: true, storagePath: true }
  });
  if (fixtures.length === 0) return;
  await client.storage.from(bucket).remove(fixtures.map((fixture) => fixture.storagePath));
  await db.schoolCastAttachment.updateMany({
    where: { id: { in: fixtures.map((fixture) => fixture.id) }, tenantId: ctx.tenantId },
    data: { deletedAt: new Date(), deletedById: ctx.userId }
  });
}

async function prepare() {
  const ctx = await loadPrincipalContext();
  await cleanupFixture(ctx);
  const communication = await createSchoolCastCommunication(ctx, {
    type: "NOTICE",
    category: CATEGORY,
    title: `Scanner recovery QA ${randomUUID().slice(0, 8)}`,
    content: "Synthetic attachment used to verify scanner outage and recovery.",
    audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
    channels: ["IN_APP"]
  });
  const bytes = Buffer.from("%PDF-1.4\n% Synthetic scanner recovery probe\n%%EOF\n", "utf8");
  const attachment = await uploadSchoolCastAttachment(ctx, {
    communicationId: communication.id,
    file: new File([bytes], "scanner-recovery.pdf", { type: "application/pdf" })
  });
  assert.equal(attachment.scanStatus, "PENDING");
  return { ok: true, phase: "prepare", scanStatus: attachment.scanStatus };
}

async function unavailable() {
  const ctx = await loadPrincipalContext();
  const fixture = await activeFixture(ctx);
  const result = await processSchoolCastAttachmentScans({
    limit: 1,
    concurrency: 1,
    workerId: `schoolcast-scanner-unavailable-${randomUUID()}`,
    leaseSeconds: 60
  });
  const failed = await db.schoolCastAttachment.findFirstOrThrow({
    where: { id: fixture.id, tenantId: ctx.tenantId },
    select: { scanStatus: true, scanFailureCode: true, scanAttemptCount: true, storagePath: true }
  });
  assert.equal(result.retrying, 1);
  assert.equal(failed.scanStatus, "FAILED");
  assert.equal(failed.scanFailureCode, "SCHOOLCAST_MALWARE_SCANNER_UNAVAILABLE");
  assert.equal(failed.scanAttemptCount, 1);
  assert(failed.storagePath.includes("/schoolcast/quarantine/"));
  const { client, bucket } = getSchoolCastStorageClient();
  const retained = await client.storage.from(bucket).download(failed.storagePath);
  assert.ifError(retained.error);
  assert.equal(await db.auditLog.count({
    where: { tenantId: ctx.tenantId, entityId: fixture.id, action: "schoolcast.attachment.scan_failed" }
  }), 1);
  return { ok: true, phase: "unavailable", quarantineRetained: true, retryScheduled: true };
}

async function recover() {
  const ctx = await loadPrincipalContext();
  const fixture = await activeFixture(ctx);
  await db.schoolCastAttachment.update({
    where: { id: fixture.id },
    data: { scanAvailableAt: new Date(Date.now() - 1_000) }
  });
  const result = await processSchoolCastAttachmentScans({
    limit: 1,
    concurrency: 1,
    workerId: `schoolcast-scanner-recovered-${randomUUID()}`,
    leaseSeconds: 60
  });
  const safe = await db.schoolCastAttachment.findFirstOrThrow({
    where: { id: fixture.id, tenantId: ctx.tenantId },
    select: { scanStatus: true, scanFailureCode: true, scanAttemptCount: true, storagePath: true }
  });
  assert.equal(result.safe, 1);
  assert.equal(safe.scanStatus, "SAFE");
  assert.equal(safe.scanFailureCode, null);
  assert.equal(safe.scanAttemptCount, 2);
  assert(safe.storagePath.includes("/schoolcast/safe/"));
  assert.equal(await db.auditLog.count({
    where: { tenantId: ctx.tenantId, entityId: fixture.id, action: "schoolcast.attachment.scan_safe" }
  }), 1);
  assert(fixture.communication);
  await deleteSchoolCastAttachment(ctx, { communicationId: fixture.communication.id }, fixture.id);
  return { ok: true, phase: "recover", safeAfterRetry: true, cleanup: true };
}

async function main() {
  assertStagingTarget();
  const command = process.argv[2];
  if (command === "prepare") return prepare();
  if (command === "unavailable") return unavailable();
  if (command === "recover") return recover();
  throw new Error("Use prepare, unavailable, or recover.");
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : "SchoolCastScannerRecoveryQaError",
      code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "SCHOOLCAST_SCANNER_RECOVERY_QA_FAILED"
    }));
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
