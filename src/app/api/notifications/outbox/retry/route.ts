import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { notificationOutboxRetrySchema } from "@/modules/notifications/schemas/in-app-notification.schema";
import { retryInAppNotificationOutbox } from "@/modules/notifications/services/in-app-notification.service";

export async function POST(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const input = notificationOutboxRetrySchema.parse(await request.json());
    await retryInAppNotificationOutbox(await getTenantContext(), input.outboxId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return notificationApiError(error, "Unable to retry this notification event.");
  }
}