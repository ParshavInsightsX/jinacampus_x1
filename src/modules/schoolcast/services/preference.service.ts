import type { CommunicationPreferenceOwnerType } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import {
  getSchoolCastDeploymentPolicy,
  requireSchoolCastDeploymentCapability
} from "@/modules/schoolcast/deployment-policy";
import { requireSchoolCastEnabled } from "@/modules/schoolcast/feature";
import {
  updateSchoolCastOwnConsentSchema,
  updateSchoolCastPreferenceSchema
} from "@/modules/schoolcast/schemas";
import {
  maskSchoolCastEmail,
  maskSchoolCastPhone,
  schoolCastContentHash
} from "@/modules/schoolcast/policy";

async function ownPreferenceIdentity(ctx: TenantContext) {
  const user = await db.user.findFirst({
    where: { id: ctx.userId, tenantId: ctx.tenantId, status: "ACTIVE" },
    select: {
      id: true,
      email: true,
      phone: true,
      staffProfile: { select: { id: true, email: true, phone: true, branchId: true } }
    }
  });
  if (!user) throw notFound("SCHOOLCAST_PREFERENCE_OWNER_NOT_FOUND");
  const ownerType: CommunicationPreferenceOwnerType = user.staffProfile ? "STAFF" : "USER";
  return {
    ownerType,
    ownerId: user.staffProfile?.id ?? user.id,
    branchId: user.staffProfile?.branchId ?? ctx.activeBranchId,
    email: user.staffProfile?.email ?? user.email,
    phone: user.staffProfile?.phone ?? user.phone
  };
}

const defaultPreference = {
  inAppEnabled: true,
  emailEnabled: false,
  whatsappEnabled: false,
  generalNoticesEnabled: true,
  homeworkUpdatesEnabled: true,
  attendanceAlertsEnabled: false,
  leaveUpdatesEnabled: false,
  calendarRemindersEnabled: true,
  gradebookUpdatesEnabled: true,
  feeUpdatesEnabled: true
};

export async function getOwnSchoolCastPreference(ctx: TenantContext) {
  await requireSchoolCastEnabled(ctx);
  await requirePermission({ ctx, permission: "schoolcast.preference.view_own", branchId: ctx.activeBranchId });
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const owner = await ownPreferenceIdentity(ctx);
  const preference = await db.communicationPreference.findUnique({
    where: { tenantId_ownerType_ownerId: { tenantId: ctx.tenantId, ownerType: owner.ownerType, ownerId: owner.ownerId } },
    select: {
      inAppEnabled: true,
      emailEnabled: true,
      whatsappEnabled: true,
      generalNoticesEnabled: true,
      homeworkUpdatesEnabled: true,
      attendanceAlertsEnabled: true,
      leaveUpdatesEnabled: true,
      calendarRemindersEnabled: true,
      gradebookUpdatesEnabled: true,
      feeUpdatesEnabled: true
    }
  });
  return {
    ...(preference ?? defaultPreference),
    emailEnabled: deploymentPolicy.externalChannels && (preference?.emailEnabled ?? defaultPreference.emailEnabled),
    whatsappEnabled: deploymentPolicy.externalChannels && (preference?.whatsappEnabled ?? defaultPreference.whatsappEnabled),
    homeworkUpdatesEnabled: deploymentPolicy.homework && (preference?.homeworkUpdatesEnabled ?? defaultPreference.homeworkUpdatesEnabled),
    attendanceAlertsEnabled: deploymentPolicy.sourceAutomation && (preference?.attendanceAlertsEnabled ?? defaultPreference.attendanceAlertsEnabled),
    leaveUpdatesEnabled: deploymentPolicy.sourceAutomation && (preference?.leaveUpdatesEnabled ?? defaultPreference.leaveUpdatesEnabled),
    calendarRemindersEnabled: deploymentPolicy.sourceAutomation && (preference?.calendarRemindersEnabled ?? defaultPreference.calendarRemindersEnabled),
    gradebookUpdatesEnabled: deploymentPolicy.sourceAutomation && (preference?.gradebookUpdatesEnabled ?? defaultPreference.gradebookUpdatesEnabled),
    feeUpdatesEnabled: false,
    contact: {
      email: maskSchoolCastEmail(owner.email),
      phone: maskSchoolCastPhone(owner.phone),
      emailAvailable: Boolean(owner.email),
      phoneAvailable: Boolean(owner.phone)
    }
  };
}

export async function updateOwnSchoolCastPreference(ctx: TenantContext, input: unknown) {
  const data = updateSchoolCastPreferenceSchema.parse(input);
  const deploymentPolicy = getSchoolCastDeploymentPolicy();
  const effectiveData = deploymentPolicy.externalChannels && deploymentPolicy.sourceAutomation
    ? data
    : {
        ...data,
        emailEnabled: false,
        whatsappEnabled: false,
        homeworkUpdatesEnabled: false,
        attendanceAlertsEnabled: false,
        leaveUpdatesEnabled: false,
        calendarRemindersEnabled: false,
        gradebookUpdatesEnabled: false,
        feeUpdatesEnabled: false
      };
  await requireSchoolCastEnabled(ctx);
  await requirePermission({ ctx, permission: "schoolcast.preference.update_own", branchId: ctx.activeBranchId });
  const owner = await ownPreferenceIdentity(ctx);
  if (effectiveData.emailEnabled && !owner.email) throw new Error("SCHOOLCAST_EMAIL_CONTACT_REQUIRED");
  if (effectiveData.whatsappEnabled && !owner.phone) throw new Error("SCHOOLCAST_WHATSAPP_CONTACT_REQUIRED");

  return db.$transaction(async (tx) => {
    const before = await tx.communicationPreference.findUnique({
      where: { tenantId_ownerType_ownerId: { tenantId: ctx.tenantId, ownerType: owner.ownerType, ownerId: owner.ownerId } }
    });
    const saved = await tx.communicationPreference.upsert({
      where: { tenantId_ownerType_ownerId: { tenantId: ctx.tenantId, ownerType: owner.ownerType, ownerId: owner.ownerId } },
      create: {
        tenantId: ctx.tenantId,
        branchId: owner.branchId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        emailAddress: owner.email,
        whatsappNumber: owner.phone,
        ...effectiveData
      },
      update: {
        branchId: owner.branchId,
        emailAddress: owner.email,
        whatsappNumber: owner.phone,
        ...effectiveData
      },
      select: { id: true, ...Object.fromEntries(Object.keys(defaultPreference).map((key) => [key, true])) }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.PREFERENCE_UPDATED,
      entityType: "CommunicationPreference",
      entityId: saved.id,
      branchId: owner.branchId,
      before: before ? Object.fromEntries(Object.keys(defaultPreference).map((key) => [key, before[key as keyof typeof defaultPreference]])) : null,
      after: effectiveData,
      metadata: { ownerType: owner.ownerType, ownerId: owner.ownerId }
    }, tx);
    return { ...effectiveData, contact: { email: maskSchoolCastEmail(owner.email), phone: maskSchoolCastPhone(owner.phone) } };
  });
}

const CONSENT_NOTICES: Record<string, string> = {
  NOTICE: "Receive general school notices through the selected communication channel.",
  HOMEWORK: "Receive homework and classwork updates through the selected communication channel.",
  ATTENDANCE: "Receive attendance alerts and summaries through the selected communication channel.",
  LEAVE: "Receive staff leave updates through the selected communication channel.",
  CALENDAR: "Receive calendar and holiday reminders through the selected communication channel.",
  GRADEBOOK: "Receive approved GradeBook result and report-card updates through the selected communication channel.",
  FEEDESK: "Receive approved fee reminders through the selected communication channel."
};

export async function recordOwnSchoolCastConsent(ctx: TenantContext, input: unknown) {
  requireSchoolCastDeploymentCapability("externalChannels");
  const data = updateSchoolCastOwnConsentSchema.parse(input);
  await requireSchoolCastEnabled(ctx);
  await requirePermission({ ctx, permission: "schoolcast.consent.manage_own", branchId: ctx.activeBranchId });
  const owner = await ownPreferenceIdentity(ctx);
  const noticeText = CONSENT_NOTICES[data.purpose];
  if (!noticeText) throw new Error("SCHOOLCAST_CONSENT_PURPOSE_INVALID");

  return db.$transaction(async (tx) => {
    const record = await tx.schoolCastConsentRecord.create({
      data: {
        tenantId: ctx.tenantId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        channel: data.channel,
        purpose: data.purpose,
        status: data.decision,
        noticeVersion: data.noticeVersion,
        noticeTextHash: schoolCastContentHash({ noticeText, noticeVersion: data.noticeVersion }),
        source: "SELF_SERVICE",
        withdrawnAt: data.decision === "WITHDRAWN" ? new Date() : null
      }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.CONSENT_RECORDED,
      entityType: "SchoolCastConsentRecord",
      entityId: record.id,
      branchId: owner.branchId,
      after: {
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        channel: data.channel,
        purpose: data.purpose,
        status: data.decision,
        noticeVersion: data.noticeVersion,
        noticeTextHash: record.noticeTextHash
      }
    }, tx);
    return { id: record.id, channel: data.channel, purpose: data.purpose, status: data.decision };
  });
}