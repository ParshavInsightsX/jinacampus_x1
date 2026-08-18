import {
  InAppNotificationAudienceType,
  InAppNotificationCategory,
  InAppNotificationDigestMode,
  InAppNotificationPriority,
  InAppNotificationSourceModule,
  InAppNotificationTemplateStatus
} from "@prisma/client";
import { z } from "zod";

const uuid = z.string().uuid();

const internalAudienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal(InAppNotificationAudienceType.USER), userId: uuid }).strict(),
  z.object({
    type: z.literal(InAppNotificationAudienceType.USERS),
    userIds: z.array(uuid).min(1).max(5000)
  }).strict(),
  z.object({
    type: z.literal(InAppNotificationAudienceType.ROLE),
    roleCode: z.string().trim().min(1).max(80)
  }).strict(),
  z.object({ type: z.literal(InAppNotificationAudienceType.TENANT) }).strict(),
  z.object({
    type: z.literal(InAppNotificationAudienceType.INSTITUTION),
    institutionId: uuid
  }).strict(),
  z.object({
    type: z.literal(InAppNotificationAudienceType.BRANCH),
    branchId: uuid
  }).strict()
]);

const publishInAppNotificationObjectSchema = z.object({
  eventId: z.string().trim().min(1).max(160),
  eventType: z.string().trim().min(1).max(160).regex(/^[a-z0-9_.-]+$/i),
  sourceModule: z.nativeEnum(InAppNotificationSourceModule),
  sourceEntityType: z.string().trim().min(1).max(120).optional(),
  sourceEntityId: z.string().trim().min(1).max(160).optional(),
  category: z.nativeEnum(InAppNotificationCategory),
  priority: z.nativeEnum(InAppNotificationPriority).default(InAppNotificationPriority.NORMAL),
  title: z.string().trim().min(1).max(160),
  bodyPreview: z.string().trim().min(1).max(500),
  audience: internalAudienceSchema,
  deepLink: z.string().trim().max(500).optional(),
  scheduledAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  mandatory: z.boolean().default(false),
  requiresAcknowledgement: z.boolean().default(false),
  variables: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  safeMetadata: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  idempotencyKey: z.string().trim().min(1).max(240)
}).strict();

function validateSchedule(
  value: { scheduledAt?: Date; expiresAt?: Date },
  ctx: z.RefinementCtx
) {
  if (value.scheduledAt && value.expiresAt && value.expiresAt <= value.scheduledAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["expiresAt"],
      message: "Expiry must be later than the scheduled time."
    });
  }
}

export const publishInAppNotificationSchema = publishInAppNotificationObjectSchema.superRefine(validateSchedule);

export const inAppNotificationOutboxPayloadSchema = publishInAppNotificationObjectSchema.extend({
  tenantId: uuid,
  institutionId: uuid.nullable(),
  branchId: uuid.nullable(),
  academicYearId: uuid.nullable(),
  createdById: uuid.nullable(),
  templateId: uuid.nullable()
}).strict().superRefine(validateSchedule);

export const templatedInAppNotificationSchema = z.object({
  templateKey: z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_.-]*$/),
  eventId: z.string().trim().min(1).max(160),
  eventType: z.string().trim().min(1).max(160).regex(/^[a-z0-9_.-]+$/i),
  sourceEntityType: z.string().trim().min(1).max(120).optional(),
  sourceEntityId: z.string().trim().min(1).max(160).optional(),
  audience: internalAudienceSchema,
  scheduledAt: z.coerce.date().optional(),
  expiresAt: z.coerce.date().optional(),
  variables: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])),
  safeMetadata: z.record(z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).optional(),
  idempotencyKey: z.string().trim().min(1).max(240)
}).strict().superRefine(validateSchedule);
export const notificationListQuerySchema = z.object({
  sourceModule: z.nativeEnum(InAppNotificationSourceModule).optional(),
  category: z.nativeEnum(InAppNotificationCategory).optional(),
  priority: z.nativeEnum(InAppNotificationPriority).optional(),
  state: z.enum(["all", "unread", "read", "acknowledgement", "archived"]).default("all"),
  search: z.string().trim().max(100).optional(),
  cursorCreatedAt: z.coerce.date().optional(),
  cursorId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.cursorCreatedAt) !== Boolean(value.cursorId)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["cursorId"],
      message: "Both cursor fields are required."
    });
  }
});

export const notificationIdSchema = z.object({ notificationId: uuid }).strict();

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const updateInAppNotificationPreferencesSchema = z.object({
  preferences: z.array(z.object({
    category: z.nativeEnum(InAppNotificationCategory),
    enabled: z.boolean(),
    minimumPriority: z.nativeEnum(InAppNotificationPriority).nullable(),
    quietHoursEnabled: z.boolean(),
    quietStart: timeSchema.nullable(),
    quietEnd: timeSchema.nullable(),
    timeZone: z.string().trim().min(1).max(80),
    digestMode: z.nativeEnum(InAppNotificationDigestMode)
  }).strict()).max(20)
}).strict().superRefine((value, ctx) => {
  const categories = value.preferences.map((preference) => preference.category);
  if (new Set(categories).size !== categories.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["preferences"],
      message: "Each notification category can appear only once."
    });
  }
});

const notificationScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TENANT") }).strict(),
  z.object({ type: z.literal("INSTITUTION"), institutionId: uuid }).strict(),
  z.object({ type: z.literal("BRANCH"), branchId: uuid }).strict()
]);

const templateScopeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TENANT") }).strict(),
  z.object({ type: z.literal("INSTITUTION"), institutionId: uuid }).strict()
]);

const templateKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9_.-]*$/);
const templateVariablesSchema = z.array(
  z.string().trim().min(1).max(80).regex(/^[a-z][a-zA-Z0-9_]*$/)
).max(50).refine((values) => new Set(values).size === values.length, {
  message: "Template variables must be unique."
});

export const createInAppNotificationTemplateSchema = z.object({
  scope: templateScopeSchema,
  templateKey: templateKeySchema,
  name: z.string().trim().min(1).max(160),
  sourceModule: z.nativeEnum(InAppNotificationSourceModule),
  category: z.nativeEnum(InAppNotificationCategory),
  defaultPriority: z.nativeEnum(InAppNotificationPriority),
  titleTemplate: z.string().trim().min(1).max(160),
  bodyTemplate: z.string().trim().min(1).max(500),
  deepLinkTemplate: z.string().trim().max(500).nullable(),
  requiredVariables: templateVariablesSchema,
  mandatory: z.boolean(),
  requiresAcknowledgement: z.boolean(),
  status: z.nativeEnum(InAppNotificationTemplateStatus).default(InAppNotificationTemplateStatus.ACTIVE)
}).strict();

export const updateInAppNotificationTemplateSchema = createInAppNotificationTemplateSchema.omit({
  scope: true,
  templateKey: true
}).strict();

export const notificationTemplateIdSchema = z.object({ templateId: uuid }).strict();

export const updateInAppNotificationSettingSchema = z.object({
  scope: notificationScopeSchema,
  retentionDays: z.number().int().min(30).max(3650),
  defaultPriority: z.nativeEnum(InAppNotificationPriority),
  quietHoursStart: timeSchema.nullable(),
  quietHoursEnd: timeSchema.nullable(),
  timeZone: z.string().trim().min(1).max(80),
  mandatoryCategories: z.array(z.nativeEnum(InAppNotificationCategory)).max(20)
    .refine((values) => new Set(values).size === values.length, { message: "Mandatory categories must be unique." }),
  featureEnabled: z.boolean()
}).strict().superRefine((value, ctx) => {
  if (Boolean(value.quietHoursStart) !== Boolean(value.quietHoursEnd)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["quietHoursEnd"],
      message: "Both quiet-hours values are required."
    });
  }
});

export const notificationSettingQuerySchema = z.object({
  scopeType: z.enum(["TENANT", "INSTITUTION", "BRANCH"]).default("TENANT"),
  scopeId: uuid.optional()
}).strict().superRefine((value, ctx) => {
  if (value.scopeType !== "TENANT" && !value.scopeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "A scope ID is required." });
  }
  if (value.scopeType === "TENANT" && value.scopeId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["scopeId"], message: "Tenant scope does not accept a scope ID." });
  }
});

export const notificationReportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
}).strict().superRefine((value, ctx) => {
  if (value.from && value.to && value.to <= value.from) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "The report end must be after its start." });
  }
  if (value.from && value.to && value.to.getTime() - value.from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "Reports are limited to 366 days." });
  }
});

export const notificationOutboxRetrySchema = z.object({ outboxId: uuid }).strict();

export type PublishInAppNotificationInput = z.input<typeof publishInAppNotificationSchema>;
export type ParsedPublishInAppNotification = z.output<typeof publishInAppNotificationSchema>;
export type NotificationListQuery = z.output<typeof notificationListQuerySchema>;
export type CreateInAppNotificationTemplateInput = z.input<typeof createInAppNotificationTemplateSchema>;
export type UpdateInAppNotificationTemplateInput = z.input<typeof updateInAppNotificationTemplateSchema>;
export type UpdateInAppNotificationSettingInput = z.input<typeof updateInAppNotificationSettingSchema>;