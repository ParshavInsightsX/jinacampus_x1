import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import { notificationApiError } from "@/modules/notifications/api-response";
import { getUnreadInAppNotificationCount } from "@/modules/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const count = await getUnreadInAppNotificationCount(await getTenantContext());
    return NextResponse.json({ success: true, count });
  } catch (error) {
    return notificationApiError(error, "Unable to load the unread notification count.");
  }
}
