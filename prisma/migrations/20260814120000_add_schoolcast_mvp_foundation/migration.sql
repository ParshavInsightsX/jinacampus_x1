-- CreateEnum
CREATE TYPE "SchoolCastCommunicationType" AS ENUM ('NOTICE', 'CIRCULAR', 'BROADCAST', 'EMERGENCY', 'AUTOMATION', 'HOMEWORK', 'CLASSWORK');

-- CreateEnum
CREATE TYPE "SchoolCastCommunicationStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'PARTIALLY_DELIVERED', 'EXPIRED', 'CANCELLED', 'ARCHIVED', 'FAILED');

-- CreateEnum
CREATE TYPE "SchoolCastPriority" AS ENUM ('NORMAL', 'HIGH', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "SchoolCastAudienceRuleType" AS ENUM ('ALL_USERS', 'ROLE', 'BRANCH', 'CLASS_SECTION', 'STUDENT', 'STAFF', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SchoolCastAudienceMode" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateEnum
CREATE TYPE "SchoolCastRecipientType" AS ENUM ('USER', 'STUDENT', 'GUARDIAN', 'STAFF');

-- CreateEnum
CREATE TYPE "SchoolCastChannelPlanStatus" AS ENUM ('DRAFT', 'READY', 'BLOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SchoolCastApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "SchoolCastApprovalActionType" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "SchoolCastProviderStatus" AS ENUM ('DRAFT', 'TESTING', 'READY', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "SchoolCastDeliveryMode" AS ENUM ('DRY_RUN', 'TEST', 'LIVE');

-- CreateEnum
CREATE TYPE "SchoolCastConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'WITHDRAWN', 'EXPIRED', 'REVOKED', 'NOT_REQUIRED_BY_POLICY');

-- CreateEnum
CREATE TYPE "SchoolCastAttachmentScanStatus" AS ENUM ('PENDING', 'SAFE', 'REJECTED', 'FAILED');

-- CreateEnum
CREATE TYPE "SchoolCastHomeworkStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'UPDATED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SchoolCastWorkType" AS ENUM ('HOMEWORK', 'CLASSWORK');

-- CreateEnum
CREATE TYPE "SchoolCastDeliveryAttemptStatus" AS ENUM ('STARTED', 'DRY_RUN', 'SUBMITTED', 'SENT', 'DELIVERED', 'READ', 'RETRYABLE_FAILURE', 'PERMANENT_FAILURE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SchoolCastDeliveryEventStatus" AS ENUM ('SUBMITTED', 'SENT', 'DELIVERED', 'READ', 'BOUNCED', 'FAILED', 'COMPLAINED');

-- CreateEnum
CREATE TYPE "SchoolCastDomainEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'IGNORED');

-- AlterEnum
ALTER TYPE "CommunicationPreferenceOwnerType" ADD VALUE 'USER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationChannel" ADD VALUE 'IN_APP';
ALTER TYPE "NotificationChannel" ADD VALUE 'EMAIL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationRecipientType" ADD VALUE 'USER';
ALTER TYPE "NotificationRecipientType" ADD VALUE 'STUDENT';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationOutboxStatus" ADD VALUE 'RETRYING';
ALTER TYPE "NotificationOutboxStatus" ADD VALUE 'UNDELIVERABLE';
ALTER TYPE "NotificationOutboxStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'SUBMITTED';
ALTER TYPE "NotificationDeliveryStatus" ADD VALUE 'BOUNCED';

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "schoolCastAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastApprovalsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastAutomationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastDeliveryMode" "SchoolCastDeliveryMode" NOT NULL DEFAULT 'DRY_RUN',
ADD COLUMN     "schoolCastEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastHomeworkEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastInAppEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastNoticesEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastTeacherDirectPublish" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schoolCastWhatsAppEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "guardians" ADD COLUMN     "userId" UUID;

-- AlterTable
ALTER TABLE "in_app_notifications" ADD COLUMN     "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "communicationId" UUID,
ADD COLUMN     "communicationVersionId" UUID,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "priority" "SchoolCastPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "recipientSnapshotId" UUID;

-- AlterTable
ALTER TABLE "communication_preferences" ADD COLUMN     "calendarRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "emailAddress" TEXT,
ADD COLUMN     "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "feeUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "generalNoticesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "gradebookUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "homeworkUpdatesEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "inAppEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "notification_outbox" ADD COLUMN     "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "channelPlanId" UUID,
ADD COLUMN     "communicationVersionId" UUID,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "lastAttemptAt" TIMESTAMP(3),
ADD COLUMN     "leaseUntil" TIMESTAMP(3),
ADD COLUMN     "lockOwner" TEXT,
ADD COLUMN     "lockedAt" TIMESTAMP(3),
ADD COLUMN     "maxAttempts" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mode" "SchoolCastDeliveryMode" NOT NULL DEFAULT 'DRY_RUN',
ADD COLUMN     "payloadHash" TEXT,
ADD COLUMN     "priority" "SchoolCastPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "providerConfigId" UUID,
ADD COLUMN     "recipientAddressEncrypted" TEXT,
ADD COLUMN     "recipientSnapshotId" UUID,
ADD COLUMN     "schoolCastCommunicationId" UUID,
ADD COLUMN     "templateVersionId" UUID,
ALTER COLUMN "recipientPhone" DROP NOT NULL;

-- CreateTable
CREATE TABLE "schoolcast_communications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID,
    "branchId" UUID,
    "academicYearId" UUID,
    "type" "SchoolCastCommunicationType" NOT NULL,
    "category" TEXT NOT NULL,
    "priority" "SchoolCastPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "SchoolCastCommunicationStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceModule" TEXT,
    "sourceEntityType" TEXT,
    "sourceEntityId" TEXT,
    "sourceEntityVersionId" TEXT,
    "currentVersionId" UUID,
    "timeZoneId" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "scheduledAtUtc" TIMESTAMP(3),
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "acknowledgementRequired" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "publicationAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastPublicationError" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_communication_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "contentText" TEXT NOT NULL,
    "contentHtmlSanitized" TEXT,
    "contentJson" JSONB,
    "contentHash" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_communication_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_audience_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "ruleType" "SchoolCastAudienceRuleType" NOT NULL,
    "mode" "SchoolCastAudienceMode" NOT NULL DEFAULT 'INCLUDE',
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "criteriaJson" JSONB NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_audience_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_recipient_snapshots" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "communicationVersionId" UUID NOT NULL,
    "recipientType" "SchoolCastRecipientType" NOT NULL,
    "stableRecipientKey" TEXT NOT NULL,
    "userId" UUID,
    "studentId" UUID,
    "guardianId" UUID,
    "staffId" UUID,
    "relationship" TEXT,
    "displayName" TEXT NOT NULL,
    "contactEmailMasked" TEXT,
    "contactEmailHash" TEXT,
    "contactPhoneMasked" TEXT,
    "contactPhoneHash" TEXT,
    "contactSnapshotEncrypted" TEXT,
    "eligibilityJson" JSONB NOT NULL,
    "resolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_recipient_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_recipient_channel_eligibility" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "recipientSnapshotId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "purpose" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "reasonCode" TEXT,
    "consentRecordId" UUID,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_recipient_channel_eligibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_channel_plans" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "templateId" UUID,
    "templateVersionId" UUID,
    "providerConfigId" UUID,
    "status" "SchoolCastChannelPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "fallbackOrder" INTEGER,
    "configurationJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_channel_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_approvals" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "communicationVersionId" UUID NOT NULL,
    "status" "SchoolCastApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requiredPermission" TEXT NOT NULL,
    "selfApprovalAllowed" BOOLEAN NOT NULL DEFAULT false,
    "submittedById" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_approval_actions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "approvalId" UUID NOT NULL,
    "actorUserId" UUID NOT NULL,
    "action" "SchoolCastApprovalActionType" NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_approval_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_template_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "subject" TEXT,
    "bodyText" TEXT NOT NULL,
    "bodyHtmlSanitized" TEXT,
    "variableSchemaJson" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_provider_configurations" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID,
    "branchId" UUID,
    "channel" "NotificationChannel" NOT NULL,
    "providerCode" TEXT NOT NULL,
    "mode" "SchoolCastDeliveryMode" NOT NULL DEFAULT 'DRY_RUN',
    "status" "SchoolCastProviderStatus" NOT NULL DEFAULT 'DRAFT',
    "senderDisplayName" TEXT,
    "senderIdentifierMasked" TEXT,
    "secretRef" TEXT,
    "webhookSecretRef" TEXT,
    "configurationJson" JSONB,
    "limitsJson" JSONB,
    "healthStatus" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_provider_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_consent_records" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ownerType" "CommunicationPreferenceOwnerType" NOT NULL,
    "ownerId" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" "SchoolCastConsentStatus" NOT NULL,
    "noticeVersion" TEXT NOT NULL,
    "noticeTextHash" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "proofReference" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawnAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_attachments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID,
    "communicationVersionId" UUID,
    "homeworkVersionId" UUID,
    "storageBucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "scanStatus" "SchoolCastAttachmentScanStatus" NOT NULL DEFAULT 'PENDING',
    "scanAttemptCount" INTEGER NOT NULL DEFAULT 0,
    "scanAvailableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanLockedAt" TIMESTAMP(3),
    "scanLeaseUntil" TIMESTAMP(3),
    "scanLockOwner" TEXT,
    "scanCompletedAt" TIMESTAMP(3),
    "scanEngine" TEXT,
    "scanReference" TEXT,
    "scanFailureCode" TEXT,
    "retentionClass" TEXT NOT NULL DEFAULT 'COMMUNICATION',
    "uploadedById" UUID NOT NULL,
    "deletedById" UUID,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_homework_items" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "teacherUserId" UUID NOT NULL,
    "workType" "SchoolCastWorkType" NOT NULL,
    "status" "SchoolCastHomeworkStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" UUID,
    "communicationId" UUID,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_homework_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_homework_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "homeworkItemId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "instructionsSanitized" TEXT NOT NULL,
    "assignmentDate" DATE NOT NULL,
    "completionDueAt" TIMESTAMP(3),
    "teacherRemarks" TEXT,
    "contentHash" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_homework_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_acknowledgements" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "communicationId" UUID NOT NULL,
    "communicationVersionId" UUID NOT NULL,
    "recipientSnapshotId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "acknowledgementTextHash" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schoolcast_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_delivery_attempts" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "outboxId" UUID NOT NULL,
    "attemptNo" INTEGER NOT NULL,
    "providerMessageId" TEXT,
    "requestHash" TEXT NOT NULL,
    "status" "SchoolCastDeliveryAttemptStatus" NOT NULL DEFAULT 'STARTED',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorCategory" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "costAmount" DECIMAL(12,4),
    "currency" VARCHAR(3),

    CONSTRAINT "schoolcast_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_delivery_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "providerEventId" TEXT,
    "canonicalStatus" "SchoolCastDeliveryEventStatus" NOT NULL,
    "providerStatus" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadHash" TEXT,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "schoolcast_delivery_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schoolcast_domain_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "academicYearId" UUID,
    "sourceModule" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "sourceEntityType" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "status" "SchoolCastDomainEventStatus" NOT NULL DEFAULT 'PENDING',
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schoolcast_domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_communications_currentVersionId_key" ON "schoolcast_communications"("currentVersionId");

-- CreateIndex
CREATE INDEX "schoolcast_communications_tenantId_status_scheduledAtUtc_idx" ON "schoolcast_communications"("tenantId", "status", "scheduledAtUtc");

-- CreateIndex
CREATE INDEX "schoolcast_communications_tenantId_branchId_academicYearId__idx" ON "schoolcast_communications"("tenantId", "branchId", "academicYearId", "createdAt");

-- CreateIndex
CREATE INDEX "schoolcast_communications_tenantId_type_status_createdAt_idx" ON "schoolcast_communications"("tenantId", "type", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_communications_tenantId_sourceModule_sourceEntit_key" ON "schoolcast_communications"("tenantId", "sourceModule", "sourceEntityType", "sourceEntityId", "sourceEntityVersionId");

-- CreateIndex
CREATE INDEX "schoolcast_communication_versions_tenantId_communicationId__idx" ON "schoolcast_communication_versions"("tenantId", "communicationId", "createdAt");

-- CreateIndex
CREATE INDEX "schoolcast_communication_versions_tenantId_contentHash_idx" ON "schoolcast_communication_versions"("tenantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_communication_versions_communicationId_versionNo_key" ON "schoolcast_communication_versions"("communicationId", "versionNo");

-- CreateIndex
CREATE INDEX "schoolcast_audience_rules_tenantId_communicationId_sequence_idx" ON "schoolcast_audience_rules"("tenantId", "communicationId", "sequence");

-- CreateIndex
CREATE INDEX "schoolcast_recipient_snapshots_tenantId_communicationId_rec_idx" ON "schoolcast_recipient_snapshots"("tenantId", "communicationId", "recipientType");

-- CreateIndex
CREATE INDEX "schoolcast_recipient_snapshots_tenantId_userId_resolvedAt_idx" ON "schoolcast_recipient_snapshots"("tenantId", "userId", "resolvedAt");

-- CreateIndex
CREATE INDEX "schoolcast_recipient_snapshots_tenantId_studentId_guardianI_idx" ON "schoolcast_recipient_snapshots"("tenantId", "studentId", "guardianId");

-- CreateIndex
CREATE INDEX "schoolcast_recipient_snapshots_tenantId_staffId_idx" ON "schoolcast_recipient_snapshots"("tenantId", "staffId");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_recipient_snapshots_communicationVersionId_recip_key" ON "schoolcast_recipient_snapshots"("communicationVersionId", "recipientType", "stableRecipientKey");

-- CreateIndex
CREATE INDEX "schoolcast_recipient_channel_eligibility_tenantId_channel_e_idx" ON "schoolcast_recipient_channel_eligibility"("tenantId", "channel", "eligible");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_recipient_channel_eligibility_recipientSnapshotI_key" ON "schoolcast_recipient_channel_eligibility"("recipientSnapshotId", "channel", "purpose");

-- CreateIndex
CREATE INDEX "schoolcast_channel_plans_tenantId_channel_status_idx" ON "schoolcast_channel_plans"("tenantId", "channel", "status");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_channel_plans_communicationId_channel_key" ON "schoolcast_channel_plans"("communicationId", "channel");

-- CreateIndex
CREATE INDEX "schoolcast_approvals_tenantId_status_submittedAt_idx" ON "schoolcast_approvals"("tenantId", "status", "submittedAt");

-- CreateIndex
CREATE INDEX "schoolcast_approvals_tenantId_communicationId_status_idx" ON "schoolcast_approvals"("tenantId", "communicationId", "status");

-- CreateIndex
CREATE INDEX "schoolcast_approval_actions_tenantId_approvalId_occurredAt_idx" ON "schoolcast_approval_actions"("tenantId", "approvalId", "occurredAt");

-- CreateIndex
CREATE INDEX "schoolcast_approval_actions_tenantId_actorUserId_occurredAt_idx" ON "schoolcast_approval_actions"("tenantId", "actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "schoolcast_template_versions_tenantId_channel_status_idx" ON "schoolcast_template_versions"("tenantId", "channel", "status");

-- CreateIndex
CREATE INDEX "schoolcast_template_versions_tenantId_contentHash_idx" ON "schoolcast_template_versions"("tenantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_template_versions_templateId_versionNo_channel_l_key" ON "schoolcast_template_versions"("templateId", "versionNo", "channel", "languageCode");

-- CreateIndex
CREATE INDEX "schoolcast_provider_configurations_tenantId_institutionId_b_idx" ON "schoolcast_provider_configurations"("tenantId", "institutionId", "branchId", "channel", "status");

-- CreateIndex
CREATE INDEX "schoolcast_provider_configurations_tenantId_channel_isDefau_idx" ON "schoolcast_provider_configurations"("tenantId", "channel", "isDefault");

-- CreateIndex
CREATE INDEX "schoolcast_consent_records_tenantId_ownerType_ownerId_chann_idx" ON "schoolcast_consent_records"("tenantId", "ownerType", "ownerId", "channel", "purpose", "capturedAt");

-- CreateIndex
CREATE INDEX "schoolcast_consent_records_tenantId_status_expiresAt_idx" ON "schoolcast_consent_records"("tenantId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "schoolcast_attachments_tenantId_communicationVersionId_dele_idx" ON "schoolcast_attachments"("tenantId", "communicationVersionId", "deletedAt");

-- CreateIndex
CREATE INDEX "schoolcast_attachments_tenantId_homeworkVersionId_deletedAt_idx" ON "schoolcast_attachments"("tenantId", "homeworkVersionId", "deletedAt");

-- CreateIndex
CREATE INDEX "schoolcast_attachments_tenantId_scanStatus_idx" ON "schoolcast_attachments"("tenantId", "scanStatus");

-- CreateIndex
CREATE INDEX "schoolcast_attachments_scanStatus_scanAvailableAt_scanLeaseUntil_idx" ON "schoolcast_attachments"("scanStatus", "scanAvailableAt", "scanLeaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_attachments_storageBucket_storagePath_key" ON "schoolcast_attachments"("storageBucket", "storagePath");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_homework_items_currentVersionId_key" ON "schoolcast_homework_items"("currentVersionId");

-- CreateIndex
CREATE INDEX "schoolcast_homework_items_tenantId_branchId_academicYearId__idx" ON "schoolcast_homework_items"("tenantId", "branchId", "academicYearId", "classSectionId", "status");

-- CreateIndex
CREATE INDEX "schoolcast_homework_items_tenantId_teacherUserId_status_cre_idx" ON "schoolcast_homework_items"("tenantId", "teacherUserId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "schoolcast_homework_items_tenantId_subjectId_status_idx" ON "schoolcast_homework_items"("tenantId", "subjectId", "status");

-- CreateIndex
CREATE INDEX "schoolcast_homework_versions_tenantId_assignmentDate_idx" ON "schoolcast_homework_versions"("tenantId", "assignmentDate");

-- CreateIndex
CREATE INDEX "schoolcast_homework_versions_tenantId_contentHash_idx" ON "schoolcast_homework_versions"("tenantId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_homework_versions_homeworkItemId_versionNo_key" ON "schoolcast_homework_versions"("homeworkItemId", "versionNo");

-- CreateIndex
CREATE INDEX "schoolcast_acknowledgements_tenantId_userId_acknowledgedAt_idx" ON "schoolcast_acknowledgements"("tenantId", "userId", "acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_acknowledgements_communicationVersionId_recipien_key" ON "schoolcast_acknowledgements"("communicationVersionId", "recipientSnapshotId", "userId");

-- CreateIndex
CREATE INDEX "schoolcast_delivery_attempts_tenantId_status_startedAt_idx" ON "schoolcast_delivery_attempts"("tenantId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "schoolcast_delivery_attempts_providerMessageId_idx" ON "schoolcast_delivery_attempts"("providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_delivery_attempts_outboxId_attemptNo_key" ON "schoolcast_delivery_attempts"("outboxId", "attemptNo");

-- CreateIndex
CREATE INDEX "schoolcast_delivery_events_tenantId_canonicalStatus_occurre_idx" ON "schoolcast_delivery_events"("tenantId", "canonicalStatus", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_delivery_events_attemptId_providerEventId_key" ON "schoolcast_delivery_events"("attemptId", "providerEventId");

-- CreateIndex
CREATE INDEX "schoolcast_domain_events_tenantId_status_availableAt_idx" ON "schoolcast_domain_events"("tenantId", "status", "availableAt");

-- CreateIndex
CREATE INDEX "schoolcast_domain_events_tenantId_sourceModule_eventType_cr_idx" ON "schoolcast_domain_events"("tenantId", "sourceModule", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "schoolcast_domain_events_tenantId_sourceModule_sourceEventI_key" ON "schoolcast_domain_events"("tenantId", "sourceModule", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "students_userId_key" ON "students"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "guardians_userId_key" ON "guardians"("userId");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenantId_communicationId_createdAt_idx" ON "in_app_notifications"("tenantId", "communicationId", "createdAt");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenantId_userId_expiresAt_idx" ON "in_app_notifications"("tenantId", "userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "in_app_notifications_tenantId_recipientSnapshotId_userId_co_key" ON "in_app_notifications"("tenantId", "recipientSnapshotId", "userId", "communicationVersionId");

-- CreateIndex
CREATE INDEX "notification_outbox_tenantId_status_availableAt_priority_idx" ON "notification_outbox"("tenantId", "status", "availableAt", "priority");

-- CreateIndex
CREATE INDEX "notification_outbox_tenantId_providerConfigId_status_idx" ON "notification_outbox"("tenantId", "providerConfigId", "status");

-- CreateIndex
CREATE INDEX "notification_outbox_tenantId_recipientSnapshotId_channel_idx" ON "notification_outbox"("tenantId", "recipientSnapshotId", "channel");

-- CreateIndex
CREATE INDEX "notification_outbox_leaseUntil_idx" ON "notification_outbox"("leaseUntil");

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardians" ADD CONSTRAINT "guardians_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_recipientSnapshotId_fkey" FOREIGN KEY ("recipientSnapshotId") REFERENCES "schoolcast_recipient_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_schoolCastCommunicationId_fkey" FOREIGN KEY ("schoolCastCommunicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_recipientSnapshotId_fkey" FOREIGN KEY ("recipientSnapshotId") REFERENCES "schoolcast_recipient_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_channelPlanId_fkey" FOREIGN KEY ("channelPlanId") REFERENCES "schoolcast_channel_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "schoolcast_provider_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_outbox" ADD CONSTRAINT "notification_outbox_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "schoolcast_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communications" ADD CONSTRAINT "schoolcast_communications_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communication_versions" ADD CONSTRAINT "schoolcast_communication_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communication_versions" ADD CONSTRAINT "schoolcast_communication_versions_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_communication_versions" ADD CONSTRAINT "schoolcast_communication_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_audience_rules" ADD CONSTRAINT "schoolcast_audience_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_audience_rules" ADD CONSTRAINT "schoolcast_audience_rules_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_guardianId_fkey" FOREIGN KEY ("guardianId") REFERENCES "guardians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_snapshots" ADD CONSTRAINT "schoolcast_recipient_snapshots_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_channel_eligibility" ADD CONSTRAINT "schoolcast_recipient_channel_eligibility_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_channel_eligibility" ADD CONSTRAINT "schoolcast_recipient_channel_eligibility_recipientSnapshot_fkey" FOREIGN KEY ("recipientSnapshotId") REFERENCES "schoolcast_recipient_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_recipient_channel_eligibility" ADD CONSTRAINT "schoolcast_recipient_channel_eligibility_consentRecordId_fkey" FOREIGN KEY ("consentRecordId") REFERENCES "schoolcast_consent_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_channel_plans" ADD CONSTRAINT "schoolcast_channel_plans_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_channel_plans" ADD CONSTRAINT "schoolcast_channel_plans_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_channel_plans" ADD CONSTRAINT "schoolcast_channel_plans_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_channel_plans" ADD CONSTRAINT "schoolcast_channel_plans_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "schoolcast_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_channel_plans" ADD CONSTRAINT "schoolcast_channel_plans_providerConfigId_fkey" FOREIGN KEY ("providerConfigId") REFERENCES "schoolcast_provider_configurations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approvals" ADD CONSTRAINT "schoolcast_approvals_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approvals" ADD CONSTRAINT "schoolcast_approvals_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approvals" ADD CONSTRAINT "schoolcast_approvals_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approvals" ADD CONSTRAINT "schoolcast_approvals_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approval_actions" ADD CONSTRAINT "schoolcast_approval_actions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approval_actions" ADD CONSTRAINT "schoolcast_approval_actions_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "schoolcast_approvals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_approval_actions" ADD CONSTRAINT "schoolcast_approval_actions_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_template_versions" ADD CONSTRAINT "schoolcast_template_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_template_versions" ADD CONSTRAINT "schoolcast_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_template_versions" ADD CONSTRAINT "schoolcast_template_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_provider_configurations" ADD CONSTRAINT "schoolcast_provider_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_provider_configurations" ADD CONSTRAINT "schoolcast_provider_configurations_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_provider_configurations" ADD CONSTRAINT "schoolcast_provider_configurations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_provider_configurations" ADD CONSTRAINT "schoolcast_provider_configurations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_provider_configurations" ADD CONSTRAINT "schoolcast_provider_configurations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_consent_records" ADD CONSTRAINT "schoolcast_consent_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_homeworkVersionId_fkey" FOREIGN KEY ("homeworkVersionId") REFERENCES "schoolcast_homework_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_attachments" ADD CONSTRAINT "schoolcast_attachments_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "schoolcast_homework_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_items" ADD CONSTRAINT "schoolcast_homework_items_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_versions" ADD CONSTRAINT "schoolcast_homework_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_versions" ADD CONSTRAINT "schoolcast_homework_versions_homeworkItemId_fkey" FOREIGN KEY ("homeworkItemId") REFERENCES "schoolcast_homework_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_homework_versions" ADD CONSTRAINT "schoolcast_homework_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_acknowledgements" ADD CONSTRAINT "schoolcast_acknowledgements_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_acknowledgements" ADD CONSTRAINT "schoolcast_acknowledgements_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "schoolcast_communications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_acknowledgements" ADD CONSTRAINT "schoolcast_acknowledgements_communicationVersionId_fkey" FOREIGN KEY ("communicationVersionId") REFERENCES "schoolcast_communication_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_acknowledgements" ADD CONSTRAINT "schoolcast_acknowledgements_recipientSnapshotId_fkey" FOREIGN KEY ("recipientSnapshotId") REFERENCES "schoolcast_recipient_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_acknowledgements" ADD CONSTRAINT "schoolcast_acknowledgements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_delivery_attempts" ADD CONSTRAINT "schoolcast_delivery_attempts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_delivery_attempts" ADD CONSTRAINT "schoolcast_delivery_attempts_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "notification_outbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_delivery_events" ADD CONSTRAINT "schoolcast_delivery_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_delivery_events" ADD CONSTRAINT "schoolcast_delivery_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "schoolcast_delivery_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_domain_events" ADD CONSTRAINT "schoolcast_domain_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_domain_events" ADD CONSTRAINT "schoolcast_domain_events_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schoolcast_domain_events" ADD CONSTRAINT "schoolcast_domain_events_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- SchoolCast database hardening and RBAC catalogue.
-- Hosted direct-client access is denied. Server-side session context, tenant,
-- institution, branch and permission checks remain authoritative.
ALTER TABLE "schoolcast_communications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_communication_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_audience_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_recipient_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_recipient_channel_eligibility" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_channel_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_approval_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_provider_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_consent_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_homework_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_homework_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_acknowledgements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_delivery_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_delivery_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "schoolcast_domain_events" ENABLE ROW LEVEL SECURITY;

-- Seed the additive SchoolCast permission catalogue without enabling the
-- feature for any tenant. All feature flags remain false and delivery remains
-- DRY_RUN until a separately approved pilot rollout.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), code, 'SCHOOLCAST'::"PermissionModule", description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT code, 'SchoolCast capability: ' || replace(code, '.', ' ') AS description
  FROM unnest(ARRAY[
    'schoolcast.dashboard.view',
    'schoolcast.communication.view',
    'schoolcast.communication.create',
    'schoolcast.communication.edit',
    'schoolcast.communication.submit',
    'schoolcast.communication.review',
    'schoolcast.communication.approve',
    'schoolcast.communication.reject',
    'schoolcast.communication.publish',
    'schoolcast.communication.schedule',
    'schoolcast.communication.cancel',
    'schoolcast.communication.archive',
    'schoolcast.communication.duplicate',
    'schoolcast.audience.create',
    'schoolcast.audience.preview',
    'schoolcast.audience.resolve',
    'schoolcast.audience.use_individual',
    'schoolcast.audience.use_custom_list',
    'schoolcast.recipient.view_masked_contact',
    'schoolcast.recipient.view_detail',
    'schoolcast.emergency.create',
    'schoolcast.emergency.preview',
    'schoolcast.emergency.publish',
    'schoolcast.emergency.cancel_pending',
    'schoolcast.emergency.delivery.view',
    'schoolcast.template.view',
    'schoolcast.template.create',
    'schoolcast.template.update',
    'schoolcast.template.activate',
    'schoolcast.template.deactivate',
    'schoolcast.template.provider_map',
    'schoolcast.channel.select',
    'schoolcast.channel.override_defaults',
    'schoolcast.provider.view',
    'schoolcast.provider.manage',
    'schoolcast.provider.test',
    'schoolcast.provider.enable_live',
    'schoolcast.provider.rotate_secret',
    'schoolcast.provider.suspend',
    'schoolcast.provider.health.view',
    'schoolcast.approval.view',
    'schoolcast.approval.action',
    'schoolcast.attachment.upload',
    'schoolcast.attachment.view',
    'schoolcast.attachment.delete',
    'schoolcast.preference.view_own',
    'schoolcast.preference.update_own',
    'schoolcast.preference.manage',
    'schoolcast.consent.view_own',
    'schoolcast.consent.manage_own',
    'schoolcast.consent.manage',
    'schoolcast.inbox.view',
    'schoolcast.inbox.read',
    'schoolcast.inbox.acknowledge',
    'schoolcast.homework.view',
    'schoolcast.homework.create',
    'schoolcast.homework.edit',
    'schoolcast.homework.submit',
    'schoolcast.homework.approve',
    'schoolcast.homework.publish',
    'schoolcast.homework.cancel',
    'schoolcast.homework.resend',
    'schoolcast.homework.delivery.view',
    'schoolcast.outbox.view',
    'schoolcast.outbox.view_payload_metadata',
    'schoolcast.outbox.cancel',
    'schoolcast.outbox.process_manual',
    'schoolcast.outbox.retry',
    'schoolcast.outbox.admin_reconcile',
    'schoolcast.delivery.view',
    'schoolcast.delivery.resend',
    'schoolcast.history.view',
    'schoolcast.history.export',
    'schoolcast.analytics.view',
    'schoolcast.analytics.export',
    'schoolcast.automation.view',
    'schoolcast.automation.manage',
    'schoolcast.settings.view',
    'schoolcast.settings.manage',
    'schoolcast.feature.manage',
    'schoolcast.test.run',
    'schoolcast.audit.view',
    'schoolcast.audit.export'
  ]::text[]) AS permission_codes(code)
) AS permission_rows
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- Principals and legacy school-governance aliases receive operational
-- SchoolCast permissions only. Provider-secret and feature-management
-- permissions are intentionally excluded. Platform ADMINISTRATOR is separate.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
    'schoolcast.dashboard.view',
    'schoolcast.communication.view',
    'schoolcast.communication.create',
    'schoolcast.communication.edit',
    'schoolcast.communication.submit',
    'schoolcast.communication.review',
    'schoolcast.communication.approve',
    'schoolcast.communication.reject',
    'schoolcast.communication.publish',
    'schoolcast.communication.schedule',
    'schoolcast.communication.cancel',
    'schoolcast.communication.archive',
    'schoolcast.communication.duplicate',
    'schoolcast.audience.create',
    'schoolcast.audience.preview',
    'schoolcast.audience.resolve',
    'schoolcast.audience.use_individual',
    'schoolcast.audience.use_custom_list',
    'schoolcast.recipient.view_masked_contact',
    'schoolcast.recipient.view_detail',
    'schoolcast.emergency.create',
    'schoolcast.emergency.preview',
    'schoolcast.emergency.publish',
    'schoolcast.emergency.cancel_pending',
    'schoolcast.emergency.delivery.view',
    'schoolcast.template.view',
    'schoolcast.template.create',
    'schoolcast.template.update',
    'schoolcast.template.activate',
    'schoolcast.template.deactivate',
    'schoolcast.template.provider_map',
    'schoolcast.channel.select',
    'schoolcast.channel.override_defaults',
    'schoolcast.provider.view',
    'schoolcast.provider.test',
    'schoolcast.provider.health.view',
    'schoolcast.approval.view',
    'schoolcast.approval.action',
    'schoolcast.attachment.upload',
    'schoolcast.attachment.view',
    'schoolcast.attachment.delete',
    'schoolcast.preference.view_own',
    'schoolcast.preference.update_own',
    'schoolcast.preference.manage',
    'schoolcast.consent.view_own',
    'schoolcast.consent.manage_own',
    'schoolcast.consent.manage',
    'schoolcast.inbox.view',
    'schoolcast.inbox.read',
    'schoolcast.inbox.acknowledge',
    'schoolcast.homework.view',
    'schoolcast.homework.create',
    'schoolcast.homework.edit',
    'schoolcast.homework.submit',
    'schoolcast.homework.approve',
    'schoolcast.homework.publish',
    'schoolcast.homework.cancel',
    'schoolcast.homework.resend',
    'schoolcast.homework.delivery.view',
    'schoolcast.outbox.view',
    'schoolcast.outbox.view_payload_metadata',
    'schoolcast.outbox.cancel',
    'schoolcast.outbox.process_manual',
    'schoolcast.outbox.retry',
    'schoolcast.outbox.admin_reconcile',
    'schoolcast.delivery.view',
    'schoolcast.delivery.resend',
    'schoolcast.history.view',
    'schoolcast.history.export',
    'schoolcast.analytics.view',
    'schoolcast.analytics.export',
    'schoolcast.automation.view',
    'schoolcast.automation.manage',
    'schoolcast.settings.view',
    'schoolcast.settings.manage',
    'schoolcast.test.run',
    'schoolcast.audit.view',
    'schoolcast.audit.export'
)
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- Teachers receive assigned-class communication and homework capabilities.
-- Service-layer assignment and scope checks remain mandatory.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
    'schoolcast.dashboard.view',
    'schoolcast.communication.view',
    'schoolcast.inbox.view',
    'schoolcast.inbox.read',
    'schoolcast.inbox.acknowledge',
    'schoolcast.preference.view_own',
    'schoolcast.preference.update_own',
    'schoolcast.consent.view_own',
    'schoolcast.consent.manage_own',
    'schoolcast.homework.view',
    'schoolcast.homework.create',
    'schoolcast.homework.edit',
    'schoolcast.homework.submit',
    'schoolcast.homework.publish',
    'schoolcast.homework.cancel',
    'schoolcast.homework.resend',
    'schoolcast.homework.delivery.view',
    'schoolcast.attachment.upload',
    'schoolcast.attachment.view',
    'schoolcast.attachment.delete'
)
WHERE role."code" IN ('TEACHER', 'CLASS_TEACHER')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- Office Staff and Staff receive only their own inbox, preference and consent
-- capabilities. Neither role receives publishing or provider access.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
    'schoolcast.inbox.view',
    'schoolcast.inbox.read',
    'schoolcast.inbox.acknowledge',
    'schoolcast.preference.view_own',
    'schoolcast.preference.update_own',
    'schoolcast.consent.view_own',
    'schoolcast.consent.manage_own'
)
WHERE role."code" IN ('OFFICE_STAFF', 'STAFF')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
