import { z } from "zod";
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
  gradebookPortalResultsEnabled: z.boolean().optional()
}).refine(({ tenantId: _tenantId, ...value }) => Object.values(value).some((field) => field !== undefined), {
  message: "At least one school field is required."
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
