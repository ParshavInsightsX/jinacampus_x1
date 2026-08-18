import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import {
  listInAppNotifications,
  parseNotificationListQuery
} from "@/modules/notifications/queries";
import { publishManualInAppNotification } from "@/modules/notifications/services/in-app-notification.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const ctx = await getTenantContext();
    const result = await listInAppNotifications(ctx, parseNotificationListQuery(new URL(request.url).searchParams));
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return notificationApiError(error, "Unable to load notifications.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const input: unknown = await request.json();
    const result = await publishManualInAppNotification(await getTenantContext(), input);
    return NextResponse.json({ success: true, result }, { status: 202 });
  } catch (error) {
    return notificationApiError(error, "Unable to publish this notification.");
  }
}