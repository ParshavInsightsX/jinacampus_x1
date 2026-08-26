import { createHash, randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import {
  detectStudentDocumentMimeType,
  safeStudentDocumentObjectName
} from "@/lib/files/student-document-file";
import { requirePermission } from "@/lib/rbac/require-permission";
import { requireInstitutionRegulatorySchema } from "@/lib/schema-readiness/institution-regulatory";
import {
  ensureInstitutionRegulatoryDocumentsBucket,
  getInstitutionRegulatoryDocumentStorageClient
} from "@/lib/storage/supabase-storage";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import {
  regulatoryDocumentMetadataSchema,
  regulatoryDocumentParamsSchema
} from "@/modules/campus-core/regulatory/schemas";
import {
  requireRegulatoryBranchScope,
  requireRegulatoryInstitutionScope
} from "@/modules/campus-core/regulatory/scope";

type RegulatoryDocumentMetadata = {
  institutionId: string;
  branchId?: string;
  recordType: "GENERAL" | "IDENTIFIER" | "AUTHORIZATION";
  recordId?: string;
  documentTypeCode: string;
  title: string;
  documentNumber?: string;
  issuedAt?: string | Date;
  expiresAt?: string | Date;
};

async function resolveDocumentScope(
  ctx: TenantContext,
  input: ReturnType<typeof regulatoryDocumentMetadataSchema.parse>
) {
  await requireInstitutionRegulatorySchema();
  await requireRegulatoryInstitutionScope(db, ctx, input.institutionId);

  if (input.recordType === "IDENTIFIER") {
    const identifier = await db.institutionIdentifier.findFirst({
      where: {
        id: input.recordId,
        tenantId: ctx.tenantId,
        institutionId: input.institutionId
      },
      select: { id: true, branchId: true }
    });
    if (!identifier) throw notFound("INSTITUTION_IDENTIFIER_NOT_FOUND");
    if (input.branchId && input.branchId !== identifier.branchId) {
      throw new AppError("INVALID_REGULATORY_DOCUMENT_SCOPE", "INVALID_REGULATORY_DOCUMENT_SCOPE", 400);
    }
    return { branchId: identifier.branchId, identifierId: identifier.id, authorizationId: null };
  }

  if (input.recordType === "AUTHORIZATION") {
    const authorization = await db.institutionAuthorization.findFirst({
      where: {
        id: input.recordId,
        tenantId: ctx.tenantId,
        institutionId: input.institutionId
      },
      select: { id: true, branchId: true }
    });
    if (!authorization) throw notFound("INSTITUTION_AUTHORIZATION_NOT_FOUND");
    if (input.branchId && input.branchId !== authorization.branchId) {
      throw new AppError("INVALID_REGULATORY_DOCUMENT_SCOPE", "INVALID_REGULATORY_DOCUMENT_SCOPE", 400);
    }
    return { branchId: authorization.branchId, identifierId: null, authorizationId: authorization.id };
  }

  await requireRegulatoryBranchScope(db, ctx, input.institutionId, input.branchId);
  return { branchId: input.branchId ?? null, identifierId: null, authorizationId: null };
}

export async function uploadInstitutionRegulatoryDocument(
  ctx: TenantContext,
  rawMetadata: RegulatoryDocumentMetadata,
  file: File
) {
  const metadata = regulatoryDocumentMetadataSchema.parse(rawMetadata);
  const scope = await resolveDocumentScope(ctx, metadata);
  await requirePermission({
    ctx,
    permission: "campuscore.institution.regulatory.manage",
    branchId: scope.branchId ?? undefined
  });

  const { client, bucket, maxBytes, allowedMimeTypes } = getInstitutionRegulatoryDocumentStorageClient();
  if (!(file instanceof File) || file.size === 0) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_FILE_REQUIRED", "INSTITUTION_REGULATORY_DOCUMENT_FILE_REQUIRED", 400);
  }
  if (file.size > maxBytes) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_TOO_LARGE", "INSTITUTION_REGULATORY_DOCUMENT_TOO_LARGE", 400);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mimeType = detectStudentDocumentMimeType(bytes);
  if (!mimeType || !allowedMimeTypes.includes(mimeType as (typeof allowedMimeTypes)[number])) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_TYPE_NOT_ALLOWED", "INSTITUTION_REGULATORY_DOCUMENT_TYPE_NOT_ALLOWED", 400);
  }

  await ensureInstitutionRegulatoryDocumentsBucket();
  const documentId = randomUUID();
  const scopeSegment = scope.branchId ?? "institution";
  const objectKey = `${ctx.tenantId}/${metadata.institutionId}/${scopeSegment}/${documentId}/${safeStudentDocumentObjectName(file.name, mimeType)}`;
  const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
  const { error: uploadError } = await client.storage.from(bucket).upload(objectKey, bytes, {
    contentType: mimeType,
    cacheControl: "0",
    upsert: false
  });
  if (uploadError) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_UPLOAD_FAILED", "INSTITUTION_REGULATORY_DOCUMENT_UPLOAD_FAILED", 503);
  }

  try {
    return await db.$transaction(async (tx) => {
      const document = await tx.institutionRegulatoryDocument.create({
        data: {
          id: documentId,
          tenantId: ctx.tenantId,
          institutionId: metadata.institutionId,
          branchId: scope.branchId,
          identifierId: scope.identifierId,
          authorizationId: scope.authorizationId,
          documentTypeCode: metadata.documentTypeCode,
          title: metadata.title,
          documentNumber: metadata.documentNumber ?? null,
          storageBucket: bucket,
          privateObjectKey: objectKey,
          checksumSha256,
          mimeType,
          sizeBytes: file.size,
          dataClassification: "RESTRICTED",
          publicationStatus: "NOT_PUBLISHED",
          issuedAt: metadata.issuedAt ?? null,
          expiresAt: metadata.expiresAt ?? null,
          uploadedById: ctx.userId
        }
      });
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_REGULATORY_DOCUMENT_UPLOADED,
        entityType: "InstitutionRegulatoryDocument",
        entityId: document.id,
        branchId: scope.branchId,
        after: {
          institutionId: metadata.institutionId,
          identifierId: scope.identifierId,
          authorizationId: scope.authorizationId,
          documentTypeCode: document.documentTypeCode,
          title: document.title,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          dataClassification: document.dataClassification
        }
      }, tx);
      return document;
    });
  } catch (error) {
    await client.storage.from(bucket).remove([objectKey]);
    throw error;
  }
}

async function requireDocumentAccess(
  ctx: TenantContext,
  institutionId: string,
  documentId: string,
  permission: "campuscore.institution.regulatory.document.download" | "campuscore.institution.regulatory.manage"
) {
  await requireInstitutionRegulatorySchema();
  await requireRegulatoryInstitutionScope(db, ctx, institutionId);
  const document = await db.institutionRegulatoryDocument.findFirst({
    where: {
      id: documentId,
      tenantId: ctx.tenantId,
      institutionId,
      deletedAt: null
    },
    select: {
      id: true,
      branchId: true,
      storageBucket: true,
      privateObjectKey: true,
      title: true,
      mimeType: true,
      documentTypeCode: true,
      sizeBytes: true
    }
  });
  if (!document) throw notFound("INSTITUTION_REGULATORY_DOCUMENT_NOT_FOUND");
  await requirePermission({ ctx, permission, branchId: document.branchId ?? undefined });
  return document;
}

export async function createInstitutionRegulatoryDocumentDownloadUrl(
  ctx: TenantContext,
  institutionId: string,
  documentId: string
) {
  const params = regulatoryDocumentParamsSchema.parse({ institutionId, documentId });
  const document = await requireDocumentAccess(
    ctx,
    params.institutionId,
    params.documentId,
    "campuscore.institution.regulatory.document.download"
  );
  const { client } = getInstitutionRegulatoryDocumentStorageClient();
  const { data, error } = await client.storage
    .from(document.storageBucket)
    .createSignedUrl(document.privateObjectKey, 60, {
      download: document.mimeType.startsWith("image/")
        ? false
        : safeStudentDocumentObjectName(document.title, document.mimeType)
    });
  if (error || !data?.signedUrl) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_DOWNLOAD_FAILED", "INSTITUTION_REGULATORY_DOCUMENT_DOWNLOAD_FAILED", 503);
  }
  await writeAuditLog({
    ctx,
    action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_REGULATORY_DOCUMENT_DOWNLOADED,
    entityType: "InstitutionRegulatoryDocument",
    entityId: document.id,
    branchId: document.branchId,
    metadata: {
      institutionId,
      documentTypeCode: document.documentTypeCode,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes
    }
  });
  return data.signedUrl;
}

export async function deleteInstitutionRegulatoryDocument(
  ctx: TenantContext,
  institutionId: string,
  documentId: string
) {
  const params = regulatoryDocumentParamsSchema.parse({ institutionId, documentId });
  const document = await requireDocumentAccess(
    ctx,
    params.institutionId,
    params.documentId,
    "campuscore.institution.regulatory.manage"
  );
  const { client } = getInstitutionRegulatoryDocumentStorageClient();
  const { error } = await client.storage.from(document.storageBucket).remove([document.privateObjectKey]);
  if (error) {
    throw new AppError("INSTITUTION_REGULATORY_DOCUMENT_DELETE_FAILED", "INSTITUTION_REGULATORY_DOCUMENT_DELETE_FAILED", 503);
  }

  return db.$transaction(async (tx) => {
    const deletedAt = new Date();
    const updated = await tx.institutionRegulatoryDocument.update({
      where: { id: document.id },
      data: { deletedAt, deletedById: ctx.userId }
    });
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_REGULATORY_DOCUMENT_DELETED,
      entityType: "InstitutionRegulatoryDocument",
      entityId: document.id,
      branchId: document.branchId,
      before: {
        institutionId,
        documentTypeCode: document.documentTypeCode,
        title: document.title,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes
      },
      after: { deletedAt }
    }, tx);
    return updated;
  });
}
