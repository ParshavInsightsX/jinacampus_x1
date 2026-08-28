import { NextResponse } from "next/server";
import { PasswordLoginThrottleRealm } from "@prisma/client";

import { writePlatformAuditLog } from "@/lib/audit/platform-audit-log";
import {
  createRawPlatformAdministratorSessionToken,
  getPlatformAdministratorSessionExpiresAt,
  hashPlatformAdministratorSessionToken,
  setPlatformAdministratorSessionCookie
} from "@/lib/auth/platform-administrator-session";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import { passwordLoginProtectionResponse } from "@/lib/auth/password-login-response";
import {
  beginPasswordLoginAttempt,
  completePasswordLoginAttempt,
  passwordLoginSourceAddress,
  type PasswordLoginReservation
} from "@/lib/auth/password-login-throttle";
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
  const authenticated = (
    administrator?.status === "ACTIVE" &&
    administrator.credential
  ) ? {
    administrator,
    credential: administrator.credential
  } : null;
  const sourceAddress = passwordLoginSourceAddress(request);
  let reservation: PasswordLoginReservation;
  try {
    reservation = await beginPasswordLoginAttempt({
      realm: PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR,
      channel: "ADMINISTRATOR_WEB",
      scopeKey: "platform-administrator",
      accountKey: administrator?.id ?? parsed.data.email,
      sourceAddress
    });
  } catch (error) {
    const response = passwordLoginProtectionResponse(error);
    if (response) return response;
    throw error;
  }

  const valid = await verifyPasswordOrDummy(
    parsed.data.password,
    authenticated?.credential.passwordHash ?? null
  );
  if (!valid || !authenticated) {
    await completePasswordLoginAttempt(reservation, "FAILURE");
    return NextResponse.json({ error: ADMINISTRATOR_LOGIN_ERROR_MESSAGE }, { status: 401 });
  }
  await completePasswordLoginAttempt(reservation, "SUCCESS");

  const rawToken = createRawPlatformAdministratorSessionToken();
  const tokenHash = await hashPlatformAdministratorSessionToken(rawToken);
  const expiresAt = getPlatformAdministratorSessionExpiresAt();
  const ipAddress = sourceAddress ?? undefined;
  const userAgent = request.headers.get("user-agent") ?? undefined;

  await db.$transaction(async (tx) => {
    const session = await tx.platformAdministratorSession.create({
      data: {
        administratorId: authenticated.administrator.id,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent
      }
    });

    await tx.platformAdministrator.update({
      where: { id: authenticated.administrator.id },
      data: { lastLoginAt: new Date() }
    });

    await writePlatformAuditLog({
      ctx: {
        administratorId: authenticated.administrator.id,
        sessionId: session.id,
        email: authenticated.administrator.email,
        displayName: authenticated.administrator.displayName,
        canManagePrincipalRecovery: authenticated.administrator.canManagePrincipalRecovery,
        passwordChangeRequired: authenticated.credential.mustChange,
        ipAddress,
        userAgent
      },
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.LOGIN_SUCCESS,
      entityType: "PlatformAdministrator",
      entityId: authenticated.administrator.id,
      metadata: { authenticationMethod: "PASSWORD" }
    }, tx);
  });

  await setPlatformAdministratorSessionCookie(rawToken, expiresAt);
  return NextResponse.json({
    ok: true,
    redirectTo: authenticated.credential.mustChange
      ? "/administrator/account/change-password?required=1"
      : "/administrator"
  });
}
