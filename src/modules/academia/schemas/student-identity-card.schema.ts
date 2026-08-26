import { z } from "zod";
import { idSchema } from "./shared";

const dateInputSchema = z.coerce.date();

export const issueStudentIdentityCardSchema = z.object({
  studentId: idSchema,
  enrollmentId: idSchema,
  validFrom: dateInputSchema,
  validUntil: dateInputSchema.optional(),
  reason: z.string().trim().max(250).optional()
}).strict().refine(
  (value) => !value.validUntil || value.validUntil >= value.validFrom,
  { path: ["validUntil"], message: "Validity end date must not be before the issue date." }
);

export const studentIdentityCardIdSchema = z.object({
  cardId: idSchema
}).strict();

export const deactivateStudentIdentityCardSchema = z.object({
  cardId: idSchema,
  reason: z.string().trim().min(5).max(500)
}).strict();

export type IssueStudentIdentityCardInput = z.infer<typeof issueStudentIdentityCardSchema>;
export type StudentIdentityCardIdInput = z.infer<typeof studentIdentityCardIdSchema>;
export type DeactivateStudentIdentityCardInput = z.infer<typeof deactivateStudentIdentityCardSchema>;
