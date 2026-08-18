import {
  InAppNotificationCategory,
  InAppNotificationPriority,
  InAppNotificationTemplateStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { isValidTimeZone } from "@/lib/dates/time-zone";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import {
  normalizeNotificationDeepLink,
  sanitizeNotificationText
} from "@/modules/notifications/in-app-policy";
import {
  createInAppNotificationTemplateSchema,
  notificationReportQuerySchema,
  notificationSettingQuerySchema,
  notificationTemplateIdSchema,
  updateInAppNotificationSettingSchema,
  updateInAppNotificationTemplateSchema
} from "@/modules/notifications/schemas/in-app-notification.schema";

type DbClient = PrismaClient | Prisma.TransactionClient;
type NotificationScope =
  | { type: "TENANT" }
  | { type: "INSTITUTION"; institutionId: string }
  | { type: "BRANCH"; branchId: string };

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function aggregateCount(row: { _count?: true | { _all?: number } }) {
  return typeof row._count === "object" ? row._count._all ?? 0 : 0;
}

function templateScopeKey(scope: Exclude<NotificationScope, { type: "BRANCH" }>) {
  return scope.type === "TENANT" ? "TENANT" : `INSTITUTION:${scope.institutionId}`;
}

async function resolveManagementScope(
  ctx: TenantContext,
  scope: NotificationScope,
  client: DbClient = db
) {
  if (scope.type === "BRANCH") {
    if (!ctx.accessibleBranchIds.includes(scope.branchId)) {
      throw new AppError("FORBIDDEN_BRANCH_ACCESS", "FORBIDDEN_BRANCH_ACCESS", 403);
    }
    const branch = await client.branch.findFirst({
      where: { id: scope.branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, institutionId: true }
    });
    if (!branch || (ctx.institutionId && branch.institutionId !== ctx.institutionId)) {
      throw notFound("NOTIFICATION_SCOPE_NOT_FOUND");
    }
    return {
      scopeKey: `BRANCH:${branch.id}`,
      institutionId: branch.institutionId,
      branchId: branch.id
    };
  }

  if (scope.type === "INSTITUTION") {
    if (ctx.institutionId && ctx.institutionId !== scope.institutionId) {
      throw notFound("NOTIFICATION_SCOPE_NOT_FOUND");
    }
    const institution = await client.institution.findFirst({
      where: { id: scope.institutionId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        branches: { where: { status: "ACTIVE" }, select: { id: true } }
      }
    });
    if (!institution || institution.branches.some((branch) => !ctx.accessibleBranchIds.includes(branch.id))) {
      throw notFound("NOTIFICATION_SCOPE_NOT_FOUND");
    }
    return {
      scopeKey: `INSTITUTION:${institution.id}`,
      institutionId: institution.id,
      branchId: null
    };
  }

  const activeBranches = await client.branch.findMany({
    where: { tenantId: ctx.tenantId, status: "ACTIVE" },
    select: { id: true }
  });
  if (activeBranches.some((branch) => !ctx.accessibleBranchIds.includes(branch.id))) {
    throw new AppError("FORBIDDEN_NOTIFICATION_TENANT_SCOPE", "FORBIDDEN_NOTIFICATION_TENANT_SCOPE", 403);
  }
  return { scopeKey: "TENANT", institutionId: null, branchId: null };
}

function validateTemplateContent(input: {
  titleTemplate: string;
  bodyTemplate: string;
  deepLinkTemplate: string | null;
  requiredVariables: string[];
}) {
  const required = new Set(input.requiredVariables);
  const placeholders = new Set<string>();
  const collect = (value: string) => {
    const replaced = value.replace(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g, (_match, variable: string) => {
      placeholders.add(variable);
      return "value";
    });
    if (replaced.includes("{{") || replaced.includes("}}")) {
      throw new AppError("INVALID_NOTIFICATION_TEMPLATE", "INVALID_NOTIFICATION_TEMPLATE", 400);
    }
    return replaced;
  };

  const titleTemplate = sanitizeNotificationText(input.titleTemplate, 160);
  const bodyTemplate = sanitizeNotificationText(input.bodyTemplate, 500);
  collect(titleTemplate);
  collect(bodyTemplate);
  if (input.deepLinkTemplate) {
    normalizeNotificationDeepLink(collect(input.deepLinkTemplate));
  }
  const deepLinkTemplate = input.deepLinkTemplate?.trim() || null;

  for (const variable of placeholders) {
    if (!required.has(variable)) {
      throw new AppError("INVALID_NOTIFICATION_TEMPLATE_VARIABLES", "INVALID_NOTIFICATION_TEMPLATE_VARIABLES", 400);
    }
  }

  return { titleTemplate, bodyTemplate, deepLinkTemplate };
}

export async function listInAppNotificationTemplates(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "notifications.template.view", branchId: ctx.activeBranchId });
  return db.inAppNotificationTemplate.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        { institutionId: null },
        ...(ctx.institutionId ? [{ institutionId: ctx.institutionId }] : [])
      ]
    },
    select: {
      id: true,
      institutionId: true,
      scopeKey: true,
      templateKey: true,
      name: true,
      sourceModule: true,
      category: true,
      defaultPriority: true,
      titleTemplate: true,
      bodyTemplate: true,
      deepLinkTemplate: true,
      requiredVariablesJson: true,
      mandatory: true,
      requiresAcknowledgement: true,
      status: true,
      version: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ templateKey: "asc" }, { version: "desc" }],
    take: 200
  });
}

export async function createInAppNotificationTemplate(
  ctx: TenantContext,
  rawInput: unknown
) {
  await requirePermission({ ctx, permission: "notifications.template.manage", branchId: ctx.activeBranchId });
  const input = createInAppNotificationTemplateSchema.parse(rawInput);

  const scope = await resolveManagementScope(ctx, input.scope);
  const scopeKey = templateScopeKey(input.scope);
  const content = validateTemplateContent(input);

  const existing = await db.inAppNotificationTemplate.findFirst({
    where: { tenantId: ctx.tenantId, scopeKey, templateKey: input.templateKey },
    select: { id: true }
  });
  if (existing) {
    throw new AppError("NOTIFICATION_TEMPLATE_ALREADY_EXISTS", "NOTIFICATION_TEMPLATE_ALREADY_EXISTS", 409);
  }

  return db.$transaction(async (tx) => {
    const template = await tx.inAppNotificationTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        scopeKey,
        templateKey: input.templateKey,
        name: sanitizeNotificationText(input.name, 160),
        sourceModule: input.sourceModule,
        category: input.category,
        defaultPriority: input.defaultPriority,
        ...content,
        requiredVariablesJson: jsonValue(input.requiredVariables),
        mandatory: input.mandatory,
        requiresAcknowledgement: input.requiresAcknowledgement,
        status: input.status,
        version: 1,
        createdById: ctx.userId
      },
      select: { id: true, templateKey: true, version: true }
    });
    await writeAuditLog({
      ctx,
      action: "notifications.in_app.template_created",
      entityType: "InAppNotificationTemplate",
      entityId: template.id,
      metadata: { scopeKey, templateKey: template.templateKey, version: template.version }
    }, tx);
    return template;
  });
}

export async function updateInAppNotificationTemplate(
  ctx: TenantContext,
  templateId: string,
  rawInput: unknown
) {
  await requirePermission({ ctx, permission: "notifications.template.manage", branchId: ctx.activeBranchId });
  notificationTemplateIdSchema.parse({ templateId });
  const input = updateInAppNotificationTemplateSchema.parse(rawInput);
  const content = validateTemplateContent(input);

  return db.$transaction(async (tx) => {
    const current = await tx.inAppNotificationTemplate.findFirst({
      where: { id: templateId, tenantId: ctx.tenantId },
      select: {
        id: true,
        institutionId: true,
        scopeKey: true,
        templateKey: true,
        version: true
      }
    });
    if (!current || (ctx.institutionId && current.institutionId && current.institutionId !== ctx.institutionId)) {
      throw notFound("NOTIFICATION_TEMPLATE_NOT_FOUND");
    }

    await tx.inAppNotificationTemplate.updateMany({
      where: {
        tenantId: ctx.tenantId,
        scopeKey: current.scopeKey,
        templateKey: current.templateKey,
        status: InAppNotificationTemplateStatus.ACTIVE
      },
      data: { status: InAppNotificationTemplateStatus.INACTIVE }
    });
    const nextVersion = await tx.inAppNotificationTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: current.institutionId,
        scopeKey: current.scopeKey,
        templateKey: current.templateKey,
        name: sanitizeNotificationText(input.name, 160),
        sourceModule: input.sourceModule,
        category: input.category,
        defaultPriority: input.defaultPriority,
        ...content,
        requiredVariablesJson: jsonValue(input.requiredVariables),
        mandatory: input.mandatory,
        requiresAcknowledgement: input.requiresAcknowledgement,
        status: input.status,
        version: current.version + 1,
        createdById: ctx.userId
      },
      select: { id: true, templateKey: true, version: true }
    });
    await writeAuditLog({
      ctx,
      action: "notifications.in_app.template_versioned",
      entityType: "InAppNotificationTemplate",
      entityId: nextVersion.id,
      before: { templateId: current.id, version: current.version },
      after: { templateId: nextVersion.id, version: nextVersion.version },
      metadata: { scopeKey: current.scopeKey, templateKey: current.templateKey }
    }, tx);
    return nextVersion;
  });
}

function defaultSetting(scope: Awaited<ReturnType<typeof resolveManagementScope>>, timeZone: string) {
  return {
    id: null,
    ...scope,
    retentionDays: 365,
    defaultPriority: InAppNotificationPriority.NORMAL,
    quietHoursStart: null,
    quietHoursEnd: null,
    timeZone,
    mandatoryCategories: [
      InAppNotificationCategory.ACCOUNT,
      InAppNotificationCategory.SECURITY,
      InAppNotificationCategory.SYSTEM
    ],
    featureEnabled: true,
    createdAt: null,
    updatedAt: null
  };
}

export async function getInAppNotificationSetting(ctx: TenantContext, rawQuery: unknown) {
  await requirePermission({ ctx, permission: "notifications.settings.view", branchId: ctx.activeBranchId });
  const query = notificationSettingQuerySchema.parse(rawQuery);
  const scope: NotificationScope = query.scopeType === "TENANT"
    ? { type: "TENANT" }
    : query.scopeType === "INSTITUTION"
      ? { type: "INSTITUTION", institutionId: query.scopeId! }
      : { type: "BRANCH", branchId: query.scopeId! };
  const resolved = await resolveManagementScope(ctx, scope);
  const setting = await db.inAppNotificationSetting.findUnique({
    where: { tenantId_scopeKey: { tenantId: ctx.tenantId, scopeKey: resolved.scopeKey } }
  });
  if (!setting) return defaultSetting(resolved, ctx.timeZone ?? "Asia/Kolkata");
  return {
    ...setting,
    mandatoryCategories: Array.isArray(setting.mandatoryCategoriesJson)
      ? setting.mandatoryCategoriesJson
      : []
  };
}

export async function updateInAppNotificationSetting(
  ctx: TenantContext,
  rawInput: unknown
) {
  await requirePermission({ ctx, permission: "notifications.settings.manage", branchId: ctx.activeBranchId });
  const input = updateInAppNotificationSettingSchema.parse(rawInput);
  if (!isValidTimeZone(input.timeZone)) {
    throw new AppError("INVALID_NOTIFICATION_TIME_ZONE", "INVALID_NOTIFICATION_TIME_ZONE", 400);
  }
  const scope = await resolveManagementScope(ctx, input.scope);

  return db.$transaction(async (tx) => {
    const before = await tx.inAppNotificationSetting.findUnique({
      where: { tenantId_scopeKey: { tenantId: ctx.tenantId, scopeKey: scope.scopeKey } }
    });
    const setting = await tx.inAppNotificationSetting.upsert({
      where: { tenantId_scopeKey: { tenantId: ctx.tenantId, scopeKey: scope.scopeKey } },
      create: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        scopeKey: scope.scopeKey,
        retentionDays: input.retentionDays,
        defaultPriority: input.defaultPriority,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        timeZone: input.timeZone,
        mandatoryCategoriesJson: jsonValue(input.mandatoryCategories),
        featureEnabled: input.featureEnabled
      },
      update: {
        retentionDays: input.retentionDays,
        defaultPriority: input.defaultPriority,
        quietHoursStart: input.quietHoursStart,
        quietHoursEnd: input.quietHoursEnd,
        timeZone: input.timeZone,
        mandatoryCategoriesJson: jsonValue(input.mandatoryCategories),
        featureEnabled: input.featureEnabled
      }
    });
    await writeAuditLog({
      ctx,
      action: "notifications.in_app.settings_updated",
      entityType: "InAppNotificationSetting",
      entityId: setting.id,
      branchId: scope.branchId,
      before: before ? {
        retentionDays: before.retentionDays,
        defaultPriority: before.defaultPriority,
        timeZone: before.timeZone,
        featureEnabled: before.featureEnabled
      } : null,
      after: {
        retentionDays: setting.retentionDays,
        defaultPriority: setting.defaultPriority,
        timeZone: setting.timeZone,
        featureEnabled: setting.featureEnabled
      },
      metadata: { scopeKey: scope.scopeKey, mandatoryCategories: input.mandatoryCategories }
    }, tx);
    return setting;
  });
}

export async function getInAppNotificationReport(ctx: TenantContext, rawQuery: unknown) {
  await requirePermission({ ctx, permission: "notifications.report.view", branchId: ctx.activeBranchId });
  const query = notificationReportQuerySchema.parse(rawQuery);
  const to = query.to ?? new Date();
  const from = query.from ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const createdAt = { gte: from, lt: to };
  const notificationScope: Prisma.InAppNotificationWhereInput = ctx.institutionId
    ? { OR: [{ institutionId: ctx.institutionId }, { institutionId: null }] }
    : {};
  const recipientScope: Prisma.InAppNotificationRecipientWhereInput = ctx.institutionId
    ? { notification: notificationScope }
    : {};
  const outboxScope: Prisma.InAppNotificationOutboxWhereInput = ctx.institutionId
    ? {
        OR: [
          { payloadJson: { path: ["institutionId"], equals: ctx.institutionId } },
          { payloadJson: { path: ["institutionId"], equals: Prisma.JsonNull } }
        ]
      }
    : {};

  const [notifications, outbox, recipientCount, unreadCount, acknowledgementPending, archivedCount, dismissedCount] = await db.$transaction([
    db.inAppNotification.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenantId, createdAt, ...notificationScope },
      orderBy: { status: "asc" },
      _count: { _all: true }
    }),
    db.inAppNotificationOutbox.groupBy({
      by: ["status"],
      where: { tenantId: ctx.tenantId, createdAt, ...outboxScope },
      orderBy: { status: "asc" },
      _count: { _all: true }
    }),
    db.inAppNotificationRecipient.count({ where: { tenantId: ctx.tenantId, createdAt, ...recipientScope } }),
    db.inAppNotificationRecipient.count({ where: { tenantId: ctx.tenantId, createdAt, readAt: null, ...recipientScope } }),
    db.inAppNotificationRecipient.count({
      where: {
        tenantId: ctx.tenantId,
        createdAt,
        acknowledgedAt: null,
        notification: { ...notificationScope, requiresAcknowledgement: true }
      }
    }),
    db.inAppNotificationRecipient.count({ where: { tenantId: ctx.tenantId, createdAt, archivedAt: { not: null }, ...recipientScope } }),
    db.inAppNotificationRecipient.count({ where: { tenantId: ctx.tenantId, createdAt, dismissedAt: { not: null }, ...recipientScope } })
  ]);

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    notificationStatus: Object.fromEntries(notifications.map((row) => [row.status, aggregateCount(row)])),
    outboxStatus: Object.fromEntries(outbox.map((row) => [row.status, aggregateCount(row)])),
    recipients: {
      total: recipientCount,
      unread: unreadCount,
      acknowledgementPending,
      archived: archivedCount,
      dismissed: dismissedCount
    }
  };
}