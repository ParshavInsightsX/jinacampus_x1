import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { processSchoolCastOutbox } from "../src/modules/schoolcast/services/outbox-worker.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number) {
  const raw = process.env[name];
  const value = raw ? Number.parseInt(raw, 10) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name}_INVALID`);
  return value;
}

function assertStagingTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("SCHOOLCAST_LOAD_QA_PRODUCTION_MODE_REFUSED");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("SCHOOLCAST_LOAD_QA_STAGING_REF_INVALID");
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[name] ?? "";
    if (!value.includes(STAGING_REF) || value.includes(PRODUCTION_REF)) {
      throw new Error(`SCHOOLCAST_LOAD_QA_${name}_TARGET_INVALID`);
    }
  }
}

async function main() {
  assertStagingTarget();
  const itemCount = boundedInteger("SCHOOLCAST_LOAD_QA_ITEMS", 500, 100, 5_000);
  const workerCount = boundedInteger("SCHOOLCAST_LOAD_QA_WORKERS", 5, 2, 20);
  const concurrency = boundedInteger("SCHOOLCAST_LOAD_QA_CONCURRENCY", 5, 1, 25);
  const staleLeaseCount = Math.min(10, Math.max(2, Math.floor(itemCount / 100)));
  const retryingCount = Math.min(25, Math.max(5, Math.floor(itemCount / 20)));
  const runId = randomUUID();
  const keyPrefix = `schoolcast-load-qa:${runId}:`;

  const tenant = await db.tenant.findUnique({
    where: { slug: PILOT_SLUG },
    select: {
      id: true,
      tenantSettings: {
        select: {
          schoolCastEnabled: true,
          schoolCastInAppEnabled: true,
          schoolCastDeliveryMode: true
        }
      }
    }
  });
  assert(tenant?.tenantSettings, "Synthetic staging pilot settings are missing.");
  assert.equal(tenant.tenantSettings.schoolCastEnabled, true);
  assert.equal(tenant.tenantSettings.schoolCastInAppEnabled, true);
  assert.equal(tenant.tenantSettings.schoolCastDeliveryMode, "DRY_RUN");

  const communication = await db.schoolCastCommunication.findFirst({
    where: {
      tenantId: tenant.id,
      status: "PUBLISHED",
      currentVersionId: { not: null },
      branchId: { not: null },
      academicYearId: { not: null }
    },
    select: {
      id: true,
      currentVersionId: true,
      branchId: true,
      academicYearId: true,
      updatedById: true
    },
    orderBy: { publishedAt: "desc" }
  });
  assert(
    communication?.currentVersionId && communication.branchId && communication.academicYearId,
    "Run the SchoolCast staging functional QA before load certification."
  );

  const now = new Date();
  const payloadHash = createHash("sha256").update(keyPrefix).digest("hex");
  const regularRows = Array.from({ length: itemCount }, (_, index) => ({
    tenantId: tenant.id,
    branchId: communication.branchId,
    academicYearId: communication.academicYearId,
    schoolCastCommunicationId: communication.id,
    communicationVersionId: communication.currentVersionId,
    channel: "IN_APP" as const,
    templateKey: "schoolcast.load_qa",
    recipientType: "USER" as const,
    recipientId: communication.updatedById,
    payloadJson: { syntheticOnly: true, ordinal: index },
    payloadHash,
    status: index < retryingCount ? "RETRYING" as const : "QUEUED" as const,
    mode: "DRY_RUN" as const,
    idempotencyKey: `${keyPrefix}regular:${index}`,
    scheduledFor: new Date(now.getTime() - 1_000),
    availableAt: new Date(now.getTime() - 1_000)
  }));

  const createdIds: string[] = [];
  let featureStateRestored = false;
  let certification: {
    durationMs: number;
    throughputPerSecond: number;
    workerRuns: number;
    recovered: number;
    simulated: number;
    workerErrors: number;
  } | null = null;

  try {
    for (let offset = 0; offset < regularRows.length; offset += 250) {
      await db.notificationOutbox.createMany({ data: regularRows.slice(offset, offset + 250) });
    }
    const regular = await db.notificationOutbox.findMany({
      where: { idempotencyKey: { startsWith: `${keyPrefix}regular:` } },
      select: { id: true }
    });
    assert.equal(regular.length, itemCount);
    createdIds.push(...regular.map((row) => row.id));

    const duplicate = await db.notificationOutbox.createMany({ data: regularRows, skipDuplicates: true });
    assert.equal(duplicate.count, 0, "Idempotency keys accepted duplicate queue rows.");

    await db.tenantSettings.update({ where: { tenantId: tenant.id }, data: { schoolCastEnabled: false } });
    const disabledProbe = await processSchoolCastOutbox({
      limit: concurrency,
      concurrency,
      workerId: `schoolcast-load-disabled-${runId}`,
      leaseSeconds: 60
    });
    assert.equal(disabledProbe.claimed, 0, "Feature-disabled tenant still yielded queue claims.");
    assert.equal(await db.notificationOutbox.count({
      where: { id: { in: createdIds }, status: { in: ["QUEUED", "RETRYING"] } }
    }), itemCount);
    await db.tenantSettings.update({ where: { tenantId: tenant.id }, data: { schoolCastEnabled: true } });
    featureStateRestored = true;

    for (let index = 0; index < staleLeaseCount; index += 1) {
      const stale = await db.notificationOutbox.create({
        data: {
          tenantId: tenant.id,
          branchId: communication.branchId,
          academicYearId: communication.academicYearId,
          schoolCastCommunicationId: communication.id,
          communicationVersionId: communication.currentVersionId,
          channel: "IN_APP",
          templateKey: "schoolcast.load_qa",
          recipientType: "USER",
          recipientId: communication.updatedById,
          payloadJson: { syntheticOnly: true, staleLease: true, ordinal: index },
          payloadHash,
          status: "SENDING",
          mode: "DRY_RUN",
          idempotencyKey: `${keyPrefix}stale:${index}`,
          scheduledFor: new Date(now.getTime() - 120_000),
          availableAt: new Date(now.getTime() - 120_000),
          attemptCount: 0,
          lockedAt: new Date(now.getTime() - 120_000),
          lockOwner: `crashed-worker-${index}`,
          leaseUntil: new Date(now.getTime() - 60_000)
        },
        select: { id: true }
      });
      createdIds.push(stale.id);
      await db.schoolCastDeliveryAttempt.create({
        data: {
          tenantId: tenant.id,
          outboxId: stale.id,
          attemptNo: 1,
          requestHash: payloadHash,
          status: "STARTED"
        }
      });
    }

    const totalItems = itemCount + staleLeaseCount;
    const startedAt = Date.now();
    let workerRuns = 0;
    let recovered = 0;
    let simulated = 0;
    let workerErrors = 0;
    const maxRounds = Math.ceil(totalItems / Math.max(1, workerCount * concurrency)) + 80;

    for (let round = 0; round < maxRounds; round += 1) {
      const pending = await db.notificationOutbox.count({
        where: { id: { in: createdIds }, status: { in: ["QUEUED", "RETRYING", "SENDING"] } }
      });
      if (pending === 0) break;
      const runs = await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) =>
        processSchoolCastOutbox({
          limit: concurrency,
          concurrency,
          workerId: `schoolcast-load-${runId}-${round}-${workerIndex}`,
          leaseSeconds: 60
        })
      ));
      workerRuns += runs.length;
      recovered += runs.reduce((sum, run) => sum + run.recovered, 0);
      simulated += runs.reduce((sum, run) => sum + run.simulated, 0);
      workerErrors += runs.reduce((sum, run) => sum + run.workerErrors, 0);
      const progress = runs.reduce((sum, run) => sum + run.claimed + run.recovered, 0);
      if (progress === 0) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }

    const durationMs = Date.now() - startedAt;
    const finalRows = await db.notificationOutbox.findMany({
      where: { id: { in: createdIds } },
      select: { id: true, status: true }
    });
    assert.equal(finalRows.length, totalItems);
    assert(finalRows.every((row) => row.status === "SENT"), "Not all synthetic queue rows reached SENT.");
    assert.equal(workerErrors, 0, "One or more worker tasks rejected unexpectedly.");
    assert(recovered >= staleLeaseCount, "Expired worker leases were not fully recovered.");
    assert.equal(simulated, totalItems);

    const staleIds = createdIds.slice(-staleLeaseCount);
    const staleAttempts = await db.schoolCastDeliveryAttempt.findMany({
      where: { outboxId: { in: staleIds } },
      select: { outboxId: true, attemptNo: true, status: true }
    });
    for (const staleId of staleIds) {
      const attempts = staleAttempts.filter((attempt) => attempt.outboxId === staleId);
      assert.deepEqual(attempts.map((attempt) => attempt.attemptNo).sort(), [1, 2]);
      assert.equal(attempts.find((attempt) => attempt.attemptNo === 1)?.status, "RETRYABLE_FAILURE");
      assert.equal(attempts.find((attempt) => attempt.attemptNo === 2)?.status, "DRY_RUN");
    }

    assert.equal(await db.auditLog.count({
      where: { tenantId: tenant.id, entityId: { in: staleIds }, action: "schoolcast.outbox.lease_recovered" }
    }), staleLeaseCount);
    assert.equal(await db.auditLog.count({
      where: { tenantId: tenant.id, entityId: { in: createdIds }, action: "schoolcast.outbox.simulated" }
    }), totalItems);

    const attemptCountBeforeReplay = await db.schoolCastDeliveryAttempt.count({ where: { outboxId: { in: createdIds } } });
    await Promise.all(Array.from({ length: workerCount }, (_, workerIndex) =>
      processSchoolCastOutbox({
        limit: concurrency,
        concurrency,
        workerId: `schoolcast-load-replay-${runId}-${workerIndex}`,
        leaseSeconds: 60
      })
    ));
    assert.equal(
      await db.schoolCastDeliveryAttempt.count({ where: { outboxId: { in: createdIds } } }),
      attemptCountBeforeReplay,
      "A replay created duplicate delivery attempts."
    );

    certification = {
      durationMs,
      throughputPerSecond: Number((totalItems / Math.max(1, durationMs / 1_000)).toFixed(2)),
      workerRuns,
      recovered,
      simulated,
      workerErrors
    };
  } finally {
    if (!featureStateRestored) {
      await db.tenantSettings.update({ where: { tenantId: tenant.id }, data: { schoolCastEnabled: true } });
    }
    if (createdIds.length > 0) {
      await db.auditLog.deleteMany({ where: { tenantId: tenant.id, entityId: { in: createdIds } } });
      await db.notificationOutbox.deleteMany({ where: { tenantId: tenant.id, id: { in: createdIds } } });
    }
  }

  assert(certification);
  await db.auditLog.create({
    data: {
      tenantId: tenant.id,
      branchId: communication.branchId,
      academicYearId: communication.academicYearId,
      actorUserId: null,
      action: "schoolcast.qa.worker_load_certified",
      entityType: "SchoolCastQaRun",
      entityId: runId,
      metadataJson: {
        syntheticOnly: true,
        deliveryMode: "DRY_RUN",
        externalProviderRequests: 0,
        itemCount,
        staleLeaseCount,
        retryingCount,
        workerCount,
        concurrency,
        ...certification
      }
    }
  });

  return {
    ok: true,
    target: "gradebook-mvp-staging",
    pilotTenant: PILOT_SLUG,
    profile: { itemCount, staleLeaseCount, retryingCount, workerCount, concurrency },
    certification,
    featureDisable: "pass",
    idempotentReplay: "pass",
    externalProviderRequests: 0
  };
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    const detail = error instanceof Error
      ? error.message.replace(/[^A-Za-z0-9 .:_-]/g, "").slice(0, 240)
      : "Unknown staging load QA error.";
    console.error(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : "SchoolCastLoadQaError",
      code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "SCHOOLCAST_LOAD_QA_FAILED",
      detail
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });