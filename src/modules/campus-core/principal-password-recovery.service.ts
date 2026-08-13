import { createHmac, randomBytes, randomInt } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { writePlatformAuditLog } from "@/lib/audit/platform-audit-log";
import { hashPassword } from "@/lib/auth/password";
import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { LEGACY_PRINCIPAL_ROLE_CODES } from "@/lib/rbac/roles";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { PLATFORM_ADMINISTRATOR_AUDIT_EVENTS } from "@/modules/campus-core/platform-administrator-audit-events";
import type {
  CompletePrincipalPasswordResetInput,
  PrincipalPasswordRecoveryRequestInput,
  PrincipalRecoveryApproveInput,
  PrincipalRecoveryRejectInput
} from "@/modules/campus-core/principal-password-recovery.schemas";

type DbClient = PrismaClient | Prisma.TransactionClient;
type RequestMetadata = {
  ipAddress?: string;
  userAgent?: string;
};

const PRINCIPAL_ROLE_CODES = ["PRINCIPAL", ...LEGACY_PRINCIPAL_ROLE_CODES] as const;
const RECOVERY_TOKEN_HASH_DOMAIN = "jinacampus:principal-password-reset:";
const RECOVERY_IDENTIFIER_HASH_DOMAIN = "jinacampus:principal-recovery-identifier:";
const RECOVERY_IP_HASH_DOMAIN = "jinacampus:principal-recovery-ip:";
const RECOVERY_RATE_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_IDENTIFIER_RATE_LIMIT = 5;
const RECOVERY_IP_RATE_LIMIT = 20;
export const PRINCIPAL_RECOVERY_TOKEN_TTL_MS = 30 * 60 * 1000;

function hmac(domain: string, value: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${domain}${value}`)
    .digest("hex");
}

function identifierDetails(input: PrincipalPasswordRecoveryRequestInput) {
  if (input.principalId) {
    return {
      type: "PRINCIPAL_ID" as const,
      normalized: input.principalId
    };
  }
  return {
    type: "EMAIL" as const,
    normalized: input.email!
  };
}

function identifierHash(input: PrincipalPasswordRecoveryRequestInput) {
  const identifier = identifierDetails(input);
  return hmac(
    RECOVERY_IDENTIFIER_HASH_DOMAIN,
    `${input.tenantSlug}:${identifier.type}:${identifier.normalized}`
  );
}

function ipHash(ipAddress: string | undefined) {
  const normalized = ipAddress?.split(",")[0]?.trim();
  return normalized ? hmac(RECOVERY_IP_HASH_DOMAIN, normalized) : null;
}

function safeRequestMetadata(metadata: RequestMetadata) {
  return {
    ipAddress: metadata.ipAddress?.split(",")[0]?.trim().slice(0, 128) || undefined,
    userAgent: metadata.userAgent?.trim().slice(0, 500) || undefined
  };
}

function maskEmail(email: string) {
  const [local = "", domain = ""] = email.split("@");
  const visible = local.slice(0, 1);
  return domain ? `${visible}***@${domain}` : "***";
}

function maskPhone(phone: string) {
  return `***${phone.slice(-4)}`;
}

function notificationTarget(input: { email: string; phone: string | null }) {
  return input.email ? maskEmail(input.email) : input.phone ? maskPhone(input.phone) : null;
}

function generateTemporaryPassword() {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%&*?"
  ] as const;
  const all = groups.join("");
  const characters = groups.map((group) => group[randomInt(group.length)]);
  while (characters.length < 20) characters.push(all[randomInt(all.length)]);
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex]!, characters[index]!];
  }
  return characters.join("");
}

function createRawRecoveryToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrincipalRecoveryToken(rawToken: string) {
  return hmac(RECOVERY_TOKEN_HASH_DOMAIN, rawToken);
}

function buildResetUrl(requestId: string, rawToken: string) {
  const url = new URL("/principal-password-reset", env.APP_URL);
  url.hash = new URLSearchParams({ request: requestId, token: rawToken }).toString();
  return url.toString();
}

async function assertRecoveryAdministrator(ctx: PlatformAdministratorContext, client: DbClient = db) {
  if (!ctx.canManagePrincipalRecovery) {
    throw new AppError("PRINCIPAL_RECOVERY_ADMIN_REQUIRED", "PRINCIPAL_RECOVERY_ADMIN_REQUIRED", 403);
  }
  const administrator = await client.platformAdministrator.findFirst({
    where: {
      id: ctx.administratorId,
      status: "ACTIVE",
      canManagePrincipalRecovery: true
    },
    select: { id: true }
  });
  if (!administrator) {
    throw new AppError("PRINCIPAL_RECOVERY_ADMIN_REQUIRED", "PRINCIPAL_RECOVERY_ADMIN_REQUIRED", 403);
  }
}

async function recordRecoveryAttempt(
  input: PrincipalPasswordRecoveryRequestInput,
  tenantId: string | null,
  metadata: RequestMetadata
) {
  const normalizedMetadata = safeRequestMetadata(metadata);
  const requestIdentifierHash = identifierHash(input);
  const requestIpHash = ipHash(normalizedMetadata.ipAddress);
  const createdAt = { gte: new Date(Date.now() - RECOVERY_RATE_WINDOW_MS) };
  const retentionCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.principalPasswordRecoveryAttempt.deleteMany({
    where: {
      createdAt: { lt: retentionCutoff },
      OR: [
        { identifierHash: requestIdentifierHash },
        ...(requestIpHash ? [{ ipHash: requestIpHash }] : [])
      ]
    }
  });
  const [identifierCount, addressCount] = await Promise.all([
    db.principalPasswordRecoveryAttempt.count({
      where: { identifierHash: requestIdentifierHash, createdAt }
    }),
    requestIpHash
      ? db.principalPasswordRecoveryAttempt.count({
          where: { ipHash: requestIpHash, createdAt }
        })
      : Promise.resolve(0)
  ]);
  if (
    identifierCount >= RECOVERY_IDENTIFIER_RATE_LIMIT ||
    addressCount >= RECOVERY_IP_RATE_LIMIT
  ) {
    return { allowed: false, identifierHash: requestIdentifierHash, metadata: normalizedMetadata };
  }

  await db.principalPasswordRecoveryAttempt.create({
    data: {
      tenantId,
      identifierHash: requestIdentifierHash,
      ipHash: requestIpHash
    }
  });
  return { allowed: true, identifierHash: requestIdentifierHash, metadata: normalizedMetadata };
}

async function findEligiblePrincipal(
  client: DbClient,
  tenantId: string,
  input: PrincipalPasswordRecoveryRequestInput
) {
  return client.user.findFirst({
    where: {
      tenantId,
      status: "ACTIVE",
      ...(input.principalId ? { principalId: input.principalId } : { email: input.email! }),
      roleAssignments: {
        some: {
          tenantId,
          isActive: true,
          role: {
            tenantId,
            isActive: true,
            code: { in: [...PRINCIPAL_ROLE_CODES] }
          }
        }
      },
      branchAccesses: {
        some: {
          tenantId,
          isActive: true,
          branch: {
            tenantId,
            status: "ACTIVE",
            institution: { tenantId, status: "ACTIVE" }
          }
        }
      }
    },
    select: {
      id: true,
      tenantId: true,
      principalId: true,
      email: true,
      phone: true,
      userType: true,
      branchAccesses: {
        where: {
          tenantId,
          isActive: true,
          branch: {
            tenantId,
            status: "ACTIVE",
            institution: { tenantId, status: "ACTIVE" }
          }
        },
        select: {
          branchId: true,
          isPrimary: true,
          branch: {
            select: {
              institutionId: true,
              institution: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      }
    }
  });
}

export async function requestPrincipalPasswordRecovery(
  input: PrincipalPasswordRecoveryRequestInput,
  metadata: RequestMetadata = {}
) {
  const tenant = await db.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, name: true, status: true }
  });
  const tenantId = tenant?.status === "ACTIVE" ? tenant.id : null;
  const attempt = await recordRecoveryAttempt(input, tenantId, metadata);
  if (!attempt.allowed || !tenantId || !tenant) return { requested: true };

  const principal = await findEligiblePrincipal(db, tenantId, input);
  const branchAccess = principal?.branchAccesses[0];
  if (!principal || !branchAccess) return { requested: true };
  const now = new Date();
  const identifier = identifierDetails(input);

  try {
    await db.$transaction(async (tx) => {
      const expiredRequests = await tx.principalPasswordResetRequest.findMany({
        where: {
          principalUserId: principal.id,
          status: "APPROVED",
          resetTokenExpiresAt: { lte: now },
          resetTokenUsedAt: null
        },
        select: { id: true, tenantId: true, institutionId: true }
      });
      for (const expiredRequest of expiredRequests) {
        const expired = await tx.principalPasswordResetRequest.updateMany({
          where: {
            id: expiredRequest.id,
            status: "APPROVED",
            resetTokenExpiresAt: { lte: now },
            resetTokenUsedAt: null
          },
          data: { status: "EXPIRED" }
        });
        if (expired.count !== 1) continue;

        await tx.auditLog.create({
          data: {
            tenantId: expiredRequest.tenantId,
            actorUserId: null,
            action: CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_EXPIRED,
            entityType: "PrincipalPasswordResetRequest",
            entityId: expiredRequest.id,
            metadataJson: { expirySource: "subsequent_recovery_request" }
          }
        });
        await tx.platformAuditLog.create({
          data: {
            actorAdministratorId: null,
            action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_EXPIRED,
            entityType: "PrincipalPasswordResetRequest",
            entityId: expiredRequest.id,
            metadataJson: {
              targetTenantId: expiredRequest.tenantId,
              institutionId: expiredRequest.institutionId,
              principalUserId: principal.id,
              expirySource: "subsequent_recovery_request"
            }
          }
        });
      }
      const existing = await tx.principalPasswordResetRequest.findFirst({
        where: {
          principalUserId: principal.id,
          status: { in: ["PENDING", "APPROVED"] }
        },
        select: { id: true }
      });
      if (existing) return;

      const recoveryRequest = await tx.principalPasswordResetRequest.create({
        data: {
          tenantId,
          institutionId: branchAccess.branch.institutionId,
          principalUserId: principal.id,
          identifierType: identifier.type,
          identifierHash: attempt.identifierHash,
          requestedIpAddress: attempt.metadata.ipAddress,
          requestedUserAgent: attempt.metadata.userAgent,
          notificationTargetMasked: notificationTarget(principal)
        },
        select: { id: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          branchId: branchAccess.branchId,
          actorUserId: null,
          action: CAMPUS_CORE_AUDIT_EVENTS.AUTH_PASSWORD_RECOVERY_REQUESTED,
          entityType: "PrincipalPasswordResetRequest",
          entityId: recoveryRequest.id,
          metadataJson: {
            recoveryMode: "platform_administrator_review",
            identifierType: identifier.type,
            notificationDelivery: "manual_until_provider_configured"
          },
          ipAddress: attempt.metadata.ipAddress,
          userAgent: attempt.metadata.userAgent
        }
      });
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      throw error;
    }
  }

  return { requested: true };
}

async function loadRequestForAdministrator(client: DbClient, requestId: string) {
  const request = await client.principalPasswordResetRequest.findUnique({
    where: { id: requestId },
    include: {
      tenant: { select: { id: true, name: true, slug: true, status: true } },
      institution: { select: { id: true, tenantId: true, name: true, displayName: true, status: true } },
      principalUser: {
        select: {
          id: true,
          tenantId: true,
          principalId: true,
          email: true,
          phone: true,
          firstName: true,
          lastName: true,
          displayName: true,
          status: true,
          roleAssignments: {
            where: { isActive: true, role: { isActive: true } },
            select: { tenantId: true, role: { select: { tenantId: true, code: true } } }
          },
          branchAccesses: {
            where: { isActive: true },
            select: {
              tenantId: true,
              branch: { select: { tenantId: true, institutionId: true, status: true } }
            }
          }
        }
      }
    }
  });
  if (!request) throw notFound("PRINCIPAL_RECOVERY_REQUEST_NOT_FOUND");
  const principalRole = request.principalUser.roleAssignments.some((assignment) => (
    assignment.tenantId === request.tenantId &&
    assignment.role.tenantId === request.tenantId &&
    PRINCIPAL_ROLE_CODES.some((code) => code === assignment.role.code)
  ));
  const institutionAccess = request.principalUser.branchAccesses.some((access) => (
    access.tenantId === request.tenantId &&
    access.branch.tenantId === request.tenantId &&
    access.branch.institutionId === request.institutionId &&
    access.branch.status === "ACTIVE"
  ));
  if (
    request.tenant.status !== "ACTIVE" ||
    request.institution.tenantId !== request.tenantId ||
    request.institution.status !== "ACTIVE" ||
    request.principalUser.tenantId !== request.tenantId ||
    request.principalUser.status !== "ACTIVE" ||
    !principalRole ||
    !institutionAccess
  ) {
    throw notFound("PRINCIPAL_RECOVERY_REQUEST_NOT_FOUND");
  }
  return request;
}

export async function getPrincipalPasswordRecoveryRequests(ctx: PlatformAdministratorContext) {
  await assertRecoveryAdministrator(ctx);
  const now = new Date();
  return db.$transaction(async (tx) => {
    const expired = await tx.principalPasswordResetRequest.findMany({
      where: {
        status: "APPROVED",
        resetTokenExpiresAt: { lte: now },
        resetTokenUsedAt: null
      },
      select: { id: true, tenantId: true, institutionId: true, principalUserId: true }
    });
    for (const request of expired) {
      const updated = await tx.principalPasswordResetRequest.updateMany({
        where: { id: request.id, status: "APPROVED", resetTokenExpiresAt: { lte: now } },
        data: { status: "EXPIRED" }
      });
      if (updated.count === 1) {
        await tx.auditLog.create({
          data: {
            tenantId: request.tenantId,
            actorUserId: null,
            action: CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_EXPIRED,
            entityType: "PrincipalPasswordResetRequest",
            entityId: request.id,
            metadataJson: {
              authorizedAdministratorId: ctx.administratorId,
              institutionId: request.institutionId,
              principalUserId: request.principalUserId,
              expirySource: "administrator_queue_refresh"
            }
          }
        });
        await writePlatformAuditLog({
          ctx,
          action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_EXPIRED,
          entityType: "PrincipalPasswordResetRequest",
          entityId: request.id,
          metadata: {
            targetTenantId: request.tenantId,
            institutionId: request.institutionId,
            principalUserId: request.principalUserId
          }
        }, tx);
      }
    }

    return tx.principalPasswordResetRequest.findMany({
      select: {
        id: true,
        identifierType: true,
        status: true,
        resetMethod: true,
        reviewedAt: true,
        reviewRemarks: true,
        resetTokenExpiresAt: true,
        notificationStatus: true,
        notificationTargetMasked: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, slug: true } },
        institution: { select: { id: true, name: true, displayName: true } },
        principalUser: {
          select: {
            id: true,
            principalId: true,
            email: true,
            phone: true,
            firstName: true,
            lastName: true,
            displayName: true,
            status: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    });
  });
}

export async function approvePrincipalPasswordRecovery(
  ctx: PlatformAdministratorContext,
  input: PrincipalRecoveryApproveInput
) {
  await assertRecoveryAdministrator(ctx);
  const rawCredential = input.resetMethod === "RESET_LINK"
    ? createRawRecoveryToken()
    : generateTemporaryPassword();
  const credentialHash = input.resetMethod === "RESET_LINK"
    ? hashPrincipalRecoveryToken(rawCredential)
    : await hashPassword(rawCredential);
  const expiresAt = input.resetMethod === "RESET_LINK"
    ? new Date(Date.now() + PRINCIPAL_RECOVERY_TOKEN_TTL_MS)
    : null;

  const result = await db.$transaction(async (tx) => {
    await assertRecoveryAdministrator(ctx, tx);
    const request = await loadRequestForAdministrator(tx, input.requestId);
    if (request.status !== "PENDING") {
      throw new AppError("PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", "PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", 409);
    }
    const now = new Date();
    const claimed = await tx.principalPasswordResetRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: input.resetMethod === "RESET_LINK" ? "APPROVED" : "COMPLETED",
        resetMethod: input.resetMethod,
        reviewedByAdministratorId: ctx.administratorId,
        reviewedAt: now,
        identityVerifiedAt: now,
        reviewRemarks: input.reviewRemarks,
        resetTokenHash: input.resetMethod === "RESET_LINK" ? credentialHash : null,
        resetTokenExpiresAt: expiresAt,
        temporaryPasswordIssuedAt: input.resetMethod === "TEMPORARY_PASSWORD" ? now : null,
        completedAt: input.resetMethod === "TEMPORARY_PASSWORD" ? now : null,
        notificationStatus: "MANUAL_DELIVERY_REQUIRED",
        notificationTargetMasked: notificationTarget(request.principalUser)
      }
    });
    if (claimed.count !== 1) {
      throw new AppError("PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", "PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", 409);
    }

    let sessionsRevoked = 0;
    if (input.resetMethod === "TEMPORARY_PASSWORD") {
      await tx.passwordCredential.upsert({
        where: { userId: request.principalUserId },
        create: {
          userId: request.principalUserId,
          passwordHash: credentialHash,
          mustChange: true
        },
        update: {
          passwordHash: credentialHash,
          passwordUpdatedAt: now,
          mustChange: true
        }
      });
      sessionsRevoked = (await tx.session.updateMany({
        where: {
          tenantId: request.tenantId,
          userId: request.principalUserId,
          revokedAt: null
        },
        data: { revokedAt: now }
      })).count;
      await tx.passkeyCredential.deleteMany({
        where: { tenantId: request.tenantId, userId: request.principalUserId }
      });
    }

    await tx.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: null,
        action: input.resetMethod === "RESET_LINK"
          ? CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_APPROVED
          : CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RESET_COMPLETED,
        entityType: "PrincipalPasswordResetRequest",
        entityId: request.id,
        metadataJson: {
          resetMethod: input.resetMethod,
          identityVerified: true,
          mustChange: input.resetMethod === "TEMPORARY_PASSWORD",
          sessionsRevoked,
          authorizedByPlatformAdministrator: true,
          authorizedAdministratorId: ctx.administratorId,
          institutionId: request.institutionId,
          principalUserId: request.principalUserId
        }
      }
    });
    await writePlatformAuditLog({
      ctx,
      action: input.resetMethod === "RESET_LINK"
        ? PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_APPROVED
        : PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_TEMPORARY_PASSWORD_ISSUED,
      entityType: "PrincipalPasswordResetRequest",
      entityId: request.id,
      metadata: {
        targetTenantId: request.tenantId,
        institutionId: request.institutionId,
        principalUserId: request.principalUserId,
        resetMethod: input.resetMethod,
        identityVerified: true,
        sessionsRevoked,
        notificationDelivery: "manual_verified_channel"
      }
    }, tx);
    return {
      requestId: request.id,
      notificationTargetMasked: notificationTarget(request.principalUser)
    };
  }, { maxWait: 10_000, timeout: 30_000 });

  return {
    ...result,
    credentialType: input.resetMethod,
    oneTimeCredential: input.resetMethod === "RESET_LINK"
      ? buildResetUrl(result.requestId, rawCredential)
      : rawCredential,
    expiresAt
  } as const;
}

export async function rejectPrincipalPasswordRecovery(
  ctx: PlatformAdministratorContext,
  input: PrincipalRecoveryRejectInput
) {
  await assertRecoveryAdministrator(ctx);
  return db.$transaction(async (tx) => {
    await assertRecoveryAdministrator(ctx, tx);
    const request = await loadRequestForAdministrator(tx, input.requestId);
    if (request.status !== "PENDING") {
      throw new AppError("PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", "PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", 409);
    }
    const now = new Date();
    const rejected = await tx.principalPasswordResetRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: "REJECTED",
        reviewedByAdministratorId: ctx.administratorId,
        reviewedAt: now,
        reviewRemarks: input.reviewRemarks,
        rejectedAt: now
      }
    });
    if (rejected.count !== 1) {
      throw new AppError("PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", "PRINCIPAL_RECOVERY_REQUEST_ALREADY_REVIEWED", 409);
    }
    await tx.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: null,
        action: CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_REJECTED,
        entityType: "PrincipalPasswordResetRequest",
        entityId: request.id,
        metadataJson: {
          authorizedByPlatformAdministrator: true,
          authorizedAdministratorId: ctx.administratorId,
          institutionId: request.institutionId,
          principalUserId: request.principalUserId
        }
      }
    });
    await writePlatformAuditLog({
      ctx,
      action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RECOVERY_REJECTED,
      entityType: "PrincipalPasswordResetRequest",
      entityId: request.id,
      metadata: {
        targetTenantId: request.tenantId,
        institutionId: request.institutionId,
        principalUserId: request.principalUserId
      }
    }, tx);
    return { requestId: request.id };
  });
}

export async function completePrincipalPasswordReset(
  input: CompletePrincipalPasswordResetInput,
  metadata: RequestMetadata = {}
) {
  const tokenHash = hashPrincipalRecoveryToken(input.token);
  const passwordHash = await hashPassword(input.newPassword);
  const normalizedMetadata = safeRequestMetadata(metadata);
  const now = new Date();

  return db.$transaction(async (tx) => {
    const request = await tx.principalPasswordResetRequest.findFirst({
      where: {
        id: input.requestId,
        status: "APPROVED",
        resetMethod: "RESET_LINK",
        resetTokenHash: tokenHash,
        resetTokenUsedAt: null,
        resetTokenExpiresAt: { gt: now }
      },
      include: {
        tenant: { select: { status: true } },
        institution: { select: { tenantId: true, status: true } },
        principalUser: {
          select: {
            tenantId: true,
            status: true,
            roleAssignments: {
              where: { isActive: true, role: { isActive: true } },
              select: { tenantId: true, role: { select: { tenantId: true, code: true } } }
            },
            branchAccesses: {
              where: { isActive: true },
              select: {
                tenantId: true,
                branch: { select: { tenantId: true, institutionId: true, status: true } }
              }
            }
          }
        }
      }
    });
    const validPrincipal = request?.principalUser.roleAssignments.some((assignment) => (
      assignment.tenantId === request.tenantId &&
      assignment.role.tenantId === request.tenantId &&
      PRINCIPAL_ROLE_CODES.some((code) => code === assignment.role.code)
    ));
    const validInstitution = request?.principalUser.branchAccesses.some((access) => (
      access.tenantId === request.tenantId &&
      access.branch.tenantId === request.tenantId &&
      access.branch.institutionId === request.institutionId &&
      access.branch.status === "ACTIVE"
    ));
    if (
      !request ||
      request.tenant.status !== "ACTIVE" ||
      request.institution.tenantId !== request.tenantId ||
      request.institution.status !== "ACTIVE" ||
      request.principalUser.tenantId !== request.tenantId ||
      request.principalUser.status !== "ACTIVE" ||
      !validPrincipal ||
      !validInstitution
    ) {
      throw new AppError("PRINCIPAL_RECOVERY_LINK_INVALID", "PRINCIPAL_RECOVERY_LINK_INVALID", 400);
    }

    const claimed = await tx.principalPasswordResetRequest.updateMany({
      where: {
        id: request.id,
        status: "APPROVED",
        resetTokenHash: tokenHash,
        resetTokenUsedAt: null,
        resetTokenExpiresAt: { gt: now }
      },
      data: {
        status: "COMPLETED",
        resetTokenUsedAt: now,
        completedAt: now
      }
    });
    if (claimed.count !== 1) {
      throw new AppError("PRINCIPAL_RECOVERY_LINK_INVALID", "PRINCIPAL_RECOVERY_LINK_INVALID", 400);
    }

    await tx.passwordCredential.upsert({
      where: { userId: request.principalUserId },
      create: {
        userId: request.principalUserId,
        passwordHash,
        mustChange: false
      },
      update: {
        passwordHash,
        passwordUpdatedAt: now,
        mustChange: false
      }
    });
    const sessionsRevoked = await tx.session.updateMany({
      where: {
        tenantId: request.tenantId,
        userId: request.principalUserId,
        revokedAt: null
      },
      data: { revokedAt: now }
    });
    await tx.passkeyCredential.deleteMany({
      where: { tenantId: request.tenantId, userId: request.principalUserId }
    });
    await tx.auditLog.create({
      data: {
        tenantId: request.tenantId,
        actorUserId: request.principalUserId,
        action: CAMPUS_CORE_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RESET_COMPLETED,
        entityType: "PrincipalPasswordResetRequest",
        entityId: request.id,
        metadataJson: {
          resetMethod: "RESET_LINK",
          sessionsRevoked: sessionsRevoked.count,
          passkeysRevoked: true,
          mustChange: false
        },
        ipAddress: normalizedMetadata.ipAddress,
        userAgent: normalizedMetadata.userAgent
      }
    });
    await tx.platformAuditLog.create({
      data: {
        actorAdministratorId: null,
        action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PRINCIPAL_PASSWORD_RESET_COMPLETED,
        entityType: "PrincipalPasswordResetRequest",
        entityId: request.id,
        metadataJson: {
          targetTenantId: request.tenantId,
          institutionId: request.institutionId,
          principalUserId: request.principalUserId,
          resetMethod: "RESET_LINK",
          sessionsRevoked: sessionsRevoked.count
        },
        ipAddress: normalizedMetadata.ipAddress,
        userAgent: normalizedMetadata.userAgent
      }
    });
    return { completed: true };
  }, { maxWait: 10_000, timeout: 30_000 });
}
