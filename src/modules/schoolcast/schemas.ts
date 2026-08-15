import { z } from "zod";

const idSchema = z.string().uuid();
const shortText = z.string().trim().min(1).max(120);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");

export const schoolCastChannelSchema = z.enum(["IN_APP", "EMAIL", "WHATSAPP"]);
export const schoolCastPrioritySchema = z.enum(["NORMAL", "HIGH", "EMERGENCY"]);
export const schoolCastCommunicationTypeSchema = z.enum(["NOTICE", "CIRCULAR", "BROADCAST", "EMERGENCY"]);

export const schoolCastAudienceRuleSchema = z.object({
  ruleType: z.enum(["ALL_USERS", "ROLE", "BRANCH", "CLASS_SECTION", "STUDENT", "STAFF", "CUSTOM"]),
  mode: z.enum(["INCLUDE", "EXCLUDE"]).default("INCLUDE"),
  label: z.string().trim().max(160).optional(),
  targetIds: z.array(idSchema).max(500).default([]),
  roleCodes: z.array(z.string().trim().min(1).max(64)).max(20).default([]),
  recipientTypes: z.array(z.enum(["USER", "STUDENT", "GUARDIAN", "STAFF"])).max(4).default([])
}).superRefine((value, ctx) => {
  if (["BRANCH", "CLASS_SECTION", "STUDENT", "STAFF", "CUSTOM"].includes(value.ruleType) && value.targetIds.length === 0) {
    ctx.addIssue({ code: "custom", path: ["targetIds"], message: "Select at least one target." });
  }
  if (value.ruleType === "ROLE" && value.roleCodes.length === 0) {
    ctx.addIssue({ code: "custom", path: ["roleCodes"], message: "Select at least one role." });
  }
});

const communicationContentSchema = z.object({
  title: z.string().trim().min(5).max(180),
  summary: z.string().trim().max(500).optional(),
  content: z.string().trim().min(1).max(20_000),
  languageCode: z.string().trim().min(2).max(12).default("en")
});

export const createSchoolCastCommunicationSchema = communicationContentSchema.extend({
  branchId: idSchema.optional(),
  academicYearId: idSchema.optional(),
  type: schoolCastCommunicationTypeSchema,
  category: shortText,
  priority: schoolCastPrioritySchema.default("NORMAL"),
  validFrom: z.string().datetime({ offset: true }).optional(),
  validUntil: z.string().datetime({ offset: true }).optional(),
  acknowledgementRequired: z.boolean().default(false),
  audienceRules: z.array(schoolCastAudienceRuleSchema).min(1).max(50),
  channels: z.array(schoolCastChannelSchema).min(1).max(3)
}).superRefine((value, ctx) => {
  if (value.validFrom && value.validUntil && new Date(value.validUntil) <= new Date(value.validFrom)) {
    ctx.addIssue({ code: "custom", path: ["validUntil"], message: "End date must be after the start date." });
  }
  if (value.priority === "EMERGENCY" && value.type !== "EMERGENCY") {
    ctx.addIssue({ code: "custom", path: ["type"], message: "Emergency priority requires an emergency communication." });
  }
});

export const updateSchoolCastCommunicationSchema = communicationContentSchema.extend({
  communicationId: idSchema,
  category: shortText.optional(),
  priority: schoolCastPrioritySchema.optional(),
  validFrom: z.string().datetime({ offset: true }).nullable().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  acknowledgementRequired: z.boolean().optional(),
  audienceRules: z.array(schoolCastAudienceRuleSchema).min(1).max(50).optional(),
  channels: z.array(schoolCastChannelSchema).min(1).max(3).optional()
});

export const schoolCastCommunicationIdSchema = z.object({ communicationId: idSchema });
export const submitSchoolCastCommunicationSchema = schoolCastCommunicationIdSchema.extend({
  reason: z.string().trim().max(500).optional()
});
export const decideSchoolCastApprovalSchema = schoolCastCommunicationIdSchema.extend({
  decision: z.enum(["APPROVED", "REJECTED", "RETURNED"]),
  reason: z.string().trim().max(1_000).optional()
}).superRefine((value, ctx) => {
  if (value.decision !== "APPROVED" && !value.reason) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "A reason is required." });
  }
});
export const scheduleSchoolCastCommunicationSchema = schoolCastCommunicationIdSchema.extend({
  scheduledAt: z.string().datetime({ offset: true })
});
export const cancelSchoolCastCommunicationSchema = schoolCastCommunicationIdSchema.extend({
  reason: z.string().trim().min(5).max(1_000)
});
export const archiveSchoolCastCommunicationSchema = schoolCastCommunicationIdSchema.extend({
  reason: z.string().trim().max(1_000).optional()
});

const schoolCastHomeworkBaseSchema = z.object({
  branchId: idSchema,
  academicYearId: idSchema,
  classSectionId: idSchema,
  subjectId: idSchema,
  workType: z.enum(["HOMEWORK", "CLASSWORK"]),
  title: z.string().trim().min(3).max(180),
  instructions: z.string().trim().min(1).max(12_000),
  assignmentDate: dateOnlySchema,
  completionDueAt: z.string().datetime({ offset: true }).optional(),
  teacherRemarks: z.string().trim().max(2_000).optional()
});

function validateHomeworkDates(
  value: { assignmentDate: string; completionDueAt?: string },
  ctx: z.RefinementCtx
) {
  if (value.completionDueAt && new Date(value.completionDueAt) < new Date(`${value.assignmentDate}T00:00:00.000Z`)) {
    ctx.addIssue({ code: "custom", path: ["completionDueAt"], message: "Completion date cannot precede assignment date." });
  }
}

export const createSchoolCastHomeworkSchema = schoolCastHomeworkBaseSchema.superRefine(validateHomeworkDates);

export const updateSchoolCastHomeworkSchema = schoolCastHomeworkBaseSchema.omit({
  branchId: true,
  academicYearId: true,
  classSectionId: true,
  subjectId: true,
  workType: true
}).extend({ homeworkItemId: idSchema }).superRefine(validateHomeworkDates);

export const schoolCastHomeworkIdSchema = z.object({ homeworkItemId: idSchema });
export const cancelSchoolCastHomeworkSchema = schoolCastHomeworkIdSchema.extend({
  reason: z.string().trim().min(5).max(1_000)
});
export const resendSchoolCastHomeworkSchema = schoolCastHomeworkIdSchema.extend({
  reason: z.string().trim().min(5).max(1_000)
});

export const schoolCastInboxActionSchema = z.object({ notificationId: idSchema });
export const schoolCastAcknowledgeSchema = schoolCastInboxActionSchema.extend({
  acknowledgementText: z.string().trim().max(500).optional()
});

export const updateSchoolCastPreferenceSchema = z.object({
  inAppEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
  generalNoticesEnabled: z.boolean(),
  homeworkUpdatesEnabled: z.boolean(),
  attendanceAlertsEnabled: z.boolean(),
  leaveUpdatesEnabled: z.boolean(),
  calendarRemindersEnabled: z.boolean(),
  gradebookUpdatesEnabled: z.boolean(),
  feeUpdatesEnabled: z.boolean()
});

export const updateSchoolCastOwnConsentSchema = z.object({
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  purpose: z.enum(["NOTICE", "HOMEWORK", "ATTENDANCE", "LEAVE", "CALENDAR", "GRADEBOOK", "FEEDESK"]),
  decision: z.enum(["GRANTED", "WITHDRAWN"]),
  noticeVersion: z.string().trim().min(1).max(64)
});
export const processSchoolCastOutboxSchema = z.object({
  limit: z.number().int().min(1).max(100).default(25),
  concurrency: z.number().int().min(1).max(25).default(5),
  workerId: z.string().trim().min(3).max(120),
  leaseSeconds: z.number().int().min(30).max(300).default(60)
});

export const requeueSchoolCastOutboxSchema = z.object({
  outboxId: idSchema,
  reason: z.string().trim().min(10).max(500)
}).strict();
export const requeueSchoolCastWorkerEventSchema = z.object({
  eventId: idSchema,
  kind: z.enum(["DOMAIN_EVENT", "GRADEBOOK_EVENT"]),
  reason: z.string().trim().min(10).max(500)
}).strict();
export const createSchoolCastProviderSchema = z.object({
  institutionId: idSchema.optional(),
  branchId: idSchema.optional(),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  providerCode: z.enum(["RESEND", "META_CLOUD"]),
  mode: z.enum(["DRY_RUN", "TEST"]).default("DRY_RUN"),
  senderDisplayName: z.string().trim().max(120).optional(),
  senderIdentifierMasked: z.string().trim().max(160).optional(),
  senderAddress: z.string().trim().email().optional(),
  phoneNumberId: z.string().trim().regex(/^\d{5,30}$/).optional(),
  apiVersion: z.string().trim().regex(/^v\d{1,3}\.\d{1,3}$/).default("v21.0"),
  secretRef: z.string().trim().regex(/^env:[A-Z][A-Z0-9_]{2,120}$/).optional(),
  webhookSecretRef: z.string().trim().regex(/^env:[A-Z][A-Z0-9_]{2,120}$/).optional(),
  isDefault: z.boolean().default(false)
}).superRefine((value, ctx) => {
  if (value.providerCode === "RESEND" && (!value.senderAddress || value.channel !== "EMAIL")) {
    ctx.addIssue({ code: "custom", path: ["senderAddress"], message: "A verified email sender is required for Resend." });
  }
  if (value.providerCode === "META_CLOUD" && (!value.phoneNumberId || value.channel !== "WHATSAPP")) {
    ctx.addIssue({ code: "custom", path: ["phoneNumberId"], message: "A WhatsApp phone number ID is required for Meta Cloud." });
  }
});

export const schoolCastProviderIdSchema = z.object({ providerConfigId: idSchema });

export const createSchoolCastTemplateSchema = z.object({
  branchId: idSchema.optional(),
  channel: z.enum(["EMAIL", "WHATSAPP"]),
  templateKey: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,119}$/),
  providerTemplateName: z.string().trim().min(2).max(160),
  languageCode: z.string().trim().toLowerCase().regex(/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/).default("en"),
  subject: z.string().trim().max(180).optional(),
  bodyText: z.string().trim().min(3).max(12000),
  variableNames: z.array(z.string().trim().regex(/^[a-z][a-zA-Z0-9]{0,59}$/)).max(50).default([]),
  activate: z.boolean().default(false)
}).strict();

export const updateSchoolCastTemplateSchema = createSchoolCastTemplateSchema.omit({
  branchId: true,
  channel: true,
  templateKey: true,
  providerTemplateName: true
}).extend({
  templateId: idSchema,
  providerTemplateName: z.string().trim().min(2).max(160).optional()
}).strict();

export const schoolCastTemplateIdSchema = z.object({ templateId: idSchema }).strict();

export const updateSchoolCastFeatureSettingsSchema = z.object({
  enabled: z.boolean(),
  inApp: z.boolean(),
  notices: z.boolean(),
  homework: z.boolean(),
  approvals: z.boolean(),
  email: z.boolean(),
  whatsApp: z.boolean(),
  automation: z.boolean(),
  analytics: z.boolean(),
  deliveryMode: z.enum(["DRY_RUN", "TEST", "LIVE"]),
  teacherDirectPublish: z.boolean()
});