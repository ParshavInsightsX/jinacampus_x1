import { z } from "zod";

const uuid = z.string().uuid();
const optionalText = (max = 240) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(max).optional()
);
const optionalDate = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.date().optional()
);
const optionalInteger = (minimum: number, maximum: number) => z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().int().min(minimum).max(maximum).optional()
);
const optionalBranchId = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  uuid.optional()
);
const optionalUuid = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  uuid.optional()
);

const identifierTypes = [
  "UDISE",
  "LEGACY_DISE",
  "STATE_SCHOOL_CODE",
  "BOARD_SCHOOL_CODE",
  "INSTITUTION_CODE",
  "OTHER"
] as const;
const identifierAvailability = [
  "ASSIGNED",
  "PENDING_ASSIGNMENT",
  "NOT_APPLICABLE",
  "UNKNOWN"
] as const;
const authorizationTypes = [
  "RECOGNITION",
  "AFFILIATION",
  "ACCREDITATION",
  "REGISTRATION",
  "NO_OBJECTION_CERTIFICATE",
  "PRIOR_PERMISSION",
  "MINORITY_STATUS",
  "OTHER"
] as const;
const dataClassifications = ["PUBLIC", "PUBLIC_ELIGIBLE", "INTERNAL", "RESTRICTED"] as const;
const managingEntityTypes = [
  "GOVERNMENT",
  "LOCAL_AUTHORITY",
  "REGISTERED_SOCIETY",
  "PUBLIC_TRUST",
  "PRIVATE_TRUST",
  "SECTION_8_COMPANY",
  "OTHER"
] as const;
const educationStages = [
  "PRE_PRIMARY",
  "PRIMARY",
  "UPPER_PRIMARY",
  "SECONDARY",
  "SENIOR_SECONDARY",
  "VOCATIONAL",
  "OPEN_BASIC_EDUCATION",
  "OTHER"
] as const;

const placeholderValues = new Set(["N/A", "NA", "NIL", "NONE", "PENDING", "UNKNOWN", "NOT APPLICABLE"]);

function validDateRange(value: { validFrom?: Date; validUntil?: Date }) {
  return !value.validFrom || !value.validUntil || value.validUntil >= value.validFrom;
}

export const institutionRegulatoryParamsSchema = z.object({
  institutionId: uuid
});

export const updateInstitutionLegalIdentitySchema = z.object({
  institutionId: uuid,
  legalName: z.string().trim().min(2).max(200),
  formerLegalNames: z.array(z.string().trim().min(2).max(200)).max(20).default([]),
  establishedYear: optionalInteger(1800, 2200),
  schoolType: optionalText(120),
  district: optionalText(120),
  block: optionalText(120),
  officialEmail: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().email().max(180).optional()
  ),
  officialPhone: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().min(6).max(25).regex(/^[+0-9][0-9 ()-]+$/, "Enter a valid institutional phone number.").optional()
  ),
  website: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().url().max(500).optional()
  ),
  countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
  stateCode: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,12}$/).optional()
  ),
  boardCode: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().toUpperCase().regex(/^[A-Z0-9._-]{2,40}$/).optional()
  )
});

export const createManagingEntitySchema = z.object({
  institutionId: uuid,
  branchId: optionalBranchId,
  legalName: z.string().trim().min(2).max(200),
  type: z.enum(managingEntityTypes),
  registrationNumber: optionalText(120),
  registrationAuthority: optionalText(200),
  registrationStateCode: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().toUpperCase().max(12).optional()
  ),
  registrationDate: optionalDate,
  registeredOfficeAddress: optionalText(500),
  authorisedRepresentative: optionalText(200),
  validFrom: optionalDate,
  validUntil: optionalDate
}).refine(validDateRange, {
  message: "The assignment end date cannot be before its start date.",
  path: ["validUntil"]
});

export const createInstitutionIdentifierSchema = z.object({
  institutionId: uuid,
  branchId: optionalBranchId,
  authorityId: uuid,
  type: z.enum(identifierTypes),
  availability: z.enum(identifierAvailability),
  value: optionalText(160),
  dataClassification: z.enum(dataClassifications).default("INTERNAL"),
  isPrimary: z.boolean().default(false),
  issuedAt: optionalDate,
  validFrom: optionalDate,
  validUntil: optionalDate,
  supersedesId: optionalUuid,
  supersessionReason: optionalText(500)
}).superRefine((value, ctx) => {
  if (!validDateRange(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "The end date cannot be before the start date." });
  }
  if (value.availability === "ASSIGNED" && !value.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Enter the assigned identifier." });
  }
  if (value.availability !== "ASSIGNED" && value.value) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Leave the identifier blank unless it has been assigned." });
  }
  if (value.value && placeholderValues.has(value.value.trim().toUpperCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Use the assignment status instead of a placeholder value." });
  }
  if (value.type === "UDISE" && value.availability === "ASSIGNED" && !/^\d{11}$/.test(value.value ?? "")) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "UDISE Code must contain exactly 11 digits." });
  }
  if (value.supersedesId && !value.supersessionReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supersessionReason"], message: "Explain why the earlier identifier is being replaced." });
  }
});

export const createInstitutionAuthorizationSchema = z.object({
  institutionId: uuid,
  branchId: optionalBranchId,
  authorityId: uuid,
  type: z.enum(authorizationTypes),
  authorizationNumber: optionalText(160),
  applicationReference: optionalText(160),
  categoryCode: optionalText(80),
  dataClassification: z.enum(dataClassifications).default("INTERNAL"),
  issuedAt: optionalDate,
  validFrom: optionalDate,
  validUntil: optionalDate,
  stage: z.enum(educationStages).optional(),
  gradeFrom: optionalInteger(-2, 12),
  gradeTo: optionalInteger(-2, 12),
  programmeCode: optionalText(80),
  streamCode: optionalText(80),
  mediumCode: optionalText(80),
  supersedesId: optionalUuid,
  supersessionReason: optionalText(500)
}).superRefine((value, ctx) => {
  if (!validDateRange(value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "The end date cannot be before the start date." });
  }
  if (value.gradeFrom !== undefined && value.gradeTo !== undefined && value.gradeTo < value.gradeFrom) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gradeTo"], message: "The final grade cannot be below the starting grade." });
  }
  if (value.supersedesId && !value.supersessionReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["supersessionReason"], message: "Explain why the earlier approval is being replaced." });
  }
});

export const submitRegulatoryRecordSchema = z.object({
  institutionId: uuid,
  recordType: z.enum(["IDENTIFIER", "AUTHORIZATION"]),
  recordId: uuid
});

export const regulatoryDocumentMetadataSchema = z.object({
  institutionId: uuid,
  branchId: optionalBranchId,
  recordType: z.enum(["GENERAL", "IDENTIFIER", "AUTHORIZATION"]),
  recordId: optionalUuid,
  documentTypeCode: z.string().trim().toUpperCase().min(2).max(80).regex(/^[A-Z0-9_]+$/),
  title: z.string().trim().min(2).max(200),
  documentNumber: optionalText(160),
  issuedAt: optionalDate,
  expiresAt: optionalDate
}).superRefine((value, ctx) => {
  if (value.recordType !== "GENERAL" && !value.recordId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recordId"], message: "Choose the record supported by this document." });
  }
  if (value.recordType === "GENERAL" && value.recordId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recordId"], message: "A general institution document cannot be linked to another record." });
  }
  if (value.issuedAt && value.expiresAt && value.expiresAt < value.issuedAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["expiresAt"], message: "The expiry date cannot be before the issue date." });
  }
});

export const regulatoryDocumentParamsSchema = z.object({
  institutionId: uuid,
  documentId: uuid
});

export type InstitutionIdentifierInput = z.infer<typeof createInstitutionIdentifierSchema>;
export type InstitutionAuthorizationInput = z.infer<typeof createInstitutionAuthorizationSchema>;
