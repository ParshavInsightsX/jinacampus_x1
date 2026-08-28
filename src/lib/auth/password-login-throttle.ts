import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import {
  PasswordLoginThrottleDimension,
  PasswordLoginThrottleRealm,
  Prisma,
  type PasswordLoginThrottle
} from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { PLATFORM_ADMINISTRATOR_AUDIT_EVENTS } from "@/modules/campus-core/platform-administrator-audit-events";

export type PasswordLoginChannel =
  | "SCHOOL_WEB"
  | "MOBILE"
  | "ADMINISTRATOR_WEB";

export type PasswordLoginAttemptInput = {
  realm: PasswordLoginThrottleRealm;
  channel: PasswordLoginChannel;
  tenantId?: string | null;
  scopeKey: string;
  accountKey: string;
  sourceAddress?: string | null;
};

type ReservationBucket = {
  id: string;
  dimension: PasswordLoginThrottleDimension;
  failureCount: number;
  blockStarted: boolean;
};

export type PasswordLoginReservation = {
  realm: PasswordLoginThrottleRealm;
  channel: PasswordLoginChannel;
  tenantId: string | null;
  accountBucketId: string;
  sourceBucketId: string | null;
  buckets: ReservationBucket[];
};

type BucketSpec = {
  dimension: PasswordLoginThrottleDimension;
  keyHash: string;
};

type CooldownStep = {
  failures: number;
  cooldownMs: number;
};

const HASH_DOMAIN = "jinacampus:password-login-throttle:v1:";
const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_SERIALIZABLE_RETRIES = 3;

const ACCOUNT_STEPS: readonly CooldownStep[] = [
  { failures: 5, cooldownMs: 60 * 1000 },
  { failures: 7, cooldownMs: 5 * 60 * 1000 },
  { failures: 10, cooldownMs: 15 * 60 * 1000 }
];

const SCHOOL_SOURCE_STEPS: readonly CooldownStep[] = [
  { failures: 50, cooldownMs: 60 * 1000 },
  { failures: 75, cooldownMs: 5 * 60 * 1000 },
  { failures: 100, cooldownMs: 15 * 60 * 1000 }
];

const ADMINISTRATOR_SOURCE_STEPS: readonly CooldownStep[] = [
  { failures: 20, cooldownMs: 60 * 1000 },
  { failures: 30, cooldownMs: 5 * 60 * 1000 },
  { failures: 50, cooldownMs: 15 * 60 * 1000 }
];

let nextCleanupAt = 0;

export class PasswordLoginThrottledError extends AppError {
  constructor(public readonly retryAfterSeconds: number) {
    super("PASSWORD_LOGIN_THROTTLED", "PASSWORD_LOGIN_THROTTLED", 429);
  }
}

function hashThrottleValue(label: string, value: string) {
  return createHmac("sha256", env.SESSION_SECRET)
    .update(`${HASH_DOMAIN}${label}:${value}`)
    .digest("hex");
}

function sourceAddressFromHeader(value: string | null) {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate.toLowerCase() : null;
}

export function passwordLoginSourceAddress(request: Request) {
  return sourceAddressFromHeader(
    request.headers.get("x-forwarded-for") ??
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip")
  );
}

function cooldownSteps(
  realm: PasswordLoginThrottleRealm,
  dimension: PasswordLoginThrottleDimension
) {
  if (dimension === PasswordLoginThrottleDimension.ACCOUNT) return ACCOUNT_STEPS;
  return realm === PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR
    ? ADMINISTRATOR_SOURCE_STEPS
    : SCHOOL_SOURCE_STEPS;
}

export function passwordLoginCooldownMs(
  realm: PasswordLoginThrottleRealm,
  dimension: PasswordLoginThrottleDimension,
  failureCount: number
) {
  let cooldownMs = 0;
  for (const step of cooldownSteps(realm, dimension)) {
    if (failureCount >= step.failures) cooldownMs = step.cooldownMs;
  }
  return cooldownMs;
}

function retryAfterSeconds(blockedUntil: Date, now: Date) {
  return Math.max(1, Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000));
}

function isSerializableConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  ) || (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2034"
  );
}

function safeDatabaseErrorCode(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 32);
  }
  return "UNKNOWN";
}

async function runSerializable<T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>
) {
  for (let attempt = 1; attempt <= MAX_SERIALIZABLE_RETRIES; attempt += 1) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 5_000
      });
    } catch (error) {
      if (!isSerializableConflict(error) || attempt === MAX_SERIALIZABLE_RETRIES) {
        throw error;
      }
    }
  }
  throw new Error("PASSWORD_LOGIN_THROTTLE_RETRY_EXHAUSTED");
}

async function maybeCleanupThrottleBuckets(now: Date) {
  if (now.getTime() < nextCleanupAt) return;
  nextCleanupAt = now.getTime() + CLEANUP_INTERVAL_MS;
  try {
    await db.passwordLoginThrottle.deleteMany({
      where: {
        updatedAt: { lt: new Date(now.getTime() - RETENTION_MS) }
      }
    });
  } catch {
    nextCleanupAt = 0;
  }
}

function bucketWhere(
  realm: PasswordLoginThrottleRealm,
  dimension: PasswordLoginThrottleDimension,
  scopeHash: string,
  keyHash: string
) {
  return {
    realm_dimension_scopeHash_keyHash: {
      realm,
      dimension,
      scopeHash,
      keyHash
    }
  } as const;
}

async function reserveBuckets(
  input: PasswordLoginAttemptInput,
  now: Date,
  scopeHash: string,
  specs: BucketSpec[]
) {
  return runSerializable(async (tx) => {
    const rows: PasswordLoginThrottle[] = [];
    for (const spec of specs) {
      rows.push(await tx.passwordLoginThrottle.upsert({
        where: bucketWhere(input.realm, spec.dimension, scopeHash, spec.keyHash),
        create: {
          tenantId: input.tenantId ?? null,
          realm: input.realm,
          dimension: spec.dimension,
          scopeHash,
          keyHash: spec.keyHash,
          failureCount: 0,
          windowStartedAt: now,
          updatedAt: now
        },
        update: {
          tenantId: input.tenantId ?? undefined,
          updatedAt: now
        }
      }));
    }

    const activeBlocks = rows
      .map((row) => row.blockedUntil)
      .filter((blockedUntil): blockedUntil is Date => Boolean(
        blockedUntil && blockedUntil.getTime() > now.getTime()
      ));
    if (activeBlocks.length > 0) {
      const blockedUntil = activeBlocks.reduce((latest, candidate) => (
        candidate.getTime() > latest.getTime() ? candidate : latest
      ));
      return {
        allowed: false as const,
        retryAfterSeconds: retryAfterSeconds(blockedUntil, now)
      };
    }

    const windowCutoff = now.getTime() - WINDOW_MS;
    const reserved: ReservationBucket[] = [];
    for (const row of rows) {
      const windowExpired = row.windowStartedAt.getTime() <= windowCutoff;
      const failureCount = windowExpired ? 1 : row.failureCount + 1;
      const windowStartedAt = windowExpired ? now : row.windowStartedAt;
      const cooldownMs = passwordLoginCooldownMs(
        input.realm,
        row.dimension,
        failureCount
      );
      const blockedUntil = cooldownMs > 0
        ? new Date(now.getTime() + cooldownMs)
        : null;

      await tx.passwordLoginThrottle.update({
        where: { id: row.id },
        data: {
          tenantId: input.tenantId ?? undefined,
          failureCount,
          windowStartedAt,
          lastAttemptAt: now,
          blockedUntil,
          updatedAt: now
        }
      });
      reserved.push({
        id: row.id,
        dimension: row.dimension,
        failureCount,
        blockStarted: blockedUntil !== null
      });
    }

    return { allowed: true as const, buckets: reserved };
  });
}

export async function beginPasswordLoginAttempt(
  input: PasswordLoginAttemptInput,
  now = new Date()
): Promise<PasswordLoginReservation> {
  const scopeKey = input.scopeKey.trim().toLowerCase();
  const accountKey = input.accountKey.trim();
  if (!scopeKey || !accountKey) {
    throw new AppError(
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      503
    );
  }

  const scopeHash = hashThrottleValue(`${input.realm}:scope`, scopeKey);
  const accountKeyHash = hashThrottleValue(
    `${input.realm}:account`,
    `${scopeHash}:${accountKey}`
  );
  const sourceAddress = input.sourceAddress?.trim() || null;
  const sourceKeyHash = sourceAddress
    ? hashThrottleValue(`${input.realm}:source`, `${scopeHash}:${sourceAddress}`)
    : null;
  const specs: BucketSpec[] = [
    {
      dimension: PasswordLoginThrottleDimension.ACCOUNT,
      keyHash: accountKeyHash
    },
    ...(sourceKeyHash ? [{
      dimension: PasswordLoginThrottleDimension.SOURCE,
      keyHash: sourceKeyHash
    }] : [])
  ];

  try {
    await maybeCleanupThrottleBuckets(now);
    const result = await reserveBuckets(input, now, scopeHash, specs);
    if (!result.allowed) {
      throw new PasswordLoginThrottledError(result.retryAfterSeconds);
    }
    const accountBucket = result.buckets.find(
      (bucket) => bucket.dimension === PasswordLoginThrottleDimension.ACCOUNT
    );
    const sourceBucket = result.buckets.find(
      (bucket) => bucket.dimension === PasswordLoginThrottleDimension.SOURCE
    );
    if (!accountBucket) throw new Error("PASSWORD_LOGIN_ACCOUNT_BUCKET_MISSING");

    return {
      realm: input.realm,
      channel: input.channel,
      tenantId: input.tenantId ?? null,
      accountBucketId: accountBucket.id,
      sourceBucketId: sourceBucket?.id ?? null,
      buckets: result.buckets
    };
  } catch (error) {
    if (error instanceof PasswordLoginThrottledError) throw error;
    console.error("Password login protection is unavailable.", {
      code: safeDatabaseErrorCode(error)
    });
    throw new AppError(
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      503
    );
  }
}

async function writeThrottleAudit(reservation: PasswordLoginReservation) {
  const blockedBuckets = reservation.buckets.filter((bucket) => bucket.blockStarted);
  if (blockedBuckets.length === 0) return;
  const metadata = {
    realm: reservation.realm,
    channel: reservation.channel,
    dimensions: blockedBuckets.map((bucket) => bucket.dimension),
    failureCounts: Object.fromEntries(
      blockedBuckets.map((bucket) => [bucket.dimension, bucket.failureCount])
    )
  };

  if (reservation.realm === PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR) {
    await db.platformAuditLog.create({
      data: {
        action: PLATFORM_ADMINISTRATOR_AUDIT_EVENTS.PASSWORD_LOGIN_THROTTLED,
        entityType: "PasswordLoginThrottle",
        entityId: reservation.accountBucketId,
        metadataJson: metadata
      }
    });
    return;
  }

  if (reservation.tenantId) {
    await db.auditLog.create({
      data: {
        tenantId: reservation.tenantId,
        action: CAMPUS_CORE_AUDIT_EVENTS.AUTH_PASSWORD_LOGIN_THROTTLED,
        entityType: "PasswordLoginThrottle",
        entityId: reservation.accountBucketId,
        metadataJson: metadata
      }
    });
  }
}

async function releaseSuccessfulAttempt(
  reservation: PasswordLoginReservation,
  now: Date
) {
  await runSerializable(async (tx) => {
    await tx.passwordLoginThrottle.deleteMany({
      where: { id: reservation.accountBucketId }
    });

    if (!reservation.sourceBucketId) return;
    const sourceBucket = await tx.passwordLoginThrottle.findUnique({
      where: { id: reservation.sourceBucketId }
    });
    if (!sourceBucket) return;

    const failureCount = Math.max(0, sourceBucket.failureCount - 1);
    if (failureCount === 0) {
      await tx.passwordLoginThrottle.delete({ where: { id: sourceBucket.id } });
      return;
    }

    const threshold = cooldownSteps(
      reservation.realm,
      PasswordLoginThrottleDimension.SOURCE
    )[0]!.failures;
    await tx.passwordLoginThrottle.update({
      where: { id: sourceBucket.id },
      data: {
        failureCount,
        blockedUntil: failureCount < threshold ? null : sourceBucket.blockedUntil,
        updatedAt: now
      }
    });
  });
}

export async function completePasswordLoginAttempt(
  reservation: PasswordLoginReservation,
  outcome: "SUCCESS" | "FAILURE",
  now = new Date()
) {
  if (outcome === "FAILURE") {
    try {
      await writeThrottleAudit(reservation);
    } catch (error) {
      console.error("Password login throttle audit could not be recorded.", {
        code: safeDatabaseErrorCode(error)
      });
    }
    return;
  }

  try {
    await releaseSuccessfulAttempt(reservation, now);
  } catch (error) {
    console.error("Password login protection could not release a successful attempt.", {
      code: safeDatabaseErrorCode(error)
    });
    throw new AppError(
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      503
    );
  }
}
