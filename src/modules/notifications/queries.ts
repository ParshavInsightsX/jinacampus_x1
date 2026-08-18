import {
  InAppNotificationCategory,
  InAppNotificationRecipientStatus,
  InAppNotificationStatus,
  type Prisma
} from "@prisma/client";

import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";
import {
  notificationListQuerySchema,
  type NotificationListQuery
} from "@/modules/notifications/schemas/in-app-notification.schema";

const notificationSummarySelect = {
  id: true,
  sourceModule: true,
  eventType: true,
  category: true,
  priority: true,
  title: true,
  bodyPreview: true,
  deepLink: true,
  iconKey: true,
  mandatory: true,
  requiresAcknowledgement: true,
  publishedAt: true,
  expiresAt: true,
  createdAt: true
} satisfies Prisma.InAppNotificationSelect;

function activeNotificationWhere(now: Date): Prisma.InAppNotificationWhereInput {
  return {
    status: InAppNotificationStatus.PUBLISHED,
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }]
  };
}

export function parseNotificationListQuery(searchParams: URLSearchParams) {
  const raw = {
    sourceModule: searchParams.get("sourceModule") || undefined,
    category: searchParams.get("category") || undefined,
    priority: searchParams.get("priority") || undefined,
    state: searchParams.get("state") || undefined,
    search: searchParams.get("search") || undefined,
    cursorCreatedAt: searchParams.get("cursorCreatedAt") || undefined,
    cursorId: searchParams.get("cursorId") || undefined,
    limit: searchParams.get("limit") || undefined
  };
  return notificationListQuerySchema.parse(raw);
}

export async function getUnreadInAppNotificationCount(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "notifications.view_own", branchId: ctx.activeBranchId });
  const feature = await getInAppNotificationFeatureState(ctx.tenantId);
  if (!feature.enabled) return 0;

  return db.inAppNotificationRecipient.count({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP,
      readAt: null,
      archivedAt: null,
      dismissedAt: null,
      notification: activeNotificationWhere(new Date())
    }
  });
}

export async function listInAppNotifications(
  ctx: TenantContext,
  rawQuery: NotificationListQuery | unknown = {}
) {
  await requirePermission({ ctx, permission: "notifications.view_own", branchId: ctx.activeBranchId });
  const feature = await getInAppNotificationFeatureState(ctx.tenantId);
  const query = notificationListQuerySchema.parse(rawQuery);
  if (!feature.enabled) return { items: [], nextCursor: null, feature };

  const now = new Date();
  const notificationWhere: Prisma.InAppNotificationWhereInput = {
    status: InAppNotificationStatus.PUBLISHED,
    sourceModule: query.sourceModule,
    category: query.category,
    priority: query.priority,
    AND: [
      { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ...(query.search
        ? [{
            OR: [
              { title: { contains: query.search, mode: "insensitive" as const } },
              { bodyPreview: { contains: query.search, mode: "insensitive" as const } }
            ]
          }]
        : [])
    ],
    ...(query.state === "acknowledgement"
      ? { requiresAcknowledgement: true }
      : {})
  };

  const where: Prisma.InAppNotificationRecipientWhereInput = {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP,
    dismissedAt: null,
    notification: notificationWhere,
    ...(query.state === "archived"
      ? { archivedAt: { not: null } }
      : { archivedAt: null }),
    ...(query.state === "unread" ? { readAt: null } : {}),
    ...(query.state === "read" ? { readAt: { not: null } } : {}),
    ...(query.state === "acknowledgement" ? { acknowledgedAt: null } : {}),
    ...(query.cursorCreatedAt && query.cursorId
      ? {
          OR: [
            { createdAt: { lt: query.cursorCreatedAt } },
            { createdAt: query.cursorCreatedAt, id: { lt: query.cursorId } }
          ]
        }
      : {})
  };

  const rows = await db.inAppNotificationRecipient.findMany({
    where,
    select: {
      id: true,
      deliveryStatus: true,
      deliveredAt: true,
      readAt: true,
      acknowledgedAt: true,
      archivedAt: true,
      dismissedAt: true,
      createdAt: true,
      notification: { select: notificationSummarySelect }
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items.at(-1);

  return {
    items,
    nextCursor: hasMore && last
      ? { createdAt: last.createdAt.toISOString(), id: last.id }
      : null,
    feature
  };
}

export async function getRecentInAppNotifications(ctx: TenantContext, limit = 8) {
  return listInAppNotifications(ctx, {
    state: "all",
    limit: Math.min(Math.max(limit, 1), 10)
  });
}

export async function getInAppNotificationForUser(ctx: TenantContext, notificationId: string) {
  await requirePermission({ ctx, permission: "notifications.view_own", branchId: ctx.activeBranchId });
  const feature = await getInAppNotificationFeatureState(ctx.tenantId);
  if (!feature.enabled) throw notFound("NOTIFICATION_NOT_FOUND");
  const row = await db.inAppNotificationRecipient.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      notificationId,
      deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP
    },
    select: {
      id: true,
      deliveredAt: true,
      readAt: true,
      acknowledgedAt: true,
      archivedAt: true,
      dismissedAt: true,
      notification: {
        select: {
          ...notificationSummarySelect,
          sourceEntityType: true,
          sourceEntityId: true,
          safeMetadataJson: true
        }
      }
    }
  });
  if (!row) throw notFound("NOTIFICATION_NOT_FOUND");
  return row;
}

export async function getInAppNotificationPreferences(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "notifications.preference.manage_own", branchId: ctx.activeBranchId });
  const feature = await getInAppNotificationFeatureState(ctx.tenantId);
  if (!feature.enabled) throw notFound("NOTIFICATION_NOT_FOUND");
  const existing = await db.inAppNotificationPreference.findMany({
    where: { tenantId: ctx.tenantId, userId: ctx.userId },
    orderBy: { category: "asc" }
  });
  const byCategory = new Map(existing.map((preference) => [preference.category, preference]));

  return Object.values(InAppNotificationCategory).map((category) => {
    const preference = byCategory.get(category);
    return {
      category: preference?.category ?? category,
      enabled: preference?.enabled ?? true,
      minimumPriority: preference?.minimumPriority ?? null,
      quietHoursEnabled: preference?.quietHoursEnabled ?? false,
      quietStart: preference?.quietStart ?? null,
      quietEnd: preference?.quietEnd ?? null,
      timeZone: preference?.timeZone ?? ctx.timeZone ?? "Asia/Kolkata",
      digestMode: preference?.digestMode ?? ("IMMEDIATE" as const)
    };
  });
}
