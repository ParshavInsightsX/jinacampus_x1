import { z } from "zod";
import { idSchema, optionalTrimmedString, trimmedString } from "@/modules/academia/schemas/shared";

const numericMarkSchema = z.object({
  kind: z.literal("NUMERIC"),
  marksObtained: z.coerce.number().finite().min(0).max(10000)
}).strict();

const specialMarkSchema = z.object({
  kind: z.literal("SPECIAL_STATUS"),
  status: z.enum(["ABSENT", "EXEMPTED", "MEDICAL_LEAVE", "NOT_APPLICABLE", "WITHHELD", "RESULT_PENDING"]),
  reason: optionalTrimmedString(1000),
  publicRemark: optionalTrimmedString(300)
}).strict();

export const markValueInputSchema = z.discriminatedUnion("kind", [numericMarkSchema, specialMarkSchema]).superRefine((value, ctx) => {
  if (value.kind !== "SPECIAL_STATUS") return;
  if (["EXEMPTED", "MEDICAL_LEAVE", "WITHHELD", "RESULT_PENDING"].includes(value.status) && !value.reason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A reason is required for this status.", path: ["reason"] });
  }
});

export const saveMarksDraftSchema = z.object({
  batchId: idSchema,
  expectedVersion: z.coerce.number().int().positive(),
  entries: z.array(z.object({
    enrollmentId: idSchema,
    componentId: idSchema,
    value: markValueInputSchema,
    teacherRemark: optionalTrimmedString(500)
  }).strict()).min(1).max(3000)
}).strict().superRefine((value, ctx) => {
  const keys = new Set<string>();
  value.entries.forEach((entry, index) => {
    const key = `${entry.enrollmentId}:${entry.componentId}`;
    if (keys.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate student/component row.", path: ["entries", index] });
    keys.add(key);
  });
});

export const marksBatchIdSchema = z.object({ batchId: idSchema }).strict();
export const transitionMarksBatchSchema = z.object({
  batchId: idSchema,
  expectedVersion: z.coerce.number().int().positive(),
  action: z.enum(["SUBMIT", "VERIFY", "APPROVE", "LOCK"]),
  comment: optionalTrimmedString(1000)
}).strict();
export const returnMarksBatchSchema = z.object({
  batchId: idSchema,
  expectedVersion: z.coerce.number().int().positive(),
  reason: trimmedString(10, 1000)
}).strict();

export type SaveMarksDraftInput = z.infer<typeof saveMarksDraftSchema>;
export type TransitionMarksBatchInput = z.infer<typeof transitionMarksBatchSchema>;
