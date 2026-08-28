import { NextResponse } from "next/server";

import { AppError } from "@/lib/errors";

export const PASSWORD_LOGIN_THROTTLED_MESSAGE =
  "Too many sign-in attempts. Please wait and try again.";
export const PASSWORD_LOGIN_PROTECTION_UNAVAILABLE_MESSAGE =
  "Sign in is temporarily unavailable. Please try again shortly.";

function retryAfterSeconds(error: AppError) {
  if (
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number" &&
    Number.isFinite(error.retryAfterSeconds)
  ) {
    return Math.max(1, Math.ceil(error.retryAfterSeconds));
  }
  return 60;
}

export function passwordLoginProtectionResponse(error: unknown) {
  if (!(error instanceof AppError)) return null;
  if (error.code === "PASSWORD_LOGIN_THROTTLED") {
    return NextResponse.json(
      { error: PASSWORD_LOGIN_THROTTLED_MESSAGE },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSeconds(error)) }
      }
    );
  }
  if (error.code === "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE") {
    return NextResponse.json(
      { error: PASSWORD_LOGIN_PROTECTION_UNAVAILABLE_MESSAGE },
      { status: 503 }
    );
  }
  return null;
}
