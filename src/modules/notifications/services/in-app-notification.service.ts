import { randomUUID } from "node:crypto";

import {
  InAppNotificationAudienceType,
  InAppNotificationOutboxStatus,
  InAppNotificationRecipientStatus,
  InAppNotificationStatus,
  Prisma,
  type PrismaClient
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import {
  getEffectiveInAppNotificationSetting,
  getInAppNotificationFeatureState,
  normalizeNotificationDeepLink,
  priorityMeetsMinimum,
  sanitizeNotificationFailure,
  sanitizeNotificationText,
  sourceModuleIsEnabled
} from "@/modules/notifications/in-app-policy";
import {
  inAppNotificationOutboxPayloadSchema,
  notificationIdSchema,
  notificationOutboxRetrySchema,
  publishInAppNotificationSchema,
  templatedInAppNotificationSchema,
  type ParsedPublishInAppNotification,
  type PublishInAppNotificationInput
} from "@/modules/notifications/schemas/in-app-notification.schema";

type DbClient = PrismaClient | Prisma.TransactionClient;

const MAX_ATTEMPTS = 5;
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000;
const RECIPIENT_WRITE_BATCH_SIZE = 500;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000, 3_600_000] as const;
const PERMANENT_FAILURE_CODES = new Set([
  "NOTIFICATION_OUTBOX_TENANT_MISMATCH",
  "NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND",
  "NOTIFICATION_AUDIENCE_ROLE_NOT_FOUND",
  "NOTIFICATION_ACADEMIC_YEAR_SCOPE_NOT_FOUND"
]);

export type QueueInAppNotificationResult =
  | { status: "queued"; outboxId: string }
  | { status: "alreadyQueued"; outboxId: string }
  | { status: "skipped"; reason: "FEATURE_DISABLED" | "SOURCE_MODULE_DISABLED" | "SCOPE_DISABLED" };

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function nextRetryAt(attemptCount: number, now = new Date()) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(now.getTime() + delay);
}

async function resolvedScope(
  ctx: TenantContext,
  input: ParsedPublishInAppNotification,
  client: DbClient
) {
  const audience = input.audience;
  const broadAudience = audience.type === InAppNotificationAudienceType.TENANT ||
    audience.type === InAppNotificationAudienceType.INSTITUTION;
  const branchId = audience.type === InAppNotificationAudienceType.BRANCH
    ? audience.branchId
    : broadAudience
      ? null
      : ctx.activeBranchId;
  let institutionId = audience.type === InAppNotificationAudienceType.INSTITUTION
    ? audience.institutionId
    : audience.type === InAppNotificationAudienceType.TENANT
      ? null
      : ctx.institutionId ?? null;

  if (branchId) {
    if (!ctx.accessibleBranchIds.includes(branchId)) throw new Error("FORBIDDEN_BRANCH_ACCESS");
    const branch = await client.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { institutionId: true }
    });
    if (!branch) throw new Error("NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND");
    if (ctx.institutionId && branch.institutionId !== ctx.institutionId) {
      throw new Error("FORBIDDEN_NOTIFICATION_SCOPE");
    }
    institutionId = branch.institutionId;
  } else if (institutionId) {
    const institution = await client.institution.findFirst({
      where: { id: institutionId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!institution) throw new Error("NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND");
    if (ctx.institutionId && institution.id !== ctx.institutionId) {
      throw new Error("FORBIDDEN_NOTIFICATION_SCOPE");
    }
  }

  const academicYearId = broadAudience ? null : ctx.activeAcademicYearId;
  if (academicYearId) {
    const academicYear = await client.academicYear.findFirst({
      where: { id: academicYearId, tenantId: ctx.tenantId },
      select: { institutionId: true }
    });
    if (!academicYear || (institutionId && academicYear.institutionId !== institutionId)) {
      throw new Error("NOTIFICATION_ACADEMIC_YEAR_SCOPE_NOT_FOUND");
    }
    institutionId ??= academicYear.institutionId;
  }

  return {
    institutionId,
    branchId,
    academicYearId,
    createdById: ctx.userId
  };
}

export async function queueInAppNotificationEvent(
  ctx: TenantContext,
  rawInput: PublishInAppNotificationInput,
  client: DbClient = db,
  options: { templateId?: string } = {}
): Promise<QueueInAppNotificationResult> {
  const input = publishInAppNotificationSchema.parse(rawInput);
  const featureState = await getInAppNotificationFeatureState(ctx.tenantId, client);
  if (!featureState.enabled) return { status: "skipped", reason: "FEATURE_DISABLED" };
  if (!sourceModuleIsEnabled(input.sourceModule, featureState)) {
    return { status: "skipped", reason: "SOURCE_MODULE_DISABLED" };
  }

  const now = new Date();
  if (input.scheduledAt && input.scheduledAt > now && !featureState.schedulingEnabled) {
    throw new Error("NOTIFICATION_SCHEDULING_DISABLED");
  }

  const scope = await resolvedScope(ctx, input, client);
  const setting = await getEffectiveInAppNotificationSetting(ctx.tenantId, scope, client);
  if (!setting.featureEnabled) return { status: "skipped", reason: "SCOPE_DISABLED" };
  const priorityProvided = typeof rawInput === "object" && rawInput !== null && "priority" in rawInput;
  const normalized = {
    ...input,
    priority: priorityProvided ? input.priority : setting.defaultPriority,
    mandatory: input.mandatory || setting.mandatoryCategories.has(input.category),
    title: sanitizeNotificationText(input.title, 160),
    bodyPreview: sanitizeNotificationText(input.bodyPreview, 500),
    deepLink: normalizeNotificationDeepLink(input.deepLink),
    ...scope,
    tenantId: ctx.tenantId,
    templateId: options.templateId ?? null
  };

  const existing = await client.inAppNotificationOutbox.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: ctx.tenantId,
        idempotencyKey: input.idempotencyKey
      }
    },
    select: { id: true }
  });
  if (existing) return { status: "alreadyQueued", outboxId: existing.id };

  try {
    const outbox = await client.inAppNotificationOutbox.create({
      data: {
        tenantId: ctx.tenantId,
        eventId: input.eventId,
        eventType: input.eventType,
        sourceModule: input.sourceModule,
        payloadJson: jsonValue(normalized),
        idempotencyKey: input.idempotencyKey,
        nextAttemptAt: input.scheduledAt && input.scheduledAt > now ? input.scheduledAt : now
      },
      select: { id: true }
    });

    await writeAuditLog({
      ctx,
      action: "notifications.in_app.queued",
      entityType: "InAppNotificationOutbox",
      entityId: outbox.id,
      branchId: normalized.branchId,
      academicYearId: normalized.academicYearId,
      metadata: {
        eventType: input.eventType,
        sourceModule: input.sourceModule,
        category: input.category,
        priority: normalized.priority,
        scheduled: Boolean(input.scheduledAt && input.scheduledAt > now),
        mandatory: normalized.mandatory,
        requiresAcknowledgement: input.requiresAcknowledgement
      }
    }, client);

    return { status: "queued", outboxId: outbox.id };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await client.inAppNotificationOutbox.findUnique({
        where: {
          tenantId_idempotencyKey: {
            tenantId: ctx.tenantId,
            idempotencyKey: input.idempotencyKey
          }
        },
        select: { id: true }
      });
      if (duplicate) return { status: "alreadyQueued", outboxId: duplicate.id };
    }
    throw error;
  }
}

function templateVariables(value: Prisma.JsonValue | null) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function renderNotificationTemplate(
  template: string,
  variables: Record<string, string | number | boolean | null>,
  encodeValues = false
) {
  return template.replace(/{{\s*([a-z][a-zA-Z0-9_]*)\s*}}/g, (_match, variable: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, variable)) {
      throw new AppError("NOTIFICATION_TEMPLATE_VARIABLE_MISSING", "NOTIFICATION_TEMPLATE_VARIABLE_MISSING", 400);
    }
    const rawValue = variables[variable];
    const value = rawValue === null ? "" : String(rawValue);
    return encodeValues ? encodeURIComponent(value) : value;
  });
}

export async function queueTemplatedInAppNotificationEvent(
  ctx: TenantContext,
  rawInput: unknown,
  client: DbClient = db
) {
  const input = templatedInAppNotificationSchema.parse(rawInput);
  const scopeKeys = [
    ...(ctx.institutionId ? [`INSTITUTION:${ctx.institutionId}`] : []),
    "TENANT"
  ];
  const templates = await client.inAppNotificationTemplate.findMany({
    where: {
      tenantId: ctx.tenantId,
      templateKey: input.templateKey,
      scopeKey: { in: scopeKeys },
      status: "ACTIVE"
    },
    orderBy: { version: "desc" }
  });
  const template = scopeKeys
    .map((scopeKey) => templates.find((candidate) => candidate.scopeKey === scopeKey))
    .find(Boolean);
  if (!template) throw notFound("NOTIFICATION_TEMPLATE_NOT_FOUND");

  const requiredVariables = templateVariables(template.requiredVariablesJson);
  for (const variable of requiredVariables) {
    if (!Object.prototype.hasOwnProperty.call(input.variables, variable)) {
      throw new AppError("NOTIFICATION_TEMPLATE_VARIABLE_MISSING", "NOTIFICATION_TEMPLATE_VARIABLE_MISSING", 400);
    }
  }

  return queueInAppNotificationEvent(ctx, {
    eventId: input.eventId,
    eventType: input.eventType,
    sourceModule: template.sourceModule,
    sourceEntityType: input.sourceEntityType,
    sourceEntityId: input.sourceEntityId,
    category: template.category,
    priority: template.defaultPriority,
    title: renderNotificationTemplate(template.titleTemplate, input.variables),
    bodyPreview: renderNotificationTemplate(template.bodyTemplate, input.variables),
    audience: input.audience,
    deepLink: template.deepLinkTemplate
      ? renderNotificationTemplate(template.deepLinkTemplate, input.variables, true)
      : undefined,
    scheduledAt: input.scheduledAt,
    expiresAt: input.expiresAt,
    mandatory: template.mandatory,
    requiresAcknowledgement: template.requiresAcknowledgement,
    variables: input.variables,
    safeMetadata: input.safeMetadata,
    idempotencyKey: input.idempotencyKey
  }, client, { templateId: template.id });
}
type ClaimedOutbox = Awaited<ReturnType<typeof claimNextOutbox>>;

async function claimNextOutbox(tenantId?: string) {
  return db.$transaction(async (tx) => {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);
    const candidate = await tx.inAppNotificationOutbox.findFirst({
      where: {
        tenantId,
        status: { in: [InAppNotificationOutboxStatus.PENDING, InAppNotificationOutboxStatus.FAILED] },
        attemptCount: { lt: MAX_ATTEMPTS },
        nextAttemptAt: { lte: now },
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }]
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        tenantId: true,
        status: true
      }
    });
    if (!candidate) return null;

    const lockToken = randomUUID();
    const claimed = await tx.inAppNotificationOutbox.updateMany({
      where: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        status: candidate.status,
        OR: [{ lockedAt: null }, { lockedAt: { lt: staleBefore } }]
      },
      data: {
        status: InAppNotificationOutboxStatus.PROCESSING,
        lockedAt: now,
        lockToken,
        attemptCount: { increment: 1 }
      }
    });
    if (claimed.count !== 1) return null;

    return tx.inAppNotificationOutbox.findFirst({
      where: { id: candidate.id, tenantId: candidate.tenantId, lockToken }
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

function activeAssignmentFilter(now: Date): Prisma.UserRoleAssignmentWhereInput {
  return {
    isActive: true,
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
    ]
  };
}

function assignmentScopeFilter(
  payload: ReturnType<typeof inAppNotificationOutboxPayloadSchema.parse>
): Prisma.UserRoleAssignmentWhereInput[] {
  const scopes: Prisma.UserRoleAssignmentWhereInput[] = [
    { scopeType: "TENANT", scopeId: "TENANT" }
  ];
  if (payload.institutionId) scopes.push({ scopeType: "INSTITUTION", scopeId: payload.institutionId });
  if (payload.branchId) scopes.push({ scopeType: "BRANCH", scopeId: payload.branchId });
  if (payload.academicYearId) scopes.push({ scopeType: "ACADEMIC_YEAR", scopeId: payload.academicYearId });
  return scopes;
}

async function resolveRecipients(
  client: DbClient,
  payload: ReturnType<typeof inAppNotificationOutboxPayloadSchema.parse>
) {
  const now = new Date();
  const audience = payload.audience;
  const assignmentFilter = activeAssignmentFilter(now);
  const roleCode = audience.type === InAppNotificationAudienceType.ROLE ? audience.roleCode : null;

  if (audience.type === InAppNotificationAudienceType.BRANCH) {
    const branch = await client.branch.findFirst({
      where: { id: audience.branchId, tenantId: payload.tenantId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!branch) throw new Error("NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND");
  }
  if (audience.type === InAppNotificationAudienceType.INSTITUTION) {
    const institution = await client.institution.findFirst({
      where: { id: audience.institutionId, tenantId: payload.tenantId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!institution) throw new Error("NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND");
  }

  const userIds = audience.type === InAppNotificationAudienceType.USER
    ? [audience.userId]
    : audience.type === InAppNotificationAudienceType.USERS
      ? audience.userIds
      : null;
  const selectedUserIds = userIds ? [...new Set(userIds)] : null;


  const where: Prisma.UserWhereInput = {
    tenantId: payload.tenantId,
    status: "ACTIVE",
    ...(selectedUserIds ? { id: { in: selectedUserIds } } : {}),
    ...(payload.branchId
      ? { branchAccesses: { some: { tenantId: payload.tenantId, branchId: payload.branchId, isActive: true } } }
      : payload.institutionId
        ? {
            branchAccesses: {
              some: {
                tenantId: payload.tenantId,
                isActive: true,
                branch: { institutionId: payload.institutionId, status: "ACTIVE" }
              }
            }
          }
        : {}),
    roleAssignments: {
      some: {
        tenantId: payload.tenantId,
        ...assignmentFilter,
        OR: assignmentScopeFilter(payload),
        role: {
          tenantId: payload.tenantId,
          isActive: true,
          ...(roleCode ? { code: roleCode } : {}),
          rolePermissions: {
            some: {
              tenantId: payload.tenantId,
              permission: { code: "notifications.view_own", isActive: true }
            }
          }
        }
      }
    }
  };

  const users = await client.user.findMany({
    where,
    select: { id: true },
    orderBy: { id: "asc" }
  });
  if (selectedUserIds && users.length !== selectedUserIds.length) {
    throw new Error("NOTIFICATION_AUDIENCE_SCOPE_NOT_FOUND");
  }


  const preferences = payload.mandatory || users.length === 0
    ? []
    : await client.inAppNotificationPreference.findMany({
        where: {
          tenantId: payload.tenantId,
          userId: { in: users.map((user) => user.id) },
          category: payload.category
        },
        select: {
          userId: true,
          enabled: true,
          minimumPriority: true
        }
      });
  const preferenceByUser = new Map(preferences.map((preference) => [preference.userId, preference]));

  const recipientIds = users
    .filter((user) => {
      if (payload.mandatory) return true;
      const preference = preferenceByUser.get(user.id);
      return !preference || (
        preference.enabled &&
        priorityMeetsMinimum(payload.priority, preference.minimumPriority)
      );
    })
    .map((user) => user.id);
  const selectedCount = selectedUserIds?.length ?? users.length;

  return {
    recipientIds,
    skippedCount: Math.max(0, selectedCount - recipientIds.length)
  };
}

async function audienceRuleData(
  client: DbClient,
  payload: ReturnType<typeof inAppNotificationOutboxPayloadSchema.parse>
) {
  const audience = payload.audience;
  if (audience.type === InAppNotificationAudienceType.USER) {
    return { audienceType: audience.type, userId: audience.userId };
  }
  if (audience.type === InAppNotificationAudienceType.USERS) {
    return {
      audienceType: audience.type,
      criteriaJson: jsonValue({ selectedUserCount: new Set(audience.userIds).size })
    };
  }
  if (audience.type === InAppNotificationAudienceType.ROLE) {
    const role = await client.role.findUnique({
      where: { tenantId_code: { tenantId: payload.tenantId, code: audience.roleCode } },
      select: { id: true }
    });
    if (!role) throw new Error("NOTIFICATION_AUDIENCE_ROLE_NOT_FOUND");
    return { audienceType: audience.type, roleId: role.id };
  }
  if (audience.type === InAppNotificationAudienceType.INSTITUTION) {
    return { audienceType: audience.type, institutionId: audience.institutionId };
  }
  if (audience.type === InAppNotificationAudienceType.BRANCH) {
    return { audienceType: audience.type, branchId: audience.branchId };
  }
  return { audienceType: InAppNotificationAudienceType.TENANT };
}

async function completeClaimedOutbox(row: NonNullable<ClaimedOutbox>) {
  const payload = inAppNotificationOutboxPayloadSchema.parse(row.payloadJson);
  if (payload.tenantId !== row.tenantId) throw new Error("NOTIFICATION_OUTBOX_TENANT_MISMATCH");

  const now = new Date();
  if (payload.scheduledAt && payload.scheduledAt > now) {
    await db.inAppNotificationOutbox.updateMany({
      where: { id: row.id, tenantId: row.tenantId, lockToken: row.lockToken },
      data: {
        status: InAppNotificationOutboxStatus.PENDING,
        nextAttemptAt: payload.scheduledAt,
        lockedAt: null,
        lockToken: null
      }
    });
    return "scheduled" as const;
  }

  const featureState = await getInAppNotificationFeatureState(row.tenantId);
  if (!sourceModuleIsEnabled(payload.sourceModule, featureState)) {
    await db.inAppNotificationOutbox.updateMany({
      where: { id: row.id, tenantId: row.tenantId, lockToken: row.lockToken },
      data: {
        status: InAppNotificationOutboxStatus.CANCELLED,
        processedAt: now,
        lockedAt: null,
        lockToken: null,
        lastError: "Feature or source module is disabled."
      }
    });
    return "cancelled" as const;
  }

  const existing = await db.inAppNotification.findUnique({
    where: {
      tenantId_idempotencyKey: {
        tenantId: row.tenantId,
        idempotencyKey: payload.idempotencyKey
      }
    },
    select: { id: true }
  });
  if (existing) {
    await db.inAppNotificationOutbox.updateMany({
      where: { id: row.id, tenantId: row.tenantId, lockToken: row.lockToken },
      data: {
        status: InAppNotificationOutboxStatus.COMPLETED,
        processedAt: now,
        lockedAt: null,
        lockToken: null,
        lastError: null
      }
    });
    return "duplicate" as const;
  }

  const recipientResolution = await resolveRecipients(db, payload);
  const recipientIds = recipientResolution.recipientIds;
  const rule = await audienceRuleData(db, payload);
  const expired = Boolean(payload.expiresAt && payload.expiresAt <= now);
  const requiresAcknowledgement = featureState.acknowledgementsEnabled && payload.requiresAcknowledgement;

  await db.$transaction(async (tx) => {
    const notification = await tx.inAppNotification.create({
      data: {
        tenantId: row.tenantId,
        institutionId: payload.institutionId,
        branchId: payload.branchId,
        academicYearId: payload.academicYearId,
        legacyType: payload.eventType,
        sourceModule: payload.sourceModule,
        eventType: payload.eventType,
        sourceEntityType: payload.sourceEntityType,
        sourceEntityId: payload.sourceEntityId,
        category: payload.category,
        priority: payload.priority,
        title: payload.title,
        bodyPreview: payload.bodyPreview,
        deepLink: payload.deepLink,
        mandatory: payload.mandatory,
        requiresAcknowledgement,
        scheduledAt: payload.scheduledAt,
        publishedAt: expired ? null : now,
        expiresAt: payload.expiresAt,
        status: expired ? InAppNotificationStatus.EXPIRED : InAppNotificationStatus.PUBLISHED,
        idempotencyKey: payload.idempotencyKey,
        templateId: payload.templateId,
        variablesJson: payload.variables ? jsonValue(payload.variables) : undefined,
        safeMetadataJson: payload.safeMetadata ? jsonValue(payload.safeMetadata) : undefined,
        createdById: payload.createdById
      },
      select: { id: true }
    });

    await tx.inAppNotificationAudienceRule.create({
      data: {
        tenantId: row.tenantId,
        notificationId: notification.id,
        ...rule
      }
    });

    if (!expired && recipientIds.length > 0) {
      for (let index = 0; index < recipientIds.length; index += RECIPIENT_WRITE_BATCH_SIZE) {
        const batch = recipientIds.slice(index, index + RECIPIENT_WRITE_BATCH_SIZE);
        await tx.inAppNotificationRecipient.createMany({
          data: batch.map((userId) => ({
            tenantId: row.tenantId,
            notificationId: notification.id,
            userId,
            deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP,
            deliveredAt: now,
            updatedAt: now
          })),
          skipDuplicates: true
        });
      }
    }

    await tx.inAppNotificationOutbox.updateMany({
      where: { id: row.id, tenantId: row.tenantId, lockToken: row.lockToken },
      data: {
        status: InAppNotificationOutboxStatus.COMPLETED,
        processedAt: now,
        lockedAt: null,
        lockToken: null,
        lastError: null
      }
    });

    await tx.auditLog.create({
      data: {
        tenantId: row.tenantId,
        branchId: payload.branchId,
        academicYearId: payload.academicYearId,
        actorUserId: payload.createdById,
        action: expired ? "notifications.in_app.expired" : "notifications.in_app.published",
        entityType: "InAppNotification",
        entityId: notification.id,
        metadataJson: jsonValue({
          eventType: payload.eventType,
          sourceModule: payload.sourceModule,
          category: payload.category,
          priority: payload.priority,
          recipientCount: expired ? 0 : recipientIds.length,
          skippedCount: recipientResolution.skippedCount + (expired ? recipientIds.length : 0),
          mandatory: payload.mandatory,
          requiresAcknowledgement
        })
      }
    });
  });

  return expired ? "expired" as const : "published" as const;
}

function notificationFailureCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN_FAILURE";
  if (error.name === "ZodError") return "INVALID_EVENT_PAYLOAD";
  const candidate = error.message.split(":", 1)[0]?.trim() ?? "";
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(candidate) ? candidate : "PROCESSING_FAILURE";
}

async function failClaimedOutbox(row: NonNullable<ClaimedOutbox>, error: unknown) {
  const failure = sanitizeNotificationFailure(error);
  const failureCode = notificationFailureCode(error);
  const terminal = row.attemptCount >= MAX_ATTEMPTS ||
    failureCode === "INVALID_EVENT_PAYLOAD" ||
    PERMANENT_FAILURE_CODES.has(failureCode);
  const failedAt = terminal ? new Date() : null;

  await db.inAppNotificationOutbox.updateMany({
    where: { id: row.id, tenantId: row.tenantId, lockToken: row.lockToken },
    data: {
      status: InAppNotificationOutboxStatus.FAILED,
      attemptCount: terminal ? MAX_ATTEMPTS : row.attemptCount,
      nextAttemptAt: terminal ? row.nextAttemptAt : nextRetryAt(row.attemptCount),
      failedAt,
      lockedAt: null,
      lockToken: null,
      lastError: failure
    }
  });

  const parsedPayload = inAppNotificationOutboxPayloadSchema.safeParse(row.payloadJson);
  try {
    await db.auditLog.create({
      data: {
        tenantId: row.tenantId,
        branchId: parsedPayload.success ? parsedPayload.data.branchId : null,
        academicYearId: parsedPayload.success ? parsedPayload.data.academicYearId : null,
        actorUserId: parsedPayload.success ? parsedPayload.data.createdById : null,
        action: terminal ? "notifications.in_app.failed" : "notifications.in_app.retry_scheduled",
        entityType: "InAppNotificationOutbox",
        entityId: row.id,
        metadataJson: jsonValue({
          attemptCount: row.attemptCount,
          terminal,
          failureCode,
          nextAttemptScheduled: !terminal
        })
      }
    });
  } catch {
    // The outbox lock must still be released if audit storage is temporarily unavailable.
  }
}

export async function reconcileExpiredInAppNotifications(input: {
  tenantId?: string;
  limit?: number;
} = {}) {
  const now = new Date();
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db.inAppNotification.findMany({
    where: {
      tenantId: input.tenantId,
      status: InAppNotificationStatus.PUBLISHED,
      expiresAt: { lte: now }
    },
    select: { id: true, tenantId: true, branchId: true, academicYearId: true },
    orderBy: { expiresAt: "asc" },
    take: limit
  });
  let expired = 0;

  for (const row of rows) {
    const changed = await db.$transaction(async (tx) => {
      const notification = await tx.inAppNotification.updateMany({
        where: {
          id: row.id,
          tenantId: row.tenantId,
          status: InAppNotificationStatus.PUBLISHED,
          expiresAt: { lte: now }
        },
        data: { status: InAppNotificationStatus.EXPIRED }
      });
      if (notification.count !== 1) return false;
      await tx.inAppNotificationRecipient.updateMany({
        where: {
          tenantId: row.tenantId,
          notificationId: row.id,
          deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP
        },
        data: { deliveryStatus: InAppNotificationRecipientStatus.EXPIRED }
      });
      await tx.auditLog.create({
        data: {
          tenantId: row.tenantId,
          branchId: row.branchId,
          academicYearId: row.academicYearId,
          action: "notifications.in_app.expired",
          entityType: "InAppNotification",
          entityId: row.id,
          metadataJson: jsonValue({ reconciledBy: "outbox_worker" })
        }
      });
      return true;
    });
    if (changed) expired += 1;
  }

  return expired;
}
export async function processInAppNotificationOutbox(input: {
  tenantId?: string;
  limit?: number;
} = {}) {
  const limit = Math.min(Math.max(input.limit ?? 25, 1), 100);
  const result = {
    processed: 0,
    reconciledExpired: await reconcileExpiredInAppNotifications({ tenantId: input.tenantId, limit: 100 }),
    published: 0,
    duplicate: 0,
    scheduled: 0,
    cancelled: 0,
    expired: 0,
    failed: 0
  };

  for (let index = 0; index < limit; index += 1) {
    const row = await claimNextOutbox(input.tenantId);
    if (!row) break;
    result.processed += 1;
    try {
      const status = await completeClaimedOutbox(row);
      result[status] += 1;
    } catch (error) {
      await failClaimedOutbox(row, error);
      result.failed += 1;
    }
  }

  return result;
}

async function assertBroadPublicationAuthority(
  ctx: TenantContext,
  input: ParsedPublishInAppNotification
) {
  if (
    input.audience.type !== InAppNotificationAudienceType.TENANT &&
    input.audience.type !== InAppNotificationAudienceType.INSTITUTION
  ) return;

  const institutionId = input.audience.type === InAppNotificationAudienceType.INSTITUTION
    ? input.audience.institutionId
    : null;
  const branches = await db.branch.findMany({
    where: {
      tenantId: ctx.tenantId,
      status: "ACTIVE",
      ...(institutionId ? { institutionId } : {})
    },
    select: { id: true }
  });
  if (branches.some((branch) => !ctx.accessibleBranchIds.includes(branch.id))) {
    throw new AppError("FORBIDDEN_NOTIFICATION_SCOPE", "FORBIDDEN_NOTIFICATION_SCOPE", 403);
  }

  const requiredPermissions = [
    "notifications.create",
    "notifications.publish",
    ...(input.priority === "CRITICAL" ? ["notifications.critical.publish"] : []),
    ...(input.scheduledAt && input.scheduledAt > new Date() ? ["notifications.schedule"] : [])
  ];
  const now = new Date();
  const assignments = await db.userRoleAssignment.findMany({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      isActive: true,
      OR: [
        { scopeType: "TENANT", scopeId: "TENANT" },
        ...(institutionId ? [{ scopeType: "INSTITUTION" as const, scopeId: institutionId }] : [])
      ],
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
      ]
    },
    select: {
      role: {
        select: {
          isActive: true,
          rolePermissions: {
            where: {
              tenantId: ctx.tenantId,
              permission: { code: { in: requiredPermissions }, isActive: true }
            },
            select: { permission: { select: { code: true } } }
          }
        }
      }
    }
  });
  const granted = new Set(assignments.flatMap((assignment) => assignment.role.isActive
    ? assignment.role.rolePermissions.map((entry) => entry.permission.code)
    : []));
  if (requiredPermissions.some((permission) => !granted.has(permission))) {
    throw new AppError("FORBIDDEN_NOTIFICATION_SCOPE", "FORBIDDEN_NOTIFICATION_SCOPE", 403);
  }
}
export async function publishManualInAppNotification(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = publishInAppNotificationSchema.parse(rawInput);
  await requirePermission({ ctx, permission: "notifications.create", branchId: ctx.activeBranchId });
  await requirePermission({ ctx, permission: "notifications.publish", branchId: ctx.activeBranchId });
  if (input.priority === "CRITICAL") {
    await requirePermission({ ctx, permission: "notifications.critical.publish", branchId: ctx.activeBranchId });
  }
  if (input.scheduledAt && input.scheduledAt > new Date()) {
    await requirePermission({ ctx, permission: "notifications.schedule", branchId: ctx.activeBranchId });
  }
  await assertBroadPublicationAuthority(ctx, input);

  const queued = await queueInAppNotificationEvent(ctx, input);
  if (queued.status === "queued" && (!input.scheduledAt || input.scheduledAt <= new Date())) {
    await processInAppNotificationOutbox({ tenantId: ctx.tenantId, limit: 10 });
  }
  return queued;
}

export async function retryInAppNotificationOutbox(ctx: TenantContext, outboxId: string) {
  notificationOutboxRetrySchema.parse({ outboxId });
  await requirePermission({ ctx, permission: "notifications.retry.manage", branchId: ctx.activeBranchId });
  const updated = await db.inAppNotificationOutbox.updateMany({
    where: {
      id: outboxId,
      tenantId: ctx.tenantId,
      status: InAppNotificationOutboxStatus.FAILED
    },
    data: {
      status: InAppNotificationOutboxStatus.PENDING,
      attemptCount: 0,
      nextAttemptAt: new Date(),
      failedAt: null,
      lockedAt: null,
      lockToken: null,
      lastError: null
    }
  });
  if (updated.count !== 1) throw notFound("NOTIFICATION_OUTBOX_NOT_FOUND");

  await writeAuditLog({
    ctx,
    action: "notifications.in_app.retry_requested",
    entityType: "InAppNotificationOutbox",
    entityId: outboxId
  });
}

export async function cancelInAppNotification(ctx: TenantContext, notificationId: string) {
  notificationIdSchema.parse({ notificationId });
  await requirePermission({ ctx, permission: "notifications.cancel", branchId: ctx.activeBranchId });
  const now = new Date();

  const notification = await db.inAppNotification.findFirst({
    where: { id: notificationId, tenantId: ctx.tenantId },
    select: { id: true, branchId: true, academicYearId: true, status: true }
  });
  if (!notification) throw notFound("NOTIFICATION_NOT_FOUND");
  if (notification.status === InAppNotificationStatus.CANCELLED) return;

  await db.$transaction(async (tx) => {
    await tx.inAppNotification.update({
      where: { id: notification.id },
      data: { status: InAppNotificationStatus.CANCELLED, cancelledAt: now }
    });
    await tx.inAppNotificationRecipient.updateMany({
      where: { tenantId: ctx.tenantId, notificationId: notification.id },
      data: { deliveryStatus: InAppNotificationRecipientStatus.CANCELLED }
    });
    await writeAuditLog({
      ctx,
      action: "notifications.in_app.cancelled",
      entityType: "InAppNotification",
      entityId: notification.id,
      branchId: notification.branchId,
      academicYearId: notification.academicYearId,
      before: { status: notification.status },
      after: { status: InAppNotificationStatus.CANCELLED }
    }, tx);
  });
}
