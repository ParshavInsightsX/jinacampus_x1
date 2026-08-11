-- CreateEnum
CREATE TYPE "GradebookAssessmentType" AS ENUM (
    'UNIT_TEST',
    'PERIODIC_TEST',
    'HALF_YEARLY',
    'ANNUAL',
    'PROJECT',
    'PRACTICAL',
    'OTHER'
);

-- CreateEnum
CREATE TYPE "GradebookAssessmentStatus" AS ENUM ('OPEN', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookMarkStatus" AS ENUM ('GRADED', 'ABSENT', 'EXEMPT');

-- AlterTable
ALTER TABLE "tenant_settings"
ADD COLUMN "gradebookEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "class_section_subjects" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "teacherUserId" UUID,
    "status" "AcademicRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_section_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_assessments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "classSectionSubjectId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" "GradebookAssessmentType" NOT NULL,
    "assessmentDate" DATE NOT NULL,
    "maxMarks" DECIMAL(8,2) NOT NULL,
    "passMarks" DECIMAL(8,2) NOT NULL,
    "status" "GradebookAssessmentStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_marks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "status" "GradebookMarkStatus" NOT NULL DEFAULT 'GRADED',
    "marksObtained" DECIMAL(8,2),
    "remarks" TEXT,
    "enteredById" UUID NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_marks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "class_section_subjects_tenantId_classSectionId_subjectId_key"
ON "class_section_subjects"("tenantId", "classSectionId", "subjectId");

CREATE INDEX "class_section_subjects_tenantId_branchId_academicYearId_status_idx"
ON "class_section_subjects"("tenantId", "branchId", "academicYearId", "status");

CREATE INDEX "class_section_subjects_tenantId_teacherUserId_status_idx"
ON "class_section_subjects"("tenantId", "teacherUserId", "status");

CREATE UNIQUE INDEX "gradebook_assessments_tenantId_classSectionSubjectId_code_key"
ON "gradebook_assessments"("tenantId", "classSectionSubjectId", "code");

CREATE INDEX "gradebook_assessments_tenantId_branchId_academicYearId_status_idx"
ON "gradebook_assessments"("tenantId", "branchId", "academicYearId", "status");

CREATE INDEX "gradebook_assessments_tenantId_classSectionId_assessmentDate_idx"
ON "gradebook_assessments"("tenantId", "classSectionId", "assessmentDate");

CREATE INDEX "gradebook_assessments_tenantId_classSectionSubjectId_status_idx"
ON "gradebook_assessments"("tenantId", "classSectionSubjectId", "status");

CREATE UNIQUE INDEX "gradebook_marks_tenantId_assessmentId_enrollmentId_key"
ON "gradebook_marks"("tenantId", "assessmentId", "enrollmentId");

CREATE INDEX "gradebook_marks_tenantId_branchId_academicYearId_assessmentId_idx"
ON "gradebook_marks"("tenantId", "branchId", "academicYearId", "assessmentId");

CREATE INDEX "gradebook_marks_tenantId_studentId_academicYearId_idx"
ON "gradebook_marks"("tenantId", "studentId", "academicYearId");

CREATE INDEX "gradebook_marks_tenantId_enrollmentId_idx"
ON "gradebook_marks"("tenantId", "enrollmentId");

-- AddForeignKey
ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_classSectionId_fkey"
FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "class_section_subjects" ADD CONSTRAINT "class_section_subjects_teacherUserId_fkey"
FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_classSectionId_fkey"
FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_classSectionSubjectId_fkey"
FOREIGN KEY ("classSectionSubjectId") REFERENCES "class_section_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gradebook_assessments" ADD CONSTRAINT "gradebook_assessments_cancelledById_fkey"
FOREIGN KEY ("cancelledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_academicYearId_fkey"
FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_assessmentId_fkey"
FOREIGN KEY ("assessmentId") REFERENCES "gradebook_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "gradebook_marks" ADD CONSTRAINT "gradebook_marks_enteredById_fkey"
FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Server-only Prisma access remains authoritative. RLS prevents accidental
-- direct client access in the hosted database until explicit policies exist.
ALTER TABLE "class_section_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_marks" ENABLE ROW LEVEL SECURITY;

-- Add GradeBook permissions to existing installations without enabling the
-- tenant feature flag. New role seeds use the same definitions from source.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), permission.code, 'GRADEBOOK'::"PermissionModule", permission.description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (VALUES
    ('gradebook.view', 'View the GradeBook workspace and assigned assessments.'),
    ('gradebook.setup.manage', 'Assign subjects and teachers to class-sections.'),
    ('gradebook.assessment.manage', 'Create and cancel GradeBook assessments.'),
    ('gradebook.marks.enter', 'Enter marks for authorised class-subject assignments.'),
    ('gradebook.publish', 'Publish and reopen assessment results.'),
    ('gradebook.report', 'View published GradeBook results and summaries.')
) AS permission(code, description)
ON CONFLICT ("code") DO UPDATE SET
    "module" = EXCLUDED."module",
    "description" = EXCLUDED."description",
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

-- Principals and supported legacy governance aliases receive full GradeBook
-- access. Teachers receive assigned-class marks entry and published reports.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
    'gradebook.view',
    'gradebook.setup.manage',
    'gradebook.assessment.manage',
    'gradebook.marks.enter',
    'gradebook.publish',
    'gradebook.report'
)
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
    'gradebook.view',
    'gradebook.marks.enter',
    'gradebook.report'
)
WHERE role."code" IN ('TEACHER', 'CLASS_TEACHER')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
