import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const storedObject = {
    upload: vi.fn(),
    remove: vi.fn(),
    createSignedUrl: vi.fn()
  };
  const storageClient = {
    storage: {
      from: vi.fn(() => storedObject)
    }
  };
  const transaction = {
    staffProfilePhoto: {
      upsert: vi.fn(),
      delete: vi.fn()
    }
  };
  const db = {
    staffProfile: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn()
  };

  return {
    db,
    transaction,
    storageClient,
    storedObject,
    ensureStaffProfilePhotosBucket: vi.fn(),
    getEffectivePermissions: vi.fn(),
    requirePermission: vi.fn(),
    writeAuditLog: vi.fn()
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions,
  requirePermission: mocks.requirePermission
}));
vi.mock("@/lib/storage/supabase-storage", () => ({
  ensureStaffProfilePhotosBucket: mocks.ensureStaffProfilePhotosBucket,
  getStaffProfilePhotoStorageClient: () => ({
    client: mocks.storageClient,
    bucket: "staff-profile-photos",
    maxBytes: 2_000_000,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  })
}));

import {
  createStaffProfilePhotoDownloadUrl,
  deleteStaffProfilePhoto,
  uploadStaffProfilePhoto
} from "@/modules/staffboard-lite/services/staff-profile-photo.service";

const tenantId = "11111111-1111-4111-8111-111111111111";
const institutionId = "22222222-2222-4222-8222-222222222222";
const branchId = "33333333-3333-4333-8333-333333333333";
const staffId = "44444444-4444-4444-8444-444444444444";
const userId = "55555555-5555-4555-8555-555555555555";

const ctx: TenantContext = {
  tenantId,
  institutionId,
  userId,
  userEmail: "principal@example.test",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: null
};

const existingPhoto = {
  id: "66666666-6666-4666-8666-666666666666",
  tenantId,
  branchId,
  staffId,
  storageBucket: "staff-profile-photos",
  storagePath: `${tenantId}/${staffId}/old/photo.png`,
  originalFileName: "old-photo.png",
  mimeType: "image/png",
  sizeBytes: 9,
  checksumSha256: "checksum",
  uploadedById: userId,
  createdAt: new Date("2026-08-26T00:00:00.000Z"),
  updatedAt: new Date("2026-08-26T00:00:00.000Z")
};

function staff(profilePhoto: typeof existingPhoto | null = null) {
  return {
    id: staffId,
    branchId,
    userId,
    employeeCode: "EMP-01",
    profilePhoto
  };
}

function pngFile() {
  return new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
  ], "staff-photo.png", { type: "application/octet-stream" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.transaction) => unknown) => callback(mocks.transaction));
  mocks.ensureStaffProfilePhotosBucket.mockResolvedValue(undefined);
  mocks.requirePermission.mockResolvedValue(undefined);
  mocks.getEffectivePermissions.mockResolvedValue(new Set<string>());
  mocks.storedObject.upload.mockResolvedValue({ error: null });
  mocks.storedObject.remove.mockResolvedValue({ error: null });
  mocks.storedObject.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.example.test/signed/staff-photo" },
    error: null
  });
  mocks.transaction.staffProfilePhoto.upsert.mockResolvedValue(existingPhoto);
  mocks.transaction.staffProfilePhoto.delete.mockResolvedValue(existingPhoto);
});

describe("staff profile photo private-storage lifecycle", () => {
  it("uploads to a tenant/staff-scoped private path and writes a safe audit", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff());

    await uploadStaffProfilePhoto(ctx, { staffId, file: pngFile() });

    expect(mocks.db.staffProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: staffId,
        tenantId,
        branchId: { in: [branchId] },
        branch: { institutionId }
      }
    }));
    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "staffboard.staff.update",
      branchId
    });
    expect(mocks.ensureStaffProfilePhotosBucket).toHaveBeenCalledOnce();
    const storagePath = String(mocks.storedObject.upload.mock.calls[0]?.[0]);
    expect(storagePath).toMatch(new RegExp(`^${tenantId}/${staffId}/[0-9a-f-]+/staff-photo\\.png$`));
    expect(mocks.transaction.staffProfilePhoto.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenantId_staffId: { tenantId, staffId } },
      create: expect.objectContaining({ tenantId, branchId, staffId, storagePath }),
      update: expect.objectContaining({ branchId, storagePath })
    }));
    const auditInput = mocks.writeAuditLog.mock.calls[0]?.[0];
    expect(auditInput).toEqual(expect.objectContaining({
      action: "staffboard.staff.photo_uploaded",
      entityType: "StaffProfilePhoto",
      branchId,
      after: {
        staffId,
        mimeType: "image/png",
        sizeBytes: 9,
        replacedExistingPhoto: false
      }
    }));
    expect(JSON.stringify(auditInput)).not.toMatch(/storagePath|checksum|signedUrl|service.role/i);
  });

  it("removes the superseded private object after replacement", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff(existingPhoto));

    await uploadStaffProfilePhoto(ctx, { staffId, file: pngFile() });

    expect(mocks.storedObject.remove).toHaveBeenCalledWith([existingPhoto.storagePath]);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      after: expect.objectContaining({ replacedExistingPhoto: true })
    }), mocks.transaction);
  });

  it("creates only a short-lived signed URL for the linked staff member", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff(existingPhoto));
    mocks.getEffectivePermissions.mockResolvedValue(new Set([
      "staffboard.attendance.credential.self_view"
    ]));

    const url = await createStaffProfilePhotoDownloadUrl(ctx, staffId);

    expect(url).toBe("https://storage.example.test/signed/staff-photo");
    expect(mocks.storageClient.storage.from).toHaveBeenCalledWith(existingPhoto.storageBucket);
    expect(mocks.storedObject.createSignedUrl).toHaveBeenCalledWith(
      existingPhoto.storagePath,
      60,
      { download: false }
    );
  });

  it("denies another user without management authority", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff(existingPhoto));
    mocks.getEffectivePermissions.mockResolvedValue(new Set<string>());

    await expect(createStaffProfilePhotoDownloadUrl({ ...ctx, userId: "77777777-7777-4777-8777-777777777777" }, staffId))
      .rejects.toMatchObject({ code: "FORBIDDEN_STAFF_PHOTO_ACCESS", status: 403 });
    expect(mocks.storedObject.createSignedUrl).not.toHaveBeenCalled();
  });

  it("fails closed before storage access for a cross-scope staff record", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(null);

    await expect(createStaffProfilePhotoDownloadUrl(ctx, staffId))
      .rejects.toMatchObject({ code: "STAFF_PROFILE_NOT_FOUND", status: 404 });
    expect(mocks.storageClient.storage.from).not.toHaveBeenCalled();
  });

  it("does not delete metadata or write an audit when private-object removal fails", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff(existingPhoto));
    mocks.storedObject.remove.mockResolvedValue({ error: { message: "storage unavailable" } });

    await expect(deleteStaffProfilePhoto(ctx, staffId))
      .rejects.toMatchObject({ code: "STAFF_PROFILE_PHOTO_DELETE_FAILED", status: 503 });

    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.transaction.staffProfilePhoto.delete).not.toHaveBeenCalled();
    expect(mocks.writeAuditLog).not.toHaveBeenCalled();
  });

  it("removes the private object before deleting metadata and recording the audit", async () => {
    mocks.db.staffProfile.findFirst.mockResolvedValue(staff(existingPhoto));

    await deleteStaffProfilePhoto(ctx, staffId);

    expect(mocks.storedObject.remove).toHaveBeenCalledWith([existingPhoto.storagePath]);
    expect(mocks.transaction.staffProfilePhoto.delete).toHaveBeenCalledWith({
      where: { tenantId_staffId: { tenantId, staffId } }
    });
    expect(mocks.storedObject.remove.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.db.$transaction.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER);
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "staffboard.staff.photo_removed",
      entityType: "StaffProfilePhoto",
      entityId: existingPhoto.id,
      branchId
    }), mocks.transaction);
  });
});