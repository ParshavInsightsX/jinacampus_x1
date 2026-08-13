import { z } from "zod";

import { schoolIdSchema } from "@/modules/campus-core/administrator-schemas";

const uuid = z.string().uuid();
const optionalEmail = z.preprocess(
  (value) => value === null || typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().email("Enter a valid email address.").max(180).transform((value) => value.toLowerCase()).optional()
);
const optionalPrincipalId = z.preprocess(
  (value) => value === null || typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string()
    .trim()
    .min(3, "Enter a valid Principal ID.")
    .max(50)
    .transform((value) => value.toUpperCase())
    .refine((value) => /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(value), "Enter a valid Principal ID.")
    .optional()
);

export const principalPasswordRecoveryRequestSchema = z.object({
  tenantSlug: schoolIdSchema,
  email: optionalEmail,
  principalId: optionalPrincipalId
}).strict().superRefine((value, ctx) => {
  if (!value.email && !value.principalId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Enter the registered email or Principal ID."
    });
  }
  if (value.email && value.principalId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["principalId"],
      message: "Use either the registered email or Principal ID."
    });
  }
});

export const principalRecoveryApproveSchema = z.object({
  requestId: uuid,
  resetMethod: z.enum(["RESET_LINK", "TEMPORARY_PASSWORD"]),
  identityVerified: z.literal(true, {
    errorMap: () => ({ message: "Confirm that the Principal identity and institution were verified." })
  }),
  reviewRemarks: z.string().trim().min(10, "Record the identity-verification method.").max(500)
}).strict();

export const principalRecoveryRejectSchema = z.object({
  requestId: uuid,
  reviewRemarks: z.string().trim().min(5, "Add a rejection reason.").max(500)
}).strict();

const strongPassword = z.string()
  .min(12, "Password must be at least 12 characters.")
  .max(200)
  .refine((value) => /[a-z]/.test(value), "Password must include a lowercase letter.")
  .refine((value) => /[A-Z]/.test(value), "Password must include an uppercase letter.")
  .refine((value) => /[0-9]/.test(value), "Password must include a number.")
  .refine((value) => /[^A-Za-z0-9]/.test(value), "Password must include a symbol.");

export const completePrincipalPasswordResetSchema = z.object({
  requestId: uuid,
  token: z.string().min(32).max(500),
  newPassword: strongPassword,
  confirmNewPassword: z.string().max(200)
}).strict().refine((value) => value.newPassword === value.confirmNewPassword, {
  message: "New password and confirmation do not match.",
  path: ["confirmNewPassword"]
});

export type PrincipalPasswordRecoveryRequestInput = z.infer<typeof principalPasswordRecoveryRequestSchema>;
export type PrincipalRecoveryApproveInput = z.infer<typeof principalRecoveryApproveSchema>;
export type PrincipalRecoveryRejectInput = z.infer<typeof principalRecoveryRejectSchema>;
export type CompletePrincipalPasswordResetInput = z.infer<typeof completePrincipalPasswordResetSchema>;
