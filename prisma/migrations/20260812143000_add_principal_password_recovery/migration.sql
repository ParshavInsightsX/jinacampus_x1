-- Principal recovery is additive and remains separate from school-level user governance.
CREATE TYPE "PrincipalPasswordResetRequestStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'COMPLETED',
    'EXPIRED'
);

CREATE TYPE "PrincipalPasswordResetMethod" AS ENUM (
    'RESET_LINK',
    'TEMPORARY_PASSWORD'
);

CREATE TYPE "PrincipalRecoveryIdentifierType" AS ENUM (
    'EMAIL',
    'PRINCIPAL_ID'
);

CREATE TYPE "PrincipalRecoveryNotificationStatus" AS ENUM (
    'MANUAL_DELIVERY_REQUIRED',
    'SENT',
    'FAILED'
);

ALTER TABLE "platform_administrators"
ADD COLUMN "canManagePrincipalRecovery" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ADD COLUMN "principalId" TEXT;

WITH "principal_users" AS (
    SELECT
        "users"."id",
        "users"."tenantId",
        MIN("users"."createdAt") AS "createdAt"
    FROM "users"
    INNER JOIN "user_role_assignments"
        ON "user_role_assignments"."userId" = "users"."id"
        AND "user_role_assignments"."tenantId" = "users"."tenantId"
        AND "user_role_assignments"."isActive" = true
    INNER JOIN "roles"
        ON "roles"."id" = "user_role_assignments"."roleId"
        AND "roles"."tenantId" = "users"."tenantId"
        AND "roles"."isActive" = true
        AND "roles"."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
    GROUP BY "users"."id", "users"."tenantId"
),
"ranked_principals" AS (
    SELECT
        "id",
        "tenantId",
        ROW_NUMBER() OVER (
            PARTITION BY "tenantId"
            ORDER BY "createdAt", "id"
        ) AS "principalSequence"
    FROM "principal_users"
)
UPDATE "users"
SET "principalId" = 'PRINCIPAL-' || LPAD("ranked_principals"."principalSequence"::TEXT, 3, '0')
FROM "ranked_principals"
WHERE "users"."id" = "ranked_principals"."id";

CREATE UNIQUE INDEX "users_tenantId_principalId_key"
ON "users"("tenantId", "principalId");

CREATE TABLE "principal_password_reset_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "principalUserId" UUID NOT NULL,
    "identifierType" "PrincipalRecoveryIdentifierType" NOT NULL,
    "identifierHash" TEXT NOT NULL,
    "status" "PrincipalPasswordResetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resetMethod" "PrincipalPasswordResetMethod",
    "reviewedByAdministratorId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "identityVerifiedAt" TIMESTAMP(3),
    "reviewRemarks" TEXT,
    "requestedIpAddress" TEXT,
    "requestedUserAgent" TEXT,
    "resetTokenHash" TEXT,
    "resetTokenExpiresAt" TIMESTAMP(3),
    "resetTokenUsedAt" TIMESTAMP(3),
    "temporaryPasswordIssuedAt" TIMESTAMP(3),
    "notificationStatus" "PrincipalRecoveryNotificationStatus" NOT NULL DEFAULT 'MANUAL_DELIVERY_REQUIRED',
    "notificationTargetMasked" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "principal_password_reset_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "principal_password_recovery_attempts" (
    "id" UUID NOT NULL,
    "tenantId" UUID,
    "identifierHash" TEXT NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "principal_password_recovery_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "principal_password_reset_requests_resetTokenHash_key"
ON "principal_password_reset_requests"("resetTokenHash");

CREATE UNIQUE INDEX "principal_recovery_one_active_request_per_user_idx"
ON "principal_password_reset_requests"("principalUserId")
WHERE "status" IN ('PENDING', 'APPROVED');

CREATE INDEX "principal_password_reset_requests_tenantId_status_createdAt_idx"
ON "principal_password_reset_requests"("tenantId", "status", "createdAt");

CREATE INDEX "principal_password_reset_requests_institutionId_status_createdAt_idx"
ON "principal_password_reset_requests"("institutionId", "status", "createdAt");

CREATE INDEX "principal_password_reset_requests_principalUserId_status_createdAt_idx"
ON "principal_password_reset_requests"("principalUserId", "status", "createdAt");

CREATE INDEX "principal_password_reset_requests_reviewedByAdministratorId_reviewedAt_idx"
ON "principal_password_reset_requests"("reviewedByAdministratorId", "reviewedAt");

CREATE INDEX "principal_password_reset_requests_resetTokenExpiresAt_idx"
ON "principal_password_reset_requests"("resetTokenExpiresAt");

CREATE INDEX "principal_password_recovery_attempts_identifierHash_createdAt_idx"
ON "principal_password_recovery_attempts"("identifierHash", "createdAt");

CREATE INDEX "principal_password_recovery_attempts_ipHash_createdAt_idx"
ON "principal_password_recovery_attempts"("ipHash", "createdAt");

CREATE INDEX "principal_password_recovery_attempts_tenantId_createdAt_idx"
ON "principal_password_recovery_attempts"("tenantId", "createdAt");

ALTER TABLE "principal_password_reset_requests"
ADD CONSTRAINT "principal_password_reset_requests_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "principal_password_reset_requests"
ADD CONSTRAINT "principal_password_reset_requests_institutionId_fkey"
FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "principal_password_reset_requests"
ADD CONSTRAINT "principal_password_reset_requests_principalUserId_fkey"
FOREIGN KEY ("principalUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "principal_password_reset_requests"
ADD CONSTRAINT "principal_password_reset_requests_reviewedByAdministratorId_fkey"
FOREIGN KEY ("reviewedByAdministratorId") REFERENCES "platform_administrators"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "principal_password_recovery_attempts"
ADD CONSTRAINT "principal_password_recovery_attempts_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
