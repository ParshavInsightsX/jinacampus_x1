import { z } from "zod";
import {
  dateSchema,
  idSchema,
  optionalIdSchema,
  optionalTrimmedString,
  trimmedString
} from "@/modules/academia/schemas/shared";

export const gradebookAssessmentTypeSchema = z.enum([
  "UNIT_TEST",
  "PERIODIC_TEST",
  "HALF_YEARLY",
  "ANNUAL",
  "PROJECT",
  "PRACTICAL",
  "OTHER"
]);

export const gradebookMarkStatusSchema = z.enum(["GRADED", "ABSENT", "EXEMPT"]);

const marksValueSchema = z.coerce.number().finite().min(0).max(1000);

export const assignClassSectionSubjectSchema = z.object({
  classSectionId: idSchema,
  subjectId: idSchema,
  teacherUserId: optionalIdSchema
}).strict();

export const updateClassSectionSubjectSchema = z.object({
  classSectionSubjectId: idSchema,
  teacherUserId: idSchema.nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional()
}).strict().refine(
  ({ teacherUserId, status }) => teacherUserId !== undefined || status !== undefined,
  { message: "Choose a teacher or lifecycle change before saving." }
);

export const createGradebookAssessmentSchema = z.object({
  classSectionSubjectId: idSchema,
  code: z.string().trim().toUpperCase().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  title: trimmedString(2, 120),
  type: gradebookAssessmentTypeSchema,
  assessmentDate: dateSchema,
  maxMarks: marksValueSchema.positive(),
  passMarks: marksValueSchema
}).strict().refine((value) => value.passMarks <= value.maxMarks, {
  message: "Pass marks cannot exceed maximum marks",
  path: ["passMarks"]
});

export const saveGradebookMarkEntrySchema = z.object({
  enrollmentId: idSchema,
  status: gradebookMarkStatusSchema,
  marksObtained: marksValueSchema.optional(),
  remarks: optionalTrimmedString(300)
}).strict().superRefine((value, ctx) => {
  if (value.status === "GRADED" && value.marksObtained === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Enter marks for a graded student",
      path: ["marksObtained"]
    });
  }
  if (value.status !== "GRADED" && value.marksObtained !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Marks must be blank for absent or exempt students",
      path: ["marksObtained"]
    });
  }
});

export const saveGradebookMarksSchema = z.object({
  assessmentId: idSchema,
  entries: z.array(saveGradebookMarkEntrySchema).min(1).max(500)
}).strict().superRefine((value, ctx) => {
  const enrollmentIds = new Set<string>();
  value.entries.forEach((entry, index) => {
    if (enrollmentIds.has(entry.enrollmentId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "An enrollment can appear only once",
        path: ["entries", index, "enrollmentId"]
      });
    }
    enrollmentIds.add(entry.enrollmentId);
  });
});

export const gradebookAssessmentIdSchema = z.object({ assessmentId: idSchema }).strict();

export const reopenGradebookAssessmentSchema = gradebookAssessmentIdSchema.extend({
  reason: trimmedString(10, 500)
}).strict();

export const cancelGradebookAssessmentSchema = gradebookAssessmentIdSchema.extend({
  reason: trimmedString(10, 500)
}).strict();

export type AssignClassSectionSubjectInput = z.infer<typeof assignClassSectionSubjectSchema>;
export type UpdateClassSectionSubjectInput = z.infer<typeof updateClassSectionSubjectSchema>;
export type CreateGradebookAssessmentInput = z.infer<typeof createGradebookAssessmentSchema>;
export type SaveGradebookMarksInput = z.infer<typeof saveGradebookMarksSchema>;
