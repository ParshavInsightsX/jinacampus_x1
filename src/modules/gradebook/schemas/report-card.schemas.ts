import { z } from "zod";

export const reportCardTemplateConfigurationSchema = z.object({
  title: z.string().trim().min(1).max(120).default("Academic Report Card"),
  showAttendance: z.boolean().default(true),
  showRemarks: z.boolean().default(true),
  showPromotionStatus: z.boolean().default(true),
  signatureLabels: z.array(z.string().trim().min(1).max(60)).min(1).max(4).default(["Class Teacher", "Principal"])
}).strict();

export const createReportCardTemplateSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  locale: z.string().trim().min(2).max(20).default("en-IN"),
  configuration: reportCardTemplateConfigurationSchema
}).strict();

export const reportCardTemplateVersionIdSchema = z.object({
  templateVersionId: z.string().uuid()
}).strict();

export const generateReportCardsSchema = z.object({
  resultRunId: z.string().uuid(),
  templateVersionId: z.string().uuid(),
  attendancePeriodStart: z.coerce.date().optional(),
  attendancePeriodEnd: z.coerce.date().optional()
}).strict().refine((value) => Boolean(value.attendancePeriodStart) === Boolean(value.attendancePeriodEnd), {
  message: "Provide both attendance period dates or neither.",
  path: ["attendancePeriodEnd"]
}).refine((value) => !value.attendancePeriodStart || !value.attendancePeriodEnd || value.attendancePeriodEnd >= value.attendancePeriodStart, {
  message: "Attendance period end must be on or after its start.",
  path: ["attendancePeriodEnd"]
});

export const reportCardIdSchema = z.object({ reportCardId: z.string().uuid() }).strict();

export const preparePublicationSchema = z.object({
  resultRunId: z.string().uuid(),
  audience: z.enum(["STUDENT", "GUARDIAN", "STUDENT_AND_GUARDIAN"]),
  publishAt: z.coerce.date(),
  reason: z.string().trim().max(500).optional()
}).strict();

export const publicationIdSchema = z.object({ publicationId: z.string().uuid() }).strict();

export const revokePublicationSchema = publicationIdSchema.extend({
  reason: z.string().trim().min(10).max(500)
}).strict();
