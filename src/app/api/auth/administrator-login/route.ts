import { NextResponse } from "next/server";

import { writePlatformAuditLog } from "@/lib/audit/platform-audit-log";
import {
  createRawPlatformAdministratorSessionToken,
  getPlatformAdministratorSessionExpiresAt,
  hashPlatformAdministratorSessionToken,
  setPlatformAdministratorSessionCookie
} from "@/lib/auth/platform-administrator-session";
import { verifyPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { administratorLoginSchema } from "@/modules/campus-core/administrator-schemas";
import { PLATFORM_ADMINISTRATOR_AUDIT_EVENTS } from "@/modules/campus-core/platform-administrator-audit-events";
import { ADMINISTRATOR_LOGIN_ERROR_MESSAGE } from "@/modules/campus-core/tenant-login-policy";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = administratorLoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: ADMINISTRATOR_LOGIN_ERROR_MESSAGE }, { status: 400 });
  }

  const administrator = await db.platformAdministrator.findUnique({
    where: { email: parsed.data.email },
    include: { credential: true }
  });

  if (
    !administrator ||
    administrator.status !== "ACTIVE" ||
    !administrator.credential ||
    !(await verifyPassword(parsed.data.password, administrator.credential.passwordHash))
  ) {
    return NextResponse.json({ error: ADMINISTRATOR_LOGIN_ERROR_MESSAGE }, { status: 401 });
  }

  const rawToken = createRawPlatformAdministratorSessionToken();
  const tokenHash = await hashPlatformAdministratorSessionToken(rawToken);
  const expiresAt = getPlatformAdministratorSessionExpiresAt();
  const ipAddress = request.headers.get("x-forwarded-for") ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  await db.$transaction(async (tx) => {
    const session = await tx.platformAdministratorSession.create({
      data: {
        administratorId: administrator.id,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent
      }
    });

    await tx.platformAdministrator.update({
      where: { id: administrator.id },
      data: { lastLoginAt: new Date() }
    });

    await writePlatformAuditLog({
      ctx: {
        administratorId: administrator.id,
        sessionId: session.id,
        email: administrator.email,
        displayName: administrator.displayName,
        canManagePrincipalRecovery: administrator.canManagePrincipalRecovery,
        passwordChangeRequired: administrator.credential?.mustChange ?? true,
        ipAddress,
        userAgent
      },
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.LOGIN_SUCCESS,
      entityType: "PlatformAdministrator",
      entityId: administrator.id,
      metadata: { authenticationMethod: "PASSWORD" }
    }, tx);
  });

  await setPlatformAdministratorSessionCookie(rawToken, expiresAt);
  return NextResponse.json({
    ok: true,
    redirectTo: administrator.credential.mustChange
      ? "/administrator/account/change-password?required=1"
      : "/administrator"
  });
}
