import {
  InAppNotificationCategory,
  InAppNotificationRecipientStatus,
  InAppNotificationStatus,
  Prisma
} from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { isValidTimeZone } from "@/lib/dates/time-zone";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { getInAppNotificationFeatureState } from "@/modules/notifications/in-app-policy";
import {
  notificationIdSchema,
  updateInAppNotificationPreferencesSchema
} from "@/modules/notifications/schemas/in-app-notification.schema";

type RecipientMutation = "read" | "unread" | "archive" | "dismiss" | "acknowledge";

const PERMISSION_BY_MUTATION = {
  read: "notifications.mark_read",
  unread: "notifications.mark_unread",
  archive: "notifications.archive_own",
  dismiss: "notifications.archive_own",
  acknowledge: "notifications.acknowledge"
} as const;

function recipientData(mutation: RecipientMutation, now: Date) {
  switch (mutation) {
    case "read":
      return { readAt: now };
    case "unread":
      return { readAt: null };
    case "archive":
      return { archivedAt: now, readAt: now };
    case "dismiss":
      return { dismissedAt: now, readAt: now };
    case "acknowledge":
      return { acknowledgedAt: now, readAt: now };
  }
}

export async function updateOwnInAppNotification(
  ctx: TenantContext,
  notificationId: string,
  mutation: RecipientMutation
) {
  notificationIdSchema.parse({ notificationId });
  await requirePermission({
    ctx,
    permission: PERMISSION_BY_MUTATION[mutation],
    branchId: ctx.activeBranchId
  });
  const feature = await getInAppNotificationFeatureState(ctx.tenantId);
  if (!feature.enabled) throw notFound("NOTIFICATION_NOT_FOUND");
  if (mutation === "acknowledge" && !feature.acknowledgementsEnabled) {
    throw new AppError("NOTIFICATION_ACKNOWLEDGEMENTS_DISABLED", "NOTIFICATION_ACKNOWLEDGEMENTS_DISABLED", 409);
  }

  const notification = await db.inAppNotificationRecipient.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      notificationId,
      deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP,
      notification: {
        status: InAppNotificationStatus.PUBLISHED,
        ...(mutation === "acknowledge" ? { requiresAcknowledgement: true } : {})
      }
    },
    select: {
      id: true,
      readAt: true,
      acknowledgedAt: true,
      archivedAt: true,
      dismissedAt: true,
      notification: {
        select: {
          id: true,
          branchId: true,
          academicYearId: true,
          requiresAcknowledgement: true
        }
      }
    }
  });
  if (!notification) throw notFound("NOTIFICATION_NOT_FOUND");

  const before = {
    read: Boolean(notification.readAt),
    acknowledged: Boolean(notification.acknowledgedAt),
    archived: Boolean(notification.archivedAt),
    dismissed: Boolean(notification.dismissedAt)
  };
  if (
    (mutation === "archive" || mutation === "dismiss") &&
    notification.notification.requiresAcknowledgement &&
    !notification.acknowledgedAt
  ) {
    throw new AppError("NOTIFICATION_ACKNOWLEDGEMENT_REQUIRED", "NOTIFICATION_ACKNOWLEDGEMENT_REQUIRED", 409);
  }
  const now = new Date();

  await db.$transaction(async (tx) => {
    await tx.inAppNotificationRecipient.update({
      where: { id: notification.id },
      data: recipientData(mutation, now)
    });
    await writeAuditLog({
      ctx,
      action: `notifications.in_app.${mutation}`,
      entityType: "InAppNotificationRecipient",
      entityId: notification.id,
      branchId: notification.notification.branchId,
      academicYearId: notification.notification.academicYearId,
      before,
      after: {
        ...before,
        read: mutation === "unread" ? false : mutation === "read" || mutation === "archive" || mutation === "dismiss" || mutation === "acknowledge" ? true : before.read,
        acknowledged: mutation === "acknowledge" ? true : before.acknowledged,
        archived: mutation === "archive" ? true : before.archived,
        dismissed: mutation === "dismiss" ? true : before.dismissed
      }
    }, tx);
  });
}

export async function markAllOwnInAppNotificationsRead(ctx: TenantContext) {
  await requirePermission({ ctx, permission: "notifications.mark_read", branchId: ctx.activeBranchId });
  const now = new Date();
  const result = await db.inAppNotificationRecipient.updateMany({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      deliveryStatus: InAppNotificationRecipientStatus.DELIVERED_IN_APP,
      readAt: null,
      archivedAt: null,
      dismissedAt: null,
      notification: {
        status: InAppNotificationStatus.PUBLISHED,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
      }
    },
    data: { readAt: now }
  });

  await writeAuditLog({
    ctx,
    action: "notifications.in_app.mark_all_read",
    entityType: "InAppNotificationRecipient",
    metadata: { affectedCount: result.count }
  });
  return result.count;
}

export async function updateOwnInAppNotificationPreferences(ctx: TenantContext, rawInput: unknown) {
  await requirePermission({
    ctx,
    permission: "notifications.preference.manage_own",
    branchId: ctx.activeBranchId
  });
  const input = updateInAppNotificationPreferencesSchema.parse(rawInput);
  for (const preference of input.preferences) {
    if (!isValidTimeZone(preference.timeZone)) throw new Error("INVALID_NOTIFICATION_TIME_ZONE");
    if (preference.quietHoursEnabled && (!preference.quietStart || !preference.quietEnd)) {
      throw new Error("INVALID_NOTIFICATION_QUIET_HOURS");
    }
  }

  const mandatoryCategories = new Set<InAppNotificationCategory>([
    InAppNotificationCategory.ACCOUNT,
    InAppNotificationCategory.SECURITY,
    InAppNotificationCategory.SYSTEM
  ]);

  await db.$transaction(async (tx) => {
    for (const preference of input.preferences) {
      const enforcedEnabled = mandatoryCategories.has(preference.category)
        ? true
        : preference.enabled;
      await tx.inAppNotificationPreference.upsert({
        where: {
          tenantId_userId_category: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            category: preference.category
          }
        },
        create: {
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          ...preference,
          enabled: enforcedEnabled
        },
        update: {
          enabled: enforcedEnabled,
          minimumPriority: preference.minimumPriority,
          quietHoursEnabled: preference.quietHoursEnabled,
          quietStart: preference.quietHoursEnabled ? preference.quietStart : null,
          quietEnd: preference.quietHoursEnabled ? preference.quietEnd : null,
          timeZone: preference.timeZone,
          digestMode: preference.digestMode
        }
      });
    }

    await writeAuditLog({
      ctx,
      action: "notifications.in_app.preferences_updated",
      entityType: "InAppNotificationPreference",
      metadata: {
        categoryCount: input.preferences.length,
        mandatoryCategoriesEnforced: [...mandatoryCategories]
      }
    }, tx);
  });
}
