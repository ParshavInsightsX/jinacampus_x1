import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import {
  assertSchoolCastFeatureRequestDeployed,
  constrainSchoolCastFeatureSettings,
  requireSchoolCastDeploymentCapability
} from "@/modules/schoolcast/deployment-policy";
import { getSchoolCastFeatureState } from "@/modules/schoolcast/feature";
import {
  createSchoolCastProviderSchema,
  schoolCastProviderIdSchema,
  updateSchoolCastFeatureSettingsSchema
} from "@/modules/schoolcast/schemas";

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function listSchoolCastProviderConfigurations(ctx: TenantContext) {
  requireSchoolCastDeploymentCapability("providerConfiguration");
  await requirePermission({ ctx, permission: "schoolcast.provider.view", branchId: ctx.activeBranchId });
  return db.schoolCastProviderConfiguration.findMany({
    where: { tenantId: ctx.tenantId },
    select: {
      id: true,
      institutionId: true,
      branchId: true,
      channel: true,
      providerCode: true,
      mode: true,
      status: true,
      senderDisplayName: true,
      senderIdentifierMasked: true,
      healthStatus: true,
      isDefault: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: [{ channel: "asc" }, { isDefault: "desc" }, { updatedAt: "desc" }]
  });
}

export async function createSchoolCastProviderConfiguration(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("providerConfiguration");
  const data = createSchoolCastProviderSchema.parse(input);
  await requirePermission({ ctx, permission: "schoolcast.provider.manage", branchId: data.branchId ?? ctx.activeBranchId });
  if (data.branchId && !ctx.accessibleBranchIds.includes(data.branchId)) throw notFound("SCHOOLCAST_PROVIDER_SCOPE_NOT_FOUND");
  if (data.institutionId && data.institutionId !== ctx.institutionId) throw notFound("SCHOOLCAST_PROVIDER_SCOPE_NOT_FOUND");
  const configurationJson = data.providerCode === "RESEND"
    ? { from: data.senderAddress }
    : { phoneNumberId: data.phoneNumberId, apiVersion: data.apiVersion };

  return db.$transaction(async (tx) => {
    if (data.isDefault) {
      await tx.schoolCastProviderConfiguration.updateMany({
        where: { tenantId: ctx.tenantId, channel: data.channel, institutionId: data.institutionId ?? null, branchId: data.branchId ?? null, isDefault: true },
        data: { isDefault: false }
      });
    }
    const provider = await tx.schoolCastProviderConfiguration.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: data.institutionId ?? ctx.institutionId,
        branchId: data.branchId,
        channel: data.channel,
        providerCode: data.providerCode,
        mode: data.mode,
        status: data.secretRef ? "READY" : data.mode === "DRY_RUN" ? "READY" : "DRAFT",
        senderDisplayName: data.senderDisplayName,
        senderIdentifierMasked: data.senderIdentifierMasked,
        secretRef: data.secretRef,
        webhookSecretRef: data.webhookSecretRef,
        configurationJson: json(configurationJson),
        healthStatus: data.mode === "DRY_RUN" ? "SIMULATION_READY" : "NOT_TESTED",
        isDefault: data.isDefault,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.PROVIDER_CREATED,
      entityType: "SchoolCastProviderConfiguration",
      entityId: provider.id,
      branchId: provider.branchId,
      after: {
        channel: provider.channel,
        providerCode: provider.providerCode,
        mode: provider.mode,
        status: provider.status,
        senderIdentifierMasked: provider.senderIdentifierMasked,
        secretReferenceConfigured: Boolean(provider.secretRef),
        webhookReferenceConfigured: Boolean(provider.webhookSecretRef),
        isDefault: provider.isDefault
      }
    }, tx);
    return { id: provider.id, channel: provider.channel, providerCode: provider.providerCode, mode: provider.mode, status: provider.status };
  });
}

export async function testSchoolCastProviderConfiguration(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("providerConfiguration");
  const data = schoolCastProviderIdSchema.parse(input);
  await requirePermission({ ctx, permission: "schoolcast.provider.test", branchId: ctx.activeBranchId });
  const provider = await db.schoolCastProviderConfiguration.findFirst({
    where: { id: data.providerConfigId, tenantId: ctx.tenantId },
    select: { id: true, branchId: true, mode: true, status: true, providerCode: true, secretRef: true, webhookSecretRef: true, configurationJson: true }
  });
  if (!provider || (provider.branchId && !ctx.accessibleBranchIds.includes(provider.branchId))) throw notFound("SCHOOLCAST_PROVIDER_NOT_FOUND");
  const secretConfigured = provider.mode === "DRY_RUN" || Boolean(provider.secretRef?.startsWith("env:") && process.env[provider.secretRef.slice(4)]);
  const ready = provider.status === "READY" && secretConfigured;
  await db.schoolCastProviderConfiguration.update({ where: { id: provider.id }, data: { healthStatus: ready ? "CONFIGURATION_READY" : "CONFIGURATION_INCOMPLETE", updatedById: ctx.userId } });
  await writeAuditLog({
    ctx,
    action: SCHOOLCAST_AUDIT_EVENTS.PROVIDER_TESTED,
    entityType: "SchoolCastProviderConfiguration",
    entityId: provider.id,
    branchId: provider.branchId,
    after: { ready, mode: provider.mode, providerCode: provider.providerCode, secretReferenceResolved: secretConfigured }
  });
  return { id: provider.id, ready, mode: provider.mode, healthStatus: ready ? "CONFIGURATION_READY" : "CONFIGURATION_INCOMPLETE" };
}

export async function updateSchoolCastFeatureSettings(ctx: TenantContext, input: unknown) {
  const data = updateSchoolCastFeatureSettingsSchema.parse(input);
  assertSchoolCastFeatureRequestDeployed(data);
  const effectiveData = constrainSchoolCastFeatureSettings(data);
  await requirePermission({ ctx, permission: "schoolcast.feature.manage", branchId: ctx.activeBranchId });
  if (effectiveData.deliveryMode === "LIVE") {
    await requirePermission({ ctx, permission: "schoolcast.provider.enable_live", branchId: ctx.activeBranchId });
    const readyChannels = await db.schoolCastProviderConfiguration.count({
      where: {
        tenantId: ctx.tenantId,
        mode: "LIVE",
        status: "READY",
        isDefault: true,
        channel: { in: [effectiveData.email ? "EMAIL" : "IN_APP", effectiveData.whatsApp ? "WHATSAPP" : "IN_APP"].filter((channel) => channel !== "IN_APP") as Array<"EMAIL" | "WHATSAPP"> }
      }
    });
    const requiredChannels = Number(effectiveData.email) + Number(effectiveData.whatsApp);
    if (readyChannels < requiredChannels) throw new Error("SCHOOLCAST_LIVE_PROVIDER_NOT_READY");
  }
  const before = await getSchoolCastFeatureState(ctx);
  const saved = await db.tenantSettings.upsert({
    where: { tenantId: ctx.tenantId },
    create: {
      tenantId: ctx.tenantId,
      schoolCastEnabled: effectiveData.enabled,
      schoolCastInAppEnabled: effectiveData.inApp,
      schoolCastNoticesEnabled: effectiveData.notices,
      schoolCastHomeworkEnabled: effectiveData.homework,
      schoolCastApprovalsEnabled: effectiveData.approvals,
      schoolCastEmailEnabled: effectiveData.email,
      schoolCastWhatsAppEnabled: effectiveData.whatsApp,
      schoolCastAutomationEnabled: effectiveData.automation,
      schoolCastAnalyticsEnabled: effectiveData.analytics,
      schoolCastDeliveryMode: effectiveData.deliveryMode,
      schoolCastTeacherDirectPublish: effectiveData.teacherDirectPublish
    },
    update: {
      schoolCastEnabled: effectiveData.enabled,
      schoolCastInAppEnabled: effectiveData.inApp,
      schoolCastNoticesEnabled: effectiveData.notices,
      schoolCastHomeworkEnabled: effectiveData.homework,
      schoolCastApprovalsEnabled: effectiveData.approvals,
      schoolCastEmailEnabled: effectiveData.email,
      schoolCastWhatsAppEnabled: effectiveData.whatsApp,
      schoolCastAutomationEnabled: effectiveData.automation,
      schoolCastAnalyticsEnabled: effectiveData.analytics,
      schoolCastDeliveryMode: effectiveData.deliveryMode,
      schoolCastTeacherDirectPublish: effectiveData.teacherDirectPublish
    }
  });
  await writeAuditLog({
    ctx,
    action: "schoolcast.settings.updated",
    entityType: "TenantSettings",
    entityId: saved.id,
    before,
    after: effectiveData
  });
  return effectiveData;
}