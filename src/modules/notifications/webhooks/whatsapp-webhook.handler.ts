import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NOTIFICATION_AUDIT_EVENTS } from "@/modules/notifications/audit-events";
import {
  whatsAppWebhookClientPayloadSchema,
  whatsAppWebhookStatusSchema
} from "@/modules/notifications/schemas";

export type WhatsAppWebhookStatusUpdate = {
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  rawStatusJson?: unknown;
  errorCode?: string;
  errorMessage?: string;
};

export type WhatsAppWebhookResult = {
  received: number;
  updated: number;
  ignored: number;
};

type WebhookDeps = {
  findDeliveryTarget(input: { providerMessageId: string }): Promise<{
    tenantId: string;
    outboxId: string;
    provider: "META_CLOUD" | "BSP" | "DRY_RUN";
  } | null>;
  recordStatus(input: WhatsAppWebhookStatusUpdate & {
    tenantId: string;
    outboxId: string;
    provider: "META_CLOUD" | "BSP" | "DRY_RUN";
  }): Promise<void>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeError(value: string | undefined) {
  return value?.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]").slice(0, 500);
}

const defaultDeps: WebhookDeps = {
  async findDeliveryTarget(input) {
    const legacy = await db.notificationDeliveryLog.findFirst({
      where: { providerMessageId: input.providerMessageId },
      select: {
        tenantId: true,
        outboxId: true,
        provider: true
      },
      orderBy: { createdAt: "desc" }
    });
    return legacy;
  },
  async recordStatus(input) {
    await db.$transaction(async (tx) => {
      await tx.notificationDeliveryLog.create({
        data: {
          tenantId: input.tenantId,
          outboxId: input.outboxId,
          provider: input.provider,
          providerMessageId: input.providerMessageId,
          status: input.status,
          rawStatusJson: input.rawStatusJson ? toJson(input.rawStatusJson) : undefined,
          errorCode: input.errorCode,
          errorMessage: safeError(input.errorMessage)
        }
      });

      if (input.status === "FAILED") {
        await tx.notificationOutbox.update({
          where: { id: input.outboxId },
          data: {
            status: "FAILED",
            failedAt: new Date(),
            failureReason: safeError(input.errorMessage) ?? "WHATSAPP_DELIVERY_FAILED"
          }
        });
      } else {
        await tx.notificationOutbox.update({
          where: { id: input.outboxId },
          data: {
            status: "SENT",
            sentAt: new Date(),
            failedAt: null,
            failureReason: null
          }
        });
      }

      const outbox = await tx.notificationOutbox.findUnique({
        where: { id: input.outboxId },
        select: { branchId: true, academicYearId: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId: input.tenantId,
          branchId: outbox?.branchId ?? null,
          academicYearId: outbox?.academicYearId ?? null,
          action: NOTIFICATION_AUDIT_EVENTS.WHATSAPP_WEBHOOK_RECEIVED,
          entityType: "NotificationOutbox",
          entityId: input.outboxId,
          metadataJson: toJson({
            status: input.status,
            provider: input.provider,
            providerMessageId: input.providerMessageId
          })
        }
      });
    });
  }
};

export function normalizeWhatsAppDeliveryStatus(status: string): WhatsAppWebhookStatusUpdate["status"] | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "sent") return "SENT";
  if (normalized === "delivered") return "DELIVERED";
  if (normalized === "read") return "READ";
  if (normalized === "failed") return "FAILED";
  return null;
}

export function extractWhatsAppWebhookStatuses(payload: unknown): WhatsAppWebhookStatusUpdate[] {
  const parsed = whatsAppWebhookClientPayloadSchema.safeParse(payload);
  if (!parsed.success) return [];

  const updates: WhatsAppWebhookStatusUpdate[] = [];
  for (const entry of parsed.data.entry ?? []) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue;
    for (const change of entry.changes) {
      if (!isRecord(change) || !isRecord(change.value) || !Array.isArray(change.value.statuses)) continue;
      for (const statusRecord of change.value.statuses) {
        if (!isRecord(statusRecord)) continue;
        const id = typeof statusRecord.id === "string" ? statusRecord.id : null;
        const status = typeof statusRecord.status === "string" ? normalizeWhatsAppDeliveryStatus(statusRecord.status) : null;
        if (!id || !status) continue;
        const errors = Array.isArray(statusRecord.errors) ? statusRecord.errors : [];
        const firstError = errors.find(isRecord);
        updates.push({
          providerMessageId: id,
          status,
          rawStatusJson: statusRecord,
          errorCode: typeof firstError?.code === "string" ? firstError.code : undefined,
          errorMessage: typeof firstError?.message === "string" ? firstError.message : undefined
        });
      }
    }
  }
  return updates;
}

export async function handleWhatsAppWebhookStatus(
  input: unknown,
  deps: WebhookDeps = defaultDeps
): Promise<"updated" | "ignored"> {
  const data = whatsAppWebhookStatusSchema.parse(input);
  const target = await deps.findDeliveryTarget({ providerMessageId: data.providerMessageId });
  if (!target) return "ignored";
  await deps.recordStatus({
    tenantId: target.tenantId,
    outboxId: target.outboxId,
    provider: target.provider,
    providerMessageId: data.providerMessageId,
    status: data.status,
    rawStatusJson: data.rawStatusJson,
    errorCode: data.errorCode,
    errorMessage: data.errorMessage
  });
  return "updated";
}

export async function handleWhatsAppWebhookPayload(payload: unknown, deps: WebhookDeps = defaultDeps): Promise<WhatsAppWebhookResult> {
  const statuses = extractWhatsAppWebhookStatuses(payload);
  const result: WhatsAppWebhookResult = { received: statuses.length, updated: 0, ignored: 0 };
  for (const status of statuses) {
    const updateResult = await handleWhatsAppWebhookStatus(status, deps);
    if (updateResult === "updated") result.updated += 1;
    if (updateResult === "ignored") result.ignored += 1;
  }
  return result;
}

export function verifyWhatsAppWebhookSignature(body: string, signature: string | null, appSecret: string | undefined) {
  if (!appSecret || !signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${createHmac("sha256", appSecret).update(body).digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
