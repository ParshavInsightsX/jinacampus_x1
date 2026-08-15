import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { requireSchoolCastSubfeature } from "@/modules/schoolcast/feature";
import {
  schoolCastAcknowledgeSchema,
  schoolCastInboxActionSchema
} from "@/modules/schoolcast/schemas";
import { schoolCastContentHash } from "@/modules/schoolcast/policy";

export async function getSchoolCastInbox(ctx: TenantContext, limit = 50) {
  await requireSchoolCastSubfeature(ctx, "inApp");
  await requirePermission({ ctx, permission: "schoolcast.inbox.view", branchId: ctx.activeBranchId });
  const now = new Date();
  const rows = await db.inAppNotification.findMany({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    select: {
      id: true,
      type: true,
      title: true,
      message: true,
      actionUrl: true,
      priority: true,
      acknowledgementRequired: true,
      readAt: true,
      createdAt: true,
      communicationId: true,
      communicationVersionId: true,
      recipientSnapshotId: true,
      recipientSnapshot: {
        select: { acknowledgements: { where: { tenantId: ctx.tenantId, userId: ctx.userId }, select: { acknowledgedAt: true }, take: 1 } }
      }
    },
    orderBy: [{ readAt: "asc" }, { createdAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 100)
  });
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    actionUrl: row.actionUrl,
    priority: row.priority,
    acknowledgementRequired: row.acknowledgementRequired,
    readAt: row.readAt,
    createdAt: row.createdAt,
    acknowledgedAt: row.recipientSnapshot?.acknowledgements[0]?.acknowledgedAt ?? null
  }));
}

export async function markSchoolCastInboxRead(ctx: TenantContext, input: unknown) {
  const data = schoolCastInboxActionSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "inApp");
  await requirePermission({ ctx, permission: "schoolcast.inbox.read", branchId: ctx.activeBranchId });
  return db.$transaction(async (tx) => {
    const notification = await tx.inAppNotification.findFirst({
      where: { id: data.notificationId, tenantId: ctx.tenantId, userId: ctx.userId },
      select: { id: true, branchId: true, readAt: true }
    });
    if (!notification) throw notFound("SCHOOLCAST_NOTIFICATION_NOT_FOUND");
    if (notification.readAt) return { id: notification.id, readAt: notification.readAt, alreadyRead: true };
    const readAt = new Date();
    await tx.inAppNotification.update({ where: { id: notification.id }, data: { readAt } });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.INBOX_READ,
      entityType: "InAppNotification",
      entityId: notification.id,
      branchId: notification.branchId,
      after: { readAt: readAt.toISOString() }
    }, tx);
    return { id: notification.id, readAt, alreadyRead: false };
  });
}

export async function acknowledgeSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = schoolCastAcknowledgeSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "inApp");
  await requirePermission({ ctx, permission: "schoolcast.inbox.acknowledge", branchId: ctx.activeBranchId });
  return db.$transaction(async (tx) => {
    const notification = await tx.inAppNotification.findFirst({
      where: { id: data.notificationId, tenantId: ctx.tenantId, userId: ctx.userId },
      select: {
        id: true,
        branchId: true,
        acknowledgementRequired: true,
        communicationId: true,
        communicationVersionId: true,
        recipientSnapshotId: true
      }
    });
    if (!notification?.acknowledgementRequired || !notification.communicationId || !notification.communicationVersionId || !notification.recipientSnapshotId) {
      throw notFound("SCHOOLCAST_ACKNOWLEDGEMENT_NOT_AVAILABLE");
    }
    const acknowledgement = await tx.schoolCastAcknowledgement.upsert({
      where: {
        communicationVersionId_recipientSnapshotId_userId: {
          communicationVersionId: notification.communicationVersionId,
          recipientSnapshotId: notification.recipientSnapshotId,
          userId: ctx.userId
        }
      },
      create: {
        tenantId: ctx.tenantId,
        communicationId: notification.communicationId,
        communicationVersionId: notification.communicationVersionId,
        recipientSnapshotId: notification.recipientSnapshotId,
        userId: ctx.userId,
        acknowledgementTextHash: data.acknowledgementText ? schoolCastContentHash({ acknowledgementText: data.acknowledgementText }) : null
      },
      update: {},
      select: { id: true, acknowledgedAt: true }
    });
    await tx.inAppNotification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_ACKNOWLEDGED,
      entityType: "SchoolCastAcknowledgement",
      entityId: acknowledgement.id,
      branchId: notification.branchId,
      after: {
        notificationId: notification.id,
        communicationId: notification.communicationId,
        communicationVersionId: notification.communicationVersionId,
        acknowledgedAt: acknowledgement.acknowledgedAt.toISOString(),
        acknowledgementTextProvided: Boolean(data.acknowledgementText)
      }
    }, tx);
    return acknowledgement;
  });
}