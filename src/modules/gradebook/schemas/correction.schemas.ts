import { z } from "zod";

export const requestCorrectionSchema = z.object({
  examId: z.string().uuid(),
  requestType: z.enum(["MARK_REOPEN", "RESULT_CORRECTION", "RE_EVALUATION", "REPORT_CARD_REISSUE"]),
  targetType: z.enum(["MARK_BATCH", "RESULT_RUN", "REPORT_CARD"]),
  targetId: z.string().uuid(),
  reason: z.string().trim().min(10).max(1000),
  requestedChange: z.object({ summary: z.string().trim().min(3).max(1000) }).strict(),
  impactPreview: z.object({ affectedStudents: z.number().int().min(1).max(5000), publicationImpact: z.enum(["NONE", "REISSUE_REQUIRED", "REPUBLISH_REQUIRED"]) }).strict()
}).strict();
export const correctionIdSchema = z.object({ correctionRequestId: z.string().uuid() }).strict();

export const approveCorrectionSchema = correctionIdSchema.extend({
  reviewReason: z.string().trim().min(10).max(1000),
  approvalHours: z.number().int().min(1).max(168).default(24)
}).strict();

export const rejectCorrectionSchema = correctionIdSchema.extend({
  reviewReason: z.string().trim().min(10).max(1000)
}).strict();

export const closeCorrectionSchema = correctionIdSchema.extend({
  replacementVersionId: z.string().uuid(),
  reviewReason: z.string().trim().min(10).max(1000)
}).strict();

export const requestAdjustmentSchema = z.object({
  studentSubjectResultId: z.string().uuid(),
  adjustmentType: z.enum(["GRACE", "MODERATION", "CORRECTION"]),
  proposedDelta: z.number().finite().min(-1000).max(1000).optional(),
  proposedValue: z.number().finite().min(0).max(10000).optional(),
  maximumAllowed: z.number().finite().min(0).max(10000).optional(),
  reason: z.string().trim().min(10).max(1000)
}).strict().refine((value) => (value.proposedDelta === undefined) !== (value.proposedValue === undefined), {
  message: "Provide either a proposed delta or a proposed value.",
  path: ["proposedValue"]
});

export const adjustmentIdSchema = z.object({ adjustmentId: z.string().uuid() }).strict();

export const reviewAdjustmentSchema = adjustmentIdSchema.extend({
  reason: z.string().trim().min(10).max(1000)
}).strict();
