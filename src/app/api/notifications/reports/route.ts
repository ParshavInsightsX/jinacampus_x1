import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import { notificationApiError } from "@/modules/notifications/api-response";
import { getInAppNotificationReport } from "@/modules/notifications/services/in-app-administration.service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const report = await getInAppNotificationReport(await getTenantContext(), {
      from: searchParams.get("from") || undefined,
      to: searchParams.get("to") || undefined
    });
    return NextResponse.json({ success: true, report });
  } catch (error) {
    return notificationApiError(error, "Unable to load the notification report.");
  }
}