import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { writeAuditLog } from "../src/lib/audit/audit-log";
import {
  ensureGradebookStorageBucket,
  getGradebookStorageClient
} from "../src/lib/storage/supabase-storage";
import type { TenantContext } from "../src/lib/tenant/context";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const BUCKET = "gradebook-private";
const SIGNED_URL_TTL_SECONDS = 2;
const SIGNED_URL_EXPIRY_WAIT_MS = 4_000;

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(`${name} does not identify a Supabase project reference.`);
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") throw new Error("Staging storage tooling is disabled in production mode.");
  if (process.env.GRADEBOOK_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("Unapproved staging project reference.");
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production database target detected. Operation refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) throw new Error("Both database URLs must target GradeBook staging.");

  const storageUrl = new URL(process.env.SUPABASE_URL ?? "");
  if (storageUrl.protocol !== "https:" || storageUrl.hostname.toLowerCase() !== `${STAGING_REF}.supabase.co`) {
    throw new Error("SUPABASE_URL must target the approved GradeBook staging project.");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required.");
  if (process.env.GRADEBOOK_STORAGE_BUCKET !== BUCKET) throw new Error("Unexpected GradeBook storage bucket.");
  if (process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("The server-only storage key must never be public.");
  }
}

async function loadSyntheticContext(): Promise<TenantContext> {
  const tenant = await db.tenant.findUnique({
    where: { slug: PILOT_SLUG },
    include: {
      tenantSettings: true,
      users: {
        where: { email: "principal@demo.jinacampus.test", status: "ACTIVE" },
        take: 1
      },
      institutions: {
        where: { status: "ACTIVE", code: { not: "SECONDARY-QA" } },
        include: {
          branches: {
            where: { status: "ACTIVE", code: "MAIN" },
            take: 1
          },
          academicYears: {
            where: { status: "ACTIVE", isActive: true },
            take: 1
          }
        },
        take: 1
      }
    }
  });
  const institution = tenant?.institutions[0];
  const branch = institution?.branches[0];
  const academicYear = institution?.academicYears[0];
  const user = tenant?.users[0];
  if (!tenant || !tenant.tenantSettings?.gradebookEnabled || !institution || !branch || !academicYear || !user) {
    throw new Error("Prepare the synthetic GradeBook pilot before running storage QA.");
  }
  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName ?? "Synthetic GradeBook Principal",
    userType: user.userType,
    activeBranchId: branch.id,
    activeBranchName: branch.name,
    accessibleBranchIds: [branch.id],
    activeAcademicYearId: academicYear.id,
    activeAcademicYearName: academicYear.name,
    institutionId: institution.id,
    institutionName: institution.name,
    correlationId: `gradebook-storage-qa-${randomUUID()}`,
    userAgent: "gradebook-staging-storage-probe"
  };
}

function sha256(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function objectUrl(baseUrl: string, bucket: string, objectKey: string) {
  const path = objectKey.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
}

async function main() {
  assertStaging();
  const ctx = await loadSyntheticContext();
  await ensureGradebookStorageBucket();
  const { client, bucket, importMaxBytes, reportCardMaxBytes, allowedMimeTypes } = getGradebookStorageClient();
  const { data: bucketData, error: bucketError } = await client.storage.getBucket(bucket);
  assert.ifError(bucketError);
  assert(bucketData, "GradeBook bucket is missing.");
  assert.equal(bucketData.public, false);
  assert.equal(bucket, BUCKET);
  assert.equal(importMaxBytes, 10_000_000);
  assert.equal(reportCardMaxBytes, 5_000_000);
  for (const required of [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/csv"
  ]) {
    assert(allowedMimeTypes.includes(required as (typeof allowedMimeTypes)[number]));
  }

  const runId = randomUUID();
  const prefix = `${ctx.tenantId}/${ctx.activeBranchId}/${ctx.activeAcademicYearId}/qa-storage/${runId}`;
  const csvKey = `${prefix}/marks-import.csv`;
  const pdfKey = `${prefix}/report-card.pdf`;
  const invalidKey = `${prefix}/blocked.json`;
  const csv = Buffer.from("Scholar Number,Student Name,Marks\nQA-001,Synthetic Student,42\n", "utf8");
  const pdf = Buffer.from("%PDF-1.4\n% JinaCampus synthetic staging storage probe\n%%EOF\n", "utf8");
  const uploaded: string[] = [];
  let completed = false;

  await writeAuditLog({
    ctx,
    action: "gradebook.qa.storage_probe_started",
    entityType: "GradebookStorageProbe",
    entityId: runId,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId,
    metadata: { syntheticOnly: true }
  });

  try {
    const csvUpload = await client.storage.from(bucket).upload(csvKey, csv, {
      contentType: "text/csv",
      cacheControl: "0",
      upsert: false
    });
    assert.ifError(csvUpload.error);
    uploaded.push(csvKey);

    const pdfUpload = await client.storage.from(bucket).upload(pdfKey, pdf, {
      contentType: "application/pdf",
      cacheControl: "0",
      upsert: false
    });
    assert.ifError(pdfUpload.error);
    uploaded.push(pdfKey);

    const invalidUpload = await client.storage.from(bucket).upload(invalidKey, Buffer.from("{}"), {
      contentType: "application/json",
      cacheControl: "0",
      upsert: false
    });
    assert(invalidUpload.error, "The bucket accepted a forbidden MIME type.");

    const directResponse = await fetch(objectUrl(process.env.SUPABASE_URL!, bucket, csvKey), {
      redirect: "manual"
    });
    assert.equal(directResponse.ok, false, "A private object was readable without authorization.");

    const csvDownload = await client.storage.from(bucket).download(csvKey);
    assert.ifError(csvDownload.error);
    assert(csvDownload.data, "The uploaded marks file could not be downloaded by the server.");
    const downloadedCsv = Buffer.from(await csvDownload.data.arrayBuffer());
    assert.equal(sha256(downloadedCsv), sha256(csv));

    const signed = await client.storage.from(bucket).createSignedUrl(csvKey, SIGNED_URL_TTL_SECONDS, {
      download: "marks-import.csv"
    });
    assert.ifError(signed.error);
    assert(signed.data?.signedUrl, "A signed URL was not created.");
    const signedResponse = await fetch(signed.data.signedUrl);
    assert.equal(signedResponse.ok, true, "The fresh signed URL was not usable.");
    assert.equal(sha256(Buffer.from(await signedResponse.arrayBuffer())), sha256(csv));

    await new Promise((resolve) => setTimeout(resolve, SIGNED_URL_EXPIRY_WAIT_MS));
    const expiredResponse = await fetch(signed.data.signedUrl, { redirect: "manual" });
    assert.equal(expiredResponse.ok, false, "The signed URL remained valid after its expiry window.");

    const removeResult = await client.storage.from(bucket).remove([csvKey, pdfKey]);
    assert.ifError(removeResult.error);
    uploaded.length = 0;

    const deletedCsv = await client.storage.from(bucket).download(csvKey);
    assert(deletedCsv.error, "A deleted marks-import object remained downloadable.");
    const deletedPdf = await client.storage.from(bucket).download(pdfKey);
    assert(deletedPdf.error, "A deleted report-card object remained downloadable.");
    const remaining = await client.storage.from(bucket).list(prefix, { limit: 10 });
    assert.ifError(remaining.error);
    assert.equal(remaining.data?.length ?? 0, 0, "The QA object prefix was not fully cleaned.");

    await writeAuditLog({
      ctx,
      action: "gradebook.qa.storage_probe_completed",
      entityType: "GradebookStorageProbe",
      entityId: runId,
      branchId: ctx.activeBranchId,
      academicYearId: ctx.activeAcademicYearId,
      after: {
        privateBucket: true,
        serverDownloadVerified: true,
        signedUrlExpiryVerified: true,
        forbiddenMimeRejected: true,
        cleanupVerified: true
      },
      metadata: { syntheticOnly: true }
    });
    completed = true;
    return {
      ok: true,
      target: "gradebook-mvp-staging",
      bucketPrivate: true,
      browserDirectAccessDenied: true,
      serverUploadDownload: "pass",
      signedUrlExpiry: "pass",
      forbiddenMime: "pass",
      deletionCleanup: "pass",
      qaAuditLedger: "pass"
    };
  } finally {
    if (uploaded.length > 0) {
      await client.storage.from(bucket).remove(uploaded);
    }
    if (!completed) {
      await writeAuditLog({
        ctx,
        action: "gradebook.qa.storage_probe_failed",
        entityType: "GradebookStorageProbe",
        entityId: runId,
        branchId: ctx.activeBranchId,
        academicYearId: ctx.activeAcademicYearId,
        metadata: { syntheticOnly: true }
      }).catch(() => undefined);
    }
  }
}

main()
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((error: unknown) => {
    const name = error instanceof Error ? error.name : "GradebookStorageProbeError";
    console.error(JSON.stringify({ ok: false, name }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
