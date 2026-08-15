import { createHash } from "node:crypto";
import { Prisma, type NotificationOutbox } from "@prisma/client";

import { db } from "@/lib/db";
import { processSchoolCastOutboxSchema } from "@/modules/schoolcast/schemas";
import { settleWithConcurrency } from "@/modules/schoolcast/services/worker-concurrency";
import {
  sanitizeSchoolCastProviderError,
  sendSchoolCastProviderMessage,
  type SchoolCastProviderResult
} from "@/modules/schoolcast/services/provider-adapters";

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function requestHash(outbox: Pick<NotificationOutbox, "idempotencyKey" | "payloadHash" | "channel" | "mode">) {
  return createHash("sha256").update(JSON.stringify({
    idempotencyKey: outbox.idempotencyKey,
    payloadHash: outbox.payloadHash,
    channel: outbox.channel,
    mode: outbox.mode
  })).digest("hex");
}

function retryDelaySeconds(attempt: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempt - 1)));
}

export type SchoolCastOutboxRunResult = {
  claimed: number;
  recovered: number;
  simulated: number;
  submitted: number;
  retrying: number;
  failed: number;
  expired: number;
  workerErrors: number;
};

type ClaimedOutboxRow = {
  id: string;
  tenantId: string;
};

type ClaimedOutcome = "simulated" | "submitted" | "retrying" | "failed" | "workerError" | null;

function safeWorkerErrorCode(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code)) {
    return `SCHOOLCAST_WORKER_DB_${error.code}`;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return "SCHOOLCAST_WORKER_DB_UNAVAILABLE";
  }
  return "SCHOOLCAST_OUTBOX_ITEM_FAILED";
}

async function recoverExpiredOutboxLeases(now: Date, limit: number) {
  const stale = await db.notificationOutbox.findMany({
    where: {
      schoolCastCommunicationId: { not: null },
      status: "SENDING",
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
    },
    select: { id: true, tenantId: true },
    orderBy: { leaseUntil: "asc" },
    take: limit
  });
  let recovered = 0;

  for (const candidate of stale) {
    const didRecover = await db.$transaction(async (tx) => {
      const outbox = await tx.notificationOutbox.findFirst({
        where: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          status: "SENDING",
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
        },
        select: {
          id: true,
          tenantId: true,
          branchId: true,
          academicYearId: true,
          attemptCount: true,
          lockOwner: true
        }
      });
      if (!outbox) return false;
      const startedAttempt = await tx.schoolCastDeliveryAttempt.findFirst({
        where: { tenantId: outbox.tenantId, outboxId: outbox.id, status: "STARTED" },
        orderBy: { attemptNo: "desc" },
        select: { id: true, attemptNo: true }
      });
      const attemptCount = Math.max(outbox.attemptCount, startedAttempt?.attemptNo ?? 0);
      const updated = await tx.notificationOutbox.updateMany({
        where: {
          id: outbox.id,
          tenantId: outbox.tenantId,
          status: "SENDING",
          lockOwner: outbox.lockOwner,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }]
        },
        data: {
          status: "RETRYING",
          availableAt: now,
          attemptCount,
          failureReason: "SCHOOLCAST_WORKER_LEASE_EXPIRED",
          lockedAt: null,
          lockOwner: null,
          leaseUntil: null
        }
      });
      if (updated.count !== 1) return false;
      if (startedAttempt) {
        await tx.schoolCastDeliveryAttempt.updateMany({
          where: { id: startedAttempt.id, status: "STARTED" },
          data: {
            status: "RETRYABLE_FAILURE",
            completedAt: now,
            errorCategory: "TRANSIENT",
            errorCode: "SCHOOLCAST_WORKER_LEASE_EXPIRED",
            errorMessage: "The delivery worker lease expired before completion."
          }
        });
      }
      await tx.auditLog.create({
        data: {
          tenantId: outbox.tenantId,
          branchId: outbox.branchId,
          academicYearId: outbox.academicYearId,
          actorUserId: null,
          action: "schoolcast.outbox.lease_recovered",
          entityType: "NotificationOutbox",
          entityId: outbox.id,
          metadataJson: { previousWorkerId: outbox.lockOwner, attemptCount }
        }
      });
      return true;
    });
    if (didRecover) recovered += 1;
  }
  return recovered;
}

async function claimOutboxItems(input: {
  workerId: string;
  now: Date;
  leaseUntil: Date;
  limit: number;
}) {
  return db.$transaction((tx) => tx.$queryRaw<ClaimedOutboxRow[]>(Prisma.sql`
    WITH candidates AS (
      SELECT outbox."id"
      FROM "notification_outbox" AS outbox
      INNER JOIN "tenant_settings" AS settings
        ON settings."tenantId" = outbox."tenantId"
      WHERE outbox."schoolCastCommunicationId" IS NOT NULL
        AND outbox."status" IN ('QUEUED', 'RETRYING')
        AND outbox."channel" IN ('IN_APP', 'EMAIL', 'WHATSAPP')
        AND outbox."availableAt" <= ${input.now}
        AND outbox."scheduledFor" <= ${input.now}
        AND (outbox."leaseUntil" IS NULL OR outbox."leaseUntil" < ${input.now})
        AND (outbox."expiresAt" IS NULL OR outbox."expiresAt" > ${input.now})
        AND settings."schoolCastEnabled" = TRUE
        AND outbox."mode" = settings."schoolCastDeliveryMode"
        AND (
          (outbox."channel" = 'IN_APP' AND settings."schoolCastInAppEnabled" = TRUE)
          OR (outbox."channel" = 'EMAIL' AND settings."schoolCastEmailEnabled" = TRUE)
          OR (outbox."channel" = 'WHATSAPP' AND settings."schoolCastWhatsAppEnabled" = TRUE)
        )
      ORDER BY outbox."priority" DESC, outbox."availableAt" ASC, outbox."createdAt" ASC
      FOR UPDATE OF outbox SKIP LOCKED
      LIMIT ${input.limit}
    )
    UPDATE "notification_outbox" AS outbox
    SET "status" = 'SENDING',
        "lockedAt" = ${input.now},
        "lockOwner" = ${input.workerId},
        "leaseUntil" = ${input.leaseUntil},
        "updatedAt" = ${input.now}
    FROM candidates
    WHERE outbox."id" = candidates."id"
    RETURNING outbox."id", outbox."tenantId"
  `));
}

async function releaseFailedOutboxClaim(
  candidate: ClaimedOutboxRow,
  workerId: string,
  error: unknown
) {
  const now = new Date();
  const errorCode = safeWorkerErrorCode(error);
  return db.$transaction(async (tx) => {
    const outbox = await tx.notificationOutbox.findFirst({
      where: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        status: "SENDING",
        lockOwner: workerId
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        academicYearId: true,
        attemptCount: true,
        maxAttempts: true,
        expiresAt: true
      }
    });
    if (!outbox) return false;
    const startedAttempt = await tx.schoolCastDeliveryAttempt.findFirst({
      where: { tenantId: outbox.tenantId, outboxId: outbox.id, status: "STARTED" },
      orderBy: { attemptNo: "desc" },
      select: { id: true, attemptNo: true }
    });
    const attemptCount = startedAttempt
      ? Math.max(outbox.attemptCount, startedAttempt.attemptNo)
      : outbox.attemptCount + 1;
    const retry = attemptCount < outbox.maxAttempts && (!outbox.expiresAt || outbox.expiresAt > now);
    const updated = await tx.notificationOutbox.updateMany({
      where: {
        id: outbox.id,
        tenantId: outbox.tenantId,
        status: "SENDING",
        lockOwner: workerId
      },
      data: {
        status: retry ? "RETRYING" : "UNDELIVERABLE",
        attemptCount,
        lastAttemptAt: now,
        availableAt: now,
        failedAt: retry ? null : now,
        failureReason: errorCode,
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null
      }
    });
    if (updated.count !== 1) return false;
    if (startedAttempt) {
      await tx.schoolCastDeliveryAttempt.updateMany({
        where: { id: startedAttempt.id, status: "STARTED" },
        data: {
          status: retry ? "RETRYABLE_FAILURE" : "PERMANENT_FAILURE",
          completedAt: now,
          errorCategory: retry ? "TRANSIENT" : "PERMANENT",
          errorCode,
          errorMessage: "The worker could not complete this delivery attempt."
        }
      });
    }
    await tx.auditLog.create({
      data: {
        tenantId: outbox.tenantId,
        branchId: outbox.branchId,
        academicYearId: outbox.academicYearId,
        actorUserId: null,
        action: "schoolcast.outbox.worker_error",
        entityType: "NotificationOutbox",
        entityId: outbox.id,
        metadataJson: { errorCode, attemptCount, retrying: retry }
      }
    });
    return true;
  });
}

async function processClaimedOutboxItemSafely(
  candidate: ClaimedOutboxRow,
  input: { workerId: string; leaseSeconds: number }
): Promise<ClaimedOutcome> {
  try {
    return await processClaimedOutboxItem(candidate, input);
  } catch (error) {
    await releaseFailedOutboxClaim(candidate, input.workerId, error);
    return "workerError";
  }
}
function unavailableProviderResult(): SchoolCastProviderResult {
  return {
    ok: false,
    retryable: false,
    errorCode: "SCHOOLCAST_PROVIDER_NOT_READY",
    errorMessage: "The configured provider is not ready for this delivery mode."
  };
}

async function processClaimedOutboxItem(
  candidate: ClaimedOutboxRow,
  input: { workerId: string; leaseSeconds: number }
): Promise<ClaimedOutcome> {
  const leaseUntil = new Date(Date.now() + input.leaseSeconds * 1000);
  const renewed = await db.notificationOutbox.updateMany({
    where: {
      id: candidate.id,
      tenantId: candidate.tenantId,
      status: "SENDING",
      lockOwner: input.workerId
    },
    data: { leaseUntil }
  });
  if (renewed.count !== 1) return null;

  const outbox = await db.notificationOutbox.findFirst({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: "SENDING", lockOwner: input.workerId },
    include: {
      providerConfig: true,
      channelPlan: { include: { template: true, templateVersion: true } },
      communicationVersion: { select: { title: true, summary: true, contentText: true, languageCode: true } }
    }
  });
  if (!outbox) return null;
  const attemptNo = outbox.attemptCount + 1;
  const attempt = await db.schoolCastDeliveryAttempt.create({
    data: {
      tenantId: outbox.tenantId,
      outboxId: outbox.id,
      attemptNo,
      requestHash: requestHash(outbox),
      status: "STARTED"
    }
  });

  const payload = { ...jsonRecord(outbox.payloadJson), ...(outbox.communicationVersion ?? {}) };
  let providerResult: SchoolCastProviderResult;
  if (
    outbox.mode !== "DRY_RUN"
    && (
      !outbox.providerConfig
      || outbox.providerConfig.status !== "READY"
      || outbox.providerConfig.mode !== outbox.mode
    )
  ) {
    providerResult = unavailableProviderResult();
  } else {
    try {
      providerResult = await sendSchoolCastProviderMessage({
        channel: outbox.channel,
        mode: outbox.mode,
        providerCode: outbox.providerConfig?.providerCode ?? null,
        secretRef: outbox.providerConfig?.secretRef ?? null,
        senderDisplayName: outbox.providerConfig?.senderDisplayName ?? null,
        senderIdentifierMasked: outbox.providerConfig?.senderIdentifierMasked ?? null,
        configurationJson: outbox.providerConfig?.configurationJson ?? null,
        recipientAddressEncrypted: outbox.recipientAddressEncrypted,
        templateName: outbox.channelPlan?.template?.providerTemplateName ?? null,
        languageCode: outbox.channelPlan?.templateVersion?.languageCode ?? outbox.channelPlan?.template?.languageCode ?? outbox.communicationVersion?.languageCode ?? null,
        payload,
        idempotencyKey: outbox.idempotencyKey
      });
    } catch (error) {
      providerResult = {
        ok: false,
        retryable: true,
        errorCode: "SCHOOLCAST_PROVIDER_EXECUTION_ERROR",
        errorMessage: sanitizeSchoolCastProviderError(error)
      };
    }
  }

  const completedAt = new Date();
  if (providerResult.ok) {
    const finalized = await db.$transaction(async (tx) => {
      const owned = await tx.notificationOutbox.updateMany({
        where: { id: outbox.id, tenantId: outbox.tenantId, status: "SENDING", lockOwner: input.workerId },
        data: {
          status: "SENT",
          attemptCount: attemptNo,
          lastAttemptAt: completedAt,
          sentAt: completedAt,
          failureReason: null,
          lockedAt: null,
          lockOwner: null,
          leaseUntil: null
        }
      });
      if (owned.count !== 1) return false;
      await tx.schoolCastDeliveryAttempt.update({
        where: { id: attempt.id },
        data: {
          status: providerResult.status === "DRY_RUN" ? "DRY_RUN" : "SUBMITTED",
          providerMessageId: providerResult.providerMessageId,
          completedAt
        }
      });
      await tx.schoolCastDeliveryEvent.create({
        data: {
          tenantId: outbox.tenantId,
          attemptId: attempt.id,
          providerEventId: `${providerResult.status.toLowerCase()}:${providerResult.providerMessageId}`,
          canonicalStatus: "SUBMITTED",
          providerStatus: providerResult.providerStatus,
          occurredAt: completedAt,
          payloadHash: outbox.payloadHash,
          signatureVerified: providerResult.status === "DRY_RUN"
        }
      });
      await tx.auditLog.create({
        data: {
          tenantId: outbox.tenantId,
          branchId: outbox.branchId,
          academicYearId: outbox.academicYearId,
          actorUserId: null,
          action: providerResult.status === "DRY_RUN" ? "schoolcast.outbox.simulated" : "schoolcast.outbox.submitted",
          entityType: "NotificationOutbox",
          entityId: outbox.id,
          metadataJson: {
            channel: outbox.channel,
            mode: outbox.mode,
            attemptNo,
            providerCode: outbox.providerConfig?.providerCode ?? "DRY_RUN",
            providerMessageIdHash: createHash("sha256").update(providerResult.providerMessageId).digest("hex")
          }
        }
      });
      return true;
    });
    if (!finalized) return null;
    return providerResult.status === "DRY_RUN" ? "simulated" : "submitted";
  }

  const retry = providerResult.retryable
    && attemptNo < outbox.maxAttempts
    && (!outbox.expiresAt || outbox.expiresAt > completedAt);
  const safeError = sanitizeSchoolCastProviderError(providerResult.errorMessage);
  const finalized = await db.$transaction(async (tx) => {
    const owned = await tx.notificationOutbox.updateMany({
      where: { id: outbox.id, tenantId: outbox.tenantId, status: "SENDING", lockOwner: input.workerId },
      data: {
        status: retry ? "RETRYING" : "UNDELIVERABLE",
        attemptCount: attemptNo,
        lastAttemptAt: completedAt,
        availableAt: retry ? new Date(completedAt.getTime() + retryDelaySeconds(attemptNo) * 1000) : completedAt,
        failedAt: retry ? null : completedAt,
        failureReason: providerResult.errorCode,
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null
      }
    });
    if (owned.count !== 1) return false;
    await tx.schoolCastDeliveryAttempt.update({
      where: { id: attempt.id },
      data: {
        status: retry ? "RETRYABLE_FAILURE" : "PERMANENT_FAILURE",
        completedAt,
        errorCategory: retry ? "TRANSIENT" : "PERMANENT",
        errorCode: providerResult.errorCode,
        errorMessage: safeError
      }
    });
    await tx.auditLog.create({
      data: {
        tenantId: outbox.tenantId,
        branchId: outbox.branchId,
        academicYearId: outbox.academicYearId,
        actorUserId: null,
        action: retry ? "schoolcast.outbox.retry_scheduled" : "schoolcast.outbox.undeliverable",
        entityType: "NotificationOutbox",
        entityId: outbox.id,
        metadataJson: { channel: outbox.channel, mode: outbox.mode, attemptNo, errorCode: providerResult.errorCode }
      }
    });
    return true;
  });
  if (!finalized) return null;
  return retry ? "retrying" : "failed";
}

export async function processSchoolCastOutbox(input: unknown): Promise<SchoolCastOutboxRunResult> {
  const data = processSchoolCastOutboxSchema.parse(input);
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + data.leaseSeconds * 1000);
  const result: SchoolCastOutboxRunResult = {
    claimed: 0,
    recovered: 0,
    simulated: 0,
    submitted: 0,
    retrying: 0,
    failed: 0,
    expired: 0,
    workerErrors: 0
  };

  const expired = await db.notificationOutbox.updateMany({
    where: {
      schoolCastCommunicationId: { not: null },
      status: { in: ["QUEUED", "RETRYING"] },
      expiresAt: { lte: now }
    },
    data: { status: "EXPIRED", failureReason: "COMMUNICATION_EXPIRED", leaseUntil: null, lockOwner: null, lockedAt: null }
  });
  result.expired = expired.count;
  result.recovered = await recoverExpiredOutboxLeases(now, data.limit);

  const candidates = await claimOutboxItems({
    workerId: data.workerId,
    now,
    leaseUntil,
    limit: data.limit
  });
  result.claimed = candidates.length;
  const outcomes = await settleWithConcurrency(
    candidates,
    data.concurrency,
    (candidate) => processClaimedOutboxItemSafely(candidate, data)
  );
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      result.workerErrors += 1;
      continue;
    }
    if (outcome.value === "simulated") result.simulated += 1;
    else if (outcome.value === "submitted") result.submitted += 1;
    else if (outcome.value === "retrying") result.retrying += 1;
    else if (outcome.value === "failed") result.failed += 1;
    else if (outcome.value === "workerError") result.workerErrors += 1;
  }

  return result;
}
