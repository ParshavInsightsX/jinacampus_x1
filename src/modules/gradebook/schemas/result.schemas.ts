import { z } from "zod";
import { idSchema, trimmedString } from "@/modules/academia/schemas/shared";

export const createResultRunSchema = z.object({
  examId: idSchema,
  examClassSectionId: idSchema
}).strict();

export const resultRunIdSchema = z.object({ resultRunId: idSchema }).strict();

export const rejectResultRunSchema = resultRunIdSchema.extend({
  reason: trimmedString(10, 1000)
}).strict();

export const createReportCardTemplateSchema = z.object({
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  name: z.string().trim().min(2).max(120),
  configuration: z.object({
    includeAttendance: z.boolean().default(true),
    includeRemarks: z.boolean().default(true),
    includeCoScholastic: z.boolean().default(false),
    includePromotion: z.boolean().default(true),
    principalSignatureLabel: z.string().trim().min(1).max(80).default("Principal"),
    classTeacherSignatureLabel: z.string().trim().min(1).max(80).default("Class Teacher")
  }).strict(),
  locale: z.string().trim().min(2).max(20).default("en-IN")
}).strict();

export const generateReportCardsSchema = z.object({
  resultRunId: idSchema,
  templateVersionId: idSchema
}).strict();

export const reportCardIdSchema = z.object({ reportCardId: idSchema }).strict();

export const createPublicationSchema = z.object({
  resultRunId: idSchema,
  audience: z.enum(["STUDENT", "GUARDIAN", "STUDENT_AND_GUARDIAN"]),
  publishAt: z.coerce.date()
}).strict();

export const publicationIdSchema = z.object({ publicationId: idSchema }).strict();
export const revokePublicationSchema = publicationIdSchema.extend({ reason: trimmedString(10, 1000) }).strict();
