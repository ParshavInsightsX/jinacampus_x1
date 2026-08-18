import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { cancelInAppNotification } from "@/modules/notifications/services/in-app-notification.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    assertSameOriginNotificationRequest(request);
    const { notificationId } = await params;
    await cancelInAppNotification(await getTenantContext(), notificationId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return notificationApiError(error, "Unable to cancel this notification.");
  }
}