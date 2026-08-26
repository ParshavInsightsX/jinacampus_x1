-- Attendance continuity and temporary duty assignment for full-day student attendance.
-- This is additive: existing attendance records and session history are preserved.
CREATE TYPE "StudentAttendanceDutyAssignmentType" AS ENUM (
  'CO_CLASS_TEACHER',
  'SUBSTITUTE_TEACHER',
  'PERIOD_TEACHER',
  'ATTENDANCE_OPERATOR'
);

CREATE TYPE "StudentAttendanceDutyAssignmentStatus" AS ENUM (
  'PENDING',
  'ACKNOWLEDGED',
  'ACTIVE',
  'COMPLETED',
  'DECLINED',
  'EXPIRED',
  'REVOKED'
);

CREATE TYPE "StudentAttendanceDutySourceType" AS ENUM (
  'MANUAL',
  'STAFF_LEAVE',
  'TIMETABLE',
  'SYSTEM_ESCALATION'
);

CREATE TYPE "StudentAttendanceResponsibilitySource" AS ENUM (
  'CLASS_TEACHER',
  'DUTY_ASSIGNMENT',
  'ATTENDANCE_OPERATOR',
  'PRINCIPAL_OVERRIDE'
);

ALTER TABLE "student_attendance_sessions"
  ADD COLUMN "responsibleUserId" UUID,
  ADD COLUMN "responsibilitySource" "StudentAttendanceResponsibilitySource" NOT NULL DEFAULT 'CLASS_TEACHER',
  ADD COLUMN "originalClassTeacherUserId" UUID,
  ADD COLUMN "delegatedByUserId" UUID,
  ADD COLUMN "delegationReason" TEXT,
  ADD COLUMN "responsibilityTransferredAt" TIMESTAMP(3);

UPDATE "student_attendance_sessions" AS session
SET
  "responsibleUserId" = session."startedById",
  "originalClassTeacherUserId" = class_section."classTeacherUserId",
  "responsibilitySource" = CASE
    WHEN class_section."classTeacherUserId" = session."startedById"
      THEN 'CLASS_TEACHER'::"StudentAttendanceResponsibilitySource"
    ELSE 'PRINCIPAL_OVERRIDE'::"StudentAttendanceResponsibilitySource"
  END
FROM "class_sections" AS class_section
WHERE class_section."tenantId" = session."tenantId"
  AND class_section."id" = session."classSectionId";

UPDATE "student_attendance_sessions"
SET "responsibleUserId" = "startedById"
WHERE "responsibleUserId" IS NULL;

ALTER TABLE "student_attendance_sessions"
  ALTER COLUMN "responsibleUserId" SET NOT NULL;

CREATE INDEX "student_attendance_session_responsible_date_idx"
  ON "student_attendance_sessions"("tenantId", "responsibleUserId", "attendanceDate");

ALTER TABLE "student_attendance_sessions"
  ADD CONSTRAINT "student_attendance_sessions_tenantId_responsibleUserId_fkey"
    FOREIGN KEY ("tenantId", "responsibleUserId")
    REFERENCES "users"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_originalClassTeacherUserId_fkey"
    FOREIGN KEY ("tenantId", "originalClassTeacherUserId")
    REFERENCES "users"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_delegatedByUserId_fkey"
    FOREIGN KEY ("tenantId", "delegatedByUserId")
    REFERENCES "users"("tenantId", "id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "student_attendance_duty_assignments" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "classSectionId" UUID NOT NULL,
  "sessionId" UUID,
  "attendanceDate" DATE NOT NULL,
  "sessionType" "AttendanceSessionType" NOT NULL DEFAULT 'FULL_DAY',
  "assignedUserId" UUID NOT NULL,
  "assignmentType" "StudentAttendanceDutyAssignmentType" NOT NULL,
  "status" "StudentAttendanceDutyAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "priority" INTEGER NOT NULL DEFAULT 100,
  "reasonCode" TEXT NOT NULL,
  "reasonText" TEXT,
  "sourceType" "StudentAttendanceDutySourceType" NOT NULL DEFAULT 'MANUAL',
  "sourceEntityId" TEXT,
  "assignedByUserId" UUID NOT NULL,
  "revokedByUserId" UUID,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acknowledgedAt" TIMESTAMP(3),
  "activatedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "declineReason" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revocationReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_duty_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_duty_priority_check" CHECK ("priority" >= 0),
  CONSTRAINT "student_attendance_duty_window_check" CHECK ("expiresAt" > "startsAt")
);

CREATE UNIQUE INDEX "student_attendance_duty_assignments_tenant_id_id_key"
  ON "student_attendance_duty_assignments"("tenantId", "id");
CREATE INDEX "student_attendance_duty_branch_date_status_idx"
  ON "student_attendance_duty_assignments"("tenantId", "branchId", "attendanceDate", "status");
CREATE INDEX "student_attendance_duty_user_date_status_idx"
  ON "student_attendance_duty_assignments"("tenantId", "assignedUserId", "attendanceDate", "status");
CREATE INDEX "student_attendance_duty_scope_idx"
  ON "student_attendance_duty_assignments"("tenantId", "academicYearId", "classSectionId", "attendanceDate");
CREATE INDEX "student_attendance_duty_expiry_idx"
  ON "student_attendance_duty_assignments"("tenantId", "expiresAt", "status");
CREATE UNIQUE INDEX "student_attendance_duty_one_live_scope_key"
  ON "student_attendance_duty_assignments"(
    "tenantId",
    "academicYearId",
    "classSectionId",
    "attendanceDate",
    "sessionType"
  )
  WHERE "status" IN ('PENDING', 'ACKNOWLEDGED', 'ACTIVE');

ALTER TABLE "student_attendance_duty_assignments"
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_institutionId_fkey"
    FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_branchId_fkey"
    FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_academicYearId_fkey"
    FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "academic_years"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_classSectionId_fkey"
    FOREIGN KEY ("tenantId", "classSectionId") REFERENCES "class_sections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_sessionId_fkey"
    FOREIGN KEY ("tenantId", "sessionId") REFERENCES "student_attendance_sessions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_assignedUserId_fkey"
    FOREIGN KEY ("tenantId", "assignedUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_assignedByUserId_fkey"
    FOREIGN KEY ("tenantId", "assignedByUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_duty_assignments_tenantId_revokedByUserId_fkey"
    FOREIGN KEY ("tenantId", "revokedByUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance_duty_assignments" ENABLE ROW LEVEL SECURITY;

INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'academia.attendance.coverage.manage',
  'ACADEMIA',
  'Manage temporary, branch-scoped responsibility for student attendance continuity.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission
  ON permission."code" = 'academia.attendance.coverage.manage'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN', 'OFFICE_STAFF')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- Office Staff may enter student attendance only while a live duty assignment
-- passes the service-level class, date, branch, academic-year and user checks.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission
  ON permission."code" IN ('academia.attendance.view', 'academia.attendance.mark')
WHERE role."code" = 'OFFICE_STAFF'
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
