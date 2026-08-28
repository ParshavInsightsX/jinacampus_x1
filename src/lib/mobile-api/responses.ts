import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AppError,
  DEFAULT_UNEXPECTED_ERROR_MESSAGE,
  getUserSafeErrorMessage,
  getZodFieldErrors,
  normalizeErrorCode
} from "@/lib/errors";
import { SCHOOL_LOGIN_ERROR_MESSAGE } from "@/modules/campus-core/tenant-login-policy";

type MobileApiErrorOptions = {
  fallbackMessage?: string;
  validationMessage?: string;
};

function statusForError(error: unknown) {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof AppError) return error.status;
  if (error instanceof Error) {
    const normalizedCode = normalizeErrorCode(error.message);
    if (normalizedCode === "UNAUTHENTICATED") return 401;
    if (normalizedCode === "BRANCH_ACCESS_DENIED" || normalizedCode.startsWith("FORBIDDEN")) return 403;
    if (normalizedCode === "NOT_FOUND" || normalizedCode.endsWith("_NOT_FOUND")) return 404;
    if (normalizedCode === "CONFLICT" || normalizedCode.includes("_ALREADY_")) return 409;
  }
  return 500;
}

function mobileSafeMessage(error: unknown, options: MobileApiErrorOptions) {
  if (error instanceof AppError && error.code === "INVALID_MOBILE_CREDENTIALS") {
    return SCHOOL_LOGIN_ERROR_MESSAGE;
  }
  return getUserSafeErrorMessage(error, options.fallbackMessage ?? DEFAULT_UNEXPECTED_ERROR_MESSAGE);
}

function retryAfterHeader(error: unknown) {
  if (
    error instanceof AppError &&
    error.code === "PASSWORD_LOGIN_THROTTLED" &&
    "retryAfterSeconds" in error &&
    typeof error.retryAfterSeconds === "number" &&
    Number.isFinite(error.retryAfterSeconds)
  ) {
    return { "Retry-After": String(Math.max(1, Math.ceil(error.retryAfterSeconds))) };
  }
  return undefined;
}

export function mobileApiSuccess<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ success: true, ...data }, { status });
}

export function mobileApiError(error: unknown, options: MobileApiErrorOptions = {}) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({
      success: false,
      error: options.validationMessage ?? "Please check the request and try again.",
      fieldErrors: getZodFieldErrors(error)
    }, { status: 400 });
  }

  return NextResponse.json({
    success: false,
    error: mobileSafeMessage(error, options)
  }, {
    status: statusForError(error),
    headers: retryAfterHeader(error)
  });
}
