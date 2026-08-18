import { NextResponse } from "next/server";

import {
  forbidden,
  getSafeHttpStatus,
  getUserSafeErrorMessage
} from "@/lib/errors";

export function notificationApiError(error: unknown, fallback = "Unable to process this notification request.") {
  return NextResponse.json({
    success: false,
    error: getUserSafeErrorMessage(error, fallback)
  }, { status: getSafeHttpStatus(error) });
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function assertSameOriginNotificationRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;

  let requestUrl: URL;
  let submittedUrl: URL;
  try {
    requestUrl = new URL(request.url);
    submittedUrl = new URL(origin);
  } catch {
    throw new Error("INVALID_NOTIFICATION_REQUEST_ORIGIN");
  }
  if (submittedUrl.origin === requestUrl.origin) return;

  const localDevelopmentAlias = process.env.NODE_ENV !== "production" &&
    LOOPBACK_HOSTS.has(submittedUrl.hostname) &&
    LOOPBACK_HOSTS.has(requestUrl.hostname) &&
    submittedUrl.protocol === requestUrl.protocol &&
    submittedUrl.port === requestUrl.port;
  if (!localDevelopmentAlias) throw forbidden("FORBIDDEN_NOTIFICATION_REQUEST_ORIGIN");
}
