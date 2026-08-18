import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import { getInAppNotificationPreferences } from "@/modules/notifications/queries";
import { updateOwnInAppNotificationPreferences } from "@/modules/notifications/services/in-app-recipient.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const preferences = await getInAppNotificationPreferences(await getTenantContext());
    return NextResponse.json({ success: true, preferences });
  } catch (error) {
    return notificationApiError(error, "Unable to load notification preferences.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const input: unknown = await request.json();
    const ctx = await getTenantContext();
    await updateOwnInAppNotificationPreferences(ctx, input);
    return NextResponse.json({ success: true });
  } catch (error) {
    return notificationApiError(error, "Unable to update notification preferences.");
  }
}
