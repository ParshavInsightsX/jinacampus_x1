import { createHmac } from "node:crypto";

import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON
} from "@simplewebauthn/server";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse
} from "@simplewebauthn/server";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { activeRoleCodes, findLoginUser, loginUserInclude, normalizeLoginIdentifier } from "@/lib/auth/login-identity";
import { createLoginSession } from "@/lib/auth/login-session";
import { verifyPassword } from "@/lib/auth/password";
import { getWebAuthnConfig } from "@/lib/auth/webauthn-config";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { hasSchoolLoginRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_RATE_WINDOW_MS = 10 * 60 * 1000;
const CHALLENGE_RATE_LIMIT = 10;
const PASSKEY_TIMEOUT_MS = 60_000;
const VALID_TRANSPORTS = new Set<AuthenticatorTransportFuture>([
  "ble",
  "cable",
  "hybrid",
  "internal",
  "nfc",
  "smart-card",
  "usb"
]);

type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

function identifierDigest(tenantId: string, identifier: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${tenantId}:${normalizeLoginIdentifier(identifier)}`)
    .digest("hex");
}

function safeTransports(values: readonly string[] | undefined): AuthenticatorTransportFuture[] {
  return (values ?? []).filter(
    (value): value is AuthenticatorTransportFuture => VALID_TRANSPORTS.has(value as AuthenticatorTransportFuture)
  );
}

async function enforceChallengeRateLimit(
  tenantId: string,
  identifierHash: string | null,
  metadata: RequestMetadata
) {
  const createdAt = { gte: new Date(Date.now() - CHALLENGE_RATE_WINDOW_MS) };
  const count = await db.passkeyChallenge.count({
    where: {
      tenantId,
      createdAt,
      ...(metadata.ipAddress
        ? { ipAddress: metadata.ipAddress }
        : { identifierHash: identifierHash ?? undefined })
    }
  });
  if (count >= CHALLENGE_RATE_LIMIT) {
    throw new AppError("PASSKEY_RATE_LIMITED", "PASSKEY_RATE_LIMITED", 429);
  }
}

async function clearExpiredChallenges(tenantId: string) {
  await db.passkeyChallenge.deleteMany({
    where: { tenantId, expiresAt: { lt: new Date() } }
  });
}

function activeChallengeWhere(
  tenantId: string,
  challenge: string,
  purpose: "REGISTRATION" | "AUTHENTICATION"
) {
  return {
    tenantId,
    challenge,
    purpose,
    consumedAt: null,
    expiresAt: { gt: new Date() }
  } as const;
}

export async function createPasskeyAuthenticationOptions(input: {
  tenantId: string;
  identifier: string;
  metadata: RequestMetadata;
}) {
  const identifierHash = identifierDigest(input.tenantId, input.identifier);
  await clearExpiredChallenges(input.tenantId);
  await enforceChallengeRateLimit(input.tenantId, identifierHash, input.metadata);

  const resolved = await findLoginUser(db, input.tenantId, input.identifier);
  const resolvedRoleCodes = resolved ? activeRoleCodes(resolved.user) : [];
  const schoolUser = resolved && hasSchoolLoginRole(resolvedRoleCodes) ? resolved : null;
  const credentialCount = schoolUser
    ? await db.passkeyCredential.count({
      where: { tenantId: input.tenantId, userId: schoolUser.user.id }
    })
    : 0;
  const options = await generateAuthenticationOptions({
    rpID: getWebAuthnConfig().rpID,
    timeout: PASSKEY_TIMEOUT_MS,
    userVerification: "required"
  });

  await db.passkeyChallenge.create({
    data: {
      tenantId: input.tenantId,
      userId: schoolUser && credentialCount > 0 ? schoolUser.user.id : null,
      purpose: "AUTHENTICATION",
      challenge: options.challenge,
      identifierHash,
      identifierType: schoolUser?.identifierType,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      ipAddress: input.metadata.ipAddress,
      userAgent: input.metadata.userAgent
    }
  });

  return options;
}

export async function verifyPasskeyAuthentication(input: {
  tenant: { id: string; name: string };
  challenge: string;
  response: AuthenticationResponseJSON;
  metadata: RequestMetadata;
}) {
  const challenge = await db.passkeyChallenge.findFirst({
    where: activeChallengeWhere(input.tenant.id, input.challenge, "AUTHENTICATION")
  });
  if (!challenge?.userId) {
    throw new AppError("PASSKEY_AUTHENTICATION_FAILED", "PASSKEY_AUTHENTICATION_FAILED", 401);
  }

  const credential = await db.passkeyCredential.findFirst({
    where: {
      tenantId: input.tenant.id,
      userId: challenge.userId,
      credentialId: input.response.id
    },
    include: {
      user: { include: loginUserInclude }
    }
  });
  if (
    !credential ||
    credential.user.tenantId !== input.tenant.id ||
    credential.user.status !== "ACTIVE" ||
    !hasSchoolLoginRole(activeRoleCodes(credential.user))
  ) {
    throw new AppError("PASSKEY_AUTHENTICATION_FAILED", "PASSKEY_AUTHENTICATION_FAILED", 401);
  }

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: safeTransports(credential.transports)
      },
      requireUserVerification: true
    });
  } catch {
    throw new AppError("PASSKEY_AUTHENTICATION_FAILED", "PASSKEY_AUTHENTICATION_FAILED", 401);
  }
  if (!verification.verified) {
    throw new AppError("PASSKEY_AUTHENTICATION_FAILED", "PASSKEY_AUTHENTICATION_FAILED", 401);
  }

  return db.$transaction(async (tx) => {
    const claimed = await tx.passkeyChallenge.updateMany({
      where: {
        id: challenge.id,
        ...activeChallengeWhere(input.tenant.id, input.challenge, "AUTHENTICATION")
      },
      data: { consumedAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new AppError("PASSKEY_AUTHENTICATION_FAILED", "PASSKEY_AUTHENTICATION_FAILED", 401);
    }

    await tx.passkeyCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        lastUsedAt: new Date()
      }
    });

    return createLoginSession(tx, {
      tenant: input.tenant,
      user: credential.user,
      passwordChangeRequired: credential.user.passwordCredential?.mustChange ?? false,
      authMethod: "PASSKEY",
      identifierType: challenge.identifierType === "EMAIL" ? "EMAIL" : "EMPLOYEE_CODE",
      auditAction: CAMPUS_CORE_AUDIT_EVENTS.AUTH_LOGIN_PASSKEY_SUCCESS,
      ipAddress: input.metadata.ipAddress,
      userAgent: input.metadata.userAgent
    });
  });
}

export async function createPasskeyRegistrationOptions(
  ctx: TenantContext,
  currentPassword: string
) {
  if (!hasSchoolLoginRole(ctx.roleCodes ?? [])) {
    throw new AppError("SCHOOL_LOGIN_REQUIRED", "SCHOOL_LOGIN_REQUIRED", 403);
  }
  if (ctx.passwordChangeRequired) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "PASSWORD_CHANGE_REQUIRED", 403);
  }
  const user = await db.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    include: {
      passwordCredential: true,
      passkeyCredentials: {
        select: { credentialId: true, transports: true }
      }
    }
  });
  if (!user?.passwordCredential || !await verifyPassword(currentPassword, user.passwordCredential.passwordHash)) {
    throw new AppError("CURRENT_PASSWORD_INCORRECT", "CURRENT_PASSWORD_INCORRECT", 400);
  }

  const identifierHash = identifierDigest(ctx.tenantId, ctx.userEmail);
  await clearExpiredChallenges(ctx.tenantId);
  await enforceChallengeRateLimit(ctx.tenantId, identifierHash, {
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent
  });

  const config = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userID: Buffer.from(user.id, "utf8"),
    userName: user.email,
    userDisplayName: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    timeout: PASSKEY_TIMEOUT_MS,
    attestationType: "none",
    excludeCredentials: user.passkeyCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: safeTransports(credential.transports)
    })),
    authenticatorSelection: {
      residentKey: "required",
      userVerification: "required"
    },
    supportedAlgorithmIDs: [-7, -257]
  });

  await db.passkeyChallenge.create({
    data: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      purpose: "REGISTRATION",
      challenge: options.challenge,
      identifierHash,
      identifierType: "EMAIL",
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent
    }
  });
  return options;
}

export async function verifyPasskeyRegistration(input: {
  ctx: TenantContext;
  challenge: string;
  response: RegistrationResponseJSON;
  name?: string;
}) {
  if (!hasSchoolLoginRole(input.ctx.roleCodes ?? [])) {
    throw new AppError("SCHOOL_LOGIN_REQUIRED", "SCHOOL_LOGIN_REQUIRED", 403);
  }
  if (input.ctx.passwordChangeRequired) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "PASSWORD_CHANGE_REQUIRED", 403);
  }
  const challenge = await db.passkeyChallenge.findFirst({
    where: {
      userId: input.ctx.userId,
      ...activeChallengeWhere(input.ctx.tenantId, input.challenge, "REGISTRATION")
    }
  });
  if (!challenge) {
    throw new AppError("PASSKEY_REGISTRATION_FAILED", "PASSKEY_REGISTRATION_FAILED", 400);
  }

  const config = getWebAuthnConfig();
  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: config.origin,
      expectedRPID: config.rpID,
      requireUserVerification: true,
      supportedAlgorithmIDs: [-7, -257]
    });
  } catch {
    throw new AppError("PASSKEY_REGISTRATION_FAILED", "PASSKEY_REGISTRATION_FAILED", 400);
  }
  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError("PASSKEY_REGISTRATION_FAILED", "PASSKEY_REGISTRATION_FAILED", 400);
  }

  const { credential, credentialBackedUp, credentialDeviceType } = verification.registrationInfo;
  return db.$transaction(async (tx) => {
    const claimed = await tx.passkeyChallenge.updateMany({
      where: {
        id: challenge.id,
        userId: input.ctx.userId,
        ...activeChallengeWhere(input.ctx.tenantId, input.challenge, "REGISTRATION")
      },
      data: { consumedAt: new Date() }
    });
    if (claimed.count !== 1) {
      throw new AppError("PASSKEY_REGISTRATION_FAILED", "PASSKEY_REGISTRATION_FAILED", 400);
    }

    const created = await tx.passkeyCredential.create({
      data: {
        tenantId: input.ctx.tenantId,
        userId: input.ctx.userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: safeTransports(credential.transports),
        name: input.name
      },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        createdAt: true,
        lastUsedAt: true
      }
    });
    await writeAuditLog({
      ctx: input.ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_PASSKEY_REGISTERED,
      entityType: "PasskeyCredential",
      entityId: created.id,
      metadata: {
        deviceType: created.deviceType,
        backedUp: created.backedUp
      }
    }, tx);
    return created;
  });
}

export async function listPasskeys(ctx: TenantContext) {
  if (!hasSchoolLoginRole(ctx.roleCodes ?? [])) {
    throw new AppError("SCHOOL_LOGIN_REQUIRED", "SCHOOL_LOGIN_REQUIRED", 403);
  }
  return db.passkeyCredential.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true
    },
    orderBy: { createdAt: "desc" }
  });
}

export async function removePasskey(
  ctx: TenantContext,
  input: { credentialId: string; currentPassword: string }
) {
  if (!hasSchoolLoginRole(ctx.roleCodes ?? [])) {
    throw new AppError("SCHOOL_LOGIN_REQUIRED", "SCHOOL_LOGIN_REQUIRED", 403);
  }
  const credential = await db.passwordCredential.findUnique({
    where: { userId: ctx.userId },
    select: { passwordHash: true }
  });
  if (!credential || !await verifyPassword(input.currentPassword, credential.passwordHash)) {
    throw new AppError("CURRENT_PASSWORD_INCORRECT", "CURRENT_PASSWORD_INCORRECT", 400);
  }

  return db.$transaction(async (tx) => {
    const passkey = await tx.passkeyCredential.findFirst({
      where: {
        id: input.credentialId,
        tenantId: ctx.tenantId,
        userId: ctx.userId
      },
      select: { id: true, name: true, deviceType: true }
    });
    if (!passkey) throw new AppError("PASSKEY_NOT_FOUND", "PASSKEY_NOT_FOUND", 404);

    await tx.passkeyCredential.delete({ where: { id: passkey.id } });
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_PASSKEY_REMOVED,
      entityType: "PasskeyCredential",
      entityId: passkey.id,
      metadata: { deviceType: passkey.deviceType }
    }, tx);
    return { id: passkey.id };
  });
}
