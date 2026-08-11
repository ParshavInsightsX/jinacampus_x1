-- CreateEnum
CREATE TYPE "StudentPromotionBatchStatus" AS ENUM ('COMPLETED', 'REVERSED');

-- CreateEnum
CREATE TYPE "StudentPromotionOutcome" AS ENUM (
    'PROMOTED',
    'NOT_PROMOTED',
    'REPEAT_SAME_CLASS',
    'TRANSFERRED',
    'SCHOOL_LEFT',
    'RESULT_PENDING',
    'PROMOTION_WITHHELD',
    'EXCLUDED'
);

-- CreateTable
CREATE TABLE "student_promotion_batches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "sourceAcademicYearId" UUID NOT NULL,
    "targetAcademicYearId" UUID NOT NULL,
    "sourceClassSectionId" UUID NOT NULL,
    "defaultTargetClassSectionId" UUID NOT NULL,
    "status" "StudentPromotionBatchStatus" NOT NULL DEFAULT 'COMPLETED',
    "effectiveDate" DATE NOT NULL,
    "remarks" TEXT,
    "resultsPublicationConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "selectedCount" INTEGER NOT NULL,
    "excludedCount" INTEGER NOT NULL,
    "outcomeSummary" JSONB NOT NULL,
    "createdById" UUID NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_promotion_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_promotion_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "sourceEnrollmentId" UUID NOT NULL,
    "targetEnrollmentId" UUID,
    "targetClassSectionId" UUID,
    "selected" BOOLEAN NOT NULL DEFAULT true,
    "outcome" "StudentPromotionOutcome" NOT NULL,
    "decisionRemarks" TEXT,
    "sourceEnrollmentStatusBefore" "EnrollmentStatus" NOT NULL,
    "sourceEnrollmentLeftOnBefore" DATE,
    "studentStatusBefore" "StudentStatus" NOT NULL,
    "studentLeftAtBefore" DATE,
    "reversedAt" TIMESTAMP(3),
    "reversedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_promotion_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promotion_batch_source_scope_idx"
ON "student_promotion_batches"("tenantId", "branchId", "sourceAcademicYearId", "sourceClassSectionId");

-- CreateIndex
CREATE INDEX "promotion_batch_target_scope_idx"
ON "student_promotion_batches"("tenantId", "branchId", "targetAcademicYearId", "defaultTargetClassSectionId");

-- CreateIndex
CREATE INDEX "promotion_batch_status_created_idx"
ON "student_promotion_batches"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_promotion_items_targetEnrollmentId_key"
ON "student_promotion_items"("targetEnrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "promotion_item_batch_source_key"
ON "student_promotion_items"("tenantId", "batchId", "sourceEnrollmentId");

-- CreateIndex
CREATE INDEX "promotion_item_student_idx"
ON "student_promotion_items"("tenantId", "branchId", "studentId");

-- CreateIndex
CREATE INDEX "promotion_item_source_outcome_idx"
ON "student_promotion_items"("tenantId", "sourceEnrollmentId", "outcome");

-- CreateIndex
CREATE INDEX "promotion_item_batch_selected_idx"
ON "student_promotion_items"("tenantId", "batchId", "selected");

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_sourceAcademicYearId_fkey"
FOREIGN KEY ("sourceAcademicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_targetAcademicYearId_fkey"
FOREIGN KEY ("targetAcademicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_sourceClassSectionId_fkey"
FOREIGN KEY ("sourceClassSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_defaultTargetClassSectionId_fkey"
FOREIGN KEY ("defaultTargetClassSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_batches" ADD CONSTRAINT "student_promotion_batches_reversedById_fkey"
FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_batchId_fkey"
FOREIGN KEY ("batchId") REFERENCES "student_promotion_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_sourceEnrollmentId_fkey"
FOREIGN KEY ("sourceEnrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_targetEnrollmentId_fkey"
FOREIGN KEY ("targetEnrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_targetClassSectionId_fkey"
FOREIGN KEY ("targetClassSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_promotion_items" ADD CONSTRAINT "student_promotion_items_reversedById_fkey"
FOREIGN KEY ("reversedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Server-only Prisma access remains the enforcement path. RLS protects these
-- tables from accidental direct client access in hosted PostgreSQL.
ALTER TABLE "student_promotion_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_promotion_items" ENABLE ROW LEVEL SECURITY;

-- Add the promotion permission for existing installations.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    'academia.promotion.manage',
    'ACADEMIA',
    'Review and execute audited student promotion batches.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- Principals and supported legacy school-governance aliases receive promotion
-- authority. Office Staff can receive it only through an explicit role grant.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" = 'academia.promotion.manage'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
