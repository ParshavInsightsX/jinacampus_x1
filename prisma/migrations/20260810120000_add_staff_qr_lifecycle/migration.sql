-- CreateEnum
CREATE TYPE "StaffQrTokenStatus" AS ENUM ('ACTIVE', 'DEACTIVATED', 'EXPIRED');

-- AlterTable
ALTER TABLE "attendance_settings"
ALTER COLUMN "staffQrTokenValiditySeconds" SET DEFAULT 18000;

UPDATE "attendance_settings"
SET "staffQrTokenValiditySeconds" = 18000
WHERE "staffQrTokenValiditySeconds" IS DISTINCT FROM 18000;

-- AlterTable
ALTER TABLE "staff_attendance_qr_tokens"
ADD COLUMN "status" "StaffQrTokenStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "lastUsedAt" TIMESTAMP(3),
ADD COLUMN "expiredAt" TIMESTAMP(3),
ADD COLUMN "deactivatedAt" TIMESTAMP(3),
ADD COLUMN "deactivatedById" UUID,
ADD COLUMN "deactivationReason" TEXT,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing expired tokens retain their original validity window and become
-- explicitly inactive. Existing live duplicates are reduced to the newest
-- token before the one-active-token guard is created.
UPDATE "staff_attendance_qr_tokens"
SET
  "status" = 'EXPIRED',
  "expiredAt" = "validUntil"
WHERE "validUntil" <= CURRENT_TIMESTAMP;

WITH ranked_live_tokens AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "tenantId", "branchId", "purpose"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS live_rank
  FROM "staff_attendance_qr_tokens"
  WHERE "status" = 'ACTIVE'
)
UPDATE "staff_attendance_qr_tokens" AS token
SET
  "status" = 'DEACTIVATED',
  "deactivatedAt" = CURRENT_TIMESTAMP,
  "deactivationReason" = 'MIGRATION_DEDUPLICATION'
FROM ranked_live_tokens
WHERE token."id" = ranked_live_tokens."id"
  AND ranked_live_tokens.live_rank > 1;

-- Replace the older broad purpose index with lifecycle-aware indexes.
DROP INDEX IF EXISTS "staff_attendance_qr_tokens_tenantId_branchId_purpose_idx";

CREATE INDEX "staff_qr_tokens_lifecycle_idx"
ON "staff_attendance_qr_tokens"("tenantId", "branchId", "status", "purpose", "validUntil");

CREATE INDEX "staff_qr_tokens_deactivated_by_idx"
ON "staff_attendance_qr_tokens"("deactivatedById");

CREATE UNIQUE INDEX "staff_qr_tokens_one_active_per_purpose_idx"
ON "staff_attendance_qr_tokens"("tenantId", "branchId", "purpose")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "staff_attendance_qr_tokens"
ADD CONSTRAINT "staff_attendance_qr_tokens_deactivatedById_fkey"
FOREIGN KEY ("deactivatedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
