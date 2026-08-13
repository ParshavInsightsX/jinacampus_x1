import { NextResponse } from "next/server";

import { getSafeHttpStatus, getUserSafeErrorMessage } from "@/lib/errors";
import { completePrincipalPasswordResetSchema } from "@/modules/campus-core/principal-password-recovery.schemas";
import { completePrincipalPasswordReset } from "@/modules/campus-core/principal-password-recovery.service";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ ok: false, message: "Unable to process this request." }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = completePrincipalPasswordResetSchema.safeParse({
    requestId: body?.requestId,
    token: body?.token,
    newPassword: body?.newPassword,
    confirmNewPassword: body?.confirmNewPassword
  });
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      message: "Check the password requirements and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors
    }, { status: 400 });
  }

  try {
    await completePrincipalPasswordReset(parsed.data, {
      ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
      userAgent: request.headers.get("user-agent") ?? undefined
    });
    return NextResponse.json({
      ok: true,
      message: "Password updated. Sign in with your new password."
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: getUserSafeErrorMessage(error, "Unable to reset the password. Please request a new link.")
    }, { status: getSafeHttpStatus(error) });
  }
}
