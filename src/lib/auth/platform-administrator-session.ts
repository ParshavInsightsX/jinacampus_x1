import { createHmac } from "node:crypto";
import { cookies, headers } from "next/headers";

import { createRawSessionToken, getSessionExpiresAt } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

const PLATFORM_SESSION_HASH_DOMAIN = "jinacampus:platform-administrator-session:";

export type PlatformAdministratorContext = {
  administratorId: string;
  sessionId: string;
  email: string;
  displayName: string | null;
  canManagePrincipalRecovery: boolean;
  passwordChangeRequired: boolean;
  ipAddress?: string;
  userAgent?: string;
};

type PlatformAdministratorContextOptions = {
  allowPasswordChangeRequired?: boolean;
};

export function createRawPlatformAdministratorSessionToken() {
  return createRawSessionToken();
}

export async function hashPlatformAdministratorSessionToken(rawToken: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${PLATFORM_SESSION_HASH_DOMAIN}${rawToken}`)
    .digest("hex");
}

export function getPlatformAdministratorSessionExpiresAt() {
  return getSessionExpiresAt();
}

export async function setPlatformAdministratorSessionCookie(rawToken: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(env.PLATFORM_SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt
  });
}

export async function clearPlatformAdministratorSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(env.PLATFORM_SESSION_COOKIE_NAME);
}

export function isPlatformAdministratorPasswordChangeRequiredError(error: unknown) {
  return error instanceof Error && error.message === "PLATFORM_PASSWORD_CHANGE_REQUIRED";
}

export async function getPlatformAdministratorContext(
  options: PlatformAdministratorContextOptions = {}
): Promise<PlatformAdministratorContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const rawToken = cookieStore.get(env.PLATFORM_SESSION_COOKIE_NAME)?.value;
  if (!rawToken) throw new Error("PLATFORM_UNAUTHENTICATED");

  const tokenHash = await hashPlatformAdministratorSessionToken(rawToken);
  const session = await db.platformAdministratorSession.findUnique({
    where: { tokenHash },
    include: {
      administrator: {
        include: {
          credential: { select: { mustChange: true } }
        }
      }
    }
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new Error("PLATFORM_UNAUTHENTICATED");
  }
  if (session.administrator.status !== "ACTIVE") {
    throw new Error("PLATFORM_ADMINISTRATOR_INACTIVE");
  }

  const ctx: PlatformAdministratorContext = {
    administratorId: session.administratorId,
    sessionId: session.id,
    email: session.administrator.email,
    displayName: session.administrator.displayName,
    canManagePrincipalRecovery: session.administrator.canManagePrincipalRecovery,
    passwordChangeRequired: session.administrator.credential?.mustChange ?? true,
    ipAddress: headerStore.get("x-forwarded-for") ?? undefined,
    userAgent: headerStore.get("user-agent") ?? undefined
  };

  if (ctx.passwordChangeRequired && !options.allowPasswordChangeRequired) {
    throw new Error("PLATFORM_PASSWORD_CHANGE_REQUIRED");
  }

  return ctx;
}
