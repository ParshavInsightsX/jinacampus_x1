-- CreateEnum
CREATE TYPE "AcademicCalendarEntryType" AS ENUM ('HOLIDAY', 'NON_WORKING_DAY');

-- CreateEnum
CREATE TYPE "AcademicCalendarAudience" AS ENUM ('STUDENTS', 'TEACHING_STAFF', 'NON_TEACHING_STAFF');

-- CreateEnum
CREATE TYPE "AcademicCalendarEntryStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- AlterTable
ALTER TABLE "staff_attendance_records" ADD COLUMN "calendarEntryId" UUID;

-- CreateTable
CREATE TABLE "academic_calendar_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID,
    "academicYearId" UUID NOT NULL,
    "entryType" "AcademicCalendarEntryType" NOT NULL DEFAULT 'HOLIDAY',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "audiences" "AcademicCalendarAudience"[] NOT NULL,
    "status" "AcademicCalendarEntryStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_calendar_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "academic_calendar_institution_dates_idx" ON "academic_calendar_entries"("tenantId", "institutionId", "academicYearId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "academic_calendar_branch_dates_idx" ON "academic_calendar_entries"("tenantId", "branchId", "academicYearId", "status", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "staff_attendance_calendar_entry_idx" ON "staff_attendance_records"("tenantId", "calendarEntryId");

-- AddForeignKey
ALTER TABLE "academic_calendar_entries" ADD CONSTRAINT "academic_calendar_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_entries" ADD CONSTRAINT "academic_calendar_entries_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_entries" ADD CONSTRAINT "academic_calendar_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_calendar_entries" ADD CONSTRAINT "academic_calendar_entries_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_calendarEntryId_fkey" FOREIGN KEY ("calendarEntryId") REFERENCES "academic_calendar_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The application uses a server-only database role. Keep the table protected
-- from accidental direct access in hosted PostgreSQL environments.
ALTER TABLE "academic_calendar_entries" ENABLE ROW LEVEL SECURITY;

-- Add the calendar governance permission for existing installations.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES (
    gen_random_uuid(),
    'campuscore.calendar.manage',
    'CAMPUS_CORE',
    'Manage institution and branch academic calendar holidays and non-working days.',
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

-- Principals and supported legacy principal aliases receive calendar governance.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" = 'campuscore.calendar.manage'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
