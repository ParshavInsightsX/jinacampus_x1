import {
  Prisma,
  type NotificationChannel,
  type SchoolCastCommunicationStatus,
  type SchoolCastCommunicationType
} from "@prisma/client";
import type { z } from "zod";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import {
  assertSchoolCastAudienceRulesDeployed,
  assertSchoolCastChannelsDeployed,
  requireSchoolCastDeploymentCapability
} from "@/modules/schoolcast/deployment-policy";
import { getSchoolCastFeatureState, requireSchoolCastSubfeature } from "@/modules/schoolcast/feature";
import {
  archiveSchoolCastCommunicationSchema,
  cancelSchoolCastCommunicationSchema,
  createSchoolCastCommunicationSchema,
  decideSchoolCastApprovalSchema,
  scheduleSchoolCastCommunicationSchema,
  schoolCastAudienceRuleSchema,
  schoolCastCommunicationIdSchema,
  submitSchoolCastCommunicationSchema,
  updateSchoolCastCommunicationSchema
} from "@/modules/schoolcast/schemas";
import {
  resolveSchoolCastAudience,
  type SchoolCastAudienceRuleInput,
  type SchoolCastResolvedRecipient
} from "@/modules/schoolcast/services/audience.service";
import { evaluateSchoolCastEligibility } from "@/modules/schoolcast/services/eligibility.service";
import { resolveSchoolCastScope } from "@/modules/schoolcast/services/scope.service";
import {
  assertSafeSchoolCastText,
  assertSchoolCastTransition,
  maskSchoolCastEmail,
  maskSchoolCastPhone,
  renderSchoolCastPlainTextHtml,
  schoolCastContactHash,
  schoolCastContentHash,
  schoolCastIdempotencyKey
} from "@/modules/schoolcast/policy";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isHomeworkCommunication(type: SchoolCastCommunicationType) {
  return type === "HOMEWORK" || type === "CLASSWORK";
}

async function requireCommunicationFeature(ctx: TenantContext, type: SchoolCastCommunicationType) {
  return requireSchoolCastSubfeature(
    ctx,
    isHomeworkCommunication(type) ? "homework" : type === "AUTOMATION" ? "automation" : "notices"
  );
}

type CommunicationPermission = PermissionCode | ((type: SchoolCastCommunicationType) => PermissionCode);

function channelsForState(
  selected: readonly NotificationChannel[],
  state: Awaited<ReturnType<typeof getSchoolCastFeatureState>>
) {
  return selected.map((channel) => ({
    channel,
    enabled: channel === "IN_APP" ? state.inApp : channel === "EMAIL" ? state.email : state.whatsApp
  }));
}

async function buildChannelPlanData(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    institutionId: string;
    branchId: string;
    communicationId: string;
    selected: readonly NotificationChannel[];
    state: Awaited<ReturnType<typeof getSchoolCastFeatureState>>;
  }
) {
  const rows: Prisma.SchoolCastChannelPlanCreateManyInput[] = [];
  for (const selection of channelsForState(input.selected, input.state)) {
    let providerConfigId: string | null = null;
    let status: "READY" | "BLOCKED" = selection.enabled ? "READY" : "BLOCKED";
    if (selection.channel !== "IN_APP" && selection.enabled && input.state.deliveryMode !== "DRY_RUN") {
      const provider = await tx.schoolCastProviderConfiguration.findFirst({
        where: {
          tenantId: input.tenantId,
          channel: selection.channel,
          mode: input.state.deliveryMode,
          status: "READY",
          isDefault: true,
          OR: [
            { branchId: input.branchId },
            { branchId: null, institutionId: input.institutionId },
            { branchId: null, institutionId: null }
          ]
        },
        select: { id: true }
      });
      providerConfigId = provider?.id ?? null;
      if (!providerConfigId) status = "BLOCKED";
    }
    rows.push({
      tenantId: input.tenantId,
      communicationId: input.communicationId,
      channel: selection.channel,
      providerConfigId,
      status
    });
  }
  return rows;
}

function parseStoredRule(rule: {
  ruleType: SchoolCastAudienceRuleInput["ruleType"];
  mode: SchoolCastAudienceRuleInput["mode"];
  label: string | null;
  criteriaJson: Prisma.JsonValue;
}) {
  const criteria = rule.criteriaJson && typeof rule.criteriaJson === "object" && !Array.isArray(rule.criteriaJson)
    ? rule.criteriaJson as Record<string, unknown>
    : {};
  return schoolCastAudienceRuleSchema.parse({
    ruleType: rule.ruleType,
    mode: rule.mode,
    label: rule.label ?? undefined,
    targetIds: criteria.targetIds ?? [],
    roleCodes: criteria.roleCodes ?? [],
    recipientTypes: criteria.recipientTypes ?? []
  });
}

async function requireCommunicationAccess(
  ctx: TenantContext,
  communicationId: string,
  permission: CommunicationPermission
) {
  const communication = await db.schoolCastCommunication.findFirst({
    where: { id: communicationId, tenantId: ctx.tenantId },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      institutionId: true,
      type: true,
      status: true,
      currentVersionId: true,
      scheduledAtUtc: true
    }
  });
  if (!communication) throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
  if (!communication.branchId || !communication.academicYearId || !ctx.accessibleBranchIds.includes(communication.branchId)) {
    throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
  }
  const requiredPermission = typeof permission === "function" ? permission(communication.type) : permission;
  await requirePermission({
    ctx,
    permission: requiredPermission,
    branchId: communication.branchId,
    academicYearId: communication.academicYearId
  });
  return communication;
}

export async function createSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = createSchoolCastCommunicationSchema.parse(input);
  assertSchoolCastAudienceRulesDeployed(data.audienceRules.map((rule) => rule.ruleType));
  assertSchoolCastChannelsDeployed(data.channels);
  const state = await requireSchoolCastSubfeature(ctx, "notices");
  const scope = await resolveSchoolCastScope(ctx, data.branchId, data.academicYearId);
  await requirePermission({ ctx, permission: "schoolcast.communication.create", branchId: scope.branchId, academicYearId: scope.academicYearId });
  if (data.type === "EMERGENCY") {
    await requirePermission({ ctx, permission: "schoolcast.emergency.create", branchId: scope.branchId, academicYearId: scope.academicYearId });
  }

  const safeContent = assertSafeSchoolCastText(data.content);
  return db.$transaction(async (tx) => {
    const preview = await resolveSchoolCastAudience(tx, {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      rules: data.audienceRules
    });
    if (preview.length === 0) throw new Error("SCHOOLCAST_AUDIENCE_EMPTY");

    const communication = await tx.schoolCastCommunication.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        type: data.type,
        category: data.category,
        priority: data.priority,
        status: "DRAFT",
        timeZoneId: scope.timeZone,
        validFrom: data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        acknowledgementRequired: data.acknowledgementRequired,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });
    const contentSnapshot = {
      title: data.title,
      summary: data.summary ?? null,
      contentText: safeContent,
      languageCode: data.languageCode
    };
    const version = await tx.schoolCastCommunicationVersion.create({
      data: {
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        versionNo: 1,
        title: data.title,
        summary: data.summary,
        contentText: safeContent,
        contentHtmlSanitized: renderSchoolCastPlainTextHtml(safeContent),
        contentHash: schoolCastContentHash(contentSnapshot),
        languageCode: data.languageCode,
        createdById: ctx.userId
      }
    });
    await tx.schoolCastCommunication.update({ where: { id: communication.id }, data: { currentVersionId: version.id } });
    await tx.schoolCastAudienceRule.createMany({
      data: data.audienceRules.map((rule, sequence) => ({
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        ruleType: rule.ruleType,
        mode: rule.mode,
        sequence,
        label: rule.label,
        criteriaJson: json({ targetIds: rule.targetIds, roleCodes: rule.roleCodes, recipientTypes: rule.recipientTypes })
      }))
    });
    const channelPlans = await buildChannelPlanData(tx, {
      tenantId: ctx.tenantId,
      institutionId: scope.institutionId,
      branchId: scope.branchId,
      communicationId: communication.id,
      selected: data.channels,
      state
    });
    await tx.schoolCastChannelPlan.createMany({ data: channelPlans });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_CREATED,
      entityType: "SchoolCastCommunication",
      entityId: communication.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      after: {
        type: communication.type,
        category: communication.category,
        priority: communication.priority,
        status: communication.status,
        versionNo: version.versionNo,
        contentHash: version.contentHash
      },
      metadata: { audienceCount: preview.length, channels: data.channels, deliveryMode: state.deliveryMode }
    }, tx);
    return { id: communication.id, versionId: version.id, previewRecipientCount: preview.length };
  });
}

export async function updateSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = updateSchoolCastCommunicationSchema.parse(input);
  if (data.audienceRules) {
    assertSchoolCastAudienceRulesDeployed(data.audienceRules.map((rule) => rule.ruleType));
  }
  if (data.channels) assertSchoolCastChannelsDeployed(data.channels);
  await requireSchoolCastSubfeature(ctx, "notices");
  const current = await requireCommunicationAccess(ctx, data.communicationId, "schoolcast.communication.edit");
  assertSchoolCastTransition(current.status, ["DRAFT", "REJECTED"]);
  const safeContent = assertSafeSchoolCastText(data.content);

  return db.$transaction(async (tx) => {
    const communication = await tx.schoolCastCommunication.findFirst({
      where: { id: data.communicationId, tenantId: ctx.tenantId },
      include: { currentVersion: true, audienceRules: true, channelPlans: true }
    });
    if (!communication?.currentVersion || !communication.branchId || !communication.academicYearId || !communication.institutionId) {
      throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
    }
    const versionNo = communication.currentVersion.versionNo + 1;
    const snapshot = { title: data.title, summary: data.summary ?? null, contentText: safeContent, languageCode: data.languageCode };
    const version = await tx.schoolCastCommunicationVersion.create({
      data: {
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        versionNo,
        title: data.title,
        summary: data.summary,
        contentText: safeContent,
        contentHtmlSanitized: renderSchoolCastPlainTextHtml(safeContent),
        contentHash: schoolCastContentHash(snapshot),
        languageCode: data.languageCode,
        createdById: ctx.userId
      }
    });
    await tx.schoolCastCommunication.update({
      where: { id: communication.id },
      data: {
        currentVersionId: version.id,
        status: "DRAFT",
        category: data.category,
        priority: data.priority,
        validFrom: data.validFrom === undefined ? undefined : data.validFrom ? new Date(data.validFrom) : null,
        validUntil: data.validUntil === undefined ? undefined : data.validUntil ? new Date(data.validUntil) : null,
        acknowledgementRequired: data.acknowledgementRequired,
        updatedById: ctx.userId,
        submittedAt: null,
        approvedAt: null
      }
    });
    if (data.audienceRules) {
      const preview = await resolveSchoolCastAudience(tx, {
        tenantId: ctx.tenantId,
        branchId: communication.branchId,
        academicYearId: communication.academicYearId,
        rules: data.audienceRules
      });
      if (preview.length === 0) throw new Error("SCHOOLCAST_AUDIENCE_EMPTY");
      await tx.schoolCastAudienceRule.deleteMany({ where: { tenantId: ctx.tenantId, communicationId: communication.id } });
      await tx.schoolCastAudienceRule.createMany({
        data: data.audienceRules.map((rule, sequence) => ({
          tenantId: ctx.tenantId,
          communicationId: communication.id,
          ruleType: rule.ruleType,
          mode: rule.mode,
          sequence,
          label: rule.label,
          criteriaJson: json({ targetIds: rule.targetIds, roleCodes: rule.roleCodes, recipientTypes: rule.recipientTypes })
        }))
      });
    }
    if (data.channels) {
      const state = await getSchoolCastFeatureState(ctx);
      await tx.schoolCastChannelPlan.deleteMany({ where: { tenantId: ctx.tenantId, communicationId: communication.id } });
      await tx.schoolCastChannelPlan.createMany({
        data: await buildChannelPlanData(tx, {
          tenantId: ctx.tenantId,
          institutionId: communication.institutionId,
          branchId: communication.branchId,
          communicationId: communication.id,
          selected: data.channels,
          state
        })
      });
    }
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_UPDATED,
      entityType: "SchoolCastCommunication",
      entityId: communication.id,
      branchId: communication.branchId,
      academicYearId: communication.academicYearId,
      before: { versionNo: communication.currentVersion.versionNo, contentHash: communication.currentVersion.contentHash },
      after: { versionNo, contentHash: version.contentHash, status: "DRAFT" }
    }, tx);
    return { id: communication.id, versionId: version.id, versionNo };
  });
}

export async function submitSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = submitSchoolCastCommunicationSchema.parse(input);
  const current = await requireCommunicationAccess(ctx, data.communicationId, (type) =>
    isHomeworkCommunication(type) ? "schoolcast.homework.submit" : "schoolcast.communication.submit"
  );
  const state = await requireCommunicationFeature(ctx, current.type);
  assertSchoolCastTransition(current.status, ["DRAFT", "REJECTED"]);
  if (!current.currentVersionId) throw new Error("SCHOOLCAST_VERSION_REQUIRED");

  return db.$transaction(async (tx) => {
    const nextStatus: SchoolCastCommunicationStatus = state.approvals ? "PENDING_APPROVAL" : "APPROVED";
    const updated = await tx.schoolCastCommunication.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        submittedAt: new Date(),
        approvedAt: state.approvals ? null : new Date(),
        updatedById: ctx.userId
      }
    });
    if (state.approvals) {
      const approval = await tx.schoolCastApproval.create({
        data: {
          tenantId: ctx.tenantId,
          communicationId: current.id,
          communicationVersionId: current.currentVersionId!,
          requiredPermission: current.type === "EMERGENCY"
            ? "schoolcast.emergency.publish"
            : isHomeworkCommunication(current.type)
              ? "schoolcast.homework.approve"
              : "schoolcast.communication.approve",
          selfApprovalAllowed: false,
          submittedById: ctx.userId
        }
      });
      await tx.schoolCastApprovalAction.create({
        data: {
          tenantId: ctx.tenantId,
          approvalId: approval.id,
          actorUserId: ctx.userId,
          action: "SUBMITTED",
          reason: data.reason
        }
      });
    }
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_SUBMITTED,
      entityType: "SchoolCastCommunication",
      entityId: current.id,
      branchId: current.branchId,
      academicYearId: current.academicYearId,
      before: { status: current.status },
      after: { status: nextStatus, versionId: current.currentVersionId }
    }, tx);
    return { id: updated.id, status: updated.status };
  });
}

export async function decideSchoolCastApproval(ctx: TenantContext, input: unknown) {
  const data = decideSchoolCastApprovalSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "approvals");
  const current = await requireCommunicationAccess(ctx, data.communicationId, (type) => {
    if (isHomeworkCommunication(type)) return "schoolcast.homework.approve";
    return data.decision === "APPROVED" ? "schoolcast.communication.approve" : "schoolcast.communication.reject";
  });
  assertSchoolCastTransition(current.status, ["PENDING_APPROVAL"]);

  return db.$transaction(async (tx) => {
    const approval = await tx.schoolCastApproval.findFirst({
      where: { tenantId: ctx.tenantId, communicationId: current.id, status: "PENDING" },
      orderBy: { submittedAt: "desc" }
    });
    if (!approval) throw notFound("SCHOOLCAST_APPROVAL_NOT_FOUND");
    if (!approval.selfApprovalAllowed && approval.submittedById === ctx.userId) {
      throw forbidden("SCHOOLCAST_SELF_APPROVAL_FORBIDDEN");
    }
    const approvalStatus = data.decision === "APPROVED" ? "APPROVED" : data.decision === "REJECTED" ? "REJECTED" : "RETURNED";
    const communicationStatus: SchoolCastCommunicationStatus = data.decision === "APPROVED" ? "APPROVED" : "REJECTED";
    await tx.schoolCastApprovalAction.create({
      data: {
        tenantId: ctx.tenantId,
        approvalId: approval.id,
        actorUserId: ctx.userId,
        action: data.decision,
        reason: data.reason
      }
    });
    await tx.schoolCastApproval.update({ where: { id: approval.id }, data: { status: approvalStatus, completedAt: new Date() } });
    await tx.schoolCastCommunication.update({
      where: { id: current.id },
      data: { status: communicationStatus, approvedAt: data.decision === "APPROVED" ? new Date() : null, updatedById: ctx.userId }
    });
    const auditAction = data.decision === "APPROVED"
      ? SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_APPROVED
      : data.decision === "REJECTED"
        ? SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_REJECTED
        : SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_RETURNED;
    await writeAuditLog({
      ctx,
      action: auditAction,
      entityType: "SchoolCastCommunication",
      entityId: current.id,
      branchId: current.branchId,
      academicYearId: current.academicYearId,
      before: { status: current.status },
      after: { status: communicationStatus, approvalId: approval.id },
      metadata: { reasonProvided: Boolean(data.reason) }
    }, tx);
    return { id: current.id, status: communicationStatus };
  });
}

export async function scheduleSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = scheduleSchoolCastCommunicationSchema.parse(input);
  requireSchoolCastDeploymentCapability("scheduling");
  const current = await requireCommunicationAccess(ctx, data.communicationId, "schoolcast.communication.schedule");
  await requireCommunicationFeature(ctx, current.type);
  assertSchoolCastTransition(current.status, ["APPROVED"]);
  const scheduledAt = new Date(data.scheduledAt);
  if (scheduledAt <= new Date()) throw new Error("SCHOOLCAST_SCHEDULE_MUST_BE_FUTURE");
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.schoolCastCommunication.update({
      where: { id: current.id },
      data: { status: "SCHEDULED", scheduledAtUtc: scheduledAt, updatedById: ctx.userId }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_SCHEDULED,
      entityType: "SchoolCastCommunication",
      entityId: current.id,
      branchId: current.branchId,
      academicYearId: current.academicYearId,
      before: { status: current.status },
      after: { status: row.status, scheduledAtUtc: scheduledAt.toISOString(), timeZoneId: row.timeZoneId }
    }, tx);
    return row;
  });
  return { id: updated.id, status: updated.status, scheduledAtUtc: updated.scheduledAtUtc };
}

function recipientEntityId(recipient: SchoolCastResolvedRecipient) {
  return recipient.userId ?? recipient.guardianId ?? recipient.staffId ?? recipient.studentId;
}

type SchoolCastPublicationExecution = {
  source?: "USER" | "SCHEDULER" | "AUTOMATION";
  auditActorUserId?: string | null;
  claimedAt?: Date;
};

async function requireAutomationCommunicationAccess(ctx: TenantContext, communicationId: string) {
  const communication = await db.schoolCastCommunication.findFirst({
    where: {
      id: communicationId,
      tenantId: ctx.tenantId,
      type: "AUTOMATION",
      sourceModule: { not: null },
      sourceEntityId: { not: null },
      sourceEntityVersionId: { not: null }
    },
    select: {
      id: true,
      branchId: true,
      academicYearId: true,
      institutionId: true,
      type: true,
      status: true,
      currentVersionId: true,
      scheduledAtUtc: true
    }
  });
  if (
    !communication?.branchId
    || !communication.academicYearId
    || !ctx.accessibleBranchIds.includes(communication.branchId)
    || communication.academicYearId !== ctx.activeAcademicYearId
  ) {
    throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
  }
  return communication;
}

async function assertSchoolCastAttachmentsSafe(
  tx: Prisma.TransactionClient,
  input: { tenantId: string; communicationId: string; communicationVersionId: string }
) {
  const homeworkVersions = await tx.schoolCastHomeworkItem.findMany({
    where: { tenantId: input.tenantId, communicationId: input.communicationId },
    select: { currentVersionId: true }
  });
  const homeworkVersionIds = homeworkVersions
    .map((item) => item.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const attachmentScopes: Prisma.SchoolCastAttachmentWhereInput[] = [
    { communicationVersionId: input.communicationVersionId }
  ];
  if (homeworkVersionIds.length > 0) {
    attachmentScopes.push({ homeworkVersionId: { in: homeworkVersionIds } });
  }
  const unsafeAttachment = await tx.schoolCastAttachment.findFirst({
    where: {
      tenantId: input.tenantId,
      deletedAt: null,
      scanStatus: { not: "SAFE" },
      OR: attachmentScopes
    },
    select: { id: true }
  });
  if (unsafeAttachment) throw new Error("SCHOOLCAST_ATTACHMENTS_NOT_SAFE");
}

export async function publishSchoolCastCommunication(
  ctx: TenantContext,
  input: unknown,
  execution: SchoolCastPublicationExecution = {}
) {
  const data = schoolCastCommunicationIdSchema.parse(input);
  const current = execution.source === "AUTOMATION"
    ? await requireAutomationCommunicationAccess(ctx, data.communicationId)
    : await requireCommunicationAccess(
        ctx,
        data.communicationId,
        (type) => isHomeworkCommunication(type) ? "schoolcast.homework.publish" : "schoolcast.communication.publish"
      );
  const state = await requireCommunicationFeature(ctx, current.type);
  if (current.type === "EMERGENCY") {
    await requirePermission({ ctx, permission: "schoolcast.emergency.publish", branchId: current.branchId!, academicYearId: current.academicYearId! });
  }
  assertSchoolCastTransition(
    current.status,
    execution.source === "SCHEDULER"
      ? ["PUBLISHING"]
      : execution.source === "AUTOMATION"
        ? ["APPROVED", "PUBLISHED"]
        : ["APPROVED", "SCHEDULED", "PUBLISHED"]
  );
  if (current.status === "SCHEDULED" && current.scheduledAtUtc && current.scheduledAtUtc > new Date()) {
    throw new Error("SCHOOLCAST_SCHEDULE_NOT_DUE");
  }

  return db.$transaction(async (tx) => {
    if (execution.source === "SCHEDULER") {
      if (!execution.claimedAt) throw new Error("SCHOOLCAST_PUBLICATION_CLAIM_REQUIRED");
      await tx.$queryRaw(Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtext('schoolcast-publication'),
          hashtext(${current.id})
        )
      `);
    }
    const communication = await tx.schoolCastCommunication.findFirst({
      where: {
        id: current.id,
        tenantId: ctx.tenantId,
        ...(execution.source === "SCHEDULER"
          ? { status: "PUBLISHING" as const, updatedAt: execution.claimedAt }
          : {})
      },
      include: {
        currentVersion: true,
        audienceRules: { orderBy: { sequence: "asc" } },
        channelPlans: true
      }
    });
    if (!communication?.currentVersion || !communication.branchId || !communication.academicYearId) {
      throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
    }
    const existingSnapshots = await tx.schoolCastRecipientSnapshot.count({
      where: { tenantId: ctx.tenantId, communicationVersionId: communication.currentVersion.id }
    });
    if (communication.status === "PUBLISHED" && existingSnapshots > 0) {
      return { id: communication.id, status: communication.status, alreadyPublished: true, recipientCount: existingSnapshots };
    }
    if (execution.source === "SCHEDULER") {
      if (communication.status !== "PUBLISHING") throw new Error("SCHOOLCAST_PUBLICATION_NOT_CLAIMED");
    } else {
      const claimed = await tx.schoolCastCommunication.updateMany({
        where: { id: communication.id, tenantId: ctx.tenantId, status: communication.status },
        data: { status: "PUBLISHING" }
      });
      if (claimed.count !== 1) throw new Error("SCHOOLCAST_PUBLICATION_IN_PROGRESS");
    }
    await assertSchoolCastAttachmentsSafe(tx, {
      tenantId: ctx.tenantId,
      communicationId: communication.id,
      communicationVersionId: communication.currentVersion.id
    });
    const rules = communication.audienceRules.map(parseStoredRule);
    const recipients = await resolveSchoolCastAudience(tx, {
      tenantId: ctx.tenantId,
      branchId: communication.branchId,
      academicYearId: communication.academicYearId,
      rules
    });
    if (recipients.length === 0) throw new Error("SCHOOLCAST_AUDIENCE_EMPTY");
    const readyPlans = communication.channelPlans.filter((plan) => plan.status === "READY");
    if (readyPlans.length === 0) throw new Error("SCHOOLCAST_NO_READY_CHANNEL");
    const purpose = communication.type;
    const eligibility = await evaluateSchoolCastEligibility(tx, {
      tenantId: ctx.tenantId,
      purpose,
      featureState: state,
      recipients,
      channels: readyPlans.map((plan) => plan.channel)
    });

    await tx.schoolCastRecipientSnapshot.createMany({
      data: recipients.map((recipient) => ({
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        communicationVersionId: communication.currentVersion!.id,
        recipientType: recipient.recipientType,
        stableRecipientKey: recipient.stableRecipientKey,
        userId: recipient.userId,
        studentId: recipient.studentId,
        guardianId: recipient.guardianId,
        staffId: recipient.staffId,
        relationship: recipient.relationship,
        displayName: recipient.displayName,
        contactEmailMasked: maskSchoolCastEmail(recipient.email),
        contactEmailHash: schoolCastContactHash(recipient.email),
        contactPhoneMasked: maskSchoolCastPhone(recipient.phone),
        contactPhoneHash: schoolCastContactHash(recipient.phone),
        eligibilityJson: json(eligibility.get(recipient.stableRecipientKey)?.map(({ channel, eligible, reasonCode }) => ({ channel, eligible, reasonCode })) ?? [])
      })),
      skipDuplicates: true
    });
    const snapshots = await tx.schoolCastRecipientSnapshot.findMany({
      where: { tenantId: ctx.tenantId, communicationVersionId: communication.currentVersion.id },
      select: { id: true, stableRecipientKey: true, userId: true, recipientType: true, user: { select: { id: true } } }
    });
    const recipientByKey = new Map(recipients.map((recipient) => [recipient.stableRecipientKey, recipient]));
    const eligibilityRows: Prisma.SchoolCastRecipientChannelEligibilityCreateManyInput[] = [];
    const inAppRows: Prisma.InAppNotificationCreateManyInput[] = [];
    const outboxRows: Prisma.NotificationOutboxCreateManyInput[] = [];

    for (const snapshot of snapshots) {
      const recipient = recipientByKey.get(snapshot.stableRecipientKey);
      if (!recipient) continue;
      const decisions = eligibility.get(snapshot.stableRecipientKey) ?? [];
      for (const decision of decisions) {
        eligibilityRows.push({
          tenantId: ctx.tenantId,
          recipientSnapshotId: snapshot.id,
          channel: decision.channel,
          purpose,
          eligible: decision.eligible,
          reasonCode: decision.reasonCode,
          consentRecordId: decision.consentRecordId
        });
        const plan = readyPlans.find((candidate) => candidate.channel === decision.channel);
        if (!decision.eligible || !plan) continue;
        if (decision.channel === "IN_APP" && snapshot.userId) {
          inAppRows.push({
            tenantId: ctx.tenantId,
            branchId: communication.branchId,
            userId: snapshot.userId,
            communicationId: communication.id,
            communicationVersionId: communication.currentVersion.id,
            recipientSnapshotId: snapshot.id,
            type: `SCHOOLCAST_${communication.type}`,
            title: communication.currentVersion.title,
            message: communication.currentVersion.summary ?? communication.currentVersion.contentText.slice(0, 500),
            actionUrl: `/schoolcast/communications/${communication.id}`,
            priority: communication.priority,
            acknowledgementRequired: communication.acknowledgementRequired,
            expiresAt: communication.validUntil
          });
          continue;
        }
        if (decision.channel === "IN_APP") continue;
        const entityId = recipientEntityId(recipient);
        if (!entityId) continue;
        const payload = {
          communicationId: communication.id,
          versionId: communication.currentVersion.id,
          type: communication.type,
          title: communication.currentVersion.title,
          summary: communication.currentVersion.summary,
          contentText: communication.currentVersion.contentText,
          recipientDisplayName: recipient.displayName,
          relatedRoute: `/schoolcast/communications/${communication.id}`,
          languageCode: communication.currentVersion.languageCode
        };
        outboxRows.push({
          tenantId: ctx.tenantId,
          branchId: communication.branchId,
          academicYearId: communication.academicYearId,
          schoolCastCommunicationId: communication.id,
          communicationVersionId: communication.currentVersion.id,
          recipientSnapshotId: snapshot.id,
          channelPlanId: plan.id,
          providerConfigId: plan.providerConfigId,
          templateVersionId: plan.templateVersionId,
          channel: decision.channel,
          templateKey: `schoolcast.${communication.type.toLowerCase()}`,
          recipientType: recipient.recipientType,
          recipientId: entityId,
          recipientAddressEncrypted: decision.encryptedAddress,
          payloadJson: json(payload),
          payloadHash: schoolCastContentHash(payload),
          status: "QUEUED",
          mode: state.deliveryMode,
          priority: communication.priority,
          idempotencyKey: schoolCastIdempotencyKey([
            communication.currentVersion.id,
            snapshot.stableRecipientKey,
            decision.channel,
            plan.templateVersionId,
            purpose
          ]),
          scheduledFor: new Date(),
          availableAt: new Date(),
          expiresAt: communication.validUntil
        });
      }
    }
    if (eligibilityRows.length > 0) await tx.schoolCastRecipientChannelEligibility.createMany({ data: eligibilityRows, skipDuplicates: true });
    if (inAppRows.length > 0) await tx.inAppNotification.createMany({ data: inAppRows, skipDuplicates: true });
    if (outboxRows.length > 0) await tx.notificationOutbox.createMany({ data: outboxRows, skipDuplicates: true });

    const publishedAt = new Date();
    const updated = await tx.schoolCastCommunication.update({
      where: { id: communication.id },
      data: {
        status: "PUBLISHED",
        publishedAt,
        scheduledAtUtc: null,
        lastPublicationError: null,
        updatedById: ctx.userId
      }
    });
    if (isHomeworkCommunication(communication.type)) {
      await tx.schoolCastHomeworkItem.updateMany({
        where: { tenantId: ctx.tenantId, communicationId: communication.id },
        data: { status: "PUBLISHED", publishedAt }
      });
    }
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_PUBLISHED,
      entityType: "SchoolCastCommunication",
      entityId: communication.id,
      actorUserId: execution.auditActorUserId,
      branchId: communication.branchId,
      academicYearId: communication.academicYearId,
      before: { status: communication.status },
      after: { status: updated.status, versionId: communication.currentVersion.id, contentHash: communication.currentVersion.contentHash },
      metadata: {
        recipientCount: snapshots.length,
        inAppCount: inAppRows.length,
        externalQueuedCount: outboxRows.length,
        excludedChannelCount: eligibilityRows.filter((row) => !row.eligible).length,
        deliveryMode: state.deliveryMode,
        executionSource: execution.source ?? "USER"
      }
    }, tx);
    return {
      id: communication.id,
      status: updated.status,
      alreadyPublished: false,
      recipientCount: snapshots.length,
      inAppCount: inAppRows.length,
      externalQueuedCount: outboxRows.length
    };
  }, { timeout: 30_000 });
}

export async function cancelSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = cancelSchoolCastCommunicationSchema.parse(input);
  const current = await requireCommunicationAccess(ctx, data.communicationId, (type) =>
    isHomeworkCommunication(type) ? "schoolcast.homework.cancel" : "schoolcast.communication.cancel"
  );
  await requireCommunicationFeature(ctx, current.type);
  assertSchoolCastTransition(current.status, ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED"]);
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolCastCommunication.update({
      where: { id: current.id },
      data: { status: "CANCELLED", cancelledAt: new Date(), updatedById: ctx.userId }
    });
    if (isHomeworkCommunication(current.type)) {
      await tx.schoolCastHomeworkItem.updateMany({
        where: { tenantId: ctx.tenantId, communicationId: current.id },
        data: { status: "CANCELLED", cancelledAt: new Date() }
      });
    }
    await tx.notificationOutbox.updateMany({
      where: {
        tenantId: ctx.tenantId,
        schoolCastCommunicationId: current.id,
        status: { in: ["QUEUED", "RETRYING"] }
      },
      data: { status: "CANCELLED", failureReason: "COMMUNICATION_CANCELLED", leaseUntil: null, lockOwner: null, lockedAt: null }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_CANCELLED,
      entityType: "SchoolCastCommunication",
      entityId: current.id,
      branchId: current.branchId,
      academicYearId: current.academicYearId,
      before: { status: current.status },
      after: { status: updated.status },
      metadata: { reason: data.reason }
    }, tx);
    return { id: updated.id, status: updated.status };
  });
}
export async function archiveSchoolCastCommunication(ctx: TenantContext, input: unknown) {
  const data = archiveSchoolCastCommunicationSchema.parse(input);
  const current = await requireCommunicationAccess(
    ctx,
    data.communicationId,
    "schoolcast.communication.archive"
  );
  await requireCommunicationFeature(ctx, current.type);
  assertSchoolCastTransition(current.status, [
    "PUBLISHED",
    "PARTIALLY_DELIVERED",
    "EXPIRED",
    "CANCELLED",
    "FAILED"
  ]);

  return db.$transaction(async (tx) => {
    const archivedAt = new Date();
    const updated = await tx.schoolCastCommunication.update({
      where: { id: current.id },
      data: { status: "ARCHIVED", archivedAt, updatedById: ctx.userId }
    });
    if (isHomeworkCommunication(current.type)) {
      await tx.schoolCastHomeworkItem.updateMany({
        where: { tenantId: ctx.tenantId, communicationId: current.id },
        data: { status: "ARCHIVED" }
      });
    }
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_ARCHIVED,
      entityType: "SchoolCastCommunication",
      entityId: current.id,
      branchId: current.branchId,
      academicYearId: current.academicYearId,
      before: { status: current.status },
      after: { status: updated.status, archivedAt },
      metadata: { reasonProvided: Boolean(data.reason) }
    }, tx);
    return { id: updated.id, status: updated.status, archivedAt };
  });
}

export type CreateSchoolCastSourceCommunicationInput = {
  branchId: string;
  academicYearId: string;
  type: "HOMEWORK" | "CLASSWORK" | "AUTOMATION";
  category: string;
  title: string;
  summary?: string | null;
  content: string;
  languageCode?: string;
  sourceModule: string;
  sourceEntityType: string;
  sourceEntityId: string;
  sourceEntityVersionId: string;
  audienceRules: readonly SchoolCastAudienceRuleInput[];
  channels: readonly NotificationChannel[];
};

type SchoolCastSourceCommunicationExecution = {
  source?: "USER" | "AUTOMATION";
  auditActorUserId?: string | null;
};

export async function createSchoolCastSourceCommunication(
  ctx: TenantContext,
  input: CreateSchoolCastSourceCommunicationInput,
  execution: SchoolCastSourceCommunicationExecution = {}
) {
  const state = await requireSchoolCastSubfeature(
    ctx,
    input.type === "HOMEWORK" || input.type === "CLASSWORK" ? "homework" : "automation"
  );
  const scope = await resolveSchoolCastScope(ctx, input.branchId, input.academicYearId);
  if (execution.source === "AUTOMATION") {
    if (input.type !== "AUTOMATION") throw new Error("SCHOOLCAST_AUTOMATION_TYPE_REQUIRED");
  } else {
    const permission: PermissionCode = input.type === "HOMEWORK" || input.type === "CLASSWORK"
      ? "schoolcast.homework.submit"
      : "schoolcast.automation.manage";
    await requirePermission({ ctx, permission, branchId: scope.branchId, academicYearId: scope.academicYearId });
  }
  const title = input.title.trim();
  if (title.length < 3 || title.length > 180) throw new Error("SCHOOLCAST_TITLE_INVALID");
  const safeContent = assertSafeSchoolCastText(input.content);
  const rules = input.audienceRules.map((rule) => schoolCastAudienceRuleSchema.parse(rule));
  if (rules.length === 0) throw new Error("SCHOOLCAST_AUDIENCE_EMPTY");
  const channels = Array.from(new Set(input.channels));
  if (channels.length === 0) throw new Error("SCHOOLCAST_NO_CHANNEL_SELECTED");

  return db.$transaction(async (tx) => {
    const existing = await tx.schoolCastCommunication.findFirst({
      where: {
        tenantId: ctx.tenantId,
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceEntityVersionId: input.sourceEntityVersionId
      },
      select: { id: true, currentVersionId: true, status: true }
    });
    if (existing) return { ...existing, alreadyCreated: true };

    const recipients = await resolveSchoolCastAudience(tx, {
      tenantId: ctx.tenantId,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      rules
    });
    if (recipients.length === 0) throw new Error("SCHOOLCAST_AUDIENCE_EMPTY");

    const communication = await tx.schoolCastCommunication.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        type: input.type,
        category: input.category,
        priority: "NORMAL",
        status: execution.source === "AUTOMATION" ? "APPROVED" : "DRAFT",
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        sourceEntityVersionId: input.sourceEntityVersionId,
        timeZoneId: scope.timeZone,
        approvedAt: execution.source === "AUTOMATION" ? new Date() : null,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });
    const contentSnapshot = {
      title,
      summary: input.summary ?? null,
      contentText: safeContent,
      languageCode: input.languageCode ?? "en"
    };
    const version = await tx.schoolCastCommunicationVersion.create({
      data: {
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        versionNo: 1,
        title,
        summary: input.summary,
        contentText: safeContent,
        contentHtmlSanitized: renderSchoolCastPlainTextHtml(safeContent),
        contentHash: schoolCastContentHash(contentSnapshot),
        languageCode: input.languageCode ?? "en",
        createdById: ctx.userId
      }
    });
    await tx.schoolCastCommunication.update({ where: { id: communication.id }, data: { currentVersionId: version.id } });
    await tx.schoolCastAudienceRule.createMany({
      data: rules.map((rule, sequence) => ({
        tenantId: ctx.tenantId,
        communicationId: communication.id,
        ruleType: rule.ruleType,
        mode: rule.mode,
        sequence,
        label: rule.label,
        criteriaJson: json({ targetIds: rule.targetIds, roleCodes: rule.roleCodes, recipientTypes: rule.recipientTypes })
      }))
    });
    await tx.schoolCastChannelPlan.createMany({
      data: await buildChannelPlanData(tx, {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        communicationId: communication.id,
        selected: channels,
        state
      })
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.COMMUNICATION_CREATED,
      entityType: "SchoolCastCommunication",
      entityId: communication.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      actorUserId: execution.auditActorUserId,
      after: { status: communication.status, versionId: version.id, contentHash: version.contentHash },
      metadata: {
        sourceModule: input.sourceModule,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        recipientPreviewCount: recipients.length,
        channels,
        deliveryMode: state.deliveryMode,
        executionSource: execution.source ?? "USER"
      }
    }, tx);
    return { id: communication.id, currentVersionId: version.id, status: communication.status, alreadyCreated: false };
  });
}
