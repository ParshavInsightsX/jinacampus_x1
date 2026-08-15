import { createHash, randomUUID } from "node:crypto";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import {
  detectSchoolCastAttachmentMimeType,
  safeSchoolCastAttachmentObjectName
} from "@/lib/files/schoolcast-attachment-file";
import { requirePermission } from "@/lib/rbac/require-permission";
import {
  ensureSchoolCastStorageBucket,
  getSchoolCastStorageClient
} from "@/lib/storage/supabase-storage";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { requireSchoolCastDeploymentCapability } from "@/modules/schoolcast/deployment-policy";
import { requireSchoolCastEnabled } from "@/modules/schoolcast/feature";

export type SchoolCastAttachmentTarget =
  | { communicationId: string; homeworkItemId?: never }
  | { homeworkItemId: string; communicationId?: never };

async function resolveAttachmentTarget(ctx: TenantContext, target: SchoolCastAttachmentTarget, mutation: boolean) {
  requireSchoolCastDeploymentCapability("attachments");
  if ("communicationId" in target && target.communicationId) {
    const communication = await db.schoolCastCommunication.findFirst({
      where: { id: target.communicationId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
      select: { id: true, branchId: true, academicYearId: true, status: true, currentVersionId: true }
    });
    if (!communication?.branchId || !communication.currentVersionId) throw notFound("SCHOOLCAST_COMMUNICATION_NOT_FOUND");
    await requirePermission({
      ctx,
      permission: mutation ? "schoolcast.attachment.upload" : "schoolcast.attachment.view",
      branchId: communication.branchId,
      academicYearId: communication.academicYearId
    });
    if (mutation && !["DRAFT", "REJECTED"].includes(communication.status)) {
      throw new AppError("SCHOOLCAST_ATTACHMENT_TARGET_LOCKED", "SCHOOLCAST_ATTACHMENT_TARGET_LOCKED", 409);
    }
    return {
      branchId: communication.branchId,
      academicYearId: communication.academicYearId,
      communicationId: communication.id,
      communicationVersionId: communication.currentVersionId,
      homeworkVersionId: null
    };
  }

  if ("homeworkItemId" in target && target.homeworkItemId) {
    const homework = await db.schoolCastHomeworkItem.findFirst({
      where: { id: target.homeworkItemId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
      select: { id: true, branchId: true, academicYearId: true, status: true, teacherUserId: true, currentVersionId: true, communicationId: true }
    });
    if (!homework?.currentVersionId) throw notFound("SCHOOLCAST_HOMEWORK_NOT_FOUND");
    await requirePermission({
      ctx,
      permission: mutation ? "schoolcast.attachment.upload" : "schoolcast.attachment.view",
      branchId: homework.branchId,
      academicYearId: homework.academicYearId
    });
    if (mutation && (homework.teacherUserId !== ctx.userId || homework.status !== "DRAFT")) {
      throw new AppError("SCHOOLCAST_ATTACHMENT_TARGET_LOCKED", "SCHOOLCAST_ATTACHMENT_TARGET_LOCKED", 409);
    }
    return {
      branchId: homework.branchId,
      academicYearId: homework.academicYearId,
      communicationId: homework.communicationId,
      communicationVersionId: null,
      homeworkVersionId: homework.currentVersionId
    };
  }

  throw new AppError("SCHOOLCAST_ATTACHMENT_TARGET_REQUIRED", "SCHOOLCAST_ATTACHMENT_TARGET_REQUIRED", 400);
}

export async function listSchoolCastAttachments(ctx: TenantContext, target: SchoolCastAttachmentTarget) {
  await requireSchoolCastEnabled(ctx);
  const resolved = await resolveAttachmentTarget(ctx, target, false);
  return db.schoolCastAttachment.findMany({
    where: {
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(resolved.communicationVersionId ? { communicationVersionId: resolved.communicationVersionId } : { homeworkVersionId: resolved.homeworkVersionId })
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
}

export async function uploadSchoolCastAttachment(
  ctx: TenantContext,
  input: SchoolCastAttachmentTarget & { file: File }
) {
  await requireSchoolCastEnabled(ctx);
  const resolved = await resolveAttachmentTarget(ctx, input, true);
  const { client, bucket, maxBytes, allowedMimeTypes } = getSchoolCastStorageClient();
  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new AppError("SCHOOLCAST_ATTACHMENT_FILE_REQUIRED", "SCHOOLCAST_ATTACHMENT_FILE_REQUIRED", 400);
  }
  if (input.file.size > maxBytes) {
    throw new AppError("SCHOOLCAST_ATTACHMENT_TOO_LARGE", "SCHOOLCAST_ATTACHMENT_TOO_LARGE", 400);
  }
  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const mimeType = detectSchoolCastAttachmentMimeType(bytes);
  if (!mimeType || !allowedMimeTypes.includes(mimeType as (typeof allowedMimeTypes)[number])) {
    throw new AppError("SCHOOLCAST_ATTACHMENT_TYPE_NOT_ALLOWED", "SCHOOLCAST_ATTACHMENT_TYPE_NOT_ALLOWED", 400);
  }
  await ensureSchoolCastStorageBucket();
  const id = randomUUID();
  const scopeId = resolved.communicationVersionId ?? resolved.homeworkVersionId!;
  const storagePath = `${ctx.tenantId}/${resolved.branchId}/schoolcast/quarantine/${scopeId}/${id}/${safeSchoolCastAttachmentObjectName(input.file.name, mimeType)}`;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const { error } = await client.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mimeType,
    cacheControl: "0",
    upsert: false
  });
  if (error) throw new AppError("SCHOOLCAST_ATTACHMENT_UPLOAD_FAILED", "SCHOOLCAST_ATTACHMENT_UPLOAD_FAILED", 503);

  try {
    return await db.$transaction(async (tx) => {
      const attachment = await tx.schoolCastAttachment.create({
        data: {
          id,
          tenantId: ctx.tenantId,
          communicationId: resolved.communicationId,
          communicationVersionId: resolved.communicationVersionId,
          homeworkVersionId: resolved.homeworkVersionId,
          storageBucket: bucket,
          storagePath,
          originalFileName: input.file.name.slice(0, 255),
          mimeType,
          sizeBytes: input.file.size,
          checksumSha256,
          scanStatus: "PENDING",
          uploadedById: ctx.userId
        }
      });
      await writeAuditLog({
        ctx,
        action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_UPLOADED,
        entityType: "SchoolCastAttachment",
        entityId: attachment.id,
        branchId: resolved.branchId,
        academicYearId: resolved.academicYearId,
        after: {
          communicationId: resolved.communicationId,
          communicationVersionId: resolved.communicationVersionId,
          homeworkVersionId: resolved.homeworkVersionId,
          mimeType,
          sizeBytes: input.file.size,
          checksumSha256,
          scanStatus: "PENDING"
        }
      }, tx);
      return { id: attachment.id, fileName: attachment.originalFileName, mimeType, sizeBytes: attachment.sizeBytes, scanStatus: attachment.scanStatus };
    });
  } catch (databaseError) {
    await client.storage.from(bucket).remove([storagePath]);
    throw databaseError;
  }
}

export async function createSchoolCastAttachmentDownloadUrl(
  ctx: TenantContext,
  target: SchoolCastAttachmentTarget,
  attachmentId: string
) {
  await requireSchoolCastEnabled(ctx);
  const resolved = await resolveAttachmentTarget(ctx, target, false);
  const attachment = await db.schoolCastAttachment.findFirst({
    where: {
      id: attachmentId,
      tenantId: ctx.tenantId,
      deletedAt: null,
      scanStatus: "SAFE",
      ...(resolved.communicationVersionId ? { communicationVersionId: resolved.communicationVersionId } : { homeworkVersionId: resolved.homeworkVersionId })
    },
    select: { storageBucket: true, storagePath: true, originalFileName: true, mimeType: true }
  });
  if (!attachment) throw notFound("SCHOOLCAST_ATTACHMENT_NOT_FOUND");
  const { client, signedUrlTtlSeconds } = getSchoolCastStorageClient();
  const { data, error } = await client.storage.from(attachment.storageBucket).createSignedUrl(
    attachment.storagePath,
    signedUrlTtlSeconds,
    { download: attachment.mimeType.startsWith("image/") ? false : safeSchoolCastAttachmentObjectName(attachment.originalFileName, attachment.mimeType) }
  );
  if (error || !data?.signedUrl) throw new AppError("SCHOOLCAST_ATTACHMENT_DOWNLOAD_FAILED", "SCHOOLCAST_ATTACHMENT_DOWNLOAD_FAILED", 503);
  return { signedUrl: data.signedUrl, expiresInSeconds: signedUrlTtlSeconds };
}

export async function deleteSchoolCastAttachment(
  ctx: TenantContext,
  target: SchoolCastAttachmentTarget,
  attachmentId: string
) {
  await requireSchoolCastEnabled(ctx);
  const resolved = await resolveAttachmentTarget(ctx, target, true);
  await requirePermission({ ctx, permission: "schoolcast.attachment.delete", branchId: resolved.branchId, academicYearId: resolved.academicYearId });
  const attachment = await db.schoolCastAttachment.findFirst({
    where: {
      id: attachmentId,
      tenantId: ctx.tenantId,
      deletedAt: null,
      ...(resolved.communicationVersionId ? { communicationVersionId: resolved.communicationVersionId } : { homeworkVersionId: resolved.homeworkVersionId })
    }
  });
  if (!attachment) throw notFound("SCHOOLCAST_ATTACHMENT_NOT_FOUND");
  const { client } = getSchoolCastStorageClient();
  const { error } = await client.storage.from(attachment.storageBucket).remove([attachment.storagePath]);
  if (error) throw new AppError("SCHOOLCAST_ATTACHMENT_DELETE_FAILED", "SCHOOLCAST_ATTACHMENT_DELETE_FAILED", 503);
  return db.$transaction(async (tx) => {
    const deletedAt = new Date();
    await tx.schoolCastAttachment.update({ where: { id: attachment.id }, data: { deletedAt, deletedById: ctx.userId } });
    await writeAuditLog({
      ctx,
      action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_DELETED,
      entityType: "SchoolCastAttachment",
      entityId: attachment.id,
      branchId: resolved.branchId,
      academicYearId: resolved.academicYearId,
      before: { mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, checksumSha256: attachment.checksumSha256 },
      after: { deletedAt: deletedAt.toISOString() }
    }, tx);
    return { id: attachment.id, deletedAt };
  });
}
