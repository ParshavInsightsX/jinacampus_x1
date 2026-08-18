import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { markAllOwnInAppNotificationsRead } from "@/modules/notifications/services/in-app-recipient.service";

export async function POST(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const count = await markAllOwnInAppNotificationsRead(await getTenantContext());
    return NextResponse.json({ success: true, count });
  } catch (error) {
    return notificationApiError(error, "Unable to mark notifications as read.");
  }
}
