import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import {
  ensureSchoolCastStorageBucket,
  getSchoolCastStorageClient
} from "../src/lib/storage/supabase-storage";
import type { TenantContext } from "../src/lib/tenant/context";
import {
  createSchoolCastAttachmentDownloadUrl,
  deleteSchoolCastAttachment,
  uploadSchoolCastAttachment
} from "../src/modules/schoolcast/services/attachment.service";
import { processSchoolCastAttachmentScans } from "../src/modules/schoolcast/services/attachment-scan-worker.service";
import { createSchoolCastCommunication } from "../src/modules/schoolcast/services/communication.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const CONTROL_SLUG = "gradebook-control";
const BUCKET = "schoolcast-private";
const SIGNED_URL_TTL_SECONDS = 2;
const SIGNED_URL_EXPIRY_WAIT_MS = 4_000;

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required.");
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(name + " does not identify a Supabase project.");
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") throw new Error("SchoolCast staging storage QA is disabled in production mode.");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("Unapproved SchoolCast staging reference.");
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production target detected. Storage QA refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) throw new Error("Database URLs do not target approved staging.");
  const storageUrl = new URL(process.env.SUPABASE_URL ?? "");
  if (storageUrl.protocol !== "https:" || storageUrl.hostname !== STAGING_REF + ".supabase.co") {
    throw new Error("Supabase Storage does not target approved staging.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Server-only staging storage key is required.");
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) throw new Error("Service-role storage key must remain server-only.");
  if (process.env.SCHOOLCAST_STORAGE_BUCKET !== BUCKET) throw new Error("Unexpected SchoolCast storage bucket.");
  if (process.env.SCHOOLCAST_MALWARE_SCANNER_MODE !== "CLAMAV") throw new Error("ClamAV is required for staging storage QA.");
}

async function loadContext(slug: string, email: string): Promise<TenantContext> {
  const user = await db.user.findFirst({
    where: { tenant: { slug }, email, status: "ACTIVE" },
    include: {
      tenant: true,
      branchAccesses: {
        where: { isActive: true, branch: { status: "ACTIVE" } },
        include: { branch: { include: { institution: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      },
      roleAssignments: {
        where: { isActive: true, role: { isActive: true } },
        include: { role: true }
      }
    }
  });
  if (!user) throw new Error("Synthetic storage QA identity is missing.");
  const primary = user.branchAccesses.find((access) => access.branch.code === "MAIN")
    ?? user.branchAccesses[0];
  if (!primary) throw new Error("Synthetic storage QA branch is missing.");
  const year = await db.academicYear.findFirst({
    where: {
      tenantId: user.tenantId,
      institutionId: primary.branch.institutionId,
      status: "ACTIVE",
      isActive: true
    },
    orderBy: { startDate: "desc" }
  });
  if (!year) throw new Error("Synthetic storage QA academic year is missing.");
  return {
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantSlug: user.tenant.slug,
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    userType: user.userType,
    activeBranchId: primary.branchId,
    activeBranchName: primary.branch.name,
    activeBranchCode: primary.branch.code,
    timeZone: primary.branch.timezone,
    accessibleBranchIds: user.branchAccesses.map((access) => access.branchId),
    activeAcademicYearId: year.id,
    activeAcademicYearName: year.name,
    institutionId: primary.branch.institution.id,
    institutionName: primary.branch.institution.name,
    roleCodes: user.roleAssignments.map((assignment) => assignment.role.code),
    roleLabels: user.roleAssignments.map((assignment) => assignment.role.name),
    userAgent: "schoolcast-staging-storage-probe",
    correlationId: "schoolcast-storage-qa:" + randomUUID()
  };
}

async function expectError(label: string, expected: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    const code = error instanceof AppError ? error.code : error instanceof Error ? error.message : "UNKNOWN_ERROR";
    assert(code === expected || code.startsWith(expected + ":"), label + ": received " + code);
    return;
  }
  throw new Error(label + ": expected a denial.");
}

function objectUrl(baseUrl: string, bucket: string, objectKey: string) {
  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  return baseUrl + "/storage/v1/object/" + encodeURIComponent(bucket) + "/" + path;
}

function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; data: Buffer }>) {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
async function main() {
  assertStaging();
  const principal = await loadContext(PILOT_SLUG, "principal@demo.jinacampus.test");
  const staff = await loadContext(PILOT_SLUG, "staff@demo.jinacampus.test");
  const control = await loadContext(CONTROL_SLUG, "control-principal@gradebook.qa.invalid");
  const runId = randomUUID();
  const communication = await createSchoolCastCommunication(principal, {
    type: "NOTICE",
    category: "STAGING_STORAGE_QA",
    title: "SchoolCast storage QA " + runId.slice(0, 8),
    content: "Synthetic draft used only to verify private attachment handling.",
    audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
    channels: ["IN_APP"]
  });

  await ensureSchoolCastStorageBucket();
  const { client, bucket, maxBytes, signedUrlTtlSeconds, allowedMimeTypes } = getSchoolCastStorageClient();
  const bucketResult = await client.storage.getBucket(bucket);
  assert.ifError(bucketResult.error);
  assert(bucketResult.data);
  assert.equal(bucketResult.data.public, false);
  assert.equal(bucket, BUCKET);
  assert.equal(maxBytes, 10_000_000);
  assert.equal(signedUrlTtlSeconds, 60);

  const staleAttachments = await db.schoolCastAttachment.findMany({
    where: {
      tenantId: principal.tenantId,
      deletedAt: null,
      scanStatus: { not: "REJECTED" },
      communication: { category: "STAGING_STORAGE_QA" }
    },
    select: { id: true, storagePath: true }
  });
  if (staleAttachments.length > 0) {
    await client.storage.from(bucket).remove(staleAttachments.map((attachment) => attachment.storagePath));
    await db.schoolCastAttachment.updateMany({
      where: { id: { in: staleAttachments.map((attachment) => attachment.id) }, tenantId: principal.tenantId },
      data: { deletedAt: new Date(), deletedById: principal.userId }
    });
    await db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        branchId: principal.activeBranchId,
        academicYearId: principal.activeAcademicYearId,
        actorUserId: principal.userId,
        action: "schoolcast.qa.storage_fixture_cleanup",
        entityType: "SchoolCastStorageProbe",
        entityId: runId,
        metadataJson: { syntheticOnly: true, attachmentCount: staleAttachments.length }
      }
    });
  }

  for (const mime of ["application/pdf", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]) {
    assert(allowedMimeTypes.includes(mime as (typeof allowedMimeTypes)[number]));
  }

  await db.auditLog.create({
    data: {
      tenantId: principal.tenantId,
      branchId: principal.activeBranchId,
      academicYearId: principal.activeAcademicYearId,
      actorUserId: principal.userId,
      action: "schoolcast.qa.storage_probe_started",
      entityType: "SchoolCastStorageProbe",
      entityId: runId,
      metadataJson: { syntheticOnly: true, scanner: "CLAMAV" }
    }
  });

  let cleanAttachmentId: string | null = null;
  let cleanStoragePath: string | null = null;
  let infectedAttachmentId: string | null = null;
  try {
    const cleanBytes = Buffer.from("%PDF-1.4\n% Synthetic clean SchoolCast staging probe\n%%EOF\n", "utf8");
    const cleanFile = new File([cleanBytes], "synthetic-clean.pdf", { type: "application/pdf" });
    const clean = await uploadSchoolCastAttachment(principal, {
      communicationId: communication.id,
      file: cleanFile
    });
    cleanAttachmentId = clean.id;
    assert.equal(clean.scanStatus, "PENDING");
    const cleanPending = await db.schoolCastAttachment.findFirstOrThrow({
      where: { id: clean.id, tenantId: principal.tenantId },
      select: { storagePath: true, scanStatus: true }
    });
    assert(cleanPending.storagePath.includes("/schoolcast/quarantine/"));
    cleanStoragePath = cleanPending.storagePath;

    await expectError(
      "forbidden MIME",
      "SCHOOLCAST_ATTACHMENT_TYPE_NOT_ALLOWED",
      () => uploadSchoolCastAttachment(principal, {
        communicationId: communication.id,
        file: new File([Buffer.from("{}")], "blocked.json", { type: "application/json" })
      })
    );
    await expectError(
      "Staff attachment access",
      "FORBIDDEN_PERMISSION",
      () => createSchoolCastAttachmentDownloadUrl(
        staff,
        { communicationId: communication.id },
        clean.id
      )
    );
    await expectError(
      "disabled cross-tenant attachment access",
      "SCHOOLCAST_NOT_ENABLED",
      () => createSchoolCastAttachmentDownloadUrl(
        control,
        { communicationId: communication.id },
        clean.id
      )
    );

    const scanClean = await processSchoolCastAttachmentScans({
      limit: 25,
      workerId: "schoolcast-storage-clean-" + runId,
      leaseSeconds: 30
    });
    assert(scanClean.safe >= 1);
    const cleanSafe = await db.schoolCastAttachment.findFirstOrThrow({
      where: { id: clean.id, tenantId: principal.tenantId },
      select: {
        storagePath: true,
        scanStatus: true,
        scanAttemptCount: true,
        scanEngine: true,
        scanFailureCode: true
      }
    });
    assert.equal(cleanSafe.scanStatus, "SAFE");
    assert.equal(cleanSafe.scanAttemptCount, 1);
    assert.equal(cleanSafe.scanEngine, "clamav");
    assert.equal(cleanSafe.scanFailureCode, null);
    assert(cleanSafe.storagePath.includes("/schoolcast/safe/"));
    cleanStoragePath = cleanSafe.storagePath;

    const direct = await fetch(objectUrl(process.env.SUPABASE_URL!, bucket, cleanSafe.storagePath), {
      redirect: "manual"
    });
    assert.equal(direct.ok, false, "Private object was readable without authorization.");

    const signed = await createSchoolCastAttachmentDownloadUrl(
      principal,
      { communicationId: communication.id },
      clean.id
    );
    assert.equal(signed.expiresInSeconds, 60);
    const signedResponse = await fetch(signed.signedUrl);
    assert.equal(signedResponse.ok, true);
    assert.deepEqual(Buffer.from(await signedResponse.arrayBuffer()), cleanBytes);

    const shortSigned = await client.storage.from(bucket).createSignedUrl(
      cleanSafe.storagePath,
      SIGNED_URL_TTL_SECONDS
    );
    assert.ifError(shortSigned.error);
    assert(shortSigned.data?.signedUrl);
    assert.equal((await fetch(shortSigned.data.signedUrl)).ok, true);
    await new Promise((resolve) => setTimeout(resolve, SIGNED_URL_EXPIRY_WAIT_MS));
    assert.equal(
      (await fetch(shortSigned.data.signedUrl, { redirect: "manual" })).ok,
      false,
      "Signed URL remained usable after expiry."
    );

    const eicar = [
      "X5O!P%@AP[4",
      String.fromCharCode(92),
      "PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
    ].join("");
    const infectedBytes = createStoredZip([
      {
        name: "[Content_Types].xml",
        data: Buffer.from("<Types></Types>", "utf8")
      },
      {
        name: "xl/workbook.xml",
        data: Buffer.from("<workbook></workbook>", "utf8")
      },
      {
        name: "eicar.com",
        data: Buffer.from(eicar, "ascii")
      }
    ]);
    const infected = await uploadSchoolCastAttachment(principal, {
      communicationId: communication.id,
      file: new File(
        [infectedBytes],
        "synthetic-infected.xlsx",
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      )
    });
    infectedAttachmentId = infected.id;
    const scanInfected = await processSchoolCastAttachmentScans({
      limit: 25,
      workerId: "schoolcast-storage-infected-" + runId,
      leaseSeconds: 30
    });
    const infectedState = await db.schoolCastAttachment.findFirstOrThrow({
      where: { id: infected.id, tenantId: principal.tenantId },
      select: { scanStatus: true, scanFailureCode: true, scanAttemptCount: true }
    });
    if (scanInfected.rejected < 1) {
      throw new Error(
        "SCHOOLCAST_EICAR_NOT_REJECTED:" +
        JSON.stringify({ worker: scanInfected, attachment: infectedState })
      );
    }
    const rejected = await db.schoolCastAttachment.findFirstOrThrow({
      where: { id: infected.id, tenantId: principal.tenantId },
      select: { storagePath: true, scanStatus: true, scanFailureCode: true }
    });
    assert.equal(rejected.scanStatus, "REJECTED");
    assert.equal(rejected.scanFailureCode, "SCHOOLCAST_ATTACHMENT_MALWARE_DETECTED");
    const rejectedDownload = await client.storage.from(bucket).download(rejected.storagePath);
    assert(rejectedDownload.error, "Rejected malware object remained in private storage.");

    await deleteSchoolCastAttachment(
      principal,
      { communicationId: communication.id },
      clean.id
    );
    cleanAttachmentId = null;
    const deletedDownload = await client.storage.from(bucket).download(cleanSafe.storagePath);
    assert(deletedDownload.error, "Deleted clean object remained in private storage.");
    const cleanRow = await db.schoolCastAttachment.findFirstOrThrow({
      where: { id: clean.id, tenantId: principal.tenantId },
      select: { deletedAt: true }
    });
    assert(cleanRow.deletedAt);

    const actions = await db.auditLog.findMany({
      where: {
        tenantId: principal.tenantId,
        entityId: { in: [clean.id, infected.id] },
        action: {
          in: [
            "schoolcast.attachment.uploaded",
            "schoolcast.attachment.scan_started",
            "schoolcast.attachment.scan_safe",
            "schoolcast.attachment.scan_rejected",
            "schoolcast.attachment.deleted"
          ]
        }
      },
      select: { action: true }
    });
    const actionSet = new Set(actions.map((action) => action.action));
    for (const expected of [
      "schoolcast.attachment.uploaded",
      "schoolcast.attachment.scan_started",
      "schoolcast.attachment.scan_safe",
      "schoolcast.attachment.scan_rejected",
      "schoolcast.attachment.deleted"
    ]) {
      assert(actionSet.has(expected), "Missing attachment audit evidence: " + expected + ".");
    }

    await db.auditLog.create({
      data: {
        tenantId: principal.tenantId,
        branchId: principal.activeBranchId,
        academicYearId: principal.activeAcademicYearId,
        actorUserId: principal.userId,
        action: "schoolcast.qa.storage_probe_completed",
        entityType: "SchoolCastStorageProbe",
        entityId: runId,
        afterJson: {
          privateBucket: true,
          quarantine: true,
          cleanScan: true,
          malwareRejected: true,
          signedAccess: true,
          signedExpiry: true,
          authorizationDenied: true,
          cleanup: true
        },
        metadataJson: { syntheticOnly: true, scanner: "CLAMAV" }
      }
    });

    return {
      ok: true,
      target: "gradebook-mvp-staging",
      bucketPrivate: true,
      quarantineToSafe: "pass",
      malwareRejection: "pass",
      browserDirectAccessDenied: true,
      signedDownload: "pass",
      signedUrlExpiry: "pass",
      forbiddenMime: "pass",
      roleAndCrossTenantDenial: "pass",
      deletionCleanup: "pass",
      auditLedger: "pass"
    };
  } finally {
    if (cleanAttachmentId && cleanStoragePath) {
      await client.storage.from(bucket).remove([cleanStoragePath]).catch(() => undefined);
      await db.schoolCastAttachment.updateMany({
        where: { id: cleanAttachmentId, tenantId: principal.tenantId, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: principal.userId }
      }).catch(() => undefined);
    }
    if (infectedAttachmentId) {
      const row = await db.schoolCastAttachment.findFirst({
        where: { id: infectedAttachmentId },
        select: { storagePath: true, scanStatus: true }
      }).catch(() => null);
      if (row) {
        await client.storage.from(bucket).remove([row.storagePath]).catch(() => undefined);
        if (row.scanStatus !== "REJECTED") {
          await db.schoolCastAttachment.updateMany({
            where: { id: infectedAttachmentId, tenantId: principal.tenantId, deletedAt: null },
            data: { deletedAt: new Date(), deletedById: principal.userId }
          }).catch(() => undefined);
        }
      }
    }
  }
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : "SchoolCastStorageProbeError",
      code: error instanceof AppError ? error.code : error instanceof Error ? error.message : "UNKNOWN_ERROR"
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });