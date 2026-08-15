import type { NotificationChannel, Prisma, SchoolCastHomeworkStatus } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { forbidden, notFound } from "@/lib/errors";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { requireSchoolCastSubfeature } from "@/modules/schoolcast/feature";
import {
  cancelSchoolCastHomeworkSchema,
  createSchoolCastHomeworkSchema,
  resendSchoolCastHomeworkSchema,
  schoolCastHomeworkIdSchema,
  updateSchoolCastHomeworkSchema
} from "@/modules/schoolcast/schemas";
import {
  createSchoolCastSourceCommunication,
  publishSchoolCastCommunication,
  submitSchoolCastCommunication
} from "@/modules/schoolcast/services/communication.service";
import { resolveSchoolCastScope } from "@/modules/schoolcast/services/scope.service";
import { assertSafeSchoolCastText, schoolCastContentHash } from "@/modules/schoolcast/policy";

function toDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function selectedChannels(state: Awaited<ReturnType<typeof requireSchoolCastSubfeature>>) {
  const channels: NotificationChannel[] = [];
  if (state.inApp) channels.push("IN_APP");
  if (state.email) channels.push("EMAIL");
  if (state.whatsApp) channels.push("WHATSAPP");
  if (channels.length === 0) throw new Error("SCHOOLCAST_NO_CHANNEL_SELECTED");
  return channels;
}

async function requireAssignedTeachingScope(
  ctx: TenantContext,
  input: { branchId: string; academicYearId: string; classSectionId: string; subjectId: string }
) {
  const scope = await resolveSchoolCastScope(ctx, input.branchId, input.academicYearId);
  const [permissions, assignment] = await Promise.all([
    getEffectivePermissions({ ctx, branchId: scope.branchId, academicYearId: scope.academicYearId }),
    db.classSectionSubject.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        classSectionId: input.classSectionId,
        subjectId: input.subjectId,
        status: "ACTIVE",
        classSection: { tenantId: ctx.tenantId, branchId: scope.branchId, academicYearId: scope.academicYearId, status: "ACTIVE" },
        subject: { tenantId: ctx.tenantId, status: "ACTIVE" }
      },
      select: {
        id: true,
        teacherUserId: true,
        classSection: { select: { id: true, displayName: true, classTeacherUserId: true } },
        subject: { select: { id: true, code: true, name: true } }
      }
    })
  ]);
  if (!assignment) throw notFound("SCHOOLCAST_TEACHING_SCOPE_NOT_FOUND");
  const assigned = assignment.teacherUserId === ctx.userId || assignment.classSection.classTeacherUserId === ctx.userId;
  if (!assigned && !permissions.has("schoolcast.audience.resolve")) {
    throw notFound("SCHOOLCAST_TEACHING_SCOPE_NOT_FOUND");
  }
  return { scope, assignment };
}

async function requireHomeworkAccess(
  ctx: TenantContext,
  homeworkItemId: string,
  permission: "schoolcast.homework.view" | "schoolcast.homework.edit" | "schoolcast.homework.submit" | "schoolcast.homework.cancel" | "schoolcast.homework.resend"
) {
  const item = await db.schoolCastHomeworkItem.findFirst({
    where: { id: homeworkItemId, tenantId: ctx.tenantId },
    include: {
      currentVersion: true,
      classSection: { select: { displayName: true, classTeacherUserId: true } },
      subject: { select: { code: true, name: true } },
      communication: { select: { id: true, status: true } }
    }
  });
  if (!item || !ctx.accessibleBranchIds.includes(item.branchId)) throw notFound("SCHOOLCAST_HOMEWORK_NOT_FOUND");
  await requirePermission({ ctx, permission, branchId: item.branchId, academicYearId: item.academicYearId });
  if (item.teacherUserId !== ctx.userId) {
    const permissions = await getEffectivePermissions({ ctx, branchId: item.branchId, academicYearId: item.academicYearId });
    if (!permissions.has("schoolcast.audience.resolve")) throw notFound("SCHOOLCAST_HOMEWORK_NOT_FOUND");
  }
  return item;
}

function homeworkSnapshot(input: {
  title: string;
  instructions: string;
  assignmentDate: string;
  completionDueAt?: string;
  teacherRemarks?: string;
}) {
  return {
    title: input.title,
    instructions: input.instructions,
    assignmentDate: input.assignmentDate,
    completionDueAt: input.completionDueAt ?? null,
    teacherRemarks: input.teacherRemarks ?? null
  };
}

export async function createSchoolCastHomework(ctx: TenantContext, input: unknown) {
  const data = createSchoolCastHomeworkSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "homework");
  await requirePermission({ ctx, permission: "schoolcast.homework.create", branchId: data.branchId, academicYearId: data.academicYearId });
  const { scope, assignment } = await requireAssignedTeachingScope(ctx, data);
  const safeInstructions = assertSafeSchoolCastText(data.instructions);
  const safeRemarks = data.teacherRemarks ? assertSafeSchoolCastText(data.teacherRemarks) : null;
  const snapshot = homeworkSnapshot({ ...data, instructions: safeInstructions, teacherRemarks: safeRemarks ?? undefined });

  return db.$transaction(async (tx) => {
    const item = await tx.schoolCastHomeworkItem.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: scope.institutionId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        classSectionId: assignment.classSection.id,
        subjectId: assignment.subject.id,
        teacherUserId: ctx.userId,
        workType: data.workType,
        status: "DRAFT"
      }
    });
    const version = await tx.schoolCastHomeworkVersion.create({
      data: {
        tenantId: ctx.tenantId,
        homeworkItemId: item.id,
        versionNo: 1,
        title: data.title,
        instructionsSanitized: safeInstructions,
        assignmentDate: toDate(data.assignmentDate),
        completionDueAt: data.completionDueAt ? new Date(data.completionDueAt) : null,
        teacherRemarks: safeRemarks,
        contentHash: schoolCastContentHash(snapshot),
        createdById: ctx.userId
      }
    });
    await tx.schoolCastHomeworkItem.update({ where: { id: item.id }, data: { currentVersionId: version.id } });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_CREATED,
      entityType: "SchoolCastHomeworkItem",
      entityId: item.id,
      branchId: scope.branchId,
      academicYearId: scope.academicYearId,
      after: {
        workType: item.workType,
        status: item.status,
        classSectionId: item.classSectionId,
        subjectId: item.subjectId,
        versionNo: version.versionNo,
        contentHash: version.contentHash
      }
    }, tx);
    return { id: item.id, status: item.status, versionNo: version.versionNo };
  });
}

export async function updateSchoolCastHomework(ctx: TenantContext, input: unknown) {
  const data = updateSchoolCastHomeworkSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "homework");
  const item = await requireHomeworkAccess(ctx, data.homeworkItemId, "schoolcast.homework.edit");
  if (!item.currentVersion || !(["DRAFT", "REJECTED"] as SchoolCastHomeworkStatus[]).includes(item.status)) {
    throw forbidden("SCHOOLCAST_HOMEWORK_NOT_EDITABLE");
  }
  const safeInstructions = assertSafeSchoolCastText(data.instructions);
  const safeRemarks = data.teacherRemarks ? assertSafeSchoolCastText(data.teacherRemarks) : null;
  const snapshot = homeworkSnapshot({ ...data, instructions: safeInstructions, teacherRemarks: safeRemarks ?? undefined });

  return db.$transaction(async (tx) => {
    const version = await tx.schoolCastHomeworkVersion.create({
      data: {
        tenantId: ctx.tenantId,
        homeworkItemId: item.id,
        versionNo: item.currentVersion!.versionNo + 1,
        title: data.title,
        instructionsSanitized: safeInstructions,
        assignmentDate: toDate(data.assignmentDate),
        completionDueAt: data.completionDueAt ? new Date(data.completionDueAt) : null,
        teacherRemarks: safeRemarks,
        contentHash: schoolCastContentHash(snapshot),
        createdById: ctx.userId
      }
    });
    await tx.schoolCastHomeworkItem.update({
      where: { id: item.id },
      data: { currentVersionId: version.id, communicationId: null, status: "DRAFT", publishedAt: null, cancelledAt: null }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_UPDATED,
      entityType: "SchoolCastHomeworkItem",
      entityId: item.id,
      branchId: item.branchId,
      academicYearId: item.academicYearId,
      before: { versionNo: item.currentVersion!.versionNo, contentHash: item.currentVersion!.contentHash },
      after: { versionNo: version.versionNo, contentHash: version.contentHash, status: "DRAFT" }
    }, tx);
    return { id: item.id, status: "DRAFT" as const, versionNo: version.versionNo };
  });
}

async function ensureHomeworkCommunication(ctx: TenantContext, homeworkItemId: string) {
  const item = await requireHomeworkAccess(ctx, homeworkItemId, "schoolcast.homework.submit");
  if (!item.currentVersion) throw new Error("SCHOOLCAST_HOMEWORK_VERSION_REQUIRED");
  if (item.communication) return { item, communication: item.communication };

  const state = await requireSchoolCastSubfeature(ctx, "homework");
  const version = item.currentVersion;
  const communication = await createSchoolCastSourceCommunication(ctx, {
    branchId: item.branchId,
    academicYearId: item.academicYearId,
    type: item.workType,
    category: "ACADEMIC_WORK",
    title: version.title,
    summary: `${item.workType === "HOMEWORK" ? "Homework" : "Classwork"}: ${item.classSection.displayName} - ${item.subject.name}`,
    content: [version.instructionsSanitized, version.teacherRemarks ? `Teacher note: ${version.teacherRemarks}` : null].filter(Boolean).join("\n\n"),
    sourceModule: "SCHOOLCAST",
    sourceEntityType: "SchoolCastHomeworkItem",
    sourceEntityId: item.id,
    sourceEntityVersionId: version.id,
    audienceRules: [{
      ruleType: "CLASS_SECTION",
      mode: "INCLUDE",
      label: item.classSection.displayName,
      targetIds: [item.classSectionId],
      roleCodes: [],
      recipientTypes: ["STUDENT", "GUARDIAN"]
    }],
    channels: selectedChannels(state)
  });
  await db.schoolCastHomeworkItem.update({ where: { id: item.id }, data: { communicationId: communication.id } });
  return { item, communication: { id: communication.id, status: communication.status } };
}

export async function submitSchoolCastHomework(ctx: TenantContext, input: unknown) {
  const data = schoolCastHomeworkIdSchema.parse(input);
  const state = await requireSchoolCastSubfeature(ctx, "homework");
  const { item, communication } = await ensureHomeworkCommunication(ctx, data.homeworkItemId);
  if (communication.status === "PUBLISHED") return { id: item.id, status: "PUBLISHED" as const, alreadyPublished: true };
  if (communication.status === "PENDING_APPROVAL") return { id: item.id, status: "PENDING_APPROVAL" as const, pendingApproval: true };

  if (state.teacherDirectPublish && communication.status === "DRAFT") {
    await db.$transaction(async (tx) => {
      await tx.schoolCastCommunication.update({
        where: { id: communication.id },
        data: { status: "APPROVED", submittedAt: new Date(), approvedAt: new Date(), updatedById: ctx.userId }
      });
      await tx.schoolCastHomeworkItem.update({ where: { id: item.id }, data: { status: "APPROVED" } });
      await writeAuditLog({
        ctx,
        action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_SUBMITTED,
        entityType: "SchoolCastHomeworkItem",
        entityId: item.id,
        branchId: item.branchId,
        academicYearId: item.academicYearId,
        before: { status: item.status },
        after: { status: "APPROVED", directPublish: true, communicationId: communication.id }
      }, tx);
    });
    const published = await publishSchoolCastCommunication(ctx, { communicationId: communication.id });
    return { id: item.id, status: "PUBLISHED" as const, publication: published };
  }

  const submitted = communication.status === "DRAFT" || communication.status === "REJECTED"
    ? await submitSchoolCastCommunication(ctx, { communicationId: communication.id })
    : { id: communication.id, status: communication.status };
  const homeworkStatus: SchoolCastHomeworkStatus = submitted.status === "PENDING_APPROVAL" ? "PENDING_APPROVAL" : "APPROVED";
  await db.$transaction(async (tx) => {
    await tx.schoolCastHomeworkItem.update({ where: { id: item.id }, data: { status: homeworkStatus } });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_SUBMITTED,
      entityType: "SchoolCastHomeworkItem",
      entityId: item.id,
      branchId: item.branchId,
      academicYearId: item.academicYearId,
      before: { status: item.status },
      after: { status: homeworkStatus, communicationStatus: submitted.status, communicationId: communication.id }
    }, tx);
  });
  if (submitted.status === "APPROVED") {
    const published = await publishSchoolCastCommunication(ctx, { communicationId: communication.id });
    return { id: item.id, status: "PUBLISHED" as const, publication: published };
  }
  return { id: item.id, status: "PENDING_APPROVAL" as const, pendingApproval: true };
}

export async function cancelSchoolCastHomework(ctx: TenantContext, input: unknown) {
  const data = cancelSchoolCastHomeworkSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "homework");
  const item = await requireHomeworkAccess(ctx, data.homeworkItemId, "schoolcast.homework.cancel");
  if (!(["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED"] as SchoolCastHomeworkStatus[]).includes(item.status)) {
    throw forbidden("SCHOOLCAST_HOMEWORK_NOT_CANCELLABLE");
  }
  if (item.communication && ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SCHEDULED"].includes(item.communication.status)) {
    const { cancelSchoolCastCommunication } = await import("@/modules/schoolcast/services/communication.service");
    await cancelSchoolCastCommunication(ctx, { communicationId: item.communication.id, reason: data.reason });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolCastHomeworkItem.update({
      where: { id: item.id },
      data: { status: "CANCELLED", cancelledAt: new Date() }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_CANCELLED,
      entityType: "SchoolCastHomeworkItem",
      entityId: item.id,
      branchId: item.branchId,
      academicYearId: item.academicYearId,
      before: { status: item.status },
      after: { status: updated.status },
      metadata: { reason: data.reason }
    }, tx);
    return { id: updated.id, status: updated.status };
  });
}

export async function resendSchoolCastHomework(ctx: TenantContext, input: unknown) {
  const data = resendSchoolCastHomeworkSchema.parse(input);
  await requireSchoolCastSubfeature(ctx, "homework");
  const item = await requireHomeworkAccess(ctx, data.homeworkItemId, "schoolcast.homework.resend");
  if (!item.currentVersion || item.status !== "PUBLISHED") throw forbidden("SCHOOLCAST_HOMEWORK_RESEND_NOT_ALLOWED");
  const version = await db.$transaction(async (tx) => {
    const next = await tx.schoolCastHomeworkVersion.create({
      data: {
        tenantId: ctx.tenantId,
        homeworkItemId: item.id,
        versionNo: item.currentVersion!.versionNo + 1,
        title: item.currentVersion!.title,
        instructionsSanitized: item.currentVersion!.instructionsSanitized,
        assignmentDate: item.currentVersion!.assignmentDate,
        completionDueAt: item.currentVersion!.completionDueAt,
        teacherRemarks: item.currentVersion!.teacherRemarks,
        contentHash: item.currentVersion!.contentHash,
        createdById: ctx.userId
      }
    });
    await tx.schoolCastHomeworkItem.update({
      where: { id: item.id },
      data: { currentVersionId: next.id, communicationId: null, status: "DRAFT", publishedAt: null }
    });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.HOMEWORK_RESENT,
      entityType: "SchoolCastHomeworkItem",
      entityId: item.id,
      branchId: item.branchId,
      academicYearId: item.academicYearId,
      before: { versionNo: item.currentVersion!.versionNo },
      after: { versionNo: next.versionNo, status: "DRAFT" },
      metadata: { reason: data.reason }
    }, tx);
    return next;
  });
  const submitted = await submitSchoolCastHomework(ctx, { homeworkItemId: item.id });
  return { ...submitted, versionNo: version.versionNo };
}