import { NextResponse } from "next/server";

import { PASSWORD_RECOVERY_PUBLIC_MESSAGE } from "@/modules/campus-core/password-recovery-policy";
import { forgotPasswordSchema } from "@/modules/campus-core/schemas";
import { requestPasswordRecoveryService } from "@/modules/campus-core/services";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = forgotPasswordSchema.safeParse({
    tenantSlug: body?.tenantSlug ?? body?.schoolId,
    email: body?.email,
    principalId: body?.principalId
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Unable to process this request." }, { status: 400 });
  }

  await requestPasswordRecoveryService(parsed.data, {
    ipAddress: request.headers.get("x-forwarded-for") ?? undefined,
    userAgent: request.headers.get("user-agent") ?? undefined
  }).catch(() => null);

  return NextResponse.json({ ok: true, message: PASSWORD_RECOVERY_PUBLIC_MESSAGE });
}
