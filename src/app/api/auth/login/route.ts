import { NextResponse } from "next/server";
import { PasswordLoginThrottleRealm } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  beginPasswordLoginAttempt,
  completePasswordLoginAttempt,
  passwordLoginSourceAddress,
  type PasswordLoginReservation
} from "@/lib/auth/password-login-throttle";
import { passwordLoginProtectionResponse } from "@/lib/auth/password-login-response";
import { setSessionCookie } from "@/lib/auth/cookies";
import {
  activeRoleCodes,
  findLoginUser,
  normalizeLoginIdentifier
} from "@/lib/auth/login-identity";
import { createLoginSession } from "@/lib/auth/login-session";
import { hasSchoolLoginRole } from "@/lib/rbac/roles";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { SCHOOL_LOGIN_ERROR_MESSAGE, validateSchoolId } from "@/modules/campus-core/tenant-login-policy";

const loginSchema = z.object({
  schoolId: z.unknown().optional(),
  tenantSlug: z.unknown().optional(),
  identifier: z.string().trim().min(1).max(180).optional(),
  email: z.string().trim().email().max(180).optional(),
  password: z.string().min(1).max(200)
}).strict().refine((value) => Boolean(value.identifier || value.email), {
  message: "Enter an employee code or email.",
  path: ["identifier"]
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) return NextResponse.json({ error: SCHOOL_LOGIN_ERROR_MESSAGE }, { status: 400 });

  const identifier = parsed.data.identifier ?? parsed.data.email ?? "";
  const { password } = parsed.data;
  const schoolIdResult = validateSchoolId(parsed.data.schoolId ?? parsed.data.tenantSlug);
  if (!schoolIdResult.ok) return NextResponse.json({ error: SCHOOL_LOGIN_ERROR_MESSAGE }, { status: 400 });
  const schoolId = schoolIdResult.schoolId;

  const tenant = await db.tenant.findUnique({ where: { slug: schoolId } });
  const resolved = tenant?.status === "ACTIVE"
    ? await findLoginUser(db, tenant.id, identifier)
    : null;
  const roleCodes = resolved ? activeRoleCodes(resolved.user) : [];
  const authenticated = (
    tenant?.status === "ACTIVE" &&
    resolved?.user.passwordCredential &&
    hasSchoolLoginRole(roleCodes)
  ) ? {
    tenant,
    resolved,
    credential: resolved.user.passwordCredential,
    roleCodes
  } : null;
  const sourceAddress = passwordLoginSourceAddress(request);
  let reservation: PasswordLoginReservation;
  try {
    reservation = await beginPasswordLoginAttempt({
      realm: PasswordLoginThrottleRealm.SCHOOL,
      channel: "SCHOOL_WEB",
      tenantId: tenant?.id ?? null,
      scopeKey: schoolId,
      accountKey: resolved?.user.id ?? normalizeLoginIdentifier(identifier),
      sourceAddress
    });
  } catch (error) {
    const response = passwordLoginProtectionResponse(error);
    if (response) return response;
    throw error;
  }

  const valid = await verifyPasswordOrDummy(
    password,
    authenticated?.credential.passwordHash ?? null
  );
  if (!valid || !authenticated) {
    await completePasswordLoginAttempt(reservation, "FAILURE");
    return NextResponse.json({ error: SCHOOL_LOGIN_ERROR_MESSAGE }, { status: 401 });
  }
  await completePasswordLoginAttempt(reservation, "SUCCESS");

  const session = await db.$transaction((tx) => createLoginSession(tx, {
    tenant: authenticated.tenant,
    user: authenticated.resolved.user,
    passwordChangeRequired: authenticated.credential.mustChange,
    authMethod: "PASSWORD",
    identifierType: authenticated.resolved.identifierType,
    auditAction: CAMPUS_CORE_AUDIT_EVENTS.AUTH_LOGIN_PASSWORD_SUCCESS,
    userAgent: request.headers.get("user-agent") ?? undefined,
    ipAddress: sourceAddress ?? undefined
  }));
  await setSessionCookie(session.rawToken, session.expiresAt);

  return NextResponse.json({
    ok: true,
    redirectTo: session.redirectTo,
    passwordChangeRequired: authenticated.credential.mustChange
  });
}
