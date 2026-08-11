import { z } from "zod";
import { dateSchema, idSchema, optionalTrimmedString } from "./shared";

export const studentPromotionOutcomeSchema = z.enum([
  "PROMOTED",
  "NOT_PROMOTED",
  "REPEAT_SAME_CLASS",
  "TRANSFERRED",
  "SCHOOL_LEFT",
  "RESULT_PENDING",
  "PROMOTION_WITHHELD"
]);

export const promotionWorkspaceSchema = z.object({
  sourceAcademicYearId: idSchema.optional(),
  sourceClassSectionId: idSchema.optional(),
  targetAcademicYearId: idSchema.optional()
}).strict();

export const studentPromotionDecisionSchema = z.object({
  sourceEnrollmentId: idSchema,
  studentId: idSchema,
  outcome: studentPromotionOutcomeSchema,
  targetClassSectionId: idSchema.optional(),
  remarks: optionalTrimmedString(500)
}).strict();

export const createStudentPromotionBatchSchema = z.object({
  sourceAcademicYearId: idSchema,
  sourceClassSectionId: idSchema,
  targetAcademicYearId: idSchema,
  defaultTargetClassSectionId: idSchema,
  effectiveDate: dateSchema,
  remarks: optionalTrimmedString(1000),
  resultsPublicationConfirmed: z.boolean().refine(Boolean, {
    message: "Confirm that examination results are finalised and published"
  }),
  entries: z.array(studentPromotionDecisionSchema).min(1, "Select at least one student").max(5000)
}).strict().superRefine((value, ctx) => {
  const enrollmentIds = new Set<string>();
  const studentIds = new Set<string>();

  value.entries.forEach((entry, index) => {
    if (enrollmentIds.has(entry.sourceEnrollmentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A student enrollment can appear only once",
        path: ["entries", index, "sourceEnrollmentId"]
      });
    }
    if (studentIds.has(entry.studentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A student can appear only once",
        path: ["entries", index, "studentId"]
      });
    }
    enrollmentIds.add(entry.sourceEnrollmentId);
    studentIds.add(entry.studentId);

    if (entry.outcome === "REPEAT_SAME_CLASS" && !entry.targetClassSectionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Choose the target class-section for a repeating student",
        path: ["entries", index, "targetClassSectionId"]
      });
    }
  });
});

export const reverseStudentPromotionBatchSchema = z.object({
  batchId: idSchema,
  confirmation: z.literal("REVERSE PROMOTION"),
  reason: z.string().trim().min(10).max(1000)
}).strict();

export type StudentPromotionOutcomeInput = z.infer<typeof studentPromotionOutcomeSchema>;
export type PromotionWorkspaceInput = z.infer<typeof promotionWorkspaceSchema>;
export type CreateStudentPromotionBatchInput = z.infer<typeof createStudentPromotionBatchSchema>;
export type ReverseStudentPromotionBatchInput = z.infer<typeof reverseStudentPromotionBatchSchema>;
