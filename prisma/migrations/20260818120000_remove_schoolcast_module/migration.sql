-- Retire the SchoolCast module through a forward-only migration.
-- This migration intentionally removes module data. Apply it only after the
-- approved database and private-object-storage backups have been verified.

-- Remove tenant role grants and the module permission catalogue first.
DELETE FROM "role_permissions"
WHERE "permissionId" IN (
  SELECT "id"
  FROM "permissions"
  WHERE "code" LIKE 'schoolcast.%' OR "module" = 'SCHOOLCAST'::"PermissionModule"
);

DELETE FROM "permissions"
WHERE "code" LIKE 'schoolcast.%' OR "module" = 'SCHOOLCAST'::"PermissionModule";

-- Remove module-owned records from shared notification tables while preserving
-- attendance WhatsApp records and staff-leave in-application notifications.
DELETE FROM "in_app_notifications"
WHERE "communicationId" IS NOT NULL
   OR "communicationVersionId" IS NOT NULL
   OR "recipientSnapshotId" IS NOT NULL;

DELETE FROM "notification_outbox"
WHERE "schoolCastCommunicationId" IS NOT NULL
   OR "communicationVersionId" IS NOT NULL
   OR "recipientSnapshotId" IS NOT NULL
   OR "channelPlanId" IS NOT NULL
   OR "providerConfigId" IS NOT NULL
   OR "templateVersionId" IS NOT NULL
   OR "channel" IN ('IN_APP'::"NotificationChannel", 'EMAIL'::"NotificationChannel")
   OR "recipientType" IN ('USER'::"NotificationRecipientType", 'STUDENT'::"NotificationRecipientType");

DELETE FROM "notification_delivery_logs"
WHERE "status" IN ('SUBMITTED'::"NotificationDeliveryStatus", 'BOUNCED'::"NotificationDeliveryStatus");

DELETE FROM "notification_templates"
WHERE "channel" IN ('IN_APP'::"NotificationChannel", 'EMAIL'::"NotificationChannel");

DELETE FROM "communication_preferences"
WHERE "ownerType" = 'USER'::"CommunicationPreferenceOwnerType";

-- Drop all module-owned tables together so cyclic version/current-version
-- foreign keys are removed safely. Shared notification tables are not dropped.
DROP TABLE
  "schoolcast_delivery_events",
  "schoolcast_delivery_attempts",
  "schoolcast_acknowledgements",
  "schoolcast_attachments",
  "schoolcast_recipient_channel_eligibility",
  "schoolcast_approval_actions",
  "schoolcast_approvals",
  "schoolcast_channel_plans",
  "schoolcast_consent_records",
  "schoolcast_recipient_snapshots",
  "schoolcast_audience_rules",
  "schoolcast_homework_versions",
  "schoolcast_homework_items",
  "schoolcast_template_versions",
  "schoolcast_provider_configurations",
  "schoolcast_communication_versions",
  "schoolcast_communications",
  "schoolcast_domain_events"
CASCADE;

-- Remove feature flags and portal links introduced only for SchoolCast.
ALTER TABLE "tenant_settings"
  DROP COLUMN "schoolCastAnalyticsEnabled",
  DROP COLUMN "schoolCastApprovalsEnabled",
  DROP COLUMN "schoolCastAutomationEnabled",
  DROP COLUMN "schoolCastDeliveryMode",
  DROP COLUMN "schoolCastEmailEnabled",
  DROP COLUMN "schoolCastEnabled",
  DROP COLUMN "schoolCastHomeworkEnabled",
  DROP COLUMN "schoolCastInAppEnabled",
  DROP COLUMN "schoolCastNoticesEnabled",
  DROP COLUMN "schoolCastTeacherDirectPublish",
  DROP COLUMN "schoolCastWhatsAppEnabled";

ALTER TABLE "students" DROP COLUMN "userId";
ALTER TABLE "guardians" DROP COLUMN "userId";

ALTER TABLE "in_app_notifications"
  DROP COLUMN "acknowledgementRequired",
  DROP COLUMN "communicationId",
  DROP COLUMN "communicationVersionId",
  DROP COLUMN "expiresAt",
  DROP COLUMN "priority",
  DROP COLUMN "recipientSnapshotId";

ALTER TABLE "communication_preferences"
  DROP COLUMN "calendarRemindersEnabled",
  DROP COLUMN "emailAddress",
  DROP COLUMN "emailEnabled",
  DROP COLUMN "feeUpdatesEnabled",
  DROP COLUMN "generalNoticesEnabled",
  DROP COLUMN "gradebookUpdatesEnabled",
  DROP COLUMN "homeworkUpdatesEnabled",
  DROP COLUMN "inAppEnabled";

ALTER TABLE "notification_outbox"
  DROP COLUMN "attemptCount",
  DROP COLUMN "availableAt",
  DROP COLUMN "channelPlanId",
  DROP COLUMN "communicationVersionId",
  DROP COLUMN "expiresAt",
  DROP COLUMN "lastAttemptAt",
  DROP COLUMN "leaseUntil",
  DROP COLUMN "lockOwner",
  DROP COLUMN "lockedAt",
  DROP COLUMN "maxAttempts",
  DROP COLUMN "mode",
  DROP COLUMN "payloadHash",
  DROP COLUMN "priority",
  DROP COLUMN "providerConfigId",
  DROP COLUMN "recipientAddressEncrypted",
  DROP COLUMN "recipientSnapshotId",
  DROP COLUMN "schoolCastCommunicationId",
  DROP COLUMN "templateVersionId";

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "notification_outbox" WHERE "recipientPhone" IS NULL) THEN
    RAISE EXCEPTION 'Cannot restore notification_outbox.recipientPhone NOT NULL: retained shared rows contain NULL';
  END IF;
END
$$;

ALTER TABLE "notification_outbox" ALTER COLUMN "recipientPhone" SET NOT NULL;

-- PostgreSQL cannot remove enum values in place. Recreate only the shared enums
-- expanded by SchoolCast after all rows using module-only values are gone.
ALTER TYPE "PermissionModule" RENAME TO "PermissionModule_schoolcast_retired";
CREATE TYPE "PermissionModule" AS ENUM (
  'CAMPUS_CORE', 'ACADEMIA', 'GRADEBOOK', 'FEEDESK', 'STAFFBOARD',
  'NOTIFICATIONS', 'INSIGHTBOARD', 'CAMPUSFLEET', 'BOOKNEST', 'ASSETROOM', 'SYSTEM'
);
ALTER TABLE "permissions"
  ALTER COLUMN "module" TYPE "PermissionModule"
  USING ("module"::text::"PermissionModule");
DROP TYPE "PermissionModule_schoolcast_retired";

ALTER TYPE "CommunicationPreferenceOwnerType" RENAME TO "CommunicationPreferenceOwnerType_schoolcast_retired";
CREATE TYPE "CommunicationPreferenceOwnerType" AS ENUM ('GUARDIAN', 'STAFF');
ALTER TABLE "communication_preferences"
  ALTER COLUMN "ownerType" TYPE "CommunicationPreferenceOwnerType"
  USING ("ownerType"::text::"CommunicationPreferenceOwnerType");
DROP TYPE "CommunicationPreferenceOwnerType_schoolcast_retired";

ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_schoolcast_retired";
CREATE TYPE "NotificationChannel" AS ENUM ('WHATSAPP');
ALTER TABLE "notification_templates"
  ALTER COLUMN "channel" TYPE "NotificationChannel"
  USING ("channel"::text::"NotificationChannel");
ALTER TABLE "notification_outbox"
  ALTER COLUMN "channel" TYPE "NotificationChannel"
  USING ("channel"::text::"NotificationChannel");
DROP TYPE "NotificationChannel_schoolcast_retired";

ALTER TYPE "NotificationRecipientType" RENAME TO "NotificationRecipientType_schoolcast_retired";
CREATE TYPE "NotificationRecipientType" AS ENUM ('GUARDIAN', 'STAFF');
ALTER TABLE "notification_outbox"
  ALTER COLUMN "recipientType" TYPE "NotificationRecipientType"
  USING ("recipientType"::text::"NotificationRecipientType");
DROP TYPE "NotificationRecipientType_schoolcast_retired";

ALTER TABLE "notification_outbox" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "NotificationOutboxStatus" RENAME TO "NotificationOutboxStatus_schoolcast_retired";
CREATE TYPE "NotificationOutboxStatus" AS ENUM ('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');
ALTER TABLE "notification_outbox"
  ALTER COLUMN "status" TYPE "NotificationOutboxStatus"
  USING ("status"::text::"NotificationOutboxStatus");
ALTER TABLE "notification_outbox" ALTER COLUMN "status" SET DEFAULT 'QUEUED'::"NotificationOutboxStatus";
DROP TYPE "NotificationOutboxStatus_schoolcast_retired";

ALTER TYPE "NotificationDeliveryStatus" RENAME TO "NotificationDeliveryStatus_schoolcast_retired";
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('SENT', 'DELIVERED', 'READ', 'FAILED');
ALTER TABLE "notification_delivery_logs"
  ALTER COLUMN "status" TYPE "NotificationDeliveryStatus"
  USING ("status"::text::"NotificationDeliveryStatus");
DROP TYPE "NotificationDeliveryStatus_schoolcast_retired";

-- Drop module-owned enum types after all dependent columns and tables are gone.
DROP TYPE "SchoolCastCommunicationType";
DROP TYPE "SchoolCastCommunicationStatus";
DROP TYPE "SchoolCastPriority";
DROP TYPE "SchoolCastAudienceRuleType";
DROP TYPE "SchoolCastAudienceMode";
DROP TYPE "SchoolCastRecipientType";
DROP TYPE "SchoolCastChannelPlanStatus";
DROP TYPE "SchoolCastApprovalStatus";
DROP TYPE "SchoolCastApprovalActionType";
DROP TYPE "SchoolCastProviderStatus";
DROP TYPE "SchoolCastDeliveryMode";
DROP TYPE "SchoolCastConsentStatus";
DROP TYPE "SchoolCastAttachmentScanStatus";
DROP TYPE "SchoolCastHomeworkStatus";
DROP TYPE "SchoolCastWorkType";
DROP TYPE "SchoolCastDeliveryAttemptStatus";
DROP TYPE "SchoolCastDeliveryEventStatus";
DROP TYPE "SchoolCastDomainEventStatus";
