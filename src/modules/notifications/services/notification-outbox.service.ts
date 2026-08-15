import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { NOTIFICATION_AUDIT_EVENTS } from "@/modules/notifications/audit-events";
import { processNotificationOutboxSchema } from "@/modules/notifications/schemas";
import { sendWhatsAppTemplateMessage } from "@/modules/notifications/services/whatsapp-provider.service";

export type NotificationPayload = Record<string, string | number>;

export type QueueNotificationOutboxItemInput = {
  tenantId: string;
  branchId?: string | null;
  academicYearId?: string | null;
  channel: "WHATSAPP";
  templateKey: string;
  recipientType: "GUARDIAN" | "STAFF";
  recipientId: string;
  recipientPhone: string;
  payload: NotificationPayload;
  idempotencyKey: string;
  scheduledFor?: Date;
  actorUserId?: string | null;
};

export type QueueNotificationOutboxItemResult = {
  status: "queued" | "alreadyQueued";
  outboxId: string;
};

export type ProcessNotificationOutboxResult = {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
};

type DbClient = typeof db | Prisma.TransactionClient;

type NotificationTemplateRecord = {
  providerTemplateName: string;
  languageCode: string;
};

type QueuedNotificationRecord = {
  id: string;
  tenantId: string;
  branchId: string | null;
  templateKey: string;
  recipientPhone: string | null;
  payloadJson: Prisma.JsonValue;
};

type NotificationOutboxDeps = {
  findExistingOutboxItem(input: { idempotencyKey: string }): Promise<{ id: string } | null>;
  createOutboxItem(input: QueueNotificationOutboxItemInput): Promise<{ id: string }>;
  writeAudit(input: {
    tenantId: string;
    branchId?: string | null;
    academicYearId?: string | null;
    actorUserId?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    metadata?: Record<string, string | number | boolean | null>;
  }): Promise<void>;
};

type ProcessOutboxDeps = {
  findQueued(input: { tenantId: string; branchId?: string; limit: number; now: Date }): Promise<QueuedNotificationRecord[]>;
  findTemplate(input: { tenantId: string; branchId?: string | null; templateKey: string }): Promise<NotificationTemplateRecord | null>;
  markSending(input: { id: string; tenantId: string }): Promise<QueuedNotificationRecord | null>;
  markSent(input: { id: string; tenantId: string; providerMessageId: string | null; provider: "META_CLOUD" | "BSP" | "DRY_RUN" }): Promise<void>;
  markFailed(input: { id: string; tenantId: string; provider: "META_CLOUD" | "BSP" | "DRY_RUN"; failureReason: string; providerMessageId?: string | null }): Promise<void>;
  sendMessage(input: {
    tenantId: string;
    branchId?: string | null;
    to: string;
    templateName: string;
    languageCode: string;
    variables: NotificationPayload;
  }): ReturnType<typeof sendWhatsAppTemplateMessage>;
};

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function maskPhone(phone: string) {
  const visible = phone.replace(/\D/g, "").slice(-4);
  return visible ? `***${visible}` : "***";
}

function safeFailureReason(reason: string) {
  return reason.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]").slice(0, 500);
}

async function writeNotificationAudit(input: Parameters<NotificationOutboxDeps["writeAudit"]>[0], client: DbClient = db) {
  await client.auditLog.create({
    data: {
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      academicYearId: input.academicYearId ?? null,
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadataJson: input.metadata ? toJson(input.metadata) : undefined
    }
  });
}

const defaultQueueDeps: NotificationOutboxDeps = {
  async findExistingOutboxItem(input) {
    return db.notificationOutbox.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true }
    });
  },
  async createOutboxItem(input) {
    return db.notificationOutbox.create({
      data: {
        tenantId: input.tenantId,
        branchId: input.branchId ?? null,
        academicYearId: input.academicYearId ?? null,
        channel: input.channel,
        templateKey: input.templateKey,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        recipientPhone: input.recipientPhone,
        payloadJson: toJson(input.payload),
        idempotencyKey: input.idempotencyKey,
        scheduledFor: input.scheduledFor ?? new Date()
      },
      select: { id: true }
    });
  },
  async writeAudit(input) {
    await writeNotificationAudit(input);
  }
};

const defaultProcessDeps: ProcessOutboxDeps = {
  async findQueued(input) {
    return db.notificationOutbox.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        channel: "WHATSAPP",
        status: "QUEUED",
        scheduledFor: { lte: input.now }
      },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        templateKey: true,
        recipientPhone: true,
        payloadJson: true
      },
      orderBy: { createdAt: "asc" },
      take: input.limit
    });
  },
  async findTemplate(input) {
    const branchTemplate = input.branchId
      ? await db.notificationTemplate.findFirst({
        where: {
          tenantId: input.tenantId,
          branchId: input.branchId,
          channel: "WHATSAPP",
          templateKey: input.templateKey,
          isActive: true
        },
        select: { providerTemplateName: true, languageCode: true }
      })
      : null;
    if (branchTemplate) return branchTemplate;

    return db.notificationTemplate.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: null,
        channel: "WHATSAPP",
        templateKey: input.templateKey,
        isActive: true
      },
      select: { providerTemplateName: true, languageCode: true }
    });
  },
  async markSending(input) {
    const claimed = await db.notificationOutbox.updateMany({
      where: { id: input.id, tenantId: input.tenantId, status: "QUEUED" },
      data: { status: "SENDING" }
    });
    if (claimed.count !== 1) return null;
    return db.notificationOutbox.findFirst({
      where: { id: input.id, tenantId: input.tenantId, status: "SENDING" },
      select: {
        id: true,
        tenantId: true,
        branchId: true,
        templateKey: true,
        recipientPhone: true,
        payloadJson: true
      }
    });
  },
  async markSent(input) {
    await db.$transaction(async (tx) => {
      const outbox = await tx.notificationOutbox.update({
        where: { id: input.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          failedAt: null,
          failureReason: null
        },
        select: { id: true, tenantId: true, branchId: true, academicYearId: true }
      });
      await tx.notificationDeliveryLog.create({
        data: {
          tenantId: outbox.tenantId,
          outboxId: outbox.id,
          provider: input.provider,
          providerMessageId: input.providerMessageId,
          status: "SENT"
        }
      });
      await writeNotificationAudit({
        tenantId: outbox.tenantId,
        branchId: outbox.branchId,
        academicYearId: outbox.academicYearId,
        action: NOTIFICATION_AUDIT_EVENTS.OUTBOX_SENT,
        entityType: "NotificationOutbox",
        entityId: outbox.id,
        metadata: { channel: "WHATSAPP", provider: input.provider }
      }, tx);
    });
  },
  async markFailed(input) {
    await db.$transaction(async (tx) => {
      const outbox = await tx.notificationOutbox.update({
        where: { id: input.id },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: safeFailureReason(input.failureReason)
        },
        select: { id: true, tenantId: true, branchId: true, academicYearId: true }
      });
      await tx.notificationDeliveryLog.create({
        data: {
          tenantId: outbox.tenantId,
          outboxId: outbox.id,
          provider: input.provider,
          providerMessageId: input.providerMessageId ?? null,
          status: "FAILED",
          errorMessage: safeFailureReason(input.failureReason)
        }
      });
      await writeNotificationAudit({
        tenantId: outbox.tenantId,
        branchId: outbox.branchId,
        academicYearId: outbox.academicYearId,
        action: NOTIFICATION_AUDIT_EVENTS.OUTBOX_FAILED,
        entityType: "NotificationOutbox",
        entityId: outbox.id,
        metadata: { channel: "WHATSAPP", provider: input.provider, failureReason: safeFailureReason(input.failureReason) }
      }, tx);
    });
  },
  async sendMessage(input) {
    return sendWhatsAppTemplateMessage(input);
  }
};

export async function queueNotificationOutboxItem(
  input: QueueNotificationOutboxItemInput,
  deps: NotificationOutboxDeps = defaultQueueDeps
): Promise<QueueNotificationOutboxItemResult> {
  const existing = await deps.findExistingOutboxItem({ idempotencyKey: input.idempotencyKey });
  if (existing) return { status: "alreadyQueued", outboxId: existing.id };

  try {
    const outbox = await deps.createOutboxItem(input);
    await deps.writeAudit({
      tenantId: input.tenantId,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      actorUserId: input.actorUserId,
      action: NOTIFICATION_AUDIT_EVENTS.OUTBOX_QUEUED,
      entityType: "NotificationOutbox",
      entityId: outbox.id,
      metadata: {
        channel: input.channel,
        templateKey: input.templateKey,
        recipientType: input.recipientType,
        recipientPhone: maskPhone(input.recipientPhone)
      }
    });
    return { status: "queued", outboxId: outbox.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await deps.findExistingOutboxItem({ idempotencyKey: input.idempotencyKey });
      if (duplicate) return { status: "alreadyQueued", outboxId: duplicate.id };
    }
    throw error;
  }
}

export function notificationPayloadVariables(payloadJson: Prisma.JsonValue): NotificationPayload {
  if (!payloadJson || Array.isArray(payloadJson) || typeof payloadJson !== "object") return {};
  const variables: NotificationPayload = {};
  for (const [key, value] of Object.entries(payloadJson)) {
    if (typeof value === "string" || typeof value === "number") variables[key] = value;
  }
  return variables;
}

export async function processNotificationOutbox(input: unknown, deps: ProcessOutboxDeps = defaultProcessDeps) {
  const data = processNotificationOutboxSchema.parse(input);
  const rows = await deps.findQueued({
    tenantId: data.tenantId,
    branchId: data.branchId,
    limit: data.limit,
    now: new Date()
  });
  const result: ProcessNotificationOutboxResult = { processed: 0, sent: 0, failed: 0, skipped: 0 };

  for (const row of rows) {
    const sending = await deps.markSending({ id: row.id, tenantId: row.tenantId });
    if (!sending) {
      result.skipped += 1;
      continue;
    }
    result.processed += 1;

    const template = await deps.findTemplate({
      tenantId: sending.tenantId,
      branchId: sending.branchId,
      templateKey: sending.templateKey
    });
    if (!template) {
      await deps.markFailed({
        id: sending.id,
        tenantId: sending.tenantId,
        provider: "DRY_RUN",
        failureReason: "WHATSAPP_TEMPLATE_NOT_CONFIGURED"
      });
      result.failed += 1;
      continue;
    }

    if (!sending.recipientPhone) {
      await deps.markFailed({
        id: sending.id,
        tenantId: sending.tenantId,
        provider: "DRY_RUN",
        failureReason: "WHATSAPP_RECIPIENT_PHONE_MISSING"
      });
      result.failed += 1;
      continue;
    }

    const providerResult = await deps.sendMessage({
      tenantId: sending.tenantId,
      branchId: sending.branchId,
      to: sending.recipientPhone,
      templateName: template.providerTemplateName,
      languageCode: template.languageCode,
      variables: notificationPayloadVariables(sending.payloadJson)
    });

    if (providerResult.ok) {
      await deps.markSent({
        id: sending.id,
        tenantId: sending.tenantId,
        provider: providerResult.provider,
        providerMessageId: providerResult.providerMessageId
      });
      result.sent += 1;
    } else {
      await deps.markFailed({
        id: sending.id,
        tenantId: sending.tenantId,
        provider: providerResult.provider,
        providerMessageId: providerResult.providerMessageId,
        failureReason: providerResult.errorMessage
      });
      result.failed += 1;
    }
  }

  return result;
}
