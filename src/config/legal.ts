export type LegalDocumentStatus = "DRAFT" | "EFFECTIVE";

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

export type LegalPublicationConfig = {
  status: LegalDocumentStatus;
  version: string;
  effectiveDate: string | null;
  lastReviewedDate: string | null;
  entityName: string | null;
  entityAddress: string | null;
  privacyContactEmail: string | null;
  grievanceOfficerName: string | null;
  grievanceContactEmail: string | null;
  supportContactEmail: string | null;
};

function optionalValue(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function legalStatus(value: string | undefined): LegalDocumentStatus {
  return value?.trim().toUpperCase() === "EFFECTIVE" ? "EFFECTIVE" : "DRAFT";
}

export function resolveLegalPublicationConfig(
  environment: EnvironmentInput = process.env
): LegalPublicationConfig {
  return {
    status: legalStatus(environment.LEGAL_DOCUMENT_STATUS),
    version: optionalValue(environment.LEGAL_DOCUMENT_VERSION) ?? "draft-0.1",
    effectiveDate: optionalValue(environment.LEGAL_EFFECTIVE_DATE),
    lastReviewedDate: optionalValue(environment.LEGAL_LAST_REVIEWED_DATE),
    entityName: optionalValue(environment.LEGAL_ENTITY_NAME),
    entityAddress: optionalValue(environment.LEGAL_ENTITY_ADDRESS),
    privacyContactEmail: optionalValue(environment.PRIVACY_CONTACT_EMAIL),
    grievanceOfficerName: optionalValue(environment.GRIEVANCE_OFFICER_NAME),
    grievanceContactEmail: optionalValue(environment.GRIEVANCE_CONTACT_EMAIL),
    supportContactEmail: optionalValue(environment.SUPPORT_CONTACT_EMAIL)
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getLegalReadinessIssues(config: LegalPublicationConfig) {
  const issues: string[] = [];

  if (config.status !== "EFFECTIVE") issues.push("LEGAL_DOCUMENT_STATUS must be EFFECTIVE");
  if (!config.version || config.version.startsWith("draft")) issues.push("LEGAL_DOCUMENT_VERSION must be an approved version");
  if (!config.effectiveDate || !ISO_DATE.test(config.effectiveDate)) issues.push("LEGAL_EFFECTIVE_DATE must use YYYY-MM-DD");
  if (!config.lastReviewedDate || !ISO_DATE.test(config.lastReviewedDate)) issues.push("LEGAL_LAST_REVIEWED_DATE must use YYYY-MM-DD");
  if (!config.entityName) issues.push("LEGAL_ENTITY_NAME is required");
  if (!config.entityAddress) issues.push("LEGAL_ENTITY_ADDRESS is required");
  if (!config.privacyContactEmail || !EMAIL.test(config.privacyContactEmail)) issues.push("PRIVACY_CONTACT_EMAIL must be a valid email");
  if (!config.grievanceOfficerName) issues.push("GRIEVANCE_OFFICER_NAME is required");
  if (!config.grievanceContactEmail || !EMAIL.test(config.grievanceContactEmail)) issues.push("GRIEVANCE_CONTACT_EMAIL must be a valid email");
  if (!config.supportContactEmail || !EMAIL.test(config.supportContactEmail)) issues.push("SUPPORT_CONTACT_EMAIL must be a valid email");

  return issues;
}

export const LEGAL_PUBLICATION = resolveLegalPublicationConfig();
export const LEGAL_PUBLICATION_READY = getLegalReadinessIssues(LEGAL_PUBLICATION).length === 0;
