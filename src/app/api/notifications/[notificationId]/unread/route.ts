import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { updateOwnInAppNotification } from "@/modules/notifications/services/in-app-recipient.service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    assertSameOriginNotificationRequest(request);
    const { notificationId } = await params;
    await updateOwnInAppNotification(await getTenantContext(), notificationId, "unread");
    return NextResponse.json({ success: true });
  } catch (error) {
    return notificationApiError(error, "Unable to update this notification.");
  }
}
