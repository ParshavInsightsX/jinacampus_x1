import { NextResponse } from "next/server";

import { getTenantContext } from "@/lib/tenant/context";
import {
  assertSameOriginNotificationRequest,
  notificationApiError
} from "@/modules/notifications/api-response";
import {
  createInAppNotificationTemplate,
  listInAppNotificationTemplates
} from "@/modules/notifications/services/in-app-administration.service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await listInAppNotificationTemplates(await getTenantContext());
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    return notificationApiError(error, "Unable to load notification templates.");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOriginNotificationRequest(request);
    const input: unknown = await request.json();
    const template = await createInAppNotificationTemplate(await getTenantContext(), input);
    return NextResponse.json({ success: true, template }, { status: 201 });
  } catch (error) {
    return notificationApiError(error, "Unable to create the notification template.");
  }
}