import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { requireSchoolCastDeploymentCapability } from "@/modules/schoolcast/deployment-policy";
import { requireSchoolCastEnabled } from "@/modules/schoolcast/feature";
import {
  requeueSchoolCastOutboxSchema,
  requeueSchoolCastWorkerEventSchema
} from "@/modules/schoolcast/schemas";

export async function requeueSchoolCastOutbox(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("deliveryOperations");
  const data = requeueSchoolCastOutboxSchema.parse(input);
  await requireSchoolCastEnabled(ctx);

  const item = await db.notificationOutbox.findFirst({
    where: {
      id: data.outboxId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      schoolCastCommunicationId: { not: null },
      status: { in: ["FAILED", "UNDELIVERABLE"] }
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      status: true,
      attemptCount: true,
      failureReason: true,
      expiresAt: true
    }
  });
  if (!item?.branchId) throw notFound("SCHOOLCAST_DELIVERY_NOT_FOUND");
  if (item.expiresAt && item.expiresAt <= new Date()) {
    throw new Error("SCHOOLCAST_DELIVERY_EXPIRED");
  }
  await requirePermission({
    ctx,
    permission: "schoolcast.outbox.retry",
    branchId: item.branchId,
    academicYearId: item.academicYearId
  });

  return db.$transaction(async (tx) => {
    const requeuedAt = new Date();
    const updated = await tx.notificationOutbox.updateMany({
      where: {
        id: item.id,
        tenantId: ctx.tenantId,
        status: item.status,
        lockedAt: null,
        lockOwner: null,
        leaseUntil: null
      },
      data: {
        status: "QUEUED",
        attemptCount: 0,
        availableAt: requeuedAt,
        scheduledFor: requeuedAt,
        lastAttemptAt: null,
        failedAt: null,
        failureReason: null
      }
    });
    if (updated.count !== 1) throw new Error("SCHOOLCAST_DELIVERY_REQUEUE_CONFLICT");

    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.OUTBOX_REQUEUED,
      entityType: "NotificationOutbox",
      entityId: item.id,
      branchId: item.branchId,
      academicYearId: item.academicYearId,
      before: {
        status: item.status,
        attemptCount: item.attemptCount,
        failureReason: item.failureReason
      },
      after: { status: "QUEUED", attemptCount: 0, availableAt: requeuedAt.toISOString() },
      metadata: { reason: data.reason }
    }, tx);

    return { id: item.id, status: "QUEUED" as const, requeuedAt };
  });
}

export async function requeueSchoolCastWorkerEvent(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("deliveryOperations");
  const data = requeueSchoolCastWorkerEventSchema.parse(input);
  await requireSchoolCastEnabled(ctx);

  if (data.kind === "DOMAIN_EVENT") {
    const event = await db.schoolCastDomainEvent.findFirst({
      where: {
        id: data.eventId,
        tenantId: ctx.tenantId,
        branchId: { in: ctx.accessibleBranchIds },
        status: "FAILED"
      },
      select: { id: true, branchId: true, academicYearId: true, attemptCount: true, lastError: true }
    });
    if (!event?.branchId) throw notFound("SCHOOLCAST_SOURCE_EVENT_NOT_FOUND");
    await requirePermission({
      ctx,
      permission: "schoolcast.outbox.admin_reconcile",
      branchId: event.branchId,
      academicYearId: event.academicYearId
    });
    return db.$transaction(async (tx) => {
      const requeuedAt = new Date();
      const updated = await tx.schoolCastDomainEvent.updateMany({
        where: { id: event.id, tenantId: ctx.tenantId, status: "FAILED" },
        data: {
          status: "PENDING",
          attemptCount: 0,
          availableAt: requeuedAt,
          processedAt: null,
          lastError: null
        }
      });
      if (updated.count !== 1) throw new Error("SCHOOLCAST_SOURCE_EVENT_REQUEUE_CONFLICT");
      await writeAuditLog({
        ctx,
        action: SCHOOLCAST_AUDIT_EVENTS.DOMAIN_EVENT_REQUEUED,
        entityType: "SchoolCastDomainEvent",
        entityId: event.id,
        branchId: event.branchId,
        academicYearId: event.academicYearId,
        before: { status: "FAILED", attemptCount: event.attemptCount, errorCode: event.lastError },
        after: { status: "PENDING", attemptCount: 0, availableAt: requeuedAt.toISOString() },
        metadata: { reason: data.reason }
      }, tx);
      return { id: event.id, kind: data.kind, status: "PENDING" as const, requeuedAt };
    });
  }

  const event = await db.gradebookDomainEventOutbox.findFirst({
    where: {
      id: data.eventId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      eventType: "gradebook.result.published.v1",
      status: "DEAD_LETTER"
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      attemptCount: true,
      lastErrorCode: true
    }
  });
  if (!event?.branchId) throw notFound("SCHOOLCAST_GRADEBOOK_EVENT_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "schoolcast.outbox.admin_reconcile",
    branchId: event.branchId,
    academicYearId: event.academicYearId
  });
  return db.$transaction(async (tx) => {
    const requeuedAt = new Date();
    const updated = await tx.gradebookDomainEventOutbox.updateMany({
      where: { id: event.id, tenantId: ctx.tenantId, status: "DEAD_LETTER" },
      data: {
        status: "FAILED",
        attemptCount: 0,
        scheduledAt: requeuedAt,
        lockedAt: null,
        deliveredAt: null,
        lastErrorCode: null,
        lastErrorMessage: null
      }
    });
    if (updated.count !== 1) throw new Error("SCHOOLCAST_GRADEBOOK_EVENT_REQUEUE_CONFLICT");
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.GRADEBOOK_EVENT_REQUEUED,
      entityType: "GradebookDomainEventOutbox",
      entityId: event.id,
      branchId: event.branchId,
      academicYearId: event.academicYearId,
      before: { status: "DEAD_LETTER", attemptCount: event.attemptCount, errorCode: event.lastErrorCode },
      after: { status: "FAILED", attemptCount: 0, scheduledAt: requeuedAt.toISOString() },
      metadata: { reason: data.reason }
    }, tx);
    return { id: event.id, kind: data.kind, status: "FAILED" as const, requeuedAt };
  });
}