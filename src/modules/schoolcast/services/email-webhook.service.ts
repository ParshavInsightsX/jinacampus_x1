import { z } from "zod";

import {
  findSchoolCastDeliveryAttempt,
  recordSchoolCastDeliveryStatus,
  type SchoolCastWebhookStatus,
} from "@/modules/schoolcast/services/delivery-webhook.service";

const resendWebhookPayloadSchema = z.object({
  type: z.string().trim().min(1).max(80),
  created_at: z.string().datetime({ offset: true }),
  data: z.object({
    email_id: z.string().trim().min(1).max(200),
  }).passthrough(),
}).passthrough();

export type ResendSchoolCastWebhookEvent = {
  providerMessageId: string;
  status: SchoolCastWebhookStatus;
  occurredAt: Date;
  errorCode?: string;
};

type EmailWebhookDeps = {
  findDeliveryTarget(input: { providerMessageId: string }): Promise<{
    id: string;
    tenantId: string;
    outboxId: string;
  } | null>;
  recordStatus(input: ResendSchoolCastWebhookEvent & {
    providerEventId: string;
    attemptId: string;
    tenantId: string;
    outboxId: string;
  }): Promise<void>;
};

const STATUS_BY_EVENT: Readonly<Record<string, SchoolCastWebhookStatus | undefined>> = {
  "email.sent": "SENT",
  "email.delivered": "DELIVERED",
  "email.opened": "READ",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
  "email.failed": "FAILED",
  "email.suppressed": "FAILED",
};

const defaultDeps: EmailWebhookDeps = {
  async findDeliveryTarget(input) {
    return findSchoolCastDeliveryAttempt(input.providerMessageId, "EMAIL");
  },
  async recordStatus(input) {
    await recordSchoolCastDeliveryStatus({
      attemptId: input.attemptId,
      tenantId: input.tenantId,
      outboxId: input.outboxId,
      providerMessageId: input.providerMessageId,
      providerEventId: input.providerEventId,
      status: input.status,
      occurredAt: input.occurredAt,
      errorCode: input.errorCode,
      signatureVerified: true,
    });
  },
};

export function extractResendSchoolCastWebhookEvent(payload: unknown): ResendSchoolCastWebhookEvent | null {
  const parsed = resendWebhookPayloadSchema.safeParse(payload);
  if (!parsed.success) return null;
  const status = STATUS_BY_EVENT[parsed.data.type];
  if (!status) return null;
  return {
    providerMessageId: parsed.data.data.email_id,
    status,
    occurredAt: new Date(parsed.data.created_at),
    errorCode: status === "FAILED" || status === "BOUNCED" || status === "COMPLAINED"
      ? parsed.data.type.replaceAll(".", "_").toUpperCase()
      : undefined,
  };
}

export async function handleResendSchoolCastWebhook(
  payload: unknown,
  providerEventId: string,
  deps: EmailWebhookDeps = defaultDeps,
): Promise<"updated" | "ignored"> {
  const event = extractResendSchoolCastWebhookEvent(payload);
  if (!event) return "ignored";
  const target = await deps.findDeliveryTarget({ providerMessageId: event.providerMessageId });
  if (!target) return "ignored";
  await deps.recordStatus({
    ...event,
    providerEventId: `resend:${providerEventId}`,
    attemptId: target.id,
    tenantId: target.tenantId,
    outboxId: target.outboxId,
  });
  return "updated";
}