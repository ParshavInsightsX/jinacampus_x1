import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import { notificationApiError } from "@/modules/notifications/api-response";
import { getInAppNotificationForUser } from "@/modules/notifications/queries";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  try {
    const { notificationId } = await params;
    const item = await getInAppNotificationForUser(await getTenantContext(), notificationId);
    return NextResponse.json({ success: true, item });
  } catch (error) {
    return notificationApiError(error, "Unable to load this notification.");
  }
}
