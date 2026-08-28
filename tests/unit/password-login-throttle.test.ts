import {
  PasswordLoginThrottleDimension,
  PasswordLoginThrottleRealm
} from "@prisma/client";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: {
    $transaction: vi.fn(),
    passwordLoginThrottle: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
    platformAuditLog: { create: vi.fn() }
  },
  tx: {
    passwordLoginThrottle: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn()
    }
  }
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/env", () => ({
  env: {
    SESSION_SECRET: "test-session-secret-that-is-long-enough",
    PASSWORD_PEPPER: "test-password-pepper"
  }
}));

import {
  PasswordLoginThrottledError,
  beginPasswordLoginAttempt,
  completePasswordLoginAttempt,
  passwordLoginCooldownMs,
  passwordLoginSourceAddress
} from "@/lib/auth/password-login-throttle";
import { hashPassword, verifyPasswordOrDummy } from "@/lib/auth/password";

type ThrottleRow = {
  id: string;
  tenantId: string | null;
  realm: PasswordLoginThrottleRealm;
  dimension: PasswordLoginThrottleDimension;
  scopeHash: string;
  keyHash: string;
  failureCount: number;
  windowStartedAt: Date;
  lastAttemptAt: Date | null;
  blockedUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type BucketKey = {
  realm: PasswordLoginThrottleRealm;
  dimension: PasswordLoginThrottleDimension;
  scopeHash: string;
  keyHash: string;
};

type UpsertInput = {
  where: { realm_dimension_scopeHash_keyHash: BucketKey };
  create: Omit<ThrottleRow, "id" | "createdAt" | "lastAttemptAt" | "blockedUntil">;
  update: Partial<ThrottleRow>;
};

type UpdateInput = {
  where: { id: string };
  data: Partial<ThrottleRow>;
};

const tenantId = "00000000-0000-0000-0000-000000000001";
const now = new Date("2026-08-28T09:00:00.000Z");
let rows: Map<string, ThrottleRow>;
let bucketIds: Map<string, string>;

function compositeKey(key: BucketKey) {
  return [key.realm, key.dimension, key.scopeHash, key.keyHash].join(":");
}

function assignDefined(target: ThrottleRow, values: Partial<ThrottleRow>) {
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      (target as unknown as Record<string, unknown>)[key] = value;
    }
  }
}

function schoolInput(channel: "SCHOOL_WEB" | "MOBILE" = "SCHOOL_WEB") {
  return {
    realm: PasswordLoginThrottleRealm.SCHOOL,
    channel,
    tenantId,
    scopeKey: "jinacampus-demo",
    accountKey: "user:principal",
    sourceAddress: null
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = new Map();
  bucketIds = new Map();
  mocks.db.passwordLoginThrottle.deleteMany.mockResolvedValue({ count: 0 });
  mocks.db.auditLog.create.mockResolvedValue({});
  mocks.db.platformAuditLog.create.mockResolvedValue({});
  mocks.db.$transaction.mockImplementation(
    async (callback: (client: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx)
  );
  mocks.tx.passwordLoginThrottle.upsert.mockImplementation(async (input: UpsertInput) => {
    const key = compositeKey(input.where.realm_dimension_scopeHash_keyHash);
    const existingId = bucketIds.get(key);
    if (existingId) {
      const existing = rows.get(existingId)!;
      assignDefined(existing, input.update);
      return { ...existing };
    }
    const id = `bucket-${rows.size + 1}`;
    const row: ThrottleRow = {
      ...input.create,
      id,
      lastAttemptAt: null,
      blockedUntil: null,
      createdAt: input.create.updatedAt
    };
    rows.set(id, row);
    bucketIds.set(key, id);
    return { ...row };
  });
  mocks.tx.passwordLoginThrottle.update.mockImplementation(async (input: UpdateInput) => {
    const row = rows.get(input.where.id)!;
    assignDefined(row, input.data);
    return { ...row };
  });
  mocks.tx.passwordLoginThrottle.findUnique.mockImplementation(
    async (input: { where: { id: string } }) => {
      const row = rows.get(input.where.id);
      return row ? { ...row } : null;
    }
  );
  mocks.tx.passwordLoginThrottle.delete.mockImplementation(
    async (input: { where: { id: string } }) => {
      const row = rows.get(input.where.id)!;
      rows.delete(input.where.id);
      for (const [key, id] of bucketIds) {
        if (id === input.where.id) bucketIds.delete(key);
      }
      return row;
    }
  );
  mocks.tx.passwordLoginThrottle.deleteMany.mockImplementation(
    async (input: { where: { id: string } }) => {
      const existed = rows.delete(input.where.id);
      for (const [key, id] of bucketIds) {
        if (id === input.where.id) bucketIds.delete(key);
      }
      return { count: existed ? 1 : 0 };
    }
  );
});

describe("database-backed password login throttling", () => {
  it("allows five failed account attempts, then returns a durable cooldown", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const reservation = await beginPasswordLoginAttempt(schoolInput(), now);
      await completePasswordLoginAttempt(reservation, "FAILURE", now);
    }

    const account = Array.from(rows.values()).find(
      (row) => row.dimension === PasswordLoginThrottleDimension.ACCOUNT
    );
    expect(account).toMatchObject({
      tenantId,
      failureCount: 5,
      blockedUntil: new Date("2026-08-28T09:01:00.000Z")
    });
    expect(mocks.db.auditLog.create).toHaveBeenCalledTimes(1);

    const error = await beginPasswordLoginAttempt(
      schoolInput(),
      new Date("2026-08-28T09:00:01.000Z")
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PasswordLoginThrottledError);
    expect(error).toMatchObject({ status: 429, retryAfterSeconds: 59 });
  });

  it("aggregates school web and mobile failures into the same account bucket", async () => {
    const web = await beginPasswordLoginAttempt(schoolInput("SCHOOL_WEB"), now);
    await completePasswordLoginAttempt(web, "FAILURE", now);
    const mobile = await beginPasswordLoginAttempt(schoolInput("MOBILE"), now);
    await completePasswordLoginAttempt(mobile, "FAILURE", now);

    const accountRows = Array.from(rows.values()).filter(
      (row) => row.dimension === PasswordLoginThrottleDimension.ACCOUNT
    );
    expect(accountRows).toHaveLength(1);
    expect(accountRows[0]?.failureCount).toBe(2);
  });

  it("uses serializable reservations and retries transaction conflicts", async () => {
    mocks.db.$transaction.mockRejectedValueOnce({ code: "P2034" });

    const reservation = await beginPasswordLoginAttempt(schoolInput(), now);

    expect(reservation.accountBucketId).toBe("bucket-1");
    expect(mocks.db.$transaction).toHaveBeenCalledTimes(2);
    expect(mocks.db.$transaction).toHaveBeenLastCalledWith(
      expect.any(Function),
      {
        isolationLevel: "Serializable",
        maxWait: 5_000,
        timeout: 5_000
      }
    );
  });

  it("keeps platform Administrator counters separate from school counters", async () => {
    await beginPasswordLoginAttempt(schoolInput(), now);
    await beginPasswordLoginAttempt({
      realm: PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR,
      channel: "ADMINISTRATOR_WEB",
      scopeKey: "platform-administrator",
      accountKey: "user:principal",
      sourceAddress: null
    }, now);

    expect(Array.from(rows.values()).map((row) => row.realm).sort()).toEqual([
      PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR,
      PasswordLoginThrottleRealm.SCHOOL
    ]);
  });

  it("removes a successful account reservation and preserves other source failures", async () => {
    const input = { ...schoolInput(), sourceAddress: "203.0.113.10" };
    const failed = await beginPasswordLoginAttempt(input, now);
    await completePasswordLoginAttempt(failed, "FAILURE", now);
    const successful = await beginPasswordLoginAttempt(input, now);
    await completePasswordLoginAttempt(successful, "SUCCESS", now);

    const remaining = Array.from(rows.values());
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({
      dimension: PasswordLoginThrottleDimension.SOURCE,
      failureCount: 1
    });
  });

  it("stores only fixed-length HMAC keys and never raw identifiers or addresses", async () => {
    const request = new Request("https://jinacampus.example.test/login", {
      headers: { "x-forwarded-for": "203.0.113.11, 10.0.0.1" }
    });
    const sourceAddress = passwordLoginSourceAddress(request);
    expect(sourceAddress).toBe("203.0.113.11");
    await beginPasswordLoginAttempt({
      ...schoolInput(),
      accountKey: "principal@example.test",
      sourceAddress
    }, now);

    const serialized = JSON.stringify(Array.from(rows.values()));
    expect(serialized).not.toContain("principal@example.test");
    expect(serialized).not.toContain("203.0.113.11");
    for (const row of rows.values()) {
      expect(row.scopeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(row.keyHash).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("uses stricter source thresholds for the Administrator realm", () => {
    expect(passwordLoginCooldownMs(
      PasswordLoginThrottleRealm.SCHOOL,
      PasswordLoginThrottleDimension.SOURCE,
      20
    )).toBe(0);
    expect(passwordLoginCooldownMs(
      PasswordLoginThrottleRealm.PLATFORM_ADMINISTRATOR,
      PasswordLoginThrottleDimension.SOURCE,
      20
    )).toBe(60_000);
  });

  it("fails closed when the durable throttle store is unavailable", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.db.$transaction.mockRejectedValueOnce({ code: "P2021" });

    await expect(beginPasswordLoginAttempt(schoolInput(), now)).rejects.toMatchObject({
      code: "PASSWORD_LOGIN_PROTECTION_UNAVAILABLE",
      status: 503
    });
    consoleError.mockRestore();
  });
});

describe("password login security contracts", () => {
  it("keeps passwords case-sensitive and performs dummy scrypt work for unknown accounts", async () => {
    const passwordHash = await hashPassword("ExactCase@123");

    await expect(verifyPasswordOrDummy("ExactCase@123", passwordHash)).resolves.toBe(true);
    await expect(verifyPasswordOrDummy("exactcase@123", passwordHash)).resolves.toBe(false);
    await expect(verifyPasswordOrDummy("candidate-password", null)).resolves.toBe(false);
  });

  it("keeps the additive security ledger private and indexed in the migration", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const migration = readFileSync(resolve(
      process.cwd(),
      "prisma/migrations/20260828120000_add_password_login_throttling/migration.sql"
    ), "utf8");

    expect(schema).toContain("model PasswordLoginThrottle");
    expect(schema).toContain("@@unique([realm, dimension, scopeHash, keyHash]");
    expect(migration).toContain('ALTER TABLE "password_login_throttles" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE "password_login_throttles" FROM PUBLIC');
    expect(migration).toContain('"password_login_throttles_tenant_realm_updated_idx"');
    expect(migration).toContain('"password_login_throttles_scope_hash_check"');
    expect(migration).not.toMatch(/"email"|"password"|"ipAddress"|"userAgent"/);
  });
});
