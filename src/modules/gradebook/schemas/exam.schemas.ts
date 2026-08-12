import { z } from "zod";
import { codeSchema, idSchema, optionalDateSchema, optionalIdSchema, optionalTrimmedString, trimmedString } from "@/modules/academia/schemas/shared";

const componentSchema = z.object({
  componentId: optionalIdSchema,
  examTypeId: optionalIdSchema,
  componentCode: codeSchema,
  componentName: trimmedString(2, 120),
  maximumMarks: z.coerce.number().finite().positive().max(10000),
  passingMarks: z.coerce.number().finite().min(0).max(10000).optional(),
  weightagePercent: z.coerce.number().finite().min(0).max(100).optional(),
  displayOrder: z.coerce.number().int().min(0).max(100),
  isOptional: z.boolean().default(false)
}).strict().refine((value) => value.passingMarks === undefined || value.passingMarks <= value.maximumMarks, {
  message: "Component passing marks cannot exceed maximum marks.",
  path: ["passingMarks"]
});

const examSubjectSchema = z.object({
  subjectId: idSchema,
  displayName: optionalTrimmedString(120),
  maximumMarks: z.coerce.number().finite().positive().max(10000).optional(),
  passingMarks: z.coerce.number().finite().min(0).max(10000).optional(),
  displayOrder: z.coerce.number().int().min(0).max(100),
  components: z.array(componentSchema).min(1).max(30)
}).strict().refine((value) => value.maximumMarks === undefined || value.passingMarks === undefined || value.passingMarks <= value.maximumMarks, {
  message: "Subject passing marks cannot exceed maximum marks.",
  path: ["passingMarks"]
});

export const createExamSchema = z.object({
  termId: idSchema,
  examTypeId: idSchema,
  schemeVersionId: optionalIdSchema,
  gradeScaleVersionId: optionalIdSchema,
  calculationRuleSetVersionId: optionalIdSchema,
  code: codeSchema,
  name: trimmedString(2, 120),
  description: optionalTrimmedString(1000),
  instructions: optionalTrimmedString(3000),
  marksEntryOpensAt: optionalDateSchema,
  marksEntryClosesAt: optionalDateSchema,
  resultPublicationPolicy: z.enum(["MANUAL", "SCHEDULED"]).default("MANUAL"),
  scheduledPublishAt: optionalDateSchema,
  classSectionIds: z.array(idSchema).min(1).max(100),
  subjects: z.array(examSubjectSchema).min(1).max(100)
}).strict().superRefine((value, ctx) => {
  if (value.marksEntryOpensAt && value.marksEntryClosesAt && value.marksEntryClosesAt <= value.marksEntryOpensAt) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Marks entry must close after it opens.", path: ["marksEntryClosesAt"] });
  }
  if (new Set(value.classSectionIds).size !== value.classSectionIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A class-section can be selected only once.", path: ["classSectionIds"] });
  }
  const subjectIds = value.subjects.map((subject) => subject.subjectId);
  if (new Set(subjectIds).size !== subjectIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A subject can be selected only once.", path: ["subjects"] });
  }
});

export const assignTeacherSchema = z.object({
  examId: idSchema,
  examClassSectionId: idSchema,
  examSubjectId: idSchema,
  examSubjectComponentId: optionalIdSchema,
  teacherUserId: idSchema,
  sourceClassSectionSubjectId: optionalIdSchema,
  isPrimary: z.boolean().default(true),
  canEdit: z.boolean().default(true),
  canSubmit: z.boolean().default(true),
  validFrom: optionalDateSchema,
  validUntil: optionalDateSchema,
  overrideReason: optionalTrimmedString(1000)
}).strict().refine((value) => !value.validFrom || !value.validUntil || value.validUntil > value.validFrom, {
  message: "Assignment end must be after its start.",
  path: ["validUntil"]
});

export const upsertExamScheduleSchema = z.object({
  examId: idSchema,
  examClassSectionId: idSchema,
  examSubjectId: idSchema,
  examSubjectComponentId: optionalIdSchema,
  examDate: z.coerce.date(),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  reportingTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  roomName: optionalTrimmedString(120),
  instructions: optionalTrimmedString(2000)
}).strict().refine((value) => value.endTime > value.startTime, {
  message: "Schedule end time must be after start time.",
  path: ["endTime"]
});

export const examIdSchema = z.object({ examId: idSchema }).strict();
export const cancelExamSchema = examIdSchema.extend({ reason: trimmedString(10, 1000) }).strict();
export const revokeTeacherAssignmentSchema = z.object({ assignmentId: idSchema, reason: trimmedString(10, 1000) }).strict();

export type CreateExamInput = z.infer<typeof createExamSchema>;
export type AssignTeacherInput = z.infer<typeof assignTeacherSchema>;
export type UpsertExamScheduleInput = z.infer<typeof upsertExamScheduleSchema>;
