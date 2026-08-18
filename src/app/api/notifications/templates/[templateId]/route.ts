import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { updateInAppNotificationTemplate } from "@/modules/notifications/services/in-app-administration.service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ templateId: string }> }
) {
  try {
    assertSameOriginNotificationRequest(request);
    const { templateId } = await params;
    const input: unknown = await request.json();
    const template = await updateInAppNotificationTemplate(await getTenantContext(), templateId, input);
    return NextResponse.json({ success: true, template });
  } catch (error) {
    return notificationApiError(error, "Unable to update the notification template.");
  }
}