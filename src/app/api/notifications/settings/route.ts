import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import {
  getInAppNotificationSetting,
  updateInAppNotificationSetting
} from "@/modules/notifications/services/in-app-administration.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const setting = await getInAppNotificationSetting(await getTenantContext(), {
      scopeType: searchParams.get("scopeType") || undefined,
      scopeId: searchParams.get("scopeId") || undefined
    });
    return NextResponse.json({ success: true, setting });
  } catch (error) {
    return notificationApiError(error, "Unable to load notification settings.");
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const input: unknown = await request.json();
    const setting = await updateInAppNotificationSetting(await getTenantContext(), input);
    return NextResponse.json({ success: true, setting });
  } catch (error) {
    return notificationApiError(error, "Unable to update notification settings.");
  }
}