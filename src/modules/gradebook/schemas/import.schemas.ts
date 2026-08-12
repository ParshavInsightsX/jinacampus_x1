import { z } from "zod";

export const marksTemplateRequestSchema = z.object({
  batchId: z.string().uuid(),
  format: z.enum(["xlsx", "csv"]).default("xlsx")
}).strict();
export const marksImportUploadSchema = z.object({
  batchId: z.string().uuid()
}).strict();

export const marksImportJobSchema = z.object({
  importJobId: z.string().uuid()
}).strict();

export const marksImportApplySchema = marksImportJobSchema.extend({
  expectedBatchVersion: z.number().int().positive()
}).strict();
