-- CreateEnum
CREATE TYPE "StaffAttendanceEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'MANUAL_STATUS', 'STATUS_OVERRIDE', 'EVENT_VOID', 'CORRECTION');

-- CreateEnum
CREATE TYPE "StaffAttendanceEventSource" AS ENUM ('SUPERVISED_STATIC_QR', 'SELF_SERVICE_QR', 'MANUAL', 'LEAVE', 'CALENDAR', 'SYSTEM', 'IMPORT');

-- CreateEnum
CREATE TYPE "StaffAttendanceEventState" AS ENUM ('ACCEPTED', 'PENDING_REVIEW', 'VOIDED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StaffAttendanceFlag" AS ENUM ('LATE', 'EARLY_DEPARTURE', 'MISSING_CHECK_OUT', 'MANUAL_ENTRY', 'MANUAL_OVERRIDE', 'WORKED_ON_NON_WORKING_DAY', 'CROSS_BRANCH_SCAN', 'MULTIPLE_ATTENDANCE_INTERVALS', 'OUTSIDE_STANDARD_WINDOW', 'BACKDATED_ADJUSTMENT', 'POLICY_EXCEPTION');

-- CreateEnum
CREATE TYPE "StaffAttendanceReviewState" AS ENUM ('NOT_REQUIRED', 'REVIEW_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "StaffAttendanceDayLifecycle" AS ENUM ('OPEN', 'CALCULATED', 'REVIEW_REQUIRED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "StaffAttendanceCredentialType" AS ENUM ('STATIC_QR', 'ROTATING_QR');

-- CreateEnum
CREATE TYPE "StaffAttendanceCredentialStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED', 'EXPIRED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "StaffAttendanceScanMode" AS ENUM ('AUTO', 'CHECK_IN', 'CHECK_OUT', 'CHECK_IN_ONLY');

-- CreateEnum
CREATE TYPE "StaffAttendanceCaptureMode" AS ENUM ('SUPERVISED_QR', 'HYBRID', 'MANUAL_ONLY');

-- CreateEnum
CREATE TYPE "StaffAttendanceScanSessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StaffAttendanceAdjustmentType" AS ENUM ('ADD_CHECK_IN', 'ADD_CHECK_OUT', 'SET_PRESENT', 'SET_ABSENT', 'SET_HALF_DAY', 'SET_ON_LEAVE', 'SET_OFFICIAL_DUTY', 'CORRECT_EVENT_TIME', 'VOID_EVENT', 'ADD_NOTE');

-- CreateEnum
CREATE TYPE "StaffAttendanceAdjustmentStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'CANCELLED', 'APPLIED');

-- CreateEnum
CREATE TYPE "StaffAttendancePolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

-- CreateEnum
CREATE TYPE "StaffAttendanceOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED');


-- AlterTable
ALTER TABLE "attendance_settings" ADD COLUMN     "staffAttendanceCaptureMode" "StaffAttendanceCaptureMode" NOT NULL DEFAULT 'SUPERVISED_QR',
ADD COLUMN     "staffCorrectionApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "staffCredentialValidityDays" INTEGER,
ADD COLUMN     "staffManualAttendanceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "staffScanSessionValidityMinutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "staffSelfScanEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "staff_attendance_records" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" UUID,
ADD COLUMN     "calculationVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "earlyDepartureMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "flags" "StaffAttendanceFlag"[] DEFAULT ARRAY[]::"StaffAttendanceFlag"[],
ADD COLUMN     "lastCalculatedAt" TIMESTAMP(3),
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lifecycle" "StaffAttendanceDayLifecycle" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "lockedById" UUID,
ADD COLUMN     "policyId" UUID,
ADD COLUMN     "projectionVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reviewRequiredReason" TEXT,
ADD COLUMN     "reviewState" "StaffAttendanceReviewState" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "scheduleId" UUID,
ADD COLUMN     "sourceSummary" JSONB;

-- CreateTable
CREATE TABLE "staff_branch_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_branch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_policies" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "StaffAttendancePolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "checkInOnly" BOOLEAN NOT NULL DEFAULT false,
    "autoEventInference" BOOLEAN NOT NULL DEFAULT true,
    "duplicateCooldownSeconds" INTEGER NOT NULL DEFAULT 30,
    "checkInWindowStart" TEXT NOT NULL DEFAULT '06:00',
    "checkInWindowEnd" TEXT NOT NULL DEFAULT '11:00',
    "shiftStartTime" TEXT NOT NULL DEFAULT '08:00',
    "shiftEndTime" TEXT NOT NULL DEFAULT '16:00',
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "halfDayMinimumMinutes" INTEGER NOT NULL DEFAULT 240,
    "fullDayMinimumMinutes" INTEGER NOT NULL DEFAULT 360,
    "earliestCheckOutTime" TEXT,
    "earlyDepartureGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "multipleIntervalsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "manualEntryCutoffTime" TEXT NOT NULL DEFAULT '18:00',
    "backdateLimitDays" INTEGER NOT NULL DEFAULT 7,
    "correctionApprovalRequired" BOOLEAN NOT NULL DEFAULT true,
    "createdById" UUID,
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_schedules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "StaffAttendancePolicyStatus" NOT NULL DEFAULT 'PUBLISHED',
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "crossMidnight" BOOLEAN NOT NULL DEFAULT false,
    "workingWeekdays" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
    "checkInWindowStart" TEXT,
    "graceMinutes" INTEGER NOT NULL DEFAULT 0,
    "halfDayMinimumMinutes" INTEGER NOT NULL DEFAULT 240,
    "fullDayMinimumMinutes" INTEGER NOT NULL DEFAULT 360,
    "earliestCheckOutTime" TEXT,
    "expectedCheckOutTime" TEXT,
    "earlyDepartureGraceMinutes" INTEGER NOT NULL DEFAULT 0,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_schedule_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "scheduleId" UUID NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_credentials" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "credentialType" "StaffAttendanceCredentialType" NOT NULL DEFAULT 'STATIC_QR',
    "tokenHash" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "credentialVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "StaffAttendanceCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "issuedById" UUID,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "revocationReason" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_scan_sessions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "operatorUserId" UUID NOT NULL,
    "mode" "StaffAttendanceScanMode" NOT NULL DEFAULT 'AUTO',
    "status" "StaffAttendanceScanSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "closedById" UUID,
    "closeReason" TEXT,
    "createdIpHash" TEXT,
    "userAgentSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_scan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "attendanceRecordId" UUID NOT NULL,
    "attendanceDate" DATE NOT NULL,
    "eventType" "StaffAttendanceEventType" NOT NULL,
    "eventSource" "StaffAttendanceEventSource" NOT NULL,
    "processingState" "StaffAttendanceEventState" NOT NULL DEFAULT 'ACCEPTED',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedByUserId" UUID,
    "scanSessionId" UUID,
    "credentialId" UUID,
    "clientRequestId" TEXT NOT NULL,
    "manualReasonCode" TEXT,
    "manualReasonText" TEXT,
    "supersedesEventId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_attendance_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_adjustments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "staffId" UUID NOT NULL,
    "attendanceRecordId" UUID NOT NULL,
    "targetEventId" UUID,
    "appliedEventId" UUID,
    "adjustmentType" "StaffAttendanceAdjustmentType" NOT NULL,
    "status" "StaffAttendanceAdjustmentStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT NOT NULL,
    "requestedPayload" JSONB NOT NULL,
    "beforeSnapshot" JSONB NOT NULL,
    "afterSnapshot" JSONB,
    "requestedByUserId" UUID NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedByUserId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewComment" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_attendance_outbox_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "domainEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "status" "StaffAttendanceOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_attendance_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_branch_assignment_branch_range_idx" ON "staff_branch_assignments"("tenantId", "branchId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "staff_branch_assignment_staff_range_idx" ON "staff_branch_assignments"("tenantId", "staffId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_branch_assignment_effective_key" ON "staff_branch_assignments"("tenantId", "staffId", "branchId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "staff_attendance_policy_effective_idx" ON "staff_attendance_policies"("tenantId", "branchId", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_policy_branch_version_key" ON "staff_attendance_policies"("tenantId", "branchId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_policies_tenant_id_id_key" ON "staff_attendance_policies"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_attendance_schedule_effective_idx" ON "staff_attendance_schedules"("tenantId", "branchId", "status", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_schedule_branch_name_version_key" ON "staff_attendance_schedules"("tenantId", "branchId", "name", "version");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_schedules_tenant_id_id_key" ON "staff_attendance_schedules"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_schedule_assignment_branch_range_idx" ON "staff_attendance_schedule_assignments"("tenantId", "branchId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "staff_schedule_assignment_staff_range_idx" ON "staff_attendance_schedule_assignments"("tenantId", "staffId", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "staff_schedule_assignment_effective_key" ON "staff_attendance_schedule_assignments"("tenantId", "staffId", "scheduleId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "staff_attendance_credential_staff_status_idx" ON "staff_attendance_credentials"("tenantId", "staffId", "status");

-- CreateIndex
CREATE INDEX "staff_attendance_credential_institution_status_idx" ON "staff_attendance_credentials"("tenantId", "institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_credential_token_key" ON "staff_attendance_credentials"("tenantId", "tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_credentials_tenant_id_id_key" ON "staff_attendance_credentials"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_attendance_scan_session_operator_idx" ON "staff_attendance_scan_sessions"("tenantId", "operatorUserId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "staff_attendance_scan_session_branch_idx" ON "staff_attendance_scan_sessions"("tenantId", "branchId", "status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_scan_sessions_tenant_id_id_key" ON "staff_attendance_scan_sessions"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_attendance_event_staff_time_idx" ON "staff_attendance_events"("tenantId", "staffId", "occurredAt");

-- CreateIndex
CREATE INDEX "staff_attendance_event_branch_date_idx" ON "staff_attendance_events"("tenantId", "branchId", "attendanceDate");

-- CreateIndex
CREATE INDEX "staff_attendance_event_state_idx" ON "staff_attendance_events"("tenantId", "attendanceDate", "processingState");

-- CreateIndex
CREATE INDEX "staff_attendance_event_credential_idx" ON "staff_attendance_events"("tenantId", "credentialId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_event_client_request_key" ON "staff_attendance_events"("tenantId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_events_tenant_id_id_key" ON "staff_attendance_events"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_attendance_adjustment_branch_status_idx" ON "staff_attendance_adjustments"("tenantId", "branchId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "staff_attendance_adjustment_staff_idx" ON "staff_attendance_adjustments"("tenantId", "staffId", "requestedAt");

-- CreateIndex
CREATE INDEX "staff_attendance_adjustment_record_idx" ON "staff_attendance_adjustments"("tenantId", "attendanceRecordId", "status");

-- CreateIndex
CREATE INDEX "staff_attendance_outbox_due_idx" ON "staff_attendance_outbox_events"("status", "nextAttemptAt", "createdAt");

-- CreateIndex
CREATE INDEX "staff_attendance_outbox_tenant_status_idx" ON "staff_attendance_outbox_events"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_outbox_domain_event_key" ON "staff_attendance_outbox_events"("tenantId", "domainEventId");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_id_attendance_scope_key" ON "branches"("tenantId", "id");

-- CreateIndex
CREATE INDEX "staff_attendance_review_state_idx" ON "staff_attendance_records"("tenantId", "reviewState", "attendanceDate");

-- CreateIndex
CREATE INDEX "staff_attendance_lifecycle_idx" ON "staff_attendance_records"("tenantId", "lifecycle", "attendanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "staff_attendance_records_tenant_id_id_key" ON "staff_attendance_records"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_profiles_tenant_id_id_attendance_scope_key" ON "staff_profiles"("tenantId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenant_id_id_attendance_scope_key" ON "users"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_tenantId_policyId_fkey" FOREIGN KEY ("tenantId", "policyId") REFERENCES "staff_attendance_policies"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_tenantId_scheduleId_fkey" FOREIGN KEY ("tenantId", "scheduleId") REFERENCES "staff_attendance_schedules"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_tenantId_approvedById_fkey" FOREIGN KEY ("tenantId", "approvedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_tenantId_lockedById_fkey" FOREIGN KEY ("tenantId", "lockedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_branch_assignments" ADD CONSTRAINT "staff_branch_assignments_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_policies" ADD CONSTRAINT "staff_attendance_policies_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_policies" ADD CONSTRAINT "staff_attendance_policies_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_policies" ADD CONSTRAINT "staff_attendance_policies_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_policies" ADD CONSTRAINT "staff_attendance_policies_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_policies" ADD CONSTRAINT "staff_attendance_policies_tenantId_publishedById_fkey" FOREIGN KEY ("tenantId", "publishedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedules" ADD CONSTRAINT "staff_attendance_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedules" ADD CONSTRAINT "staff_attendance_schedules_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedules" ADD CONSTRAINT "staff_attendance_schedules_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedules" ADD CONSTRAINT "staff_attendance_schedules_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedule_assignments" ADD CONSTRAINT "staff_attendance_schedule_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedule_assignments" ADD CONSTRAINT "staff_attendance_schedule_assignments_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedule_assignments" ADD CONSTRAINT "staff_attendance_schedule_assignments_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedule_assignments" ADD CONSTRAINT "staff_attendance_schedule_assignments_tenantId_scheduleId_fkey" FOREIGN KEY ("tenantId", "scheduleId") REFERENCES "staff_attendance_schedules"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_schedule_assignments" ADD CONSTRAINT "staff_attendance_schedule_assignments_tenantId_createdById_fkey" FOREIGN KEY ("tenantId", "createdById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_credentials" ADD CONSTRAINT "staff_attendance_credentials_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_credentials" ADD CONSTRAINT "staff_attendance_credentials_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_credentials" ADD CONSTRAINT "staff_attendance_credentials_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_credentials" ADD CONSTRAINT "staff_attendance_credentials_tenantId_issuedById_fkey" FOREIGN KEY ("tenantId", "issuedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_credentials" ADD CONSTRAINT "staff_attendance_credentials_tenantId_revokedById_fkey" FOREIGN KEY ("tenantId", "revokedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_scan_sessions" ADD CONSTRAINT "staff_attendance_scan_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_scan_sessions" ADD CONSTRAINT "staff_attendance_scan_sessions_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_scan_sessions" ADD CONSTRAINT "staff_attendance_scan_sessions_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_scan_sessions" ADD CONSTRAINT "staff_attendance_scan_sessions_tenantId_operatorUserId_fkey" FOREIGN KEY ("tenantId", "operatorUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_scan_sessions" ADD CONSTRAINT "staff_attendance_scan_sessions_tenantId_closedById_fkey" FOREIGN KEY ("tenantId", "closedById") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_attendanceRecordId_fkey" FOREIGN KEY ("tenantId", "attendanceRecordId") REFERENCES "staff_attendance_records"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_recordedByUserId_fkey" FOREIGN KEY ("tenantId", "recordedByUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_scanSessionId_fkey" FOREIGN KEY ("tenantId", "scanSessionId") REFERENCES "staff_attendance_scan_sessions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_credentialId_fkey" FOREIGN KEY ("tenantId", "credentialId") REFERENCES "staff_attendance_credentials"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_events" ADD CONSTRAINT "staff_attendance_events_tenantId_supersedesEventId_fkey" FOREIGN KEY ("tenantId", "supersedesEventId") REFERENCES "staff_attendance_events"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_institutionId_fkey" FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "branches"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_staffId_fkey" FOREIGN KEY ("tenantId", "staffId") REFERENCES "staff_profiles"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_attendanceRecordId_fkey" FOREIGN KEY ("tenantId", "attendanceRecordId") REFERENCES "staff_attendance_records"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_targetEventId_fkey" FOREIGN KEY ("tenantId", "targetEventId") REFERENCES "staff_attendance_events"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_appliedEventId_fkey" FOREIGN KEY ("tenantId", "appliedEventId") REFERENCES "staff_attendance_events"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_requestedByUserId_fkey" FOREIGN KEY ("tenantId", "requestedByUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_adjustments" ADD CONSTRAINT "staff_attendance_adjustments_tenantId_reviewedByUserId_fkey" FOREIGN KEY ("tenantId", "reviewedByUserId") REFERENCES "users"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_attendance_outbox_events" ADD CONSTRAINT "staff_attendance_outbox_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Preserve the current StaffAttendanceRecord table as the compatibility projection.
-- New immutable events and branch assignments are backfilled without changing
-- historical attendance statuses, timestamps, leave links, or calendar links.

-- Database-level invariants for effective ranges, times, lifecycle values, and
-- maker-checker review. Runtime services also enforce these constraints.
ALTER TABLE "staff_branch_assignments"
  ADD CONSTRAINT "staff_branch_assignments_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "staff_attendance_policies"
  ADD CONSTRAINT "staff_attendance_policies_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  ADD CONSTRAINT "staff_attendance_policies_minute_values_check"
  CHECK (
    "duplicateCooldownSeconds" >= 0 AND
    "graceMinutes" >= 0 AND
    "halfDayMinimumMinutes" >= 0 AND
    "fullDayMinimumMinutes" >= "halfDayMinimumMinutes" AND
    "earlyDepartureGraceMinutes" >= 0 AND
    "backdateLimitDays" >= 0
  ),
  ADD CONSTRAINT "staff_attendance_policies_time_values_check"
  CHECK (
    "checkInWindowStart" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "checkInWindowEnd" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "shiftStartTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "shiftEndTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "manualEntryCutoffTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    ("earliestCheckOutTime" IS NULL OR "earliestCheckOutTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
  );

ALTER TABLE "staff_attendance_schedules"
  ADD CONSTRAINT "staff_attendance_schedules_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"),
  ADD CONSTRAINT "staff_attendance_schedules_minute_values_check"
  CHECK (
    "graceMinutes" >= 0 AND
    "halfDayMinimumMinutes" >= 0 AND
    "fullDayMinimumMinutes" >= "halfDayMinimumMinutes" AND
    "earlyDepartureGraceMinutes" >= 0
  ),
  ADD CONSTRAINT "staff_attendance_schedules_weekdays_check"
  CHECK ("workingWeekdays" <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::INTEGER[]),
  ADD CONSTRAINT "staff_attendance_schedules_time_values_check"
  CHECK (
    "startTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    "endTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' AND
    ("checkInWindowStart" IS NULL OR "checkInWindowStart" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$') AND
    ("earliestCheckOutTime" IS NULL OR "earliestCheckOutTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$') AND
    ("expectedCheckOutTime" IS NULL OR "expectedCheckOutTime" ~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$')
  );

ALTER TABLE "staff_attendance_schedule_assignments"
  ADD CONSTRAINT "staff_schedule_assignments_effective_range_check"
  CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");

ALTER TABLE "staff_attendance_credentials"
  ADD CONSTRAINT "staff_attendance_credentials_version_check"
  CHECK ("keyVersion" > 0 AND "credentialVersion" > 0),
  ADD CONSTRAINT "staff_attendance_credentials_expiry_check"
  CHECK ("expiresAt" IS NULL OR "expiresAt" > "issuedAt"),
  ADD CONSTRAINT "staff_attendance_credentials_revocation_check"
  CHECK (
    ("status" IN ('REVOKED', 'SUPERSEDED') AND "revokedAt" IS NOT NULL) OR
    ("status" NOT IN ('REVOKED', 'SUPERSEDED'))
  );

ALTER TABLE "staff_attendance_scan_sessions"
  ADD CONSTRAINT "staff_attendance_scan_sessions_expiry_check"
  CHECK ("expiresAt" > "startedAt"),
  ADD CONSTRAINT "staff_attendance_scan_sessions_close_check"
  CHECK (("status" = 'ACTIVE' AND "closedAt" IS NULL) OR "status" <> 'ACTIVE');

ALTER TABLE "staff_attendance_events"
  ADD CONSTRAINT "staff_attendance_events_client_request_check"
  CHECK (length(btrim("clientRequestId")) BETWEEN 8 AND 200),
  ADD CONSTRAINT "staff_attendance_events_manual_reason_check"
  CHECK (
    "eventSource" <> 'MANUAL' OR
    "clientRequestId" LIKE 'legacy-%' OR
    ("manualReasonCode" IS NOT NULL AND length(btrim("manualReasonText")) >= 3)
  );

ALTER TABLE "staff_attendance_adjustments"
  ADD CONSTRAINT "staff_attendance_adjustments_reason_check"
  CHECK (length(btrim("reasonCode")) BETWEEN 2 AND 80 AND length(btrim("reasonText")) BETWEEN 3 AND 1000),
  ADD CONSTRAINT "staff_attendance_adjustments_maker_checker_check"
  CHECK ("reviewedByUserId" IS NULL OR "reviewedByUserId" <> "requestedByUserId");

ALTER TABLE "staff_attendance_outbox_events"
  ADD CONSTRAINT "staff_attendance_outbox_attempt_count_check"
  CHECK ("attemptCount" >= 0);

ALTER TABLE "attendance_settings"
  ADD CONSTRAINT "attendance_settings_staff_hybrid_values_check"
  CHECK (
    "staffScanSessionValidityMinutes" BETWEEN 5 AND 240 AND
    ("staffCredentialValidityDays" IS NULL OR "staffCredentialValidityDays" BETWEEN 1 AND 3650)
  );

-- Only one active permanent QR credential may exist for a staff member.
CREATE UNIQUE INDEX "staff_attendance_one_active_static_credential_key"
ON "staff_attendance_credentials" ("tenantId", "staffId")
WHERE "status" = 'ACTIVE' AND "credentialType" = 'STATIC_QR';

-- An operator must close or reuse an active branch session before opening another.
CREATE UNIQUE INDEX "staff_attendance_one_active_scan_session_key"
ON "staff_attendance_scan_sessions" ("tenantId", "branchId", "operatorUserId")
WHERE "status" = 'ACTIVE';

-- Current primary-branch ownership becomes the first effective assignment.
INSERT INTO "staff_branch_assignments" (
  "id", "tenantId", "institutionId", "branchId", "staffId",
  "effectiveFrom", "effectiveTo", "isPrimary", "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), staff."tenantId", branch."institutionId", staff."branchId", staff."id",
  COALESCE(staff."joiningDate", staff."createdAt"::date), NULL, true, NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "staff_profiles" AS staff
JOIN "branches" AS branch
  ON branch."tenantId" = staff."tenantId"
 AND branch."id" = staff."branchId"
ON CONFLICT ("tenantId", "staffId", "branchId", "effectiveFrom") DO NOTHING;

-- Create one published compatibility policy per existing branch from the
-- already-configured Attendance Settings values. No client-provided scope is used.
INSERT INTO "staff_attendance_policies" (
  "id", "tenantId", "institutionId", "branchId", "name", "version", "status",
  "effectiveFrom", "effectiveTo", "checkInOnly", "autoEventInference",
  "duplicateCooldownSeconds", "checkInWindowStart", "checkInWindowEnd",
  "shiftStartTime", "shiftEndTime", "graceMinutes", "halfDayMinimumMinutes",
  "fullDayMinimumMinutes", "earliestCheckOutTime", "earlyDepartureGraceMinutes",
  "multipleIntervalsAllowed", "manualEntryCutoffTime", "backdateLimitDays",
  "correctionApprovalRequired", "createdById", "publishedById", "publishedAt",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), branch."tenantId", branch."institutionId", branch."id",
  'Standard Staff Attendance', 1, 'PUBLISHED',
  COALESCE((SELECT MIN(record."attendanceDate") FROM "staff_attendance_records" AS record
            WHERE record."tenantId" = branch."tenantId" AND record."branchId" = branch."id"),
           branch."createdAt"::date),
  NULL, false, true, 30,
  COALESCE(setting."staffCheckInStartTime", '07:30'), '11:00',
  COALESCE(setting."staffLateAfterTime", '08:00'), '16:00', 0,
  COALESCE(setting."staffHalfDayBeforeMinutes", 240),
  COALESCE(setting."staffMinimumWorkingMinutes", 360),
  NULL, 0, false, '18:00', 7,
  COALESCE(setting."staffCorrectionApprovalRequired", true),
  NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" AS branch
LEFT JOIN "attendance_settings" AS setting
  ON setting."tenantId" = branch."tenantId"
 AND setting."branchId" = branch."id"
ON CONFLICT ("tenantId", "branchId", "version") DO NOTHING;

-- Create one default working schedule per branch. It is versioned so future
-- policy changes do not rewrite the history used to calculate prior days.
INSERT INTO "staff_attendance_schedules" (
  "id", "tenantId", "institutionId", "branchId", "name", "version", "status",
  "startTime", "endTime", "crossMidnight", "workingWeekdays",
  "checkInWindowStart", "graceMinutes", "halfDayMinimumMinutes",
  "fullDayMinimumMinutes", "earliestCheckOutTime", "expectedCheckOutTime",
  "earlyDepartureGraceMinutes", "effectiveFrom", "effectiveTo", "createdById",
  "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), branch."tenantId", branch."institutionId", branch."id",
  'Standard Working Day', 1, 'PUBLISHED',
  COALESCE(setting."staffLateAfterTime", '08:00'), '16:00', false,
  ARRAY[1, 2, 3, 4, 5, 6]::INTEGER[],
  COALESCE(setting."staffCheckInStartTime", '07:30'), 0,
  COALESCE(setting."staffHalfDayBeforeMinutes", 240),
  COALESCE(setting."staffMinimumWorkingMinutes", 360),
  NULL, '16:00', 0,
  COALESCE((SELECT MIN(record."attendanceDate") FROM "staff_attendance_records" AS record
            WHERE record."tenantId" = branch."tenantId" AND record."branchId" = branch."id"),
           branch."createdAt"::date),
  NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "branches" AS branch
LEFT JOIN "attendance_settings" AS setting
  ON setting."tenantId" = branch."tenantId"
 AND setting."branchId" = branch."id"
ON CONFLICT ("tenantId", "branchId", "name", "version") DO NOTHING;

INSERT INTO "staff_attendance_schedule_assignments" (
  "id", "tenantId", "branchId", "staffId", "scheduleId", "effectiveFrom",
  "effectiveTo", "createdById", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), assignment."tenantId", assignment."branchId", assignment."staffId",
  schedule."id", assignment."effectiveFrom", assignment."effectiveTo", NULL,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "staff_branch_assignments" AS assignment
JOIN "staff_attendance_schedules" AS schedule
  ON schedule."tenantId" = assignment."tenantId"
 AND schedule."branchId" = assignment."branchId"
 AND schedule."status" = 'PUBLISHED'
 AND schedule."version" = 1
ON CONFLICT ("tenantId", "staffId", "scheduleId", "effectiveFrom") DO NOTHING;

-- Attach the versioned policy/schedule and calculation metadata to each legacy
-- projection while retaining all previously stored attendance values.
UPDATE "staff_attendance_records" AS record
SET
  "policyId" = policy."id",
  "scheduleId" = schedule."id",
  "flags" =
    (CASE WHEN record."status" = 'LATE'
      THEN ARRAY['LATE'::"StaffAttendanceFlag"] ELSE ARRAY[]::"StaffAttendanceFlag"[] END) ||
    (CASE WHEN record."checkInAt" IS NOT NULL AND record."checkOutAt" IS NULL
                AND record."status" NOT IN ('ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'OFFICIAL_DUTY', 'ABSENT', 'NOT_MARKED')
      THEN ARRAY['MISSING_CHECK_OUT'::"StaffAttendanceFlag"] ELSE ARRAY[]::"StaffAttendanceFlag"[] END) ||
    (CASE WHEN record."checkInSource" = 'MANUAL_ADMIN' OR record."checkOutSource" = 'MANUAL_ADMIN'
      THEN ARRAY['MANUAL_ENTRY'::"StaffAttendanceFlag"] ELSE ARRAY[]::"StaffAttendanceFlag"[] END),
  "reviewState" = CASE
    WHEN record."checkInAt" IS NOT NULL AND record."checkOutAt" IS NULL
         AND record."status" NOT IN ('ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'OFFICIAL_DUTY', 'ABSENT', 'NOT_MARKED')
      THEN 'REVIEW_REQUIRED'::"StaffAttendanceReviewState"
    ELSE 'NOT_REQUIRED'::"StaffAttendanceReviewState"
  END,
  "lifecycle" = CASE
    WHEN record."status" = 'NOT_MARKED' THEN 'OPEN'::"StaffAttendanceDayLifecycle"
    WHEN record."checkInAt" IS NOT NULL AND record."checkOutAt" IS NULL
         AND record."status" NOT IN ('ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'OFFICIAL_DUTY', 'ABSENT', 'NOT_MARKED')
      THEN 'REVIEW_REQUIRED'::"StaffAttendanceDayLifecycle"
    ELSE 'CALCULATED'::"StaffAttendanceDayLifecycle"
  END,
  "reviewRequiredReason" = CASE
    WHEN record."checkInAt" IS NOT NULL AND record."checkOutAt" IS NULL
         AND record."status" NOT IN ('ON_LEAVE', 'HOLIDAY', 'WEEK_OFF', 'OFFICIAL_DUTY', 'ABSENT', 'NOT_MARKED')
      THEN 'Check-out is missing.'
    ELSE NULL
  END,
  "sourceSummary" = jsonb_strip_nulls(jsonb_build_object(
    'migration', 'legacy_projection_backfill',
    'checkInSource', record."checkInSource"::text,
    'checkOutSource', record."checkOutSource"::text
  )),
  "lastCalculatedAt" = record."updatedAt"
FROM "staff_attendance_policies" AS policy,
     "staff_attendance_schedules" AS schedule
WHERE policy."tenantId" = record."tenantId"
  AND policy."branchId" = record."branchId"
  AND policy."status" = 'PUBLISHED'
  AND policy."version" = 1
  AND schedule."tenantId" = record."tenantId"
  AND schedule."branchId" = record."branchId"
  AND schedule."status" = 'PUBLISHED'
  AND schedule."version" = 1;

-- Immutable legacy check-in events. No raw QR values, hashes, credentials, or
-- other secrets are reconstructed or exposed by this compatibility backfill.
INSERT INTO "staff_attendance_events" (
  "id", "tenantId", "institutionId", "branchId", "staffId", "attendanceRecordId",
  "attendanceDate", "eventType", "eventSource", "processingState", "occurredAt",
  "recordedAt", "recordedByUserId", "scanSessionId", "credentialId",
  "clientRequestId", "manualReasonCode", "manualReasonText", "supersedesEventId",
  "metadata", "createdAt"
)
SELECT
  gen_random_uuid(), record."tenantId", branch."institutionId", record."branchId",
  record."staffId", record."id", record."attendanceDate", 'CHECK_IN',
  CASE record."checkInSource"
    WHEN 'QR_SCAN' THEN 'SELF_SERVICE_QR'::"StaffAttendanceEventSource"
    WHEN 'MANUAL_ADMIN' THEN 'MANUAL'::"StaffAttendanceEventSource"
    WHEN 'IMPORT' THEN 'IMPORT'::"StaffAttendanceEventSource"
    WHEN 'BIOMETRIC' THEN 'SYSTEM'::"StaffAttendanceEventSource"
    ELSE 'SYSTEM'::"StaffAttendanceEventSource"
  END,
  'ACCEPTED', record."checkInAt", COALESCE(record."updatedAt", record."createdAt"),
  COALESCE(record."updatedById", record."markedById"), NULL, NULL,
  'legacy-check-in:' || record."id"::text,
  CASE WHEN record."checkInSource" = 'MANUAL_ADMIN' THEN 'LEGACY_MANUAL_ENTRY' ELSE NULL END,
  CASE WHEN record."checkInSource" = 'MANUAL_ADMIN' THEN COALESCE(record."correctionReason", 'Historical manual check-in') ELSE NULL END,
  NULL,
  jsonb_strip_nulls(jsonb_build_object('legacyStatus', record."status"::text, 'legacySource', record."checkInSource"::text)),
  CURRENT_TIMESTAMP
FROM "staff_attendance_records" AS record
JOIN "branches" AS branch
  ON branch."tenantId" = record."tenantId" AND branch."id" = record."branchId"
WHERE record."checkInAt" IS NOT NULL
ON CONFLICT ("tenantId", "clientRequestId") DO NOTHING;

INSERT INTO "staff_attendance_events" (
  "id", "tenantId", "institutionId", "branchId", "staffId", "attendanceRecordId",
  "attendanceDate", "eventType", "eventSource", "processingState", "occurredAt",
  "recordedAt", "recordedByUserId", "scanSessionId", "credentialId",
  "clientRequestId", "manualReasonCode", "manualReasonText", "supersedesEventId",
  "metadata", "createdAt"
)
SELECT
  gen_random_uuid(), record."tenantId", branch."institutionId", record."branchId",
  record."staffId", record."id", record."attendanceDate", 'CHECK_OUT',
  CASE record."checkOutSource"
    WHEN 'QR_SCAN' THEN 'SELF_SERVICE_QR'::"StaffAttendanceEventSource"
    WHEN 'MANUAL_ADMIN' THEN 'MANUAL'::"StaffAttendanceEventSource"
    WHEN 'IMPORT' THEN 'IMPORT'::"StaffAttendanceEventSource"
    WHEN 'BIOMETRIC' THEN 'SYSTEM'::"StaffAttendanceEventSource"
    ELSE 'SYSTEM'::"StaffAttendanceEventSource"
  END,
  'ACCEPTED', record."checkOutAt", COALESCE(record."updatedAt", record."createdAt"),
  COALESCE(record."updatedById", record."markedById"), NULL, NULL,
  'legacy-check-out:' || record."id"::text,
  CASE WHEN record."checkOutSource" = 'MANUAL_ADMIN' THEN 'LEGACY_MANUAL_ENTRY' ELSE NULL END,
  CASE WHEN record."checkOutSource" = 'MANUAL_ADMIN' THEN COALESCE(record."correctionReason", 'Historical manual check-out') ELSE NULL END,
  NULL,
  jsonb_strip_nulls(jsonb_build_object('legacyStatus', record."status"::text, 'legacySource', record."checkOutSource"::text)),
  CURRENT_TIMESTAMP
FROM "staff_attendance_records" AS record
JOIN "branches" AS branch
  ON branch."tenantId" = record."tenantId" AND branch."id" = record."branchId"
WHERE record."checkOutAt" IS NOT NULL
ON CONFLICT ("tenantId", "clientRequestId") DO NOTHING;

INSERT INTO "staff_attendance_events" (
  "id", "tenantId", "institutionId", "branchId", "staffId", "attendanceRecordId",
  "attendanceDate", "eventType", "eventSource", "processingState", "occurredAt",
  "recordedAt", "recordedByUserId", "scanSessionId", "credentialId",
  "clientRequestId", "manualReasonCode", "manualReasonText", "supersedesEventId",
  "metadata", "createdAt"
)
SELECT
  gen_random_uuid(), record."tenantId", branch."institutionId", record."branchId",
  record."staffId", record."id", record."attendanceDate", 'MANUAL_STATUS',
  CASE
    WHEN record."leaveApplicationId" IS NOT NULL THEN 'LEAVE'::"StaffAttendanceEventSource"
    WHEN record."calendarEntryId" IS NOT NULL THEN 'CALENDAR'::"StaffAttendanceEventSource"
    ELSE 'MANUAL'::"StaffAttendanceEventSource"
  END,
  'ACCEPTED', record."attendanceDate"::timestamp + INTERVAL '12 hours',
  COALESCE(record."updatedAt", record."createdAt"),
  COALESCE(record."updatedById", record."markedById"), NULL, NULL,
  'legacy-status:' || record."id"::text,
  'LEGACY_STATUS_BACKFILL', COALESCE(record."correctionReason", 'Historical attendance status'),
  NULL,
  jsonb_build_object('legacyStatus', record."status"::text), CURRENT_TIMESTAMP
FROM "staff_attendance_records" AS record
JOIN "branches" AS branch
  ON branch."tenantId" = record."tenantId" AND branch."id" = record."branchId"
WHERE record."checkInAt" IS NULL
  AND record."checkOutAt" IS NULL
  AND record."status" <> 'NOT_MARKED'
ON CONFLICT ("tenantId", "clientRequestId") DO NOTHING;

-- New permissions remain separate from institution entitlements. Entitlements
-- decide whether Staff Attendance is available; these permissions decide who
-- may operate each workflow within an enabled institution.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'staffboard.attendance.scan', 'STAFFBOARD', 'Run a supervised staff QR attendance scanner for an authorised branch.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'staffboard.attendance.credential.manage', 'STAFFBOARD', 'Issue, reissue, suspend, and revoke staff attendance credentials.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'staffboard.attendance.manual', 'STAFFBOARD', 'Record controlled current-day manual staff attendance with a reason.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'staffboard.attendance.adjustment.request', 'STAFFBOARD', 'Request a reasoned staff attendance correction without overwriting source events.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'staffboard.attendance.adjustment.approve', 'STAFFBOARD', 'Approve or reject staff attendance corrections using maker-checker controls.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'staffboard.attendance.period.lock', 'STAFFBOARD', 'Approve and lock final staff attendance periods.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
  'staffboard.attendance.scan',
  'staffboard.attendance.credential.manage',
  'staffboard.attendance.manual',
  'staffboard.attendance.adjustment.request',
  'staffboard.attendance.adjustment.approve',
  'staffboard.attendance.period.lock'
)
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
  'staffboard.attendance.scan',
  'staffboard.attendance.manual',
  'staffboard.attendance.adjustment.request'
)
WHERE role."code" = 'OFFICE_STAFF'
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" = 'staffboard.attendance.adjustment.request'
WHERE role."code" IN ('TEACHER', 'CLASS_TEACHER', 'STAFF')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- Supabase automatically enables RLS for new public-schema tables in the target
-- environments. These statements make that requirement reproducible elsewhere.
ALTER TABLE "staff_branch_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_policies" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_schedule_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_credentials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_scan_sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "staff_attendance_outbox_events" ENABLE ROW LEVEL SECURITY;
