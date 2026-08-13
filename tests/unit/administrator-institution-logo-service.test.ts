import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const uploadedObject = {
    upload: vi.fn(),
    getPublicUrl: vi.fn(),
    remove: vi.fn()
  };
  const storageClient = {
    storage: {
      from: vi.fn(() => uploadedObject)
    }
  };
  const transaction = {
    institution: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  };
  const db = {
    institution: {
      findFirst: vi.fn()
    },
    $transaction: vi.fn()
  };

  return {
    db,
    transaction,
    storageClient,
    uploadedObject,
    ensureInstitutionLogosBucket: vi.fn(),
    writePlatformAuditLog: vi.fn()
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/platform-audit-log", () => ({
  writePlatformAuditLog: mocks.writePlatformAuditLog
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn()
}));
vi.mock("@/lib/storage/supabase-storage", () => ({
  ensureInstitutionLogosBucket: mocks.ensureInstitutionLogosBucket,
  getInstitutionLogoStorageClient: () => ({
    client: mocks.storageClient,
    bucket: "institution-logos",
    maxBytes: 2_000_000,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"]
  })
}));

import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import { updateInstitutionLogoForAdministrator } from "@/modules/campus-core/administrator-branding.service";

const context: PlatformAdministratorContext = {
  administratorId: "administrator-id",
  sessionId: "administrator-session-id",
  email: "administrator@example.test",
  displayName: "Administrator",
  canManagePrincipalRecovery: false,
  passwordChangeRequired: false
};

const tenantId = "11111111-1111-4111-8111-111111111111";
const institutionId = "22222222-2222-4222-8222-222222222222";

function pngFile() {
  return new File([
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01])
  ], "school-logo.png", { type: "application/octet-stream" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.transaction) => unknown) => callback(mocks.transaction));
  mocks.uploadedObject.upload.mockResolvedValue({ error: null });
  mocks.uploadedObject.getPublicUrl.mockImplementation((objectKey: string) => ({
    data: { publicUrl: `https://storage.example.test/institution-logos/${objectKey}` }
  }));
  mocks.uploadedObject.remove.mockResolvedValue({ error: null });
  mocks.ensureInstitutionLogosBucket.mockResolvedValue(undefined);
});

describe("platform administrator institution logo service", () => {
  it("updates the tenant-scoped institution and writes a safe platform audit", async () => {
    mocks.db.institution.findFirst.mockResolvedValue({
      id: institutionId,
      tenantId,
      name: "Example School",
      displayName: "Example Campus",
      logoUrl: null,
      logoObjectKey: null,
      tenant: { slug: "example-school" }
    });
    mocks.transaction.institution.findFirst.mockResolvedValue({
      id: institutionId,
      displayName: "Example Campus",
      logoUrl: null,
      logoObjectKey: null
    });
    mocks.transaction.institution.update.mockResolvedValue({
      id: institutionId,
      logoUrl: "https://storage.example.test/new-logo",
      logoObjectKey: "logos/new-logo.png"
    });

    await updateInstitutionLogoForAdministrator(context, { tenantId, institutionId, file: pngFile() });

    expect(mocks.db.institution.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: institutionId, tenantId }
    }));
    expect(mocks.ensureInstitutionLogosBucket).toHaveBeenCalledOnce();
    const objectKey = String(mocks.uploadedObject.upload.mock.calls[0]?.[0]);
    expect(objectKey).toMatch(/^logos\/[0-9a-f-]+\.png$/);
    expect(objectKey).not.toContain(tenantId);
    expect(objectKey).not.toContain(institutionId);
    expect(mocks.transaction.institution.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: institutionId },
      data: expect.objectContaining({ logoObjectKey: objectKey })
    }));
    expect(mocks.writePlatformAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx: context,
      action: "platform.institution.logo_updated",
      entityType: "Institution",
      entityId: institutionId,
      before: { logoConfigured: false },
      after: { logoConfigured: true },
      metadata: expect.objectContaining({ mimeType: "image/png", sizeBytes: 9 })
    }), mocks.transaction);
    const auditInput = mocks.writePlatformAuditLog.mock.calls[0]?.[0] as {
      before?: unknown;
      after?: unknown;
      metadata?: unknown;
    };
    const auditPayload = JSON.stringify({
      before: auditInput.before,
      after: auditInput.after,
      metadata: auditInput.metadata
    });
    expect(auditPayload).not.toMatch(/logoObjectKey|SUPABASE_SERVICE_ROLE_KEY|password|token/i);
  });

  it("rejects a tenant/institution mismatch before touching storage", async () => {
    mocks.db.institution.findFirst.mockResolvedValue(null);

    await expect(updateInstitutionLogoForAdministrator(context, {
      tenantId,
      institutionId,
      file: pngFile()
    })).rejects.toMatchObject({ code: "INSTITUTION_NOT_FOUND", status: 404 });

    expect(mocks.ensureInstitutionLogosBucket).not.toHaveBeenCalled();
    expect(mocks.uploadedObject.upload).not.toHaveBeenCalled();
    expect(mocks.writePlatformAuditLog).not.toHaveBeenCalled();
  });
});
