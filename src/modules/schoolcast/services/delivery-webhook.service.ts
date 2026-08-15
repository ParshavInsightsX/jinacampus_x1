import { createHash } from "node:crypto";
import type {
  SchoolCastDeliveryAttemptStatus,
  SchoolCastDeliveryEventStatus,
} from "@prisma/client";

import { db } from "@/lib/db";
import { sanitizeSchoolCastProviderError } from "@/modules/schoolcast/services/provider-adapters";

export type SchoolCastWebhookStatus =
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "BOUNCED"
  | "COMPLAINED";

export async function findSchoolCastDeliveryAttempt(
  providerMessageId: string,
  channel?: "EMAIL" | "WHATSAPP",
) {
  return db.schoolCastDeliveryAttempt.findFirst({
    where: {
      providerMessageId,
      ...(channel ? { outbox: { channel } } : {}),
    },
    select: { id: true, tenantId: true, outboxId: true },
    orderBy: { startedAt: "desc" },
  });
}

function isPermanentFailure(status: SchoolCastWebhookStatus) {
  return status === "FAILED" || status === "BOUNCED" || status === "COMPLAINED";
}

function toAttemptStatus(status: SchoolCastWebhookStatus): SchoolCastDeliveryAttemptStatus {
  if (isPermanentFailure(status)) return "PERMANENT_FAILURE";
  return status;
}

export async function recordSchoolCastDeliveryStatus(input: {
  attemptId: string;
  tenantId: string;
  outboxId: string;
  providerMessageId: string;
  providerEventId?: string;
  status: SchoolCastWebhookStatus;
  occurredAt?: Date;
  errorCode?: string;
  errorMessage?: string;
  signatureVerified?: boolean;
}) {
  const occurredAt = input.occurredAt ?? new Date();
  const providerEventId = input.providerEventId ?? `${input.status.toLowerCase()}:${input.providerMessageId}`;
  const failed = isPermanentFailure(input.status);
  const canonicalStatus: SchoolCastDeliveryEventStatus = input.status;
  const safeError = failed
    ? sanitizeSchoolCastProviderError(input.errorMessage ?? input.errorCode ?? "PROVIDER_DELIVERY_FAILED")
    : null;

  return db.$transaction(async (tx) => {
    await tx.schoolCastDeliveryEvent.upsert({
      where: {
        attemptId_providerEventId: {
          attemptId: input.attemptId,
          providerEventId,
        },
      },
      create: {
        tenantId: input.tenantId,
        attemptId: input.attemptId,
        providerEventId,
        canonicalStatus,
        providerStatus: input.status.toLowerCase(),
        occurredAt,
        payloadHash: createHash("sha256").update(providerEventId).digest("hex"),
        signatureVerified: input.signatureVerified ?? true,
      },
      update: {},
    });
    await tx.schoolCastDeliveryAttempt.update({
      where: { id: input.attemptId },
      data: {
        status: toAttemptStatus(input.status),
        completedAt: occurredAt,
        errorCategory: failed ? "PROVIDER" : null,
        errorCode: failed ? input.errorCode ?? `PROVIDER_${input.status}` : null,
        errorMessage: safeError,
      },
    });
    await tx.notificationOutbox.update({
      where: { id: input.outboxId },
      data: failed
        ? {
            status: "UNDELIVERABLE",
            failedAt: occurredAt,
            failureReason: input.errorCode ?? `PROVIDER_${input.status}`,
          }
        : {
            status: "SENT",
            sentAt: occurredAt,
            failedAt: null,
            failureReason: null,
          },
    });
    const outbox = await tx.notificationOutbox.findUnique({
      where: { id: input.outboxId },
      select: { branchId: true, academicYearId: true, channel: true, mode: true },
    });
    await tx.auditLog.create({
      data: {
        tenantId: input.tenantId,
        branchId: outbox?.branchId ?? null,
        academicYearId: outbox?.academicYearId ?? null,
        actorUserId: null,
        action: "schoolcast.delivery.webhook_received",
        entityType: "SchoolCastDeliveryAttempt",
        entityId: input.attemptId,
        metadataJson: {
          status: input.status,
          channel: outbox?.channel,
          mode: outbox?.mode,
          providerEventIdHash: createHash("sha256").update(providerEventId).digest("hex"),
          providerMessageIdHash: createHash("sha256").update(input.providerMessageId).digest("hex"),
          errorCode: input.errorCode ?? null,
        },
      },
    });
    return { status: input.status, duplicateSafe: true };
  });
}