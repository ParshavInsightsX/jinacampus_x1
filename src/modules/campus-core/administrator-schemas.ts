import { z } from "zod";
import {
  INSTITUTION_ENTITLEMENT_DEFINITIONS,
  isKnownEntitlementPair
} from "@/modules/campus-core/entitlements/catalog";
import {
  SCHOOL_ID_ERROR_MESSAGES,
  SCHOOL_ID_MAX_LENGTH,
  SCHOOL_ID_MIN_LENGTH,
  SCHOOL_ID_PATTERN,
  isReservedSchoolId,
  normalizeSchoolId
} from "@/modules/campus-core/tenant-login-policy";

const uuid = z.string().uuid();
const password = z.string().min(8, "Password must be at least 8 characters.").max(200);
const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().max(180).optional()
);
const optionalNullableText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().max(180).nullable().optional()
);
const optionalEmail = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().email().max(180).optional()
);
const optionalLogoUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string().trim().url("Enter a valid logo URL.").max(500).nullable().optional()
);

export const schoolIdSchema = z.preprocess(
  (value) => normalizeSchoolId(value) ?? "",
  z.string()
    .min(1, SCHOOL_ID_ERROR_MESSAGES.required)
    .min(SCHOOL_ID_MIN_LENGTH, SCHOOL_ID_ERROR_MESSAGES.format)
    .max(SCHOOL_ID_MAX_LENGTH, SCHOOL_ID_ERROR_MESSAGES.format)
    .regex(SCHOOL_ID_PATTERN, SCHOOL_ID_ERROR_MESSAGES.format)
    .refine((value) => !isReservedSchoolId(value), SCHOOL_ID_ERROR_MESSAGES.reserved)
);

export const administratorLoginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200)
});

export const createSchoolSchema = z.object({
  name: z.string().trim().min(2).max(160),
  schoolId: schoolIdSchema,
  institutionDisplayName: optionalNullableText,
  supportEmail: optionalEmail,
  status: z.enum(["ACTIVE", "SUSPENDED"]).default("ACTIVE"),
  principalFirstName: optionalText,
  principalLastName: optionalText,
  principalEmail: optionalEmail,
  principalInitialPassword: password.optional(),
  confirmPrincipalInitialPassword: z.string().max(200).optional()
}).superRefine((value, ctx) => {
  const principalFields = [
    value.principalFirstName,
    value.principalLastName,
    value.principalEmail,
    value.principalInitialPassword,
    value.confirmPrincipalInitialPassword
  ];
  const hasPrincipalInput = principalFields.some(Boolean);
  if (!hasPrincipalInput) return;

  for (const [field, message] of [
    ["principalFirstName", "Principal first name is required."],
    ["principalEmail", "Principal email is required."],
    ["principalInitialPassword", "Principal initial password is required."],
    ["confirmPrincipalInitialPassword", "Confirm the principal initial password."]
  ] as const) {
    if (!value[field]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  }
  if (value.principalInitialPassword !== value.confirmPrincipalInitialPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPrincipalInitialPassword"],
      message: "New password and confirmation do not match."
    });
  }
});

export const updateSchoolSchema = z.object({
  tenantId: uuid,
  name: z.string().trim().min(2).max(160).optional(),
  legalName: optionalNullableText,
  supportEmail: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    z.string().trim().email().max(180).nullable().optional()
  ),
  status: z.enum(["ACTIVE", "SUSPENDED", "ARCHIVED"]).optional(),
  institutionDisplayName: optionalNullableText,
  institutionLogoUrl: optionalLogoUrl,
  gradebookEnabled: z.boolean().optional(),
  gradebookConfigurationEnabled: z.boolean().optional(),
  gradebookMarksEntryEnabled: z.boolean().optional(),
  gradebookImportEnabled: z.boolean().optional(),
  gradebookResultCalculationEnabled: z.boolean().optional(),
  gradebookCoScholasticEnabled: z.boolean().optional(),
  gradebookReportCardsEnabled: z.boolean().optional(),
  gradebookPublicationEnabled: z.boolean().optional(),
  gradebookAnalyticsEnabled: z.boolean().optional(),
  gradebookPortalResultsEnabled: z.boolean().optional(),
}).refine(({ tenantId: _tenantId, ...value }) => Object.values(value).some((field) => field !== undefined), {
  message: "At least one school field is required."
});

const optionalSubscriptionEndDate = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
    ? new Date(`${trimmed}T23:59:59.999Z`)
    : value;
}, z.coerce.date().nullable());

export const updateTenantSubscriptionSchema = z.object({
  tenantId: uuid,
  planCode: z.preprocess(
    (value) => typeof value === "string" ? value.trim().toUpperCase() : value,
    z.string().min(2).max(50).regex(/^[A-Z][A-Z0-9_-]+$/, "Use letters, numbers, hyphens, or underscores.")
  ),
  status: z.enum(["TRIAL", "ACTIVE", "GRACE_PERIOD", "SUSPENDED", "CANCELLED", "EXPIRED"]),
  trialEndsAt: optionalSubscriptionEndDate,
  currentPeriodEndsAt: optionalSubscriptionEndDate,
  graceEndsAt: optionalSubscriptionEndDate
}).superRefine((value, ctx) => {
  if (value.status === "TRIAL" && !value.trialEndsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["trialEndsAt"],
      message: "Set a trial end date."
    });
  }
  if (value.status === "GRACE_PERIOD" && !value.graceEndsAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["graceEndsAt"],
      message: "Set a grace-period end date."
    });
  }
  if (
    value.currentPeriodEndsAt &&
    value.graceEndsAt &&
    value.graceEndsAt < value.currentPeriodEndsAt
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["graceEndsAt"],
      message: "Grace period cannot end before the current subscription period."
    });
  }
});

const institutionEntitlementEntrySchema = z.object({
  moduleKey: z.enum(["attendance", "gradebook"]),
  featureKey: z.string().min(2).max(64),
  access: z.enum(["DISABLED", "READ_ONLY", "FULL"])
});

export const updateInstitutionEntitlementsSchema = z.object({
  tenantId: uuid,
  institutionId: uuid,
  entitlements: z.array(institutionEntitlementEntrySchema)
    .length(INSTITUTION_ENTITLEMENT_DEFINITIONS.length)
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const entitlement of value.entitlements) {
    const key = entitlement.moduleKey + ":" + entitlement.featureKey;
    if (!isKnownEntitlementPair(entitlement.moduleKey, entitlement.featureKey)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entitlements"],
        message: "An unsupported module entitlement was submitted."
      });
    }
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["entitlements"],
        message: "Duplicate module entitlements are not allowed."
      });
    }
    seen.add(key);
  }
});

export const updateInstitutionLogoSchema = z.object({
  tenantId: uuid,
  institutionId: uuid
});

export const updateSchoolIdSchema = z.object({
  tenantId: uuid,
  currentSchoolId: schoolIdSchema,
  newSchoolId: schoolIdSchema,
  confirmSchoolIdChange: z.boolean().refine((value) => value, {
    message: "Confirm that the School ID login code should change."
  })
}).refine((value) => value.currentSchoolId !== value.newSchoolId, {
  message: "Enter a new School ID that differs from the current value.",
  path: ["newSchoolId"]
});

export const deactivateSchoolSchema = z.object({
  tenantId: uuid,
  confirmDeactivation: z.boolean().refine((value) => value, {
    message: "Confirm that this school should be deactivated."
  })
});

export const reactivateSchoolSchema = z.object({
  tenantId: uuid,
  confirmReactivation: z.boolean().refine((value) => value, {
    message: "Confirm that this school should be reactivated."
  })
});

export const deleteSchoolSchema = z.object({
  tenantId: uuid,
  confirmDelete: z.string().min(1)
}).refine((value) => value.confirmDelete === "Delete School", {
  message: "Type Delete School exactly to confirm permanent deletion.",
  path: ["confirmDelete"]
});
