import { z } from "zod";

const code = z.string().trim().min(1).max(40).regex(/^[A-Z0-9][A-Z0-9_-]*$/);

export const createCoScholasticSchemeSchema = z.object({
  code,
  name: z.string().trim().min(2).max(120),
  ratingScale: z.array(z.object({
    code,
    label: z.string().trim().min(1).max(80),
    description: z.string().trim().max(250).optional()
  }).strict()).min(2).max(20),
  areas: z.array(z.object({
    code,
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    category: z.string().trim().max(80).optional(),
    indicators: z.array(z.object({
      code,
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(500).optional(),
      remarkRequired: z.boolean().default(false)
    }).strict()).min(1).max(50)
  }).strict()).min(1).max(30)
}).strict();
export const coScholasticSchemeIdSchema = z.object({ schemeVersionId: z.string().uuid() }).strict();

export const saveCoScholasticEntriesSchema = z.object({
  schemeVersionId: z.string().uuid(),
  termId: z.string().uuid(),
  entries: z.array(z.object({
    enrollmentId: z.string().uuid(),
    indicatorId: z.string().uuid(),
    ratingCode: code,
    observation: z.string().trim().max(500).optional()
  }).strict()).min(1).max(1000)
}).strict();

export const saveTeacherRemarkSchema = z.object({
  examId: z.string().uuid(),
  enrollmentId: z.string().uuid(),
  examSubjectId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  remarkType: z.enum(["SUBJECT_TEACHER", "CLASS_TEACHER", "PRINCIPAL"]),
  remarkText: z.string().trim().min(2).max(1000),
  languageCode: z.string().trim().min(2).max(12).default("en")
}).strict();
