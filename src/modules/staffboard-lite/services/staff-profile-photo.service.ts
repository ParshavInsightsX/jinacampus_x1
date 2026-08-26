import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { AppError, notFound } from "@/lib/errors";
import {
  detectStudentDocumentMimeType,
  safeStudentDocumentObjectName
} from "@/lib/files/student-document-file";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import {
  ensureStaffProfilePhotosBucket,
  getStaffProfilePhotoStorageClient
} from "@/lib/storage/supabase-storage";
import type { TenantContext } from "@/lib/tenant/context";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";

async function loadScopedStaff(ctx: TenantContext, staffId: string) {
  const staff = await db.staffProfile.findFirst({
    where: {
      id: staffId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: {
      id: true,
      branchId: true,
      userId: true,
      employeeCode: true,
      profilePhoto: true
    }
  });
  if (!staff) throw notFound("STAFF_PROFILE_NOT_FOUND");
  return staff;
}

async function requireStaffPhotoView(ctx: TenantContext, staff: Awaited<ReturnType<typeof loadScopedStaff>>) {
  const permissions = await getEffectivePermissions({ ctx, branchId: staff.branchId });
  const ownsProfile = Boolean(ctx.userId && staff.userId === ctx.userId);
  const mayViewOwn = ownsProfile && permissions.has("staffboard.attendance.credential.self_view");
  const mayManage =
    permissions.has("staffboard.attendance.credential.manage") ||
    permissions.has("staffboard.staff.update");
  if (!mayViewOwn && !mayManage) {
    throw new AppError("FORBIDDEN_STAFF_PHOTO_ACCESS", "FORBIDDEN_STAFF_PHOTO_ACCESS", 403);
  }
}

export async function uploadStaffProfilePhoto(
  ctx: TenantContext,
  input: { staffId: string; file: File }
) {
  const staff = await loadScopedStaff(ctx, input.staffId);
  await requirePermission({ ctx, permission: "staffboard.staff.update", branchId: staff.branchId });
  const { client, bucket, maxBytes, allowedMimeTypes } = getStaffProfilePhotoStorageClient();

  if (!(input.file instanceof File) || input.file.size === 0) {
    throw new AppError("STAFF_PROFILE_PHOTO_REQUIRED", "STAFF_PROFILE_PHOTO_REQUIRED", 400);
  }
  if (input.file.size > maxBytes) {
    throw new AppError("STAFF_PROFILE_PHOTO_TOO_LARGE", "STAFF_PROFILE_PHOTO_TOO_LARGE", 400);
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const mimeType = detectStudentDocumentMimeType(bytes);
  if (!mimeType || !allowedMimeTypes.includes(mimeType as (typeof allowedMimeTypes)[number])) {
    throw new AppError("STAFF_PROFILE_PHOTO_TYPE_NOT_ALLOWED", "STAFF_PROFILE_PHOTO_TYPE_NOT_ALLOWED", 400);
  }

  await ensureStaffProfilePhotosBucket();
  const photoId = randomUUID();
  const storagePath = `${ctx.tenantId}/${staff.id}/${photoId}/${safeStudentDocumentObjectName(input.file.name, mimeType)}`;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: uploadError } = await client.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mimeType,
    cacheControl: "0",
    upsert: false
  });
  if (uploadError) {
    throw new AppError("STAFF_PROFILE_PHOTO_UPLOAD_FAILED", "STAFF_PROFILE_PHOTO_UPLOAD_FAILED", 503);
  }

  try {
    const previousPath = staff.profilePhoto?.storagePath ?? null;
    const previousBucket = staff.profilePhoto?.storageBucket ?? null;
    const photo = await db.$transaction(async (tx) => {
      const saved = await tx.staffProfilePhoto.upsert({
        where: {
          tenantId_staffId: {
            tenantId: ctx.tenantId,
            staffId: staff.id
          }
        },
        create: {
          id: photoId,
          tenantId: ctx.tenantId,
          branchId: staff.branchId,
          staffId: staff.id,
          storageBucket: bucket,
          storagePath,
          originalFileName: input.file.name.slice(0, 255),
          mimeType,
          sizeBytes: input.file.size,
          checksumSha256,
          uploadedById: ctx.userId
        },
        update: {
          branchId: staff.branchId,
          storageBucket: bucket,
          storagePath,
          originalFileName: input.file.name.slice(0, 255),
          mimeType,
          sizeBytes: input.file.size,
          checksumSha256,
          uploadedById: ctx.userId
        }
      });

      await writeAuditLog({
        ctx,
        action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_PROFILE_PHOTO_UPLOADED,
        entityType: "StaffProfilePhoto",
        entityId: saved.id,
        branchId: staff.branchId,
        after: {
          staffId: staff.id,
          mimeType,
          sizeBytes: input.file.size,
          replacedExistingPhoto: Boolean(previousPath)
        }
      }, tx);
      return saved;
    });

    if (previousPath && previousBucket) {
      await client.storage.from(previousBucket).remove([previousPath]);
    }
    return photo;
  } catch (error) {
    await client.storage.from(bucket).remove([storagePath]);
    throw error;
  }
}

export async function createStaffProfilePhotoDownloadUrl(ctx: TenantContext, staffId: string) {
  const staff = await loadScopedStaff(ctx, staffId);
  await requireStaffPhotoView(ctx, staff);
  if (!staff.profilePhoto) throw notFound("STAFF_PROFILE_PHOTO_NOT_FOUND");

  const { client } = getStaffProfilePhotoStorageClient();
  const { data, error } = await client.storage
    .from(staff.profilePhoto.storageBucket)
    .createSignedUrl(staff.profilePhoto.storagePath, 60, { download: false });
  if (error || !data?.signedUrl) {
    throw new AppError("STAFF_PROFILE_PHOTO_DOWNLOAD_FAILED", "STAFF_PROFILE_PHOTO_DOWNLOAD_FAILED", 503);
  }
  return data.signedUrl;
}

export async function deleteStaffProfilePhoto(ctx: TenantContext, staffId: string) {
  const staff = await loadScopedStaff(ctx, staffId);
  await requirePermission({ ctx, permission: "staffboard.staff.update", branchId: staff.branchId });
  if (!staff.profilePhoto) throw notFound("STAFF_PROFILE_PHOTO_NOT_FOUND");

  const photo = staff.profilePhoto;
  const { client } = getStaffProfilePhotoStorageClient();
  const { error: deleteError } = await client.storage
    .from(photo.storageBucket)
    .remove([photo.storagePath]);
  if (deleteError) {
    throw new AppError("STAFF_PROFILE_PHOTO_DELETE_FAILED", "STAFF_PROFILE_PHOTO_DELETE_FAILED", 503);
  }

  await db.$transaction(async (tx) => {
    await tx.staffProfilePhoto.delete({
      where: {
        tenantId_staffId: {
          tenantId: ctx.tenantId,
          staffId: staff.id
        }
      }
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_PROFILE_PHOTO_REMOVED,
      entityType: "StaffProfilePhoto",
      entityId: photo.id,
      branchId: staff.branchId,
      before: {
        staffId: staff.id,
        mimeType: photo.mimeType,
        sizeBytes: photo.sizeBytes
      }
    }, tx);
  });
}
