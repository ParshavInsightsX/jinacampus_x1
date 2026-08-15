import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { requireSchoolCastDeploymentCapability } from "@/modules/schoolcast/deployment-policy";
import { requireSchoolCastEnabled } from "@/modules/schoolcast/feature";
import {
  createSchoolCastTemplateSchema,
  schoolCastTemplateIdSchema,
  updateSchoolCastTemplateSchema,
} from "@/modules/schoolcast/schemas";
import {
  assertSafeSchoolCastText,
  renderSchoolCastPlainTextHtml,
  schoolCastContentHash,
} from "@/modules/schoolcast/policy";
import { resolveSchoolCastScope } from "@/modules/schoolcast/services/scope.service";

function variableSchema(names: readonly string[]): Prisma.InputJsonValue {
  return {
    type: "object",
    required: [...names],
    properties: Object.fromEntries(names.map((name) => [name, { type: "string" }])),
    additionalProperties: false,
  };
}

export async function createSchoolCastTemplate(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("templates");
  const data = createSchoolCastTemplateSchema.parse(input);
  await requireSchoolCastEnabled(ctx);
  const scope = await resolveSchoolCastScope(ctx, data.branchId ?? ctx.activeBranchId, ctx.activeAcademicYearId);
  await requirePermission({
    ctx,
    permission: "schoolcast.template.create",
    branchId: scope.branchId,
    academicYearId: scope.academicYearId,
  });
  if (data.activate) {
    await requirePermission({
      ctx,
      permission: "schoolcast.template.activate",
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
    });
  }
  const bodyText = assertSafeSchoolCastText(data.bodyText);
  const bodyHtmlSanitized = renderSchoolCastPlainTextHtml(bodyText);
  const contentHash = schoolCastContentHash({
    channel: data.channel,
    languageCode: data.languageCode,
    subject: data.subject ?? null,
    bodyText,
    variables: data.variableNames,
  });

  return db.$transaction(async (tx) => {
    const existing = await tx.notificationTemplate.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: data.branchId ?? null,
        channel: data.channel,
        templateKey: data.templateKey,
        languageCode: data.languageCode,
      },
      select: { id: true },
    });
    if (existing) {
      throw new AppError(
        "SCHOOLCAST_TEMPLATE_ALREADY_EXISTS",
        "SCHOOLCAST_TEMPLATE_ALREADY_EXISTS",
        409,
      );
    }
    const template = await tx.notificationTemplate.create({
      data: {
        tenantId: ctx.tenantId,
        branchId: data.branchId ?? null,
        channel: data.channel,
        templateKey: data.templateKey,
        providerTemplateName: data.providerTemplateName,
        languageCode: data.languageCode,
        isActive: data.activate,
      },
    });
    const version = await tx.schoolCastTemplateVersion.create({
      data: {
        tenantId: ctx.tenantId,
        templateId: template.id,
        versionNo: 1,
        channel: data.channel,
        languageCode: data.languageCode,
        subject: data.subject,
        bodyText,
        bodyHtmlSanitized,
        variableSchemaJson: variableSchema(data.variableNames),
        contentHash,
        status: data.activate ? "ACTIVE" : "DRAFT",
        createdById: ctx.userId,
      },
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.TEMPLATE_CREATED,
      entityType: "NotificationTemplate",
      entityId: template.id,
      branchId: data.branchId ?? null,
      after: {
        channel: template.channel,
        templateKey: template.templateKey,
        providerTemplateName: template.providerTemplateName,
        languageCode: template.languageCode,
        active: template.isActive,
        versionId: version.id,
        contentHash,
        variableNames: data.variableNames,
      },
    }, tx);
    return { id: template.id, versionId: version.id, active: template.isActive };
  });
}

export async function updateSchoolCastTemplate(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("templates");
  const data = updateSchoolCastTemplateSchema.parse(input);
  await requireSchoolCastEnabled(ctx);
  const template = await db.notificationTemplate.findFirst({
    where: {
      id: data.templateId,
      tenantId: ctx.tenantId,
      OR: [{ branchId: { in: ctx.accessibleBranchIds } }, { branchId: null }],
    },
    select: {
      id: true,
      branchId: true,
      channel: true,
      languageCode: true,
      providerTemplateName: true,
      isActive: true,
    },
  });
  if (!template) throw notFound("SCHOOLCAST_TEMPLATE_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "schoolcast.template.update",
    branchId: template.branchId ?? ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId,
  });
  if (data.activate !== template.isActive) {
    await requirePermission({
      ctx,
      permission: data.activate
        ? "schoolcast.template.activate"
        : "schoolcast.template.deactivate",
      branchId: template.branchId ?? ctx.activeBranchId,
      academicYearId: ctx.activeAcademicYearId,
    });
  }

  const bodyText = assertSafeSchoolCastText(data.bodyText);
  const bodyHtmlSanitized = renderSchoolCastPlainTextHtml(bodyText);
  const providerTemplateName = data.providerTemplateName ?? template.providerTemplateName;
  const contentHash = schoolCastContentHash({
    channel: template.channel,
    languageCode: data.languageCode,
    subject: data.subject ?? null,
    bodyText,
    variables: data.variableNames,
  });

  return db.$transaction(async (tx) => {
    const latest = await tx.schoolCastTemplateVersion.aggregate({
      where: {
        tenantId: ctx.tenantId,
        templateId: template.id,
        channel: template.channel,
        languageCode: data.languageCode,
      },
      _max: { versionNo: true },
    });
    const versionNo = (latest._max.versionNo ?? 0) + 1;
    const version = await tx.schoolCastTemplateVersion.create({
      data: {
        tenantId: ctx.tenantId,
        templateId: template.id,
        versionNo,
        channel: template.channel,
        languageCode: data.languageCode,
        subject: data.subject,
        bodyText,
        bodyHtmlSanitized,
        variableSchemaJson: variableSchema(data.variableNames),
        contentHash,
        status: data.activate ? "ACTIVE" : "DRAFT",
        createdById: ctx.userId,
      },
    });
    await tx.notificationTemplate.update({
      where: { id: template.id },
      data: {
        providerTemplateName,
        languageCode: data.languageCode,
        isActive: data.activate,
      },
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.TEMPLATE_VERSION_CREATED,
      entityType: "SchoolCastTemplateVersion",
      entityId: version.id,
      branchId: template.branchId,
      before: {
        active: template.isActive,
        providerTemplateName: template.providerTemplateName,
      },
      after: {
        templateId: template.id,
        versionNo,
        active: data.activate,
        providerTemplateName,
        contentHash,
        variableNames: data.variableNames,
      },
    }, tx);
    if (data.activate !== template.isActive) {
      await writeAuditLog({
        ctx,
        action: data.activate
          ? SCHOOLCAST_AUDIT_EVENTS.TEMPLATE_ACTIVATED
          : SCHOOLCAST_AUDIT_EVENTS.TEMPLATE_DEACTIVATED,
        entityType: "NotificationTemplate",
        entityId: template.id,
        branchId: template.branchId,
        before: { active: template.isActive },
        after: { active: data.activate, versionId: version.id },
      }, tx);
    }
    return { id: template.id, versionId: version.id, versionNo, active: data.activate };
  });
}

export async function deactivateSchoolCastTemplate(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("templates");
  const data = schoolCastTemplateIdSchema.parse(input);
  const template = await db.notificationTemplate.findFirst({
    where: {
      id: data.templateId,
      tenantId: ctx.tenantId,
      OR: [{ branchId: { in: ctx.accessibleBranchIds } }, { branchId: null }],
    },
    select: { id: true, branchId: true, isActive: true },
  });
  if (!template) throw notFound("SCHOOLCAST_TEMPLATE_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "schoolcast.template.deactivate",
    branchId: template.branchId ?? ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId,
  });
  if (!template.isActive) return { id: template.id, active: false, alreadyInactive: true };
  await db.$transaction(async (tx) => {
    await tx.notificationTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.TEMPLATE_DEACTIVATED,
      entityType: "NotificationTemplate",
      entityId: template.id,
      branchId: template.branchId,
      before: { active: true },
      after: { active: false },
    }, tx);
  });
  return { id: template.id, active: false, alreadyInactive: false };
}