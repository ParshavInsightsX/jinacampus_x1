-- Add durable, server-only password-login throttling without changing
-- credentials, sessions, roles, or existing authentication data.

CREATE TYPE "PasswordLoginThrottleRealm" AS ENUM (
  'SCHOOL',
  'PLATFORM_ADMINISTRATOR'
);

CREATE TYPE "PasswordLoginThrottleDimension" AS ENUM (
  'ACCOUNT',
  'SOURCE'
);

CREATE TABLE "password_login_throttles" (
  "id" UUID NOT NULL,
  "tenantId" UUID,
  "realm" "PasswordLoginThrottleRealm" NOT NULL,
  "dimension" "PasswordLoginThrottleDimension" NOT NULL,
  "scopeHash" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "failureCount" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL,
  "lastAttemptAt" TIMESTAMP(3),
  "blockedUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "password_login_throttles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "password_login_throttles_failure_count_check"
    CHECK ("failureCount" >= 0),
  CONSTRAINT "password_login_throttles_scope_hash_check"
    CHECK ("scopeHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "password_login_throttles_key_hash_check"
    CHECK ("keyHash" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "password_login_throttles_bucket_key"
  ON "password_login_throttles"("realm", "dimension", "scopeHash", "keyHash");

CREATE INDEX "password_login_throttles_tenant_realm_updated_idx"
  ON "password_login_throttles"("tenantId", "realm", "updatedAt");

CREATE INDEX "password_login_throttles_blocked_until_idx"
  ON "password_login_throttles"("blockedUntil");

CREATE INDEX "password_login_throttles_updated_at_idx"
  ON "password_login_throttles"("updatedAt");

ALTER TABLE "password_login_throttles"
  ADD CONSTRAINT "password_login_throttles_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma is the only application data path. Keep this security ledger private
-- even when the public schema is exposed by Supabase's Data API.
ALTER TABLE "password_login_throttles" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "password_login_throttles" FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE "password_login_throttles" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE "password_login_throttles" FROM authenticated';
  END IF;
END
$$;
