import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import {
  getSchoolCastDeploymentPolicy,
  requireSchoolCastDeploymentCapability
} from "@/modules/schoolcast/deployment-policy";
import { getSchoolCastFeatureState, requireSchoolCastEnabled, requireSchoolCastSubfeature } from "@/modules/schoolcast/feature";
import { resolveSchoolCastScope } from "@/modules/schoolcast/services/scope.service";

async function requestScope(ctx: TenantContext, permission: Parameters<typeof requirePermission>[0]["permission"]) {
  await requireSchoolCastEnabled(ctx);
  const scope = await resolveSchoolCastScope(ctx, ctx.activeBranchId, ctx.activeAcademicYearId);
  const permissions = await getEffectivePermissions({ ctx, branchId: scope.branchId, academicYearId: scope.academicYearId });
  if (!permissions.has(permission)) throw new Error(`FORBIDDEN_PERMISSION:${permission}`);
  return { ...scope, permissions };
}

function broadCommunicationVisibility(permissions: ReadonlySet<string>) {
  return permissions.has("schoolcast.audience.resolve") || permissions.has("schoolcast.communication.review") || permissions.has("schoolcast.approval.view");
}

function communicationVisibility(ctx: TenantContext, permissions: ReadonlySet<string>): Prisma.SchoolCastCommunicationWhereInput {
  if (broadCommunicationVisibility(permissions)) return {};
  return {
    OR: [
      { createdById: ctx.userId },
      { recipientSnapshots: { some: { tenantId: ctx.tenantId, userId: ctx.userId } } }
    ]
  };
}

export async function getSchoolCastDashboard(ctx: TenantContext) {
  const scope = await requestScope(ctx, "schoolcast.dashboard.view");
  const features = await getSchoolCastFeatureState(ctx);
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const visibility = communicationVisibility(ctx, scope.permissions);
  const communicationWhere = {
    tenantId: ctx.tenantId,
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    ...visibility
  };
  const homeworkWhere: Prisma.SchoolCastHomeworkItemWhereInput = {
    tenantId: ctx.tenantId,
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    ...(scope.permissions.has("schoolcast.audience.resolve") ? {} : { teacherUserId: ctx.userId })
  };
  const [drafts, pendingApproval, published, homeworkDue, unread, queued, failed, recent] = await Promise.all([
    db.schoolCastCommunication.count({ where: { ...communicationWhere, status: "DRAFT" } }),
    scope.permissions.has("schoolcast.approval.view")
      ? db.schoolCastCommunication.count({ where: { ...communicationWhere, status: "PENDING_APPROVAL" } })
      : Promise.resolve(0),
    db.schoolCastCommunication.count({ where: { ...communicationWhere, status: "PUBLISHED" } }),
    features.homework && scope.permissions.has("schoolcast.homework.view")
      ? db.schoolCastHomeworkItem.count({ where: { ...homeworkWhere, status: { in: ["DRAFT", "PENDING_APPROVAL", "APPROVED"] } } })
      : Promise.resolve(0),
    features.inApp && scope.permissions.has("schoolcast.inbox.view")
      ? db.inAppNotification.count({ where: { tenantId: ctx.tenantId, userId: ctx.userId, readAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } })
      : Promise.resolve(0),
    deploymentPolicy.deliveryOperations && scope.permissions.has("schoolcast.outbox.view")
      ? db.notificationOutbox.count({ where: { tenantId: ctx.tenantId, branchId: scope.branchId, schoolCastCommunicationId: { not: null }, status: { in: ["QUEUED", "RETRYING", "SENDING"] } } })
      : Promise.resolve(0),
    deploymentPolicy.deliveryOperations && scope.permissions.has("schoolcast.outbox.view")
      ? db.notificationOutbox.count({ where: { tenantId: ctx.tenantId, branchId: scope.branchId, schoolCastCommunicationId: { not: null }, status: { in: ["FAILED", "UNDELIVERABLE"] } } })
      : Promise.resolve(0),
    db.schoolCastCommunication.findMany({
      where: communicationWhere,
      select: {
        id: true,
        type: true,
        category: true,
        priority: true,
        status: true,
        publishedAt: true,
        createdAt: true,
        currentVersion: { select: { title: true, summary: true } },
        createdBy: { select: { displayName: true, firstName: true, lastName: true } },
        _count: { select: { recipientSnapshots: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);
  return {
    context: { branchName: scope.branchName, academicYearName: scope.academicYearName, timeZone: scope.timeZone },
    features,
    capabilities: {
      canCreate: features.notices && scope.permissions.has("schoolcast.communication.create"),
      canApprove: features.approvals && scope.permissions.has("schoolcast.approval.view"),
      canCreateHomework: deploymentPolicy.homework && scope.permissions.has("schoolcast.homework.create"),
      canViewDelivery: deploymentPolicy.deliveryOperations && scope.permissions.has("schoolcast.delivery.view"),
      canViewAnalytics: features.analytics && scope.permissions.has("schoolcast.analytics.view"),
      canManageSettings: deploymentPolicy.providerConfiguration && scope.permissions.has("schoolcast.settings.view")
    },
    metrics: { drafts, pendingApproval, published, homeworkDue, unread, queued, failed },
    recent
  };
}

export async function listSchoolCastCommunications(
  ctx: TenantContext,
  filters: {
    status?: string;
    types?: readonly ("NOTICE" | "CIRCULAR" | "BROADCAST" | "EMERGENCY" | "HOMEWORK" | "CLASSWORK")[];
  } = {}
) {
  const scope = await requestScope(ctx, "schoolcast.communication.view");
  return db.schoolCastCommunication.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      ...(filters.status ? { status: filters.status as Prisma.EnumSchoolCastCommunicationStatusFilter } : {}),
      ...(filters.types?.length ? { type: { in: [...filters.types] } } : {}),
      ...communicationVisibility(ctx, scope.permissions)
    },
    select: {
      id: true,
      type: true,
      category: true,
      priority: true,
      status: true,
      scheduledAtUtc: true,
      publishedAt: true,
      createdAt: true,
      currentVersion: { select: { title: true, summary: true, versionNo: true } },
      createdBy: { select: { displayName: true, firstName: true, lastName: true } },
      channelPlans: { select: { channel: true, status: true } },
      _count: { select: { recipientSnapshots: true, outboxItems: true } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

export async function getSchoolCastCommunication(ctx: TenantContext, communicationId: string) {
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const scope = await requestScope(ctx, "schoolcast.communication.view");
  const communication = await db.schoolCastCommunication.findFirst({
    where: {
      id: communicationId,
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      ...communicationVisibility(ctx, scope.permissions)
    },
    include: {
      currentVersion: true,
      versions: { select: { id: true, versionNo: true, title: true, contentHash: true, createdAt: true }, orderBy: { versionNo: "desc" } },
      audienceRules: { orderBy: { sequence: "asc" } },
      channelPlans: { include: { providerConfig: { select: { providerCode: true, senderIdentifierMasked: true, healthStatus: true } } } },
      approvals: { include: { actions: { select: { action: true, reason: true, occurredAt: true }, orderBy: { occurredAt: "desc" } } }, orderBy: { submittedAt: "desc" } },
      attachments: { where: { deletedAt: null }, select: { id: true, originalFileName: true, mimeType: true, sizeBytes: true, scanStatus: true, createdAt: true } },
      _count: { select: { recipientSnapshots: true, outboxItems: true, acknowledgements: true } }
    }
  });
  if (!communication) throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
  return {
    communication,
    capabilities: {
      canEdit: scope.permissions.has("schoolcast.communication.edit"),
      canSubmit: scope.permissions.has("schoolcast.communication.submit"),
      canApprove: scope.permissions.has("schoolcast.communication.approve"),
      canReject: scope.permissions.has("schoolcast.communication.reject"),
      canPublish: scope.permissions.has("schoolcast.communication.publish") || scope.permissions.has("schoolcast.homework.publish"),
      canSchedule: deploymentPolicy.scheduling && scope.permissions.has("schoolcast.communication.schedule"),
      canCancel: scope.permissions.has("schoolcast.communication.cancel") || scope.permissions.has("schoolcast.homework.cancel"),
      canArchive: scope.permissions.has("schoolcast.communication.archive"),
      canUpload: deploymentPolicy.attachments && scope.permissions.has("schoolcast.attachment.upload"),
      attachmentsAvailable: deploymentPolicy.attachments
    }
  };
}

export async function getSchoolCastComposerOptions(ctx: TenantContext) {
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const scope = await requestScope(ctx, "schoolcast.communication.create");
  const [classSections, roles] = await Promise.all([
    deploymentPolicy.classSectionAudience
      ? db.classSection.findMany({
          where: { tenantId: ctx.tenantId, branchId: scope.branchId, academicYearId: scope.academicYearId, status: "ACTIVE" },
          select: { id: true, displayName: true },
          orderBy: { displayName: "asc" }
        })
      : Promise.resolve([]),
    db.role.findMany({
      where: { tenantId: ctx.tenantId, isActive: true, code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TEACHER", "STAFF"] } },
      select: { code: true, name: true },
      orderBy: { name: "asc" }
    })
  ]);
  return {
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
    classSections,
    roles,
    enabledChannels: (await getSchoolCastFeatureState(ctx)),
    allowClassSectionAudience: deploymentPolicy.classSectionAudience
  };
}

export async function listSchoolCastApprovals(ctx: TenantContext) {
  const scope = await requestScope(ctx, "schoolcast.approval.view");
  await requireSchoolCastSubfeature(ctx, "approvals");
  return db.schoolCastApproval.findMany({
    where: { tenantId: ctx.tenantId, status: "PENDING", communication: { branchId: scope.branchId, academicYearId: scope.academicYearId } },
    select: {
      id: true,
      status: true,
      requiredPermission: true,
      submittedAt: true,
      submittedById: true,
      submittedBy: { select: { displayName: true, firstName: true, lastName: true } },
      communication: { select: { id: true, type: true, priority: true, status: true, currentVersion: { select: { title: true, summary: true } }, _count: { select: { audienceRules: true } } } }
    },
    orderBy: { submittedAt: "asc" }
  });
}

export async function listSchoolCastHomework(ctx: TenantContext) {
  await requireSchoolCastSubfeature(ctx, "homework");
  const scope = await requestScope(ctx, "schoolcast.homework.view");
  return db.schoolCastHomeworkItem.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      ...(scope.permissions.has("schoolcast.audience.resolve") ? {} : { teacherUserId: ctx.userId })
    },
    select: {
      id: true,
      workType: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      classSection: { select: { displayName: true } },
      subject: { select: { code: true, name: true } },
      currentVersion: { select: { title: true, assignmentDate: true, completionDueAt: true, versionNo: true } },
      communication: { select: { id: true, status: true, _count: { select: { recipientSnapshots: true, outboxItems: true } } } }
    },
    orderBy: { createdAt: "desc" },
    take: 100
  });
}

export async function getSchoolCastHomeworkComposerOptions(ctx: TenantContext) {
  await requireSchoolCastSubfeature(ctx, "homework");
  const scope = await requestScope(ctx, "schoolcast.homework.create");
  const broad = scope.permissions.has("schoolcast.audience.resolve");
  const assignments = await db.classSectionSubject.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      status: "ACTIVE",
      classSection: { status: "ACTIVE" },
      subject: { status: "ACTIVE" },
      ...(broad ? {} : { OR: [{ teacherUserId: ctx.userId }, { classSection: { classTeacherUserId: ctx.userId } }] })
    },
    select: {
      classSectionId: true,
      subjectId: true,
      classSection: { select: { displayName: true } },
      subject: { select: { code: true, name: true } }
    },
    orderBy: [{ classSection: { displayName: "asc" } }, { subject: { name: "asc" } }]
  });
  return { branchId: scope.branchId, academicYearId: scope.academicYearId, assignments };
}

export async function getSchoolCastDelivery(ctx: TenantContext) {
  requireSchoolCastDeploymentCapability("deliveryOperations");
  const scope = await requestScope(ctx, "schoolcast.delivery.view");
  const canRetry = scope.permissions.has("schoolcast.outbox.retry");
  const canReconcile = scope.permissions.has("schoolcast.outbox.admin_reconcile");
  const [summary, recent, domainFailures, gradebookFailures] = await Promise.all([
    db.notificationOutbox.groupBy({
      by: ["channel", "status", "mode"],
      where: { tenantId: ctx.tenantId, branchId: scope.branchId, schoolCastCommunicationId: { not: null } },
      _count: { _all: true }
    }),
    db.notificationOutbox.findMany({
      where: { tenantId: ctx.tenantId, branchId: scope.branchId, schoolCastCommunicationId: { not: null } },
      select: {
        id: true,
        channel: true,
        status: true,
        mode: true,
        attemptCount: true,
        maxAttempts: true,
        failureReason: true,
        scheduledFor: true,
        sentAt: true,
        createdAt: true,
        recipientSnapshot: { select: { recipientType: true, displayName: true, contactEmailMasked: true, contactPhoneMasked: true } },
        communicationVersion: { select: { title: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    canReconcile
      ? db.schoolCastDomainEvent.findMany({
          where: {
            tenantId: ctx.tenantId,
            branchId: scope.branchId,
            academicYearId: scope.academicYearId,
            status: "FAILED"
          },
          select: { id: true, sourceModule: true, eventType: true, attemptCount: true, lastError: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : Promise.resolve([]),
    canReconcile
      ? db.gradebookDomainEventOutbox.findMany({
          where: {
            tenantId: ctx.tenantId,
            branchId: scope.branchId,
            academicYearId: scope.academicYearId,
            eventType: "gradebook.result.published.v1",
            status: "DEAD_LETTER"
          },
          select: { id: true, aggregateType: true, eventType: true, attemptCount: true, lastErrorCode: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : Promise.resolve([])
  ]);
  const integrationFailures = [
    ...domainFailures.map((event) => ({
      id: event.id,
      kind: "DOMAIN_EVENT" as const,
      source: event.sourceModule,
      eventType: event.eventType,
      attemptCount: event.attemptCount,
      errorCode: event.lastError,
      createdAt: event.createdAt
    })),
    ...gradebookFailures.map((event) => ({
      id: event.id,
      kind: "GRADEBOOK_EVENT" as const,
      source: event.aggregateType,
      eventType: event.eventType,
      attemptCount: event.attemptCount,
      errorCode: event.lastErrorCode,
      createdAt: event.createdAt
    }))
  ].sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, 50);

  return {
    summary,
    recent,
    integrationFailures,
    capabilities: { canRetry, canReconcile }
  };
}
export async function getSchoolCastAnalytics(ctx: TenantContext) {
  await requireSchoolCastSubfeature(ctx, "analytics");
  const scope = await requestScope(ctx, "schoolcast.analytics.view");
  const [communications, recipients, acknowledgements, delivery] = await Promise.all([
    db.schoolCastCommunication.groupBy({ by: ["type", "status"], where: { tenantId: ctx.tenantId, branchId: scope.branchId, academicYearId: scope.academicYearId }, _count: { _all: true } }),
    db.schoolCastRecipientSnapshot.count({ where: { tenantId: ctx.tenantId, communication: { branchId: scope.branchId, academicYearId: scope.academicYearId } } }),
    db.schoolCastAcknowledgement.count({ where: { tenantId: ctx.tenantId, communication: { branchId: scope.branchId, academicYearId: scope.academicYearId } } }),
    db.notificationOutbox.groupBy({ by: ["channel", "status"], where: { tenantId: ctx.tenantId, branchId: scope.branchId, schoolCastCommunicationId: { not: null } }, _count: { _all: true } })
  ]);
  return { communications, recipients, acknowledgements, delivery };
}
export async function getSchoolCastHomeworkDetail(ctx: TenantContext, homeworkItemId: string) {
  await requireSchoolCastSubfeature(ctx, "homework");
  const scope = await requestScope(ctx, "schoolcast.homework.view");
  const broad = scope.permissions.has("schoolcast.audience.resolve");
  const item = await db.schoolCastHomeworkItem.findFirst({
    where: {
      id: homeworkItemId,
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      ...(broad ? {} : { teacherUserId: ctx.userId })
    },
    include: {
      classSection: { select: { displayName: true } },
      subject: { select: { code: true, name: true } },
      currentVersion: true,
      versions: {
        select: { id: true, versionNo: true, title: true, contentHash: true, createdAt: true },
        orderBy: { versionNo: "desc" }
      },
      communication: {
        select: {
          id: true,
          status: true,
          _count: { select: { recipientSnapshots: true, outboxItems: true } }
        }
      }
    }
  });
  if (!item?.currentVersion) throw notFound("SCHOOLCAST_HOMEWORK_NOT_FOUND");
  const attachments = await db.schoolCastAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      homeworkVersionId: item.currentVersion.id,
      deletedAt: null
    },
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      sizeBytes: true,
      scanStatus: true,
      createdAt: true
    },
    orderBy: { createdAt: "desc" }
  });
  return {
    item,
    attachments,
    capabilities: {
      canUpload: item.status === "DRAFT"
        && item.teacherUserId === ctx.userId
        && scope.permissions.has("schoolcast.attachment.upload")
    }
  };
}

export async function getSchoolCastTemplates(ctx: TenantContext) {
  requireSchoolCastDeploymentCapability("templates");
  const scope = await requestScope(ctx, "schoolcast.template.view");
  const templates = await db.notificationTemplate.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [{ branchId: scope.branchId }, { branchId: null }]
    },
    select: {
      id: true,
      channel: true,
      templateKey: true,
      providerTemplateName: true,
      languageCode: true,
      category: true,
      isActive: true,
      branchId: true,
      updatedAt: true,
      schoolCastVersions: {
        select: {
          id: true,
          versionNo: true,
          status: true,
          languageCode: true,
          subject: true,
          bodyText: true,
          variableSchemaJson: true,
          contentHash: true,
          createdAt: true
        },
        orderBy: { versionNo: "desc" },
        take: 1
      }
    },
    orderBy: [{ channel: "asc" }, { templateKey: "asc" }]
  });
  return {
    templates,
    capabilities: {
      canCreate: scope.permissions.has("schoolcast.template.create"),
      canUpdate: scope.permissions.has("schoolcast.template.update"),
      canActivate: scope.permissions.has("schoolcast.template.activate")
    }
  };
}

export async function getSchoolCastCalendar(ctx: TenantContext) {
  const scope = await requestScope(ctx, "schoolcast.communication.view");
  const today = new Date();
  const entries = await db.academicCalendarEntry.findMany({
    where: {
      tenantId: ctx.tenantId,
      institutionId: scope.institutionId,
      academicYearId: scope.academicYearId,
      status: "ACTIVE",
      endDate: { gte: today },
      OR: [{ branchId: scope.branchId }, { branchId: null }]
    },
    select: {
      id: true,
      entryType: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      audiences: true,
      branchId: true
    },
    orderBy: [{ startDate: "asc" }, { name: "asc" }],
    take: 100
  });
  return {
    entries,
    context: { branchName: scope.branchName, academicYearName: scope.academicYearName },
    canManage: scope.permissions.has("campuscore.calendar.manage")
  };
}

export async function getSchoolCastSettingsWorkspace(ctx: TenantContext) {
  requireSchoolCastDeploymentCapability("providerConfiguration");
  const scope = await requestScope(ctx, "schoolcast.settings.view");
  const [features, providers] = await Promise.all([
    getSchoolCastFeatureState(ctx),
    scope.permissions.has("schoolcast.provider.view")
      ? db.schoolCastProviderConfiguration.findMany({
          where: { tenantId: ctx.tenantId },
          select: {
            id: true,
            channel: true,
            providerCode: true,
            mode: true,
            status: true,
            senderDisplayName: true,
            senderIdentifierMasked: true,
            healthStatus: true,
            isDefault: true,
            branchId: true,
            updatedAt: true
          },
          orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }]
        })
      : Promise.resolve([])
  ]);
  return {
    features,
    providers,
    context: {
      institutionId: scope.institutionId,
      branchId: scope.branchId,
      branchName: scope.branchName
    },
    capabilities: {
      canManageFeatures: scope.permissions.has("schoolcast.feature.manage"),
      canManageProviders: scope.permissions.has("schoolcast.provider.manage"),
      canTestProviders: scope.permissions.has("schoolcast.provider.test"),
      canEnableLive: scope.permissions.has("schoolcast.provider.enable_live")
    }
  };
}

export async function getSchoolCastSectionNavigation(ctx: TenantContext) {
  const scope = await requestScope(ctx, "schoolcast.dashboard.view");
  const features = await getSchoolCastFeatureState(ctx);
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const items: Array<{ title: string; href: string }> = [{ title: "Overview", href: "/schoolcast" }];
  if (features.notices && scope.permissions.has("schoolcast.communication.view")) {
    items.push({ title: "Notices", href: "/schoolcast/notices" });
    items.push({ title: "Broadcasts", href: "/schoolcast/broadcasts" });
  }
  if (features.approvals && scope.permissions.has("schoolcast.approval.view")) items.push({ title: "Approvals", href: "/schoolcast/approvals" });
  if (features.homework && scope.permissions.has("schoolcast.homework.view")) items.push({ title: "Homework", href: "/schoolcast/homework" });
  if (deploymentPolicy.templates && scope.permissions.has("schoolcast.template.view")) items.push({ title: "Templates", href: "/schoolcast/templates" });
  if (deploymentPolicy.calendar && scope.permissions.has("schoolcast.communication.view")) items.push({ title: "Calendar", href: "/schoolcast/calendar" });
  if (deploymentPolicy.deliveryOperations && scope.permissions.has("schoolcast.delivery.view")) items.push({ title: "Delivery", href: "/schoolcast/delivery" });
  if (features.analytics && scope.permissions.has("schoolcast.analytics.view")) items.push({ title: "Analytics", href: "/schoolcast/analytics" });
  if (deploymentPolicy.providerConfiguration && scope.permissions.has("schoolcast.settings.view")) items.push({ title: "Settings", href: "/schoolcast/settings" });
  return items;
}
