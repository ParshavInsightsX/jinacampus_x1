import { NextResponse } from "next/server";
import { Webhook } from "svix";

import { getSchoolCastDeploymentPolicy } from "@/modules/schoolcast/deployment-policy";
import { handleResendSchoolCastWebhook } from "@/modules/schoolcast/services/email-webhook.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!getSchoolCastDeploymentPolicy().externalChannels) {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  const secret = process.env.SCHOOLCAST_RESEND_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "SchoolCast email webhook is not configured." }, { status: 503 });
  }
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ ok: false, error: "Webhook verification headers are missing." }, { status: 400 });
  }
  const body = await request.text();
  let payload: unknown;
  try {
    payload = new Webhook(secret).verify(body, {
      "svix-id": id,
      "svix-timestamp": timestamp,
      "svix-signature": signature,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Webhook signature verification failed." }, { status: 401 });
  }
  try {
    const result = await handleResendSchoolCastWebhook(payload, id);
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ ok: false, error: "Webhook processing failed." }, { status: 500 });
  }
}