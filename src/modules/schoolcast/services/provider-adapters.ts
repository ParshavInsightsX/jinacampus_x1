import { randomUUID } from "node:crypto";
import type { NotificationChannel, Prisma, SchoolCastDeliveryMode } from "@prisma/client";

import { getSchoolCastDeploymentPolicy } from "@/modules/schoolcast/deployment-policy";
import { decryptSchoolCastContact } from "@/modules/schoolcast/services/contact-encryption.service";

export type SchoolCastProviderEnvelope = {
  channel: NotificationChannel;
  mode: SchoolCastDeliveryMode;
  providerCode: string | null;
  secretRef: string | null;
  senderDisplayName: string | null;
  senderIdentifierMasked: string | null;
  configurationJson: Prisma.JsonValue | null;
  recipientAddressEncrypted: string | null;
  templateName: string | null;
  languageCode: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
};

export type SchoolCastProviderResult =
  | { ok: true; status: "DRY_RUN" | "SUBMITTED"; providerMessageId: string; providerStatus: string }
  | { ok: false; retryable: boolean; errorCode: string; errorMessage: string; providerStatus?: string };

function record(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function sanitizeSchoolCastProviderError(value: unknown) {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/(?:access[_-]?token|api[_-]?key|secret)[=:]\s*[^&\s]+/gi, "secret=[redacted]")
    .slice(0, 500);
}

function secretFromReference(reference: string | null) {
  if (!reference?.startsWith("env:")) return null;
  const name = reference.slice(4);
  if (!/^[A-Z][A-Z0-9_]{2,120}$/.test(name)) return null;
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

async function postJson(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timeout);
  }
}

function payloadText(payload: Record<string, unknown>) {
  return stringValue(payload.contentText) ?? stringValue(payload.summary) ?? "School communication";
}

async function sendResendEmail(input: SchoolCastProviderEnvelope, to: string): Promise<SchoolCastProviderResult> {
  const apiKey = secretFromReference(input.secretRef);
  const config = record(input.configurationJson);
  const from = stringValue(config.from);
  if (!apiKey || !from) {
    return { ok: false, retryable: false, errorCode: "SCHOOLCAST_EMAIL_PROVIDER_NOT_READY", errorMessage: "Email provider secret reference or sender is not configured." };
  }
  try {
    const response = await postJson("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: stringValue(input.payload.title) ?? "JinaCampus notification",
        text: payloadText(input.payload)
      })
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        errorCode: `SCHOOLCAST_EMAIL_HTTP_${response.status}`,
        errorMessage: sanitizeSchoolCastProviderError(stringValue(body.message) ?? `Provider returned ${response.status}.`)
      };
    }
    return {
      ok: true,
      status: "SUBMITTED",
      providerMessageId: stringValue(body.id) ?? `email-${randomUUID()}`,
      providerStatus: "submitted"
    };
  } catch (error) {
    return { ok: false, retryable: true, errorCode: "SCHOOLCAST_EMAIL_NETWORK_ERROR", errorMessage: sanitizeSchoolCastProviderError(error) };
  }
}

function templateVariables(payload: Record<string, unknown>) {
  const variables = [payload.recipientDisplayName, payload.title, payload.summary ?? payload.contentText]
    .map((value) => typeof value === "string" || typeof value === "number" ? String(value) : "")
    .filter(Boolean);
  return variables.map((text) => ({ type: "text", text: text.slice(0, 1024) }));
}

async function sendMetaWhatsApp(input: SchoolCastProviderEnvelope, to: string): Promise<SchoolCastProviderResult> {
  const accessToken = secretFromReference(input.secretRef);
  const config = record(input.configurationJson);
  const phoneNumberId = stringValue(config.phoneNumberId);
  const apiVersion = stringValue(config.apiVersion) ?? "v21.0";
  if (!accessToken || !phoneNumberId || !input.templateName) {
    return { ok: false, retryable: false, errorCode: "SCHOOLCAST_WHATSAPP_PROVIDER_NOT_READY", errorMessage: "WhatsApp provider secret reference, phone number, or approved template is not configured." };
  }
  const digits = to.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) {
    return { ok: false, retryable: false, errorCode: "SCHOOLCAST_WHATSAPP_RECIPIENT_INVALID", errorMessage: "The recipient WhatsApp number is invalid." };
  }
  try {
    const response = await postJson(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: digits,
        type: "template",
        template: {
          name: input.templateName,
          language: { code: input.languageCode ?? "en" },
          components: [{ type: "body", parameters: templateVariables(input.payload) }]
        }
      })
    });
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
      const providerError = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : {};
      return {
        ok: false,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        errorCode: `SCHOOLCAST_WHATSAPP_HTTP_${response.status}`,
        errorMessage: sanitizeSchoolCastProviderError(stringValue(providerError.message) ?? `Provider returned ${response.status}.`)
      };
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const first = messages[0] && typeof messages[0] === "object" ? messages[0] as Record<string, unknown> : {};
    return {
      ok: true,
      status: "SUBMITTED",
      providerMessageId: stringValue(first.id) ?? `whatsapp-${randomUUID()}`,
      providerStatus: "submitted"
    };
  } catch (error) {
    return { ok: false, retryable: true, errorCode: "SCHOOLCAST_WHATSAPP_NETWORK_ERROR", errorMessage: sanitizeSchoolCastProviderError(error) };
  }
}

export async function sendSchoolCastProviderMessage(input: SchoolCastProviderEnvelope): Promise<SchoolCastProviderResult> {
  if (!getSchoolCastDeploymentPolicy().externalChannels) {
    return {
      ok: false,
      retryable: false,
      errorCode: "SCHOOLCAST_EXTERNAL_DELIVERY_DISABLED",
      errorMessage: "External SchoolCast delivery is disabled for this deployment."
    };
  }
  if (input.mode === "DRY_RUN") {
    return { ok: true, status: "DRY_RUN", providerMessageId: `dry-run-${randomUUID()}`, providerStatus: "simulated" };
  }
  if (!input.recipientAddressEncrypted) {
    return { ok: false, retryable: false, errorCode: "SCHOOLCAST_RECIPIENT_ADDRESS_UNAVAILABLE", errorMessage: "Encrypted recipient contact is not available." };
  }
  const address = decryptSchoolCastContact(input.recipientAddressEncrypted);
  if (input.channel === "EMAIL" && input.providerCode === "RESEND") return sendResendEmail(input, address);
  if (input.channel === "WHATSAPP" && input.providerCode === "META_CLOUD") return sendMetaWhatsApp(input, address);
  return { ok: false, retryable: false, errorCode: "SCHOOLCAST_PROVIDER_UNSUPPORTED", errorMessage: "The configured provider is not supported." };
}