-- Add the provider-independent institution subscription and entitlement foundation.
-- Existing business data and legacy GradeBook flags remain intact for rollback compatibility.

CREATE TYPE "SubscriptionLifecycleStatus" AS ENUM (
  'TRIAL',
  'ACTIVE',
  'GRACE_PERIOD',
  'SUSPENDED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "InstitutionEntitlementAccess" AS ENUM (
  'DISABLED',
  'READ_ONLY',
  'FULL'
);

CREATE TYPE "InstitutionEntitlementSource" AS ENUM (
  'PLAN',
  'ADD_ON',
  'TRIAL',
  'MANUAL',
  'SYSTEM'
);

CREATE TABLE "tenant_subscriptions" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "planCode" TEXT NOT NULL DEFAULT 'TRIAL',
  "status" "SubscriptionLifecycleStatus" NOT NULL DEFAULT 'TRIAL',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trialEndsAt" TIMESTAMP(3),
  "currentPeriodStartsAt" TIMESTAMP(3),
  "currentPeriodEndsAt" TIMESTAMP(3),
  "graceEndsAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "billingProvider" TEXT,
  "externalCustomerRef" TEXT,
  "externalSubscriptionRef" TEXT,
  "limitsJson" JSONB,
  "addOnsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "tenant_subscriptions_plan_code_check" CHECK ("planCode" ~ '^[A-Z][A-Z0-9_-]{1,49}$'),
  CONSTRAINT "tenant_subscriptions_trial_range_check" CHECK ("trialEndsAt" IS NULL OR "trialEndsAt" >= "startsAt"),
  CONSTRAINT "tenant_subscriptions_period_range_check" CHECK (
    "currentPeriodStartsAt" IS NULL OR
    "currentPeriodEndsAt" IS NULL OR
    "currentPeriodEndsAt" >= "currentPeriodStartsAt"
  )
);

CREATE TABLE "institution_entitlements" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "featureKey" TEXT NOT NULL,
  "access" "InstitutionEntitlementAccess" NOT NULL DEFAULT 'DISABLED',
  "source" "InstitutionEntitlementSource" NOT NULL DEFAULT 'MANUAL',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "limitsJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_entitlements_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_entitlements_module_key_check" CHECK ("moduleKey" ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT "institution_entitlements_feature_key_check" CHECK ("featureKey" ~ '^[a-z][a-z0-9_]{1,63}$'),
  CONSTRAINT "institution_entitlements_date_range_check" CHECK (
    "startsAt" IS NULL OR "endsAt" IS NULL OR "endsAt" >= "startsAt"
  )
);

CREATE UNIQUE INDEX "tenant_subscriptions_tenantId_key"
ON "tenant_subscriptions"("tenantId");

CREATE INDEX "tenant_subscriptions_status_currentPeriodEndsAt_idx"
ON "tenant_subscriptions"("status", "currentPeriodEndsAt");

CREATE UNIQUE INDEX "institution_entitlements_tenant_institution_module_feature_key"
ON "institution_entitlements"("tenantId", "institutionId", "moduleKey", "featureKey");

CREATE INDEX "institution_entitlements_tenant_module_access_idx"
ON "institution_entitlements"("tenantId", "moduleKey", "access");

CREATE INDEX "institution_entitlements_institution_module_access_idx"
ON "institution_entitlements"("institutionId", "moduleKey", "access");

CREATE INDEX "institution_entitlements_endsAt_idx"
ON "institution_entitlements"("endsAt");

CREATE UNIQUE INDEX "institutions_tenant_id_id_entitlement_scope_key"
ON "institutions"("tenantId", "id");

ALTER TABLE "tenant_subscriptions"
ADD CONSTRAINT "tenant_subscriptions_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_entitlements"
ADD CONSTRAINT "institution_entitlements_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_entitlements"
ADD CONSTRAINT "institution_entitlements_tenant_institution_fkey"
FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "tenant_subscriptions" (
  "id",
  "tenantId",
  "planCode",
  "status",
  "startsAt",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  tenant."id",
  tenant."plan"::text,
  CASE
    WHEN tenant."plan"::text = 'TRIAL' THEN 'TRIAL'::"SubscriptionLifecycleStatus"
    ELSE 'ACTIVE'::"SubscriptionLifecycleStatus"
  END,
  tenant."createdAt",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "tenants" AS tenant
ON CONFLICT ("tenantId") DO NOTHING;

WITH attendance_features("featureKey") AS (
  VALUES
    ('module'),
    ('student_attendance'),
    ('staff_attendance'),
    ('marking'),
    ('correction'),
    ('qr'),
    ('reports'),
    ('exception_management'),
    ('calendar_leave_integration'),
    ('settings'),
    ('approval_audit')
)
INSERT INTO "institution_entitlements" (
  "id",
  "tenantId",
  "institutionId",
  "moduleKey",
  "featureKey",
  "access",
  "source",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  institution."tenantId",
  institution."id",
  'attendance',
  feature."featureKey",
  'FULL'::"InstitutionEntitlementAccess",
  'SYSTEM'::"InstitutionEntitlementSource",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "institutions" AS institution
CROSS JOIN attendance_features AS feature
ON CONFLICT ("tenantId", "institutionId", "moduleKey", "featureKey") DO NOTHING;

WITH gradebook_features("featureKey", "legacyColumn") AS (
  VALUES
    ('module', 'gradebookEnabled'),
    ('configuration', 'gradebookConfigurationEnabled'),
    ('marks_entry', 'gradebookMarksEntryEnabled'),
    ('import', 'gradebookImportEnabled'),
    ('result_calculation', 'gradebookResultCalculationEnabled'),
    ('co_scholastic', 'gradebookCoScholasticEnabled'),
    ('report_cards', 'gradebookReportCardsEnabled'),
    ('publication', 'gradebookPublicationEnabled'),
    ('analytics', 'gradebookAnalyticsEnabled'),
    ('portal_results', 'gradebookPortalResultsEnabled')
)
INSERT INTO "institution_entitlements" (
  "id",
  "tenantId",
  "institutionId",
  "moduleKey",
  "featureKey",
  "access",
  "source",
  "createdAt",
  "updatedAt"
)
SELECT
  gen_random_uuid(),
  institution."tenantId",
  institution."id",
  'gradebook',
  feature."featureKey",
  CASE
    WHEN settings."gradebookEnabled" IS NOT TRUE THEN 'DISABLED'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookEnabled' AND settings."gradebookEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookConfigurationEnabled' AND settings."gradebookConfigurationEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookMarksEntryEnabled' AND settings."gradebookMarksEntryEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookImportEnabled' AND settings."gradebookImportEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookResultCalculationEnabled' AND settings."gradebookResultCalculationEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookCoScholasticEnabled' AND settings."gradebookCoScholasticEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookReportCardsEnabled' AND settings."gradebookReportCardsEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookPublicationEnabled' AND settings."gradebookPublicationEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookAnalyticsEnabled' AND settings."gradebookAnalyticsEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    WHEN feature."legacyColumn" = 'gradebookPortalResultsEnabled' AND settings."gradebookPortalResultsEnabled" IS TRUE THEN 'FULL'::"InstitutionEntitlementAccess"
    ELSE 'DISABLED'::"InstitutionEntitlementAccess"
  END,
  'SYSTEM'::"InstitutionEntitlementSource",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "institutions" AS institution
LEFT JOIN "tenant_settings" AS settings ON settings."tenantId" = institution."tenantId"
CROSS JOIN gradebook_features AS feature
ON CONFLICT ("tenantId", "institutionId", "moduleKey", "featureKey") DO NOTHING;

-- These tables are accessed only through authenticated server-side Prisma paths.
ALTER TABLE "tenant_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_entitlements" ENABLE ROW LEVEL SECURITY;
