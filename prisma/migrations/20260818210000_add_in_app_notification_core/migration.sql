-- Add the provider-independent JinaCampus in-app notification core.
-- The legacy in_app_notifications columns remain mapped for rollback safety.

-- Repair the additive institution role scope expected by the current Prisma schema.
-- IF NOT EXISTS keeps this safe where an environment was repaired independently.
ALTER TYPE "RoleScope" ADD VALUE IF NOT EXISTS 'INSTITUTION' BEFORE 'BRANCH';
ALTER TYPE "RoleAssignmentScope" ADD VALUE IF NOT EXISTS 'INSTITUTION' BEFORE 'BRANCH';

-- CreateEnum
CREATE TYPE "InAppNotificationSourceModule" AS ENUM ('CAMPUS_CORE', 'ACADEMIA', 'ATTENDANCE', 'GRADEBOOK', 'STAFFBOARD', 'CALENDAR', 'SYSTEM');
CREATE TYPE "InAppNotificationCategory" AS ENUM ('ACCOUNT', 'ACADEMIC', 'ATTENDANCE', 'GRADEBOOK', 'LEAVE', 'CALENDAR', 'SECURITY', 'SYSTEM');
CREATE TYPE "InAppNotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');
CREATE TYPE "InAppNotificationStatus" AS ENUM ('PENDING', 'SCHEDULED', 'PUBLISHED', 'CANCELLED', 'EXPIRED', 'FAILED');
CREATE TYPE "InAppNotificationRecipientStatus" AS ENUM ('PENDING', 'DELIVERED_IN_APP', 'FAILED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "InAppNotificationAudienceType" AS ENUM ('USER', 'USERS', 'ROLE', 'TENANT', 'INSTITUTION', 'BRANCH');
CREATE TYPE "InAppNotificationTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "InAppNotificationDigestMode" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY');
CREATE TYPE "InAppNotificationOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- Add fail-safe feature controls. Realtime and browser push remain off.
ALTER TABLE "tenant_settings"
  ADD COLUMN "inAppNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppNotificationSchedulingEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppNotificationAcknowledgementsEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "inAppNotificationRealtimeEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "inAppNotificationBrowserPushEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Expand the existing notification content table without deleting legacy data.
ALTER TABLE "in_app_notifications" DROP CONSTRAINT "in_app_notifications_userId_fkey";
ALTER TABLE "in_app_notifications"
  ALTER COLUMN "userId" DROP NOT NULL,
  ALTER COLUMN "type" DROP NOT NULL,
  ADD COLUMN "institutionId" UUID,
  ADD COLUMN "academicYearId" UUID,
  ADD COLUMN "sourceModule" "InAppNotificationSourceModule" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "eventType" TEXT,
  ADD COLUMN "sourceEntityType" TEXT,
  ADD COLUMN "sourceEntityId" TEXT,
  ADD COLUMN "category" "InAppNotificationCategory" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "priority" "InAppNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN "iconKey" TEXT,
  ADD COLUMN "mandatory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scheduledAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "expiresAt" TIMESTAMP(3),
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "status" "InAppNotificationStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "templateId" UUID,
  ADD COLUMN "variablesJson" JSONB,
  ADD COLUMN "safeMetadataJson" JSONB,
  ADD COLUMN "createdById" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "in_app_notification_recipients" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "deliveryStatus" "InAppNotificationRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "deliveredAt" TIMESTAMP(3),
  "readAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "failureCode" TEXT,
  "failureReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "in_app_notification_recipients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notification_audience_rules" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "notificationId" UUID NOT NULL,
  "audienceType" "InAppNotificationAudienceType" NOT NULL,
  "institutionId" UUID,
  "branchId" UUID,
  "academicYearId" UUID,
  "roleId" UUID,
  "userId" UUID,
  "criteriaJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "in_app_notification_audience_rules_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notification_templates" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID,
  "scopeKey" TEXT NOT NULL DEFAULT 'TENANT',
  "templateKey" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceModule" "InAppNotificationSourceModule" NOT NULL,
  "category" "InAppNotificationCategory" NOT NULL,
  "defaultPriority" "InAppNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "titleTemplate" TEXT NOT NULL,
  "bodyTemplate" TEXT NOT NULL,
  "deepLinkTemplate" TEXT,
  "requiredVariablesJson" JSONB,
  "mandatory" BOOLEAN NOT NULL DEFAULT false,
  "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT false,
  "status" "InAppNotificationTemplateStatus" NOT NULL DEFAULT 'ACTIVE',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "in_app_notification_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "in_app_notification_templates_version_check" CHECK ("version" > 0)
);

CREATE TABLE "in_app_notification_preferences" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "category" "InAppNotificationCategory" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "minimumPriority" "InAppNotificationPriority",
  "quietHoursEnabled" BOOLEAN NOT NULL DEFAULT false,
  "quietStart" TEXT,
  "quietEnd" TEXT,
  "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "digestMode" "InAppNotificationDigestMode" NOT NULL DEFAULT 'IMMEDIATE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "in_app_notification_preferences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "in_app_notification_settings" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID,
  "branchId" UUID,
  "scopeKey" TEXT NOT NULL,
  "retentionDays" INTEGER NOT NULL DEFAULT 365,
  "defaultPriority" "InAppNotificationPriority" NOT NULL DEFAULT 'NORMAL',
  "quietHoursStart" TEXT,
  "quietHoursEnd" TEXT,
  "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  "mandatoryCategoriesJson" JSONB,
  "roleRulesJson" JSONB,
  "acknowledgementRulesJson" JSONB,
  "featureEnabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "in_app_notification_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "in_app_notification_settings_retention_check" CHECK ("retentionDays" BETWEEN 30 AND 3650)
);

CREATE TABLE "in_app_notification_outbox" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "eventId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "sourceModule" "InAppNotificationSourceModule" NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "InAppNotificationOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockToken" TEXT,
  "processedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "in_app_notification_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "in_app_notification_outbox_attempt_check" CHECK ("attemptCount" >= 0)
);

-- Backfill legacy Staff Leave notifications before enforcing new required fields.
UPDATE "in_app_notifications"
SET
  "sourceModule" = 'STAFFBOARD',
  "eventType" = COALESCE(NULLIF("type", ''), 'staff_leave.legacy'),
  "sourceEntityType" = 'StaffLeaveApplication',
  "category" = 'LEAVE',
  "priority" = 'NORMAL',
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("publishedAt", "createdAt"),
  "idempotencyKey" = 'legacy:' || "id"::text,
  "updatedAt" = COALESCE("updatedAt", "createdAt");

ALTER TABLE "in_app_notifications"
  ALTER COLUMN "eventType" SET NOT NULL,
  ALTER COLUMN "idempotencyKey" SET NOT NULL;

INSERT INTO "in_app_notification_recipients" (
  "id", "tenantId", "notificationId", "userId", "deliveryStatus",
  "deliveredAt", "readAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), "tenantId", "id", "userId", 'DELIVERED_IN_APP',
  "createdAt", "readAt", "createdAt", "createdAt"
FROM "in_app_notifications"
WHERE "userId" IS NOT NULL
ON CONFLICT DO NOTHING;

-- Replace the old recipient-specific index with normalized indexes.
DROP INDEX IF EXISTS "in_app_notifications_tenantId_userId_readAt_createdAt_idx";

CREATE UNIQUE INDEX "in_app_notifications_tenant_idempotency_key" ON "in_app_notifications"("tenantId", "idempotencyKey");
CREATE INDEX "in_app_notifications_tenant_source_category_created_idx" ON "in_app_notifications"("tenantId", "sourceModule", "category", "priority", "createdAt");
CREATE INDEX "in_app_notifications_status_scheduled_idx" ON "in_app_notifications"("status", "scheduledAt");
CREATE INDEX "in_app_notifications_expires_idx" ON "in_app_notifications"("expiresAt");
CREATE INDEX "in_app_notifications_institution_idx" ON "in_app_notifications"("institutionId");
CREATE INDEX "in_app_notifications_academic_year_idx" ON "in_app_notifications"("academicYearId");
CREATE INDEX "in_app_notifications_template_idx" ON "in_app_notifications"("templateId");
CREATE INDEX "in_app_notifications_created_by_idx" ON "in_app_notifications"("createdById");

CREATE UNIQUE INDEX "in_app_notification_recipients_notification_user_key" ON "in_app_notification_recipients"("notificationId", "userId");
CREATE INDEX "in_app_recipients_user_inbox_idx" ON "in_app_notification_recipients"("tenantId", "userId", "archivedAt", "readAt", "createdAt");
CREATE INDEX "in_app_recipients_user_ack_idx" ON "in_app_notification_recipients"("tenantId", "userId", "acknowledgedAt", "createdAt");
CREATE INDEX "in_app_recipients_delivery_idx" ON "in_app_notification_recipients"("tenantId", "deliveryStatus", "createdAt");

CREATE INDEX "in_app_audience_notification_idx" ON "in_app_notification_audience_rules"("tenantId", "notificationId");
CREATE INDEX "in_app_audience_type_branch_idx" ON "in_app_notification_audience_rules"("tenantId", "audienceType", "branchId");
CREATE INDEX "in_app_audience_role_idx" ON "in_app_notification_audience_rules"("tenantId", "roleId");
CREATE INDEX "in_app_audience_user_idx" ON "in_app_notification_audience_rules"("tenantId", "userId");

CREATE UNIQUE INDEX "in_app_templates_scope_key_version_key" ON "in_app_notification_templates"("tenantId", "scopeKey", "templateKey", "version");
CREATE INDEX "in_app_templates_source_category_idx" ON "in_app_notification_templates"("tenantId", "sourceModule", "category", "status");
CREATE INDEX "in_app_templates_institution_idx" ON "in_app_notification_templates"("institutionId");

CREATE UNIQUE INDEX "in_app_preferences_user_category_key" ON "in_app_notification_preferences"("tenantId", "userId", "category");
CREATE INDEX "in_app_preferences_user_enabled_idx" ON "in_app_notification_preferences"("tenantId", "userId", "enabled");

CREATE UNIQUE INDEX "in_app_settings_tenant_scope_key" ON "in_app_notification_settings"("tenantId", "scopeKey");
CREATE INDEX "in_app_settings_scope_idx" ON "in_app_notification_settings"("tenantId", "institutionId", "branchId");

CREATE UNIQUE INDEX "in_app_outbox_tenant_idempotency_key" ON "in_app_notification_outbox"("tenantId", "idempotencyKey");
CREATE INDEX "in_app_outbox_due_idx" ON "in_app_notification_outbox"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "in_app_outbox_tenant_status_idx" ON "in_app_notification_outbox"("tenantId", "status", "createdAt");

-- Foreign keys
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "in_app_notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_recipients" ADD CONSTRAINT "in_app_notification_recipients_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_recipients" ADD CONSTRAINT "in_app_notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "in_app_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_recipients" ADD CONSTRAINT "in_app_notification_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "in_app_notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_audience_rules" ADD CONSTRAINT "in_app_notification_audience_rules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_templates" ADD CONSTRAINT "in_app_notification_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_templates" ADD CONSTRAINT "in_app_notification_templates_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_templates" ADD CONSTRAINT "in_app_notification_templates_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_preferences" ADD CONSTRAINT "in_app_notification_preferences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_preferences" ADD CONSTRAINT "in_app_notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_settings" ADD CONSTRAINT "in_app_notification_settings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_settings" ADD CONSTRAINT "in_app_notification_settings_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "in_app_notification_settings" ADD CONSTRAINT "in_app_notification_settings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "in_app_notification_outbox" ADD CONSTRAINT "in_app_notification_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only Prisma access; no browser-direct policies are created.
ALTER TABLE "in_app_notification_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notification_audience_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notification_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notification_preferences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notification_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "in_app_notification_outbox" ENABLE ROW LEVEL SECURITY;

-- Permission catalogue for the independent in-app core.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'notifications.access', 'NOTIFICATIONS', 'Access the authenticated notification centre.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.view_own', 'NOTIFICATIONS', 'View notifications addressed to the authenticated user.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.mark_read', 'NOTIFICATIONS', 'Mark own notifications as read.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.mark_unread', 'NOTIFICATIONS', 'Mark own notifications as unread.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.archive_own', 'NOTIFICATIONS', 'Archive or dismiss own notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.acknowledge', 'NOTIFICATIONS', 'Acknowledge required notifications addressed to the authenticated user.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.preference.manage_own', 'NOTIFICATIONS', 'Manage optional notification preferences for the authenticated user.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.create', 'NOTIFICATIONS', 'Create institution-scoped in-app notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.publish', 'NOTIFICATIONS', 'Publish institution-scoped in-app notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.schedule', 'NOTIFICATIONS', 'Schedule institution-scoped in-app notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.cancel', 'NOTIFICATIONS', 'Cancel institution-scoped in-app notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.critical.publish', 'NOTIFICATIONS', 'Publish critical mandatory in-app notifications.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.template.view', 'NOTIFICATIONS', 'View in-app notification templates.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.template.manage', 'NOTIFICATIONS', 'Manage in-app notification templates.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.preference.manage_institution', 'NOTIFICATIONS', 'Manage institution notification preference policy.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.settings.view', 'NOTIFICATIONS', 'View institution notification settings.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.settings.manage', 'NOTIFICATIONS', 'Manage institution notification settings.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.report.view', 'NOTIFICATIONS', 'View tenant-safe notification delivery reports.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.admin.manage', 'NOTIFICATIONS', 'Manage notification lifecycle operations.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notifications.retry.manage', 'NOTIFICATIONS', 'Retry failed in-app notification outbox events.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET "isActive" = true, "updatedAt" = CURRENT_TIMESTAMP;

-- Principals and compatible school-governance aliases receive in-app governance.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" LIKE 'notifications.%'
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- School users receive only their own notification centre and preferences.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
  'notifications.access',
  'notifications.view_own',
  'notifications.mark_read',
  'notifications.mark_unread',
  'notifications.archive_own',
  'notifications.acknowledge',
  'notifications.preference.manage_own'
)
WHERE role."code" IN ('OFFICE_STAFF', 'TEACHER', 'CLASS_TEACHER', 'STAFF')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
