-- Add professional staff-photo and student identity-card foundations without
-- changing existing attendance or enrollment records.

CREATE TYPE "StudentIdentityCardStatus" AS ENUM ('ACTIVE', 'SUPERSEDED', 'DEACTIVATED', 'EXPIRED');

CREATE TABLE "staff_profile_photos" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "staffId" UUID NOT NULL,
  "storageBucket" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "uploadedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "staff_profile_photos_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_profile_photos_size_check" CHECK ("sizeBytes" > 0)
);

CREATE TABLE "student_identity_cards" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "cardVersion" INTEGER NOT NULL,
  "status" "StudentIdentityCardStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedById" UUID NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validFrom" DATE NOT NULL,
  "validUntil" DATE,
  "deactivatedById" UUID,
  "deactivatedAt" TIMESTAMP(3),
  "deactivationReason" TEXT,
  "printCount" INTEGER NOT NULL DEFAULT 0,
  "lastPrintedAt" TIMESTAMP(3),
  "lastPrintedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_identity_cards_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_identity_cards_version_check" CHECK ("cardVersion" > 0),
  CONSTRAINT "student_identity_cards_print_count_check" CHECK ("printCount" >= 0),
  CONSTRAINT "student_identity_cards_validity_check" CHECK ("validUntil" IS NULL OR "validUntil" >= "validFrom")
);

CREATE UNIQUE INDEX "staff_profile_photos_staff_key"
  ON "staff_profile_photos"("tenantId", "staffId");
CREATE UNIQUE INDEX "staff_profile_photos_storage_key"
  ON "staff_profile_photos"("storageBucket", "storagePath");
CREATE INDEX "staff_profile_photos_branch_idx"
  ON "staff_profile_photos"("tenantId", "branchId");

CREATE UNIQUE INDEX "student_identity_cards_version_key"
  ON "student_identity_cards"("tenantId", "studentId", "academicYearId", "cardVersion");
CREATE UNIQUE INDEX "student_identity_cards_tenant_id_id_key"
  ON "student_identity_cards"("tenantId", "id");
CREATE UNIQUE INDEX "student_identity_cards_one_active_idx"
  ON "student_identity_cards"("tenantId", "studentId", "academicYearId")
  WHERE "status" = 'ACTIVE';
CREATE INDEX "student_identity_cards_scope_status_idx"
  ON "student_identity_cards"("tenantId", "branchId", "academicYearId", "status");
CREATE INDEX "student_identity_cards_enrollment_status_idx"
  ON "student_identity_cards"("tenantId", "enrollmentId", "status");

ALTER TABLE "staff_profile_photos"
  ADD CONSTRAINT "staff_profile_photos_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_profile_photos"
  ADD CONSTRAINT "staff_profile_photos_tenantId_branchId_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "staff_profile_photos"
  ADD CONSTRAINT "staff_profile_photos_tenantId_staffId_fkey"
  FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_institutionId_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_branchId_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_academicYearId_fkey"
  FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "academic_years"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_studentId_fkey"
  FOREIGN KEY ("tenantId", "studentId") REFERENCES "students"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_enrollmentId_fkey"
  FOREIGN KEY ("tenantId", "enrollmentId") REFERENCES "enrollments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_issuedById_fkey"
  FOREIGN KEY ("tenantId", "issuedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_deactivatedById_fkey"
  FOREIGN KEY ("tenantId", "deactivatedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "student_identity_cards"
  ADD CONSTRAINT "student_identity_cards_tenantId_lastPrintedById_fkey"
  FOREIGN KEY ("tenantId", "lastPrintedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'staffboard.attendance.credential.self_view', 'STAFFBOARD', 'View only the signed-in staff member''s active attendance card.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'academia.student.id_card.manage', 'ACADEMIA', 'Generate, preview, print, reissue, and deactivate scoped student identity cards.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Self-camera attendance is retired. Historical assignments are removed while
-- historical attendance and QR-use audit records remain unchanged.
UPDATE "permissions"
SET "isActive" = false, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'staffboard.attendance.self_scan';

DELETE FROM "role_permissions"
WHERE "permissionId" IN (
  SELECT "id" FROM "permissions" WHERE "code" = 'staffboard.attendance.self_scan'
);

UPDATE "attendance_settings"
SET
  "staffAttendanceCaptureMode" = CASE
    WHEN "staffAttendanceCaptureMode" = 'HYBRID' THEN 'SUPERVISED_QR'::"StaffAttendanceCaptureMode"
    ELSE "staffAttendanceCaptureMode"
  END,
  "staffSelfScanEnabled" = false,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "staffSelfScanEnabled" = true
   OR "staffAttendanceCaptureMode" = 'HYBRID';
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission
  ON permission."code" = 'staffboard.attendance.credential.self_view'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN', 'OFFICE_STAFF', 'TEACHER', 'CLASS_TEACHER', 'STAFF')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission
  ON permission."code" = 'academia.student.id_card.manage'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

ALTER TABLE "staff_profile_photos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_identity_cards" ENABLE ROW LEVEL SECURITY;
