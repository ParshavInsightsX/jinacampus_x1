import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  handleWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature
} from "@/modules/notifications/webhooks/whatsapp-webhook.handler";

export const runtime = "nodejs";

function matchesVerifyToken(token: string | null, expectedHash: string | undefined) {
  if (!token || !expectedHash) return false;
  const actualHash = createHash("sha256").update(token).digest("hex");
  const actual = Buffer.from(actualHash);
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode !== "subscribe" || !challenge) {
    return NextResponse.json({ success: false, error: "Invalid webhook verification request." }, { status: 400 });
  }

  if (!matchesVerifyToken(token, process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN_SHA256)) {
    return NextResponse.json({ success: false, error: "Webhook verification is not configured or token is invalid." }, { status: 403 });
  }

  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyWhatsAppWebhookSignature(body, signature, process.env.WHATSAPP_APP_SECRET)) {
    return NextResponse.json({ success: false, error: "Webhook signature verification failed." }, { status: 401 });
  }

  try {
    const payload = JSON.parse(body) as unknown;
    const result = await handleWhatsAppWebhookPayload(payload);
    return NextResponse.json({ success: true, result });
  } catch {
    return NextResponse.json({ success: false, error: "Invalid webhook payload." }, { status: 400 });
  }
}
