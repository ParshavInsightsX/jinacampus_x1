-- Phase 1: online student-attendance session ledger. Existing attendance records remain the reporting projection.
CREATE TYPE "StudentAttendanceSessionState" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'REOPENED', 'LOCKED');
CREATE TYPE "StudentAttendanceCaptureStatus" AS ENUM ('PRESENT', 'ABSENT', 'LEAVE');
CREATE TYPE "StudentAttendanceMutationSource" AS ENUM ('ONLINE', 'BULK_PRESENT', 'BULK_UNDO', 'ADMIN_CORRECTION', 'SYSTEM');
CREATE TYPE "StudentAttendanceRosterState" AS ENUM ('INCLUDED', 'EXCLUDED');

CREATE UNIQUE INDEX "academic_years_tenant_id_id_student_attendance_scope_key"
  ON "academic_years"("tenantId", "id");
CREATE UNIQUE INDEX "class_sections_tenant_id_id_student_attendance_scope_key"
  ON "class_sections"("tenantId", "id");
CREATE UNIQUE INDEX "students_tenant_id_id_student_attendance_scope_key"
  ON "students"("tenantId", "id");
CREATE UNIQUE INDEX "enrollments_tenant_id_id_student_attendance_scope_key"
  ON "enrollments"("tenantId", "id");

CREATE TABLE "student_attendance_sessions" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID NOT NULL,
  "academicYearId" UUID NOT NULL,
  "classSectionId" UUID NOT NULL,
  "attendanceDate" DATE NOT NULL,
  "sessionType" "AttendanceSessionType" NOT NULL DEFAULT 'FULL_DAY',
  "state" "StudentAttendanceSessionState" NOT NULL DEFAULT 'DRAFT',
  "sessionVersion" INTEGER NOT NULL DEFAULT 0,
  "rosterVersion" INTEGER NOT NULL DEFAULT 1,
  "startedById" UUID NOT NULL,
  "completedById" UUID,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastMutationAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "reopenedAt" TIMESTAMP(3),
  "lockedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_sessions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_sessions_version_check" CHECK ("sessionVersion" >= 0 AND "rosterVersion" >= 1)
);

CREATE TABLE "student_attendance_session_roster" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "rosterState" "StudentAttendanceRosterState" NOT NULL DEFAULT 'INCLUDED',
  "position" INTEGER NOT NULL,
  "scholarNumber" TEXT NOT NULL,
  "studentName" TEXT NOT NULL,
  "rollNumber" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "student_attendance_session_roster_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_session_roster_position_check" CHECK ("position" >= 0)
);

CREATE TABLE "student_attendance_session_entries" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "rosterId" UUID NOT NULL,
  "enrollmentId" UUID NOT NULL,
  "status" "StudentAttendanceCaptureStatus",
  "legacyStatus" "StudentAttendanceStatus",
  "recordVersion" INTEGER NOT NULL DEFAULT 0,
  "updatedById" UUID,
  "markedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_attendance_session_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_session_entries_version_check" CHECK ("recordVersion" >= 0)
);

CREATE TABLE "student_attendance_mutations" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "entryId" UUID NOT NULL,
  "actorUserId" UUID NOT NULL,
  "clientMutationId" TEXT NOT NULL,
  "bulkMutationId" TEXT,
  "source" "StudentAttendanceMutationSource" NOT NULL DEFAULT 'ONLINE',
  "previousStatus" "StudentAttendanceCaptureStatus",
  "newStatus" "StudentAttendanceCaptureStatus",
  "baseRecordVersion" INTEGER NOT NULL,
  "resultingRecordVersion" INTEGER NOT NULL,
  "capturedAtClient" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadataJson" JSONB,
  CONSTRAINT "student_attendance_mutations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "student_attendance_mutations_version_check" CHECK (
    "baseRecordVersion" >= 0 AND "resultingRecordVersion" = "baseRecordVersion" + 1
  )
);

CREATE UNIQUE INDEX "student_attendance_session_scope_key"
  ON "student_attendance_sessions"("tenantId", "academicYearId", "classSectionId", "attendanceDate", "sessionType");
CREATE UNIQUE INDEX "student_attendance_sessions_tenant_id_id_key"
  ON "student_attendance_sessions"("tenantId", "id");
CREATE INDEX "student_attendance_session_branch_date_idx"
  ON "student_attendance_sessions"("tenantId", "branchId", "attendanceDate", "state");
CREATE INDEX "student_attendance_session_teacher_date_idx"
  ON "student_attendance_sessions"("tenantId", "startedById", "attendanceDate");

CREATE UNIQUE INDEX "student_attendance_roster_session_enrollment_key"
  ON "student_attendance_session_roster"("tenantId", "sessionId", "enrollmentId");
CREATE UNIQUE INDEX "student_attendance_roster_tenant_id_id_key"
  ON "student_attendance_session_roster"("tenantId", "id");
CREATE INDEX "student_attendance_roster_session_position_idx"
  ON "student_attendance_session_roster"("tenantId", "sessionId", "rosterState", "position");
CREATE INDEX "student_attendance_roster_student_idx"
  ON "student_attendance_session_roster"("tenantId", "studentId");

CREATE UNIQUE INDEX "student_attendance_entries_session_roster_key"
  ON "student_attendance_session_entries"("tenantId", "sessionId", "rosterId");
CREATE UNIQUE INDEX "student_attendance_entries_roster_key"
  ON "student_attendance_session_entries"("tenantId", "rosterId");
CREATE UNIQUE INDEX "student_attendance_entries_tenant_id_id_key"
  ON "student_attendance_session_entries"("tenantId", "id");
CREATE INDEX "student_attendance_entries_session_status_idx"
  ON "student_attendance_session_entries"("tenantId", "sessionId", "status");
CREATE INDEX "student_attendance_entries_enrollment_idx"
  ON "student_attendance_session_entries"("tenantId", "enrollmentId");

CREATE UNIQUE INDEX "student_attendance_mutations_client_key"
  ON "student_attendance_mutations"("tenantId", "clientMutationId");
CREATE INDEX "student_attendance_mutations_session_time_idx"
  ON "student_attendance_mutations"("tenantId", "sessionId", "appliedAt");
CREATE INDEX "student_attendance_mutations_entry_time_idx"
  ON "student_attendance_mutations"("tenantId", "entryId", "appliedAt");
CREATE INDEX "student_attendance_mutations_bulk_idx"
  ON "student_attendance_mutations"("tenantId", "bulkMutationId");

ALTER TABLE "student_attendance_sessions"
  ADD CONSTRAINT "student_attendance_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_academicYearId_fkey" FOREIGN KEY ("tenantId", "academicYearId") REFERENCES "academic_years"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_classSectionId_fkey" FOREIGN KEY ("tenantId", "classSectionId") REFERENCES "class_sections"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_startedById_fkey" FOREIGN KEY ("tenantId", "startedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_sessions_tenantId_completedById_fkey" FOREIGN KEY ("tenantId", "completedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance_session_roster"
  ADD CONSTRAINT "student_attendance_session_roster_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_roster_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "student_attendance_sessions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_roster_tenantId_enrollmentId_fkey" FOREIGN KEY ("tenantId", "enrollmentId") REFERENCES "enrollments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_roster_tenantId_studentId_fkey" FOREIGN KEY ("tenantId", "studentId") REFERENCES "students"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance_session_entries"
  ADD CONSTRAINT "student_attendance_session_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_entries_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "student_attendance_sessions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_entries_tenantId_rosterId_fkey" FOREIGN KEY ("tenantId", "rosterId") REFERENCES "student_attendance_session_roster"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_entries_tenantId_enrollmentId_fkey" FOREIGN KEY ("tenantId", "enrollmentId") REFERENCES "enrollments"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_session_entries_tenantId_updatedById_fkey" FOREIGN KEY ("tenantId", "updatedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance_mutations"
  ADD CONSTRAINT "student_attendance_mutations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_mutations_tenantId_sessionId_fkey" FOREIGN KEY ("tenantId", "sessionId") REFERENCES "student_attendance_sessions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_mutations_tenantId_entryId_fkey" FOREIGN KEY ("tenantId", "entryId") REFERENCES "student_attendance_session_entries"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "student_attendance_mutations_tenantId_actorUserId_fkey" FOREIGN KEY ("tenantId", "actorUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "student_attendance_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance_session_roster" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance_session_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "student_attendance_mutations" ENABLE ROW LEVEL SECURITY;
