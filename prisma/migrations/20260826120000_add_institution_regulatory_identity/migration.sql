-- Add the institution legal identity, recognition, affiliation, and evidence
-- foundation without replacing existing school profile fields or records.

CREATE TYPE "EducationAuthorityType" AS ENUM (
  'NATIONAL_MINISTRY',
  'CENTRAL_BOARD',
  'STATE_DEPARTMENT',
  'STATE_BOARD',
  'OPEN_SCHOOLING_AUTHORITY',
  'EDUCATION_COUNCIL',
  'DISTRICT_AUTHORITY',
  'LOCAL_AUTHORITY',
  'OTHER'
);

CREATE TYPE "InstitutionIdentifierType" AS ENUM (
  'UDISE',
  'LEGACY_DISE',
  'STATE_SCHOOL_CODE',
  'BOARD_SCHOOL_CODE',
  'INSTITUTION_CODE',
  'OTHER'
);

CREATE TYPE "IdentifierAvailability" AS ENUM (
  'ASSIGNED',
  'PENDING_ASSIGNMENT',
  'NOT_APPLICABLE',
  'UNKNOWN'
);

CREATE TYPE "InstitutionAuthorizationType" AS ENUM (
  'RECOGNITION',
  'AFFILIATION',
  'ACCREDITATION',
  'REGISTRATION',
  'NO_OBJECTION_CERTIFICATE',
  'PRIOR_PERMISSION',
  'MINORITY_STATUS',
  'OTHER'
);

CREATE TYPE "RegulatoryRecordStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'ACTIVE',
  'EXPIRED',
  'SUSPENDED',
  'REVOKED',
  'REJECTED',
  'SUPERSEDED'
);

CREATE TYPE "RegulatoryVerificationStatus" AS ENUM (
  'UNVERIFIED',
  'SELF_DECLARED',
  'DOCUMENT_VERIFIED',
  'AUTHORITY_VERIFIED',
  'VERIFICATION_FAILED'
);

CREATE TYPE "RegulatoryDataClassification" AS ENUM (
  'PUBLIC',
  'PUBLIC_ELIGIBLE',
  'INTERNAL',
  'RESTRICTED'
);

CREATE TYPE "RegulatoryPublicationStatus" AS ENUM (
  'NOT_PUBLISHED',
  'PENDING_APPROVAL',
  'PUBLISHED',
  'WITHDRAWN'
);

CREATE TYPE "ManagingEntityType" AS ENUM (
  'GOVERNMENT',
  'LOCAL_AUTHORITY',
  'REGISTERED_SOCIETY',
  'PUBLIC_TRUST',
  'PRIVATE_TRUST',
  'SECTION_8_COMPANY',
  'OTHER'
);

CREATE TYPE "EducationStage" AS ENUM (
  'PRE_PRIMARY',
  'PRIMARY',
  'UPPER_PRIMARY',
  'SECONDARY',
  'SENIOR_SECONDARY',
  'VOCATIONAL',
  'OPEN_BASIC_EDUCATION',
  'OTHER'
);

CREATE TYPE "RegulatoryCompletenessStatus" AS ENUM (
  'NOT_STARTED',
  'INCOMPLETE',
  'PENDING_VERIFICATION',
  'COMPLETE',
  'ACTION_REQUIRED'
);

ALTER TABLE "institutions"
  ADD COLUMN "legalName" TEXT,
  ADD COLUMN "formerLegalNames" JSONB,
  ADD COLUMN "establishedYear" INTEGER,
  ADD COLUMN "schoolType" TEXT,
  ADD COLUMN "district" TEXT,
  ADD COLUMN "block" TEXT,
  ADD COLUMN "officialEmail" TEXT,
  ADD COLUMN "officialPhone" TEXT,
  ADD COLUMN "website" TEXT,
  ADD CONSTRAINT "institutions_established_year_check"
    CHECK ("establishedYear" IS NULL OR "establishedYear" BETWEEN 1800 AND 2200);

UPDATE "institutions"
SET "legalName" = "name"
WHERE "legalName" IS NULL;

CREATE UNIQUE INDEX "branches_tenant_institution_id_regulatory_scope_key"
  ON "branches"("tenantId", "institutionId", "id");

CREATE TABLE "education_authorities" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "shortName" TEXT,
  "type" "EducationAuthorityType" NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'IN',
  "stateCode" TEXT,
  "officialDomain" TEXT,
  "verificationUrlTemplate" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "education_authorities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "education_authorities_country_code_check" CHECK ("countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "education_authorities_code_check" CHECK ("code" ~ '^[A-Z0-9][A-Z0-9._-]{1,79}$')
);

CREATE TABLE "institution_regulatory_profiles" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID,
  "completenessStatus" "RegulatoryCompletenessStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "countryCode" TEXT NOT NULL DEFAULT 'IN',
  "stateCode" TEXT,
  "boardCode" TEXT,
  "declaredAt" TIMESTAMP(3),
  "declaredById" UUID,
  "reviewedAt" TIMESTAMP(3),
  "reviewedById" UUID,
  "reviewNotes" TEXT,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_regulatory_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_regulatory_profiles_country_code_check" CHECK ("countryCode" ~ '^[A-Z]{2}$')
);

CREATE TABLE "institution_managing_entities" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "legalName" TEXT NOT NULL,
  "type" "ManagingEntityType" NOT NULL,
  "registrationNumber" TEXT,
  "registrationAuthority" TEXT,
  "registrationStateCode" TEXT,
  "registrationDate" DATE,
  "registeredOfficeAddress" TEXT,
  "authorisedRepresentative" TEXT,
  "metadata" JSONB,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_managing_entities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "institution_managing_entity_assignments" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID,
  "managingEntityId" UUID NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" DATE,
  "validUntil" DATE,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_managing_entity_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_managing_assignments_validity_check"
    CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom")
);

CREATE TABLE "institution_identifiers" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID,
  "authorityId" UUID NOT NULL,
  "type" "InstitutionIdentifierType" NOT NULL,
  "availability" "IdentifierAvailability" NOT NULL DEFAULT 'ASSIGNED',
  "value" TEXT,
  "normalizedValue" TEXT,
  "status" "RegulatoryRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "verificationStatus" "RegulatoryVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "dataClassification" "RegulatoryDataClassification" NOT NULL DEFAULT 'INTERNAL',
  "publicationStatus" "RegulatoryPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "issuedAt" DATE,
  "validFrom" DATE,
  "validUntil" DATE,
  "supersedesId" UUID,
  "supersessionReason" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" UUID,
  "verificationSource" TEXT,
  "verificationNotes" TEXT,
  "metadata" JSONB,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_identifiers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_identifiers_assignment_value_check" CHECK (
    ("availability" = 'ASSIGNED' AND "value" IS NOT NULL AND length(btrim("value")) > 0 AND "normalizedValue" IS NOT NULL AND length("normalizedValue") > 0)
    OR
    ("availability" <> 'ASSIGNED' AND "value" IS NULL AND "normalizedValue" IS NULL)
  ),
  CONSTRAINT "institution_identifiers_udise_check" CHECK (
    "type" <> 'UDISE' OR "availability" <> 'ASSIGNED' OR "normalizedValue" ~ '^[0-9]{11}$'
  ),
  CONSTRAINT "institution_identifiers_validity_check"
    CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom"),
  CONSTRAINT "institution_identifiers_publication_check" CHECK (
    "publicationStatus" <> 'PUBLISHED'
    OR (
      "dataClassification" IN ('PUBLIC', 'PUBLIC_ELIGIBLE')
      AND "verificationStatus" IN ('DOCUMENT_VERIFIED', 'AUTHORITY_VERIFIED')
    )
  )
);

CREATE TABLE "institution_authorizations" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID,
  "authorityId" UUID NOT NULL,
  "type" "InstitutionAuthorizationType" NOT NULL,
  "authorizationNumber" TEXT,
  "normalizedNumber" TEXT,
  "applicationReference" TEXT,
  "categoryCode" TEXT,
  "status" "RegulatoryRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "verificationStatus" "RegulatoryVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
  "dataClassification" "RegulatoryDataClassification" NOT NULL DEFAULT 'INTERNAL',
  "publicationStatus" "RegulatoryPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
  "issuedAt" DATE,
  "validFrom" DATE,
  "validUntil" DATE,
  "supersedesId" UUID,
  "supersessionReason" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "verifiedById" UUID,
  "verificationSource" TEXT,
  "verificationNotes" TEXT,
  "metadata" JSONB,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_authorizations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_authorizations_number_pair_check" CHECK (
    ("authorizationNumber" IS NULL AND "normalizedNumber" IS NULL)
    OR ("authorizationNumber" IS NOT NULL AND length(btrim("authorizationNumber")) > 0 AND "normalizedNumber" IS NOT NULL AND length("normalizedNumber") > 0)
  ),
  CONSTRAINT "institution_authorizations_validity_check"
    CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" >= "validFrom"),
  CONSTRAINT "institution_authorizations_publication_check" CHECK (
    "publicationStatus" <> 'PUBLISHED'
    OR (
      "dataClassification" IN ('PUBLIC', 'PUBLIC_ELIGIBLE')
      AND "verificationStatus" IN ('DOCUMENT_VERIFIED', 'AUTHORITY_VERIFIED')
    )
  )
);

CREATE TABLE "institution_authorization_coverage" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "authorizationId" UUID NOT NULL,
  "stage" "EducationStage" NOT NULL,
  "gradeFrom" INTEGER,
  "gradeTo" INTEGER,
  "programmeCode" TEXT,
  "streamCode" TEXT,
  "mediumCode" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_authorization_coverage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_authorization_coverage_grade_check" CHECK (
    ("gradeFrom" IS NULL OR "gradeFrom" BETWEEN -2 AND 12)
    AND ("gradeTo" IS NULL OR "gradeTo" BETWEEN -2 AND 12)
    AND ("gradeFrom" IS NULL OR "gradeTo" IS NULL OR "gradeTo" >= "gradeFrom")
  )
);

CREATE TABLE "institution_regulatory_documents" (
  "id" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionId" UUID NOT NULL,
  "branchId" UUID,
  "identifierId" UUID,
  "authorizationId" UUID,
  "documentTypeCode" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "documentNumber" TEXT,
  "storageBucket" TEXT NOT NULL,
  "privateObjectKey" TEXT NOT NULL,
  "publicRedactedObjectKey" TEXT,
  "checksumSha256" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "dataClassification" "RegulatoryDataClassification" NOT NULL DEFAULT 'RESTRICTED',
  "publicationStatus" "RegulatoryPublicationStatus" NOT NULL DEFAULT 'NOT_PUBLISHED',
  "issuedAt" DATE,
  "expiresAt" DATE,
  "publishedAt" TIMESTAMP(3),
  "publishedById" UUID,
  "withdrawnAt" TIMESTAMP(3),
  "withdrawnById" UUID,
  "uploadedById" UUID,
  "deletedAt" TIMESTAMP(3),
  "deletedById" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "institution_regulatory_documents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "institution_regulatory_documents_size_check" CHECK ("sizeBytes" > 0),
  CONSTRAINT "institution_regulatory_documents_link_check" CHECK (num_nonnulls("identifierId", "authorizationId") <= 1),
  CONSTRAINT "institution_regulatory_documents_validity_check"
    CHECK ("expiresAt" IS NULL OR "issuedAt" IS NULL OR "expiresAt" >= "issuedAt"),
  CONSTRAINT "institution_regulatory_documents_publication_check" CHECK (
    "publicationStatus" <> 'PUBLISHED'
    OR (
      "dataClassification" IN ('PUBLIC', 'PUBLIC_ELIGIBLE')
      AND "publicRedactedObjectKey" IS NOT NULL
    )
  )
);

CREATE TABLE "authority_requirement_profiles" (
  "id" UUID NOT NULL,
  "authorityId" UUID,
  "profileCode" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "countryCode" TEXT NOT NULL DEFAULT 'IN',
  "stateCode" TEXT,
  "boardCode" TEXT,
  "effectiveFrom" DATE NOT NULL,
  "effectiveUntil" DATE,
  "rules" JSONB NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "authority_requirement_profiles_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "authority_requirement_profiles_version_check" CHECK ("version" > 0),
  CONSTRAINT "authority_requirement_profiles_date_check"
    CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" >= "effectiveFrom")
);

CREATE TABLE "official_identifier_claims" (
  "id" UUID NOT NULL,
  "claimFingerprint" TEXT NOT NULL,
  "tenantId" UUID NOT NULL,
  "institutionIdentifierId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_identifier_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "official_identifier_claims_fingerprint_check" CHECK ("claimFingerprint" ~ '^[a-f0-9]{64}$')
);

CREATE UNIQUE INDEX "education_authorities_code_key" ON "education_authorities"("code");
CREATE INDEX "education_authorities_type_state_active_idx" ON "education_authorities"("type", "stateCode", "isActive");

CREATE UNIQUE INDEX "institution_regulatory_profiles_institution_scope_key"
  ON "institution_regulatory_profiles"("tenantId", "institutionId") WHERE "branchId" IS NULL;
CREATE UNIQUE INDEX "institution_regulatory_profiles_branch_scope_key"
  ON "institution_regulatory_profiles"("tenantId", "institutionId", "branchId") WHERE "branchId" IS NOT NULL;
CREATE INDEX "institution_regulatory_profiles_scope_idx" ON "institution_regulatory_profiles"("tenantId", "institutionId", "branchId");
CREATE INDEX "institution_regulatory_profiles_completeness_idx" ON "institution_regulatory_profiles"("tenantId", "completenessStatus");

CREATE UNIQUE INDEX "institution_managing_entities_tenant_registration_key" ON "institution_managing_entities"("tenantId", "registrationNumber");
CREATE UNIQUE INDEX "institution_managing_entities_tenant_id_key" ON "institution_managing_entities"("tenantId", "id");
CREATE INDEX "institution_managing_entities_name_idx" ON "institution_managing_entities"("tenantId", "legalName");
CREATE INDEX "institution_managing_entities_type_idx" ON "institution_managing_entities"("tenantId", "type");

CREATE UNIQUE INDEX "institution_managing_assignments_institution_primary_key"
  ON "institution_managing_entity_assignments"("tenantId", "institutionId")
  WHERE "branchId" IS NULL AND "isPrimary" = true AND "validUntil" IS NULL;
CREATE UNIQUE INDEX "institution_managing_assignments_branch_primary_key"
  ON "institution_managing_entity_assignments"("tenantId", "institutionId", "branchId")
  WHERE "branchId" IS NOT NULL AND "isPrimary" = true AND "validUntil" IS NULL;
CREATE INDEX "institution_managing_assignments_scope_idx" ON "institution_managing_entity_assignments"("tenantId", "institutionId", "branchId", "isPrimary");
CREATE INDEX "institution_managing_assignments_entity_idx" ON "institution_managing_entity_assignments"("tenantId", "managingEntityId");

CREATE UNIQUE INDEX "institution_identifiers_tenant_id_key" ON "institution_identifiers"("tenantId", "id");
CREATE UNIQUE INDEX "institution_identifiers_institution_primary_key"
  ON "institution_identifiers"("tenantId", "institutionId", "authorityId", "type")
  WHERE "branchId" IS NULL AND "isPrimary" = true AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "institution_identifiers_branch_primary_key"
  ON "institution_identifiers"("tenantId", "institutionId", "branchId", "authorityId", "type")
  WHERE "branchId" IS NOT NULL AND "isPrimary" = true AND "status" = 'ACTIVE';
CREATE INDEX "institution_identifiers_scope_idx" ON "institution_identifiers"("tenantId", "institutionId", "branchId");
CREATE INDEX "institution_identifiers_type_status_idx" ON "institution_identifiers"("tenantId", "institutionId", "type", "status");
CREATE INDEX "institution_identifiers_authority_value_idx" ON "institution_identifiers"("authorityId", "type", "normalizedValue");
CREATE INDEX "institution_identifiers_verification_idx" ON "institution_identifiers"("tenantId", "verificationStatus");

CREATE UNIQUE INDEX "institution_authorizations_tenant_id_key" ON "institution_authorizations"("tenantId", "id");
CREATE INDEX "institution_authorizations_scope_idx" ON "institution_authorizations"("tenantId", "institutionId", "branchId");
CREATE INDEX "institution_authorizations_type_status_idx" ON "institution_authorizations"("tenantId", "institutionId", "type", "status");
CREATE INDEX "institution_authorizations_authority_number_idx" ON "institution_authorizations"("authorityId", "type", "normalizedNumber");
CREATE INDEX "institution_authorizations_expiry_idx" ON "institution_authorizations"("tenantId", "validUntil", "status");

CREATE INDEX "institution_authorization_coverage_authorization_idx" ON "institution_authorization_coverage"("tenantId", "authorizationId");
CREATE INDEX "institution_authorization_coverage_stage_idx" ON "institution_authorization_coverage"("tenantId", "stage");

CREATE UNIQUE INDEX "institution_regulatory_documents_storage_key" ON "institution_regulatory_documents"("storageBucket", "privateObjectKey");
CREATE INDEX "institution_regulatory_documents_scope_idx" ON "institution_regulatory_documents"("tenantId", "institutionId", "branchId", "deletedAt");
CREATE INDEX "institution_regulatory_documents_authorization_idx" ON "institution_regulatory_documents"("tenantId", "authorizationId");
CREATE INDEX "institution_regulatory_documents_identifier_idx" ON "institution_regulatory_documents"("tenantId", "identifierId");
CREATE INDEX "institution_regulatory_documents_publication_idx" ON "institution_regulatory_documents"("tenantId", "publicationStatus");

CREATE UNIQUE INDEX "authority_requirement_profiles_code_version_key" ON "authority_requirement_profiles"("profileCode", "version");
CREATE INDEX "authority_requirement_profiles_scope_active_idx" ON "authority_requirement_profiles"("countryCode", "stateCode", "boardCode", "isActive");

CREATE UNIQUE INDEX "official_identifier_claims_fingerprint_key" ON "official_identifier_claims"("claimFingerprint");
CREATE UNIQUE INDEX "official_identifier_claims_identifier_key" ON "official_identifier_claims"("institutionIdentifierId");
CREATE UNIQUE INDEX "official_identifier_claims_tenant_identifier_key" ON "official_identifier_claims"("tenantId", "institutionIdentifierId");
CREATE INDEX "official_identifier_claims_tenant_idx" ON "official_identifier_claims"("tenantId");
ALTER TABLE "institution_regulatory_profiles"
  ADD CONSTRAINT "institution_regulatory_profiles_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_profiles_institution_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_profiles_branch_fkey"
  FOREIGN KEY ("tenantId", "institutionId", "branchId") REFERENCES "branches"("tenantId", "institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_managing_entities"
  ADD CONSTRAINT "institution_managing_entities_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_managing_entity_assignments"
  ADD CONSTRAINT "institution_managing_assignments_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_managing_assignments_institution_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_managing_assignments_branch_fkey"
  FOREIGN KEY ("tenantId", "institutionId", "branchId") REFERENCES "branches"("tenantId", "institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_managing_assignments_entity_fkey"
  FOREIGN KEY ("tenantId", "managingEntityId") REFERENCES "institution_managing_entities"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "institution_identifiers"
  ADD CONSTRAINT "institution_identifiers_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_identifiers_institution_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_identifiers_branch_fkey"
  FOREIGN KEY ("tenantId", "institutionId", "branchId") REFERENCES "branches"("tenantId", "institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_identifiers_authority_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "education_authorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_identifiers_supersedes_fkey"
  FOREIGN KEY ("tenantId", "supersedesId") REFERENCES "institution_identifiers"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "institution_authorizations"
  ADD CONSTRAINT "institution_authorizations_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_authorizations_institution_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_authorizations_branch_fkey"
  FOREIGN KEY ("tenantId", "institutionId", "branchId") REFERENCES "branches"("tenantId", "institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_authorizations_authority_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "education_authorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_authorizations_supersedes_fkey"
  FOREIGN KEY ("tenantId", "supersedesId") REFERENCES "institution_authorizations"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "institution_authorization_coverage"
  ADD CONSTRAINT "institution_authorization_coverage_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_authorization_coverage_authorization_fkey"
  FOREIGN KEY ("tenantId", "authorizationId") REFERENCES "institution_authorizations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "institution_regulatory_documents"
  ADD CONSTRAINT "institution_regulatory_documents_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_documents_institution_fkey"
  FOREIGN KEY ("tenantId", "institutionId") REFERENCES "institutions"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_documents_branch_fkey"
  FOREIGN KEY ("tenantId", "institutionId", "branchId") REFERENCES "branches"("tenantId", "institutionId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_documents_identifier_fkey"
  FOREIGN KEY ("tenantId", "identifierId") REFERENCES "institution_identifiers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "institution_regulatory_documents_authorization_fkey"
  FOREIGN KEY ("tenantId", "authorizationId") REFERENCES "institution_authorizations"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "authority_requirement_profiles"
  ADD CONSTRAINT "authority_requirement_profiles_authority_fkey"
  FOREIGN KEY ("authorityId") REFERENCES "education_authorities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "official_identifier_claims"
  ADD CONSTRAINT "official_identifier_claims_tenant_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "official_identifier_claims_identifier_fkey"
  FOREIGN KEY ("tenantId", "institutionIdentifierId") REFERENCES "institution_identifiers"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "education_authorities" (
  "id", "code", "name", "shortName", "type", "countryCode", "stateCode", "officialDomain", "verificationUrlTemplate", "createdAt", "updatedAt"
)
VALUES
  (gen_random_uuid(), 'IN.MOE.UDISE', 'Ministry of Education - UDISE+', 'UDISE+', 'NATIONAL_MINISTRY', 'IN', NULL, 'udiseplus.gov.in', 'https://kys.udiseplus.gov.in/', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.CBSE', 'Central Board of Secondary Education', 'CBSE', 'CENTRAL_BOARD', 'IN', NULL, 'cbse.gov.in', 'https://saras.cbse.gov.in/SARAS/AffiliatedList/ListOfSchdirReport', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.CISCE', 'Council for the Indian School Certificate Examinations', 'CISCE', 'EDUCATION_COUNCIL', 'IN', NULL, 'cisce.org', 'https://locate.cisce.org/', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.NIOS', 'National Institute of Open Schooling', 'NIOS', 'OPEN_SCHOOLING_AUTHORITY', 'IN', NULL, 'nios.ac.in', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.NCMEI', 'National Commission for Minority Educational Institutions', 'NCMEI', 'NATIONAL_MINISTRY', 'IN', NULL, 'ncmei.gov.in', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.MP.SCHOOL_EDU', 'Madhya Pradesh School Education Department', 'MP School Education', 'STATE_DEPARTMENT', 'IN', 'MP', 'educationportal.mp.gov.in', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'IN.MP.MPBSE', 'Madhya Pradesh Board of Secondary Education', 'MPBSE', 'STATE_BOARD', 'IN', 'MP', 'mpbse.nic.in', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "shortName" = EXCLUDED."shortName",
  "type" = EXCLUDED."type",
  "countryCode" = EXCLUDED."countryCode",
  "stateCode" = EXCLUDED."stateCode",
  "officialDomain" = EXCLUDED."officialDomain",
  "verificationUrlTemplate" = EXCLUDED."verificationUrlTemplate",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "authority_requirement_profiles" (
  "id", "authorityId", "profileCode", "version", "countryCode", "stateCode", "boardCode", "effectiveFrom", "rules", "createdAt", "updatedAt"
)
VALUES
  (
    gen_random_uuid(), NULL, 'IN.BASE', 1, 'IN', NULL, NULL, DATE '2026-08-26',
    '{"requiredIdentity":["legalName","officialAddress","state","postalCode"],"managingEntityRequired":true}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.MOE.UDISE'), 'IN.UDISE', 1, 'IN', NULL, NULL, DATE '2026-08-26',
    '{"identifiers":[{"type":"UDISE","label":"UDISE/DISE Code","assignedPattern":"^[0-9]{11}$","classification":"PUBLIC_ELIGIBLE"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.CBSE'), 'IN.CBSE.AFFILIATION', 1, 'IN', NULL, 'CBSE', DATE '2026-08-26',
    '{"identifiers":[{"type":"BOARD_SCHOOL_CODE","label":"CBSE School Code"}],"authorizations":[{"type":"AFFILIATION","label":"CBSE Affiliation"},{"type":"NO_OBJECTION_CERTIFICATE","label":"State NOC"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.CISCE'), 'IN.CISCE.AFFILIATION', 1, 'IN', NULL, 'CISCE', DATE '2026-08-26',
    '{"identifiers":[{"type":"BOARD_SCHOOL_CODE","label":"CISCE School Code"}],"authorizations":[{"type":"AFFILIATION","label":"CISCE Affiliation"},{"type":"NO_OBJECTION_CERTIFICATE","label":"State NOC"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.NIOS'), 'IN.NIOS.ACCREDITATION', 1, 'IN', NULL, 'NIOS', DATE '2026-08-26',
    '{"identifiers":[{"type":"INSTITUTION_CODE","label":"NIOS AI Code"}],"authorizations":[{"type":"ACCREDITATION","label":"NIOS Accreditation"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.MP.SCHOOL_EDU'), 'IN.MP.RECOGNITION', 1, 'IN', 'MP', NULL, DATE '2026-08-26',
    '{"identifiers":[{"type":"STATE_SCHOOL_CODE","label":"MP School Code"}],"authorizations":[{"type":"RECOGNITION","label":"Recognition / Manyata"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    gen_random_uuid(), (SELECT "id" FROM "education_authorities" WHERE "code" = 'IN.MP.MPBSE'), 'IN.MP.MPBSE', 1, 'IN', 'MP', 'MPBSE', DATE '2026-08-26',
    '{"identifiers":[{"type":"BOARD_SCHOOL_CODE","label":"MPBSE School Code"}],"authorizations":[{"type":"AFFILIATION","label":"MPBSE Affiliation / Sambaddhta"}]}'::jsonb,
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  )
ON CONFLICT ("profileCode", "version") DO NOTHING;

INSERT INTO "institution_regulatory_profiles" (
  "id", "tenantId", "institutionId", "completenessStatus", "countryCode", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), institution."tenantId", institution."id", 'INCOMPLETE',
  CASE WHEN upper(institution."country") = 'INDIA' THEN 'IN' ELSE 'IN' END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "institutions" AS institution
ON CONFLICT DO NOTHING;

INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'platform.regulatory.authority.manage', 'CAMPUS_CORE', 'Manage platform education-authority and requirement-profile catalogues.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'platform.regulatory.duplicate.resolve', 'CAMPUS_CORE', 'Resolve official-identifier ownership conflicts without disclosing tenant data.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.read', 'CAMPUS_CORE', 'View scoped institution legal identity and regulatory records.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.read_sensitive', 'CAMPUS_CORE', 'View restricted institution regulatory information.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.manage', 'CAMPUS_CORE', 'Create and update scoped institution legal identity and regulatory records.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.submit', 'CAMPUS_CORE', 'Submit institution regulatory records for verification.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.verify', 'CAMPUS_CORE', 'Verify institution regulatory records using approved evidence.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.publish', 'CAMPUS_CORE', 'Approve reviewed institution regulatory information for publication.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.withdraw_publication', 'CAMPUS_CORE', 'Withdraw published institution regulatory information.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'campuscore.institution.regulatory.document.download', 'CAMPUS_CORE', 'Download authorised private institution regulatory evidence.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
CROSS JOIN "permissions" AS permission
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
  AND permission."code" IN (
    'campuscore.institution.regulatory.read',
    'campuscore.institution.regulatory.read_sensitive',
    'campuscore.institution.regulatory.manage',
    'campuscore.institution.regulatory.submit',
    'campuscore.institution.regulatory.document.download'
  )
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

ALTER TABLE "education_authorities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_regulatory_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_managing_entities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_managing_entity_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_identifiers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_authorizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_authorization_coverage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "institution_regulatory_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "authority_requirement_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "official_identifier_claims" ENABLE ROW LEVEL SECURITY;
