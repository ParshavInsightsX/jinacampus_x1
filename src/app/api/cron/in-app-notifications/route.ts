import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { processInAppNotificationOutbox } from "@/modules/notifications/services/in-app-notification.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(secret);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ success: false, error: "Notification processing is not configured." }, { status: 503 });
  }
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Unauthenticated." }, { status: 401 });
  }

  const result = await processInAppNotificationOutbox({ limit: 100 });
  return NextResponse.json({ success: true, result });
}
