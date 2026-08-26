import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import { requireInstitutionRegulatorySchema } from "@/lib/schema-readiness/institution-regulatory";
import type { TenantContext } from "@/lib/tenant/context";
import { maskOfficialValue } from "@/modules/campus-core/regulatory/normalization";
import { requireRegulatoryInstitutionScope } from "@/modules/campus-core/regulatory/scope";

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export async function getInstitutionRegulatoryWorkspace(ctx: TenantContext, institutionId: string) {
  await requireInstitutionRegulatorySchema();
  await requirePermission({ ctx, permission: "campuscore.institution.regulatory.read" });
  const permissions = await getEffectivePermissions({ ctx });
  const canReadSensitive = permissions.has("campuscore.institution.regulatory.read_sensitive");
  const institution = await requireRegulatoryInstitutionScope(db, ctx, institutionId);

  const [profile, branches, authorities, assignments, identifiers, authorizations, documents] = await Promise.all([
    db.institutionRegulatoryProfile.findFirst({
      where: { tenantId: ctx.tenantId, institutionId, branchId: null },
      select: { completenessStatus: true, countryCode: true, stateCode: true, boardCode: true, updatedAt: true }
    }),
    db.branch.findMany({
      where: {
        tenantId: ctx.tenantId,
        institutionId,
        id: { in: ctx.accessibleBranchIds },
        status: { not: "ARCHIVED" }
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" }
    }),
    db.educationAuthority.findMany({
      where: { isActive: true, countryCode: "IN" },
      select: { id: true, code: true, name: true, shortName: true, type: true, stateCode: true },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    }),
    db.institutionManagingEntityAssignment.findMany({
      where: { tenantId: ctx.tenantId, institutionId },
      select: {
        id: true,
        branchId: true,
        isPrimary: true,
        validFrom: true,
        validUntil: true,
        branch: { select: { name: true } },
        managingEntity: {
          select: {
            id: true,
            legalName: true,
            type: true,
            registrationNumber: true,
            registrationAuthority: true,
            authorisedRepresentative: true
          }
        }
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
    }),
    db.institutionIdentifier.findMany({
      where: { tenantId: ctx.tenantId, institutionId },
      select: {
        id: true,
        branchId: true,
        type: true,
        availability: true,
        value: true,
        status: true,
        verificationStatus: true,
        dataClassification: true,
        publicationStatus: true,
        isPrimary: true,
        validFrom: true,
        validUntil: true,
        createdAt: true,
        authority: { select: { id: true, code: true, shortName: true, name: true } },
        branch: { select: { name: true } }
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
    }),
    db.institutionAuthorization.findMany({
      where: { tenantId: ctx.tenantId, institutionId },
      select: {
        id: true,
        branchId: true,
        type: true,
        authorizationNumber: true,
        applicationReference: true,
        categoryCode: true,
        status: true,
        verificationStatus: true,
        dataClassification: true,
        publicationStatus: true,
        issuedAt: true,
        validFrom: true,
        validUntil: true,
        createdAt: true,
        authority: { select: { id: true, code: true, shortName: true, name: true } },
        branch: { select: { name: true } },
        coverage: {
          select: { stage: true, gradeFrom: true, gradeTo: true, programmeCode: true, streamCode: true, mediumCode: true }
        }
      },
      orderBy: { createdAt: "desc" }
    }),
    db.institutionRegulatoryDocument.findMany({
      where: { tenantId: ctx.tenantId, institutionId, deletedAt: null },
      select: {
        id: true,
        branchId: true,
        identifierId: true,
        authorizationId: true,
        documentTypeCode: true,
        title: true,
        documentNumber: true,
        mimeType: true,
        sizeBytes: true,
        dataClassification: true,
        publicationStatus: true,
        issuedAt: true,
        expiresAt: true,
        createdAt: true,
        branch: { select: { name: true } }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  return {
    institution: {
      ...institution,
      formerLegalNames: Array.isArray(institution.formerLegalNames)
        ? institution.formerLegalNames.filter((value): value is string => typeof value === "string")
        : []
    },
    profile: profile ? { ...profile, updatedAt: iso(profile.updatedAt) } : null,
    branches,
    authorities,
    managingEntities: assignments.map((assignment) => ({
      ...assignment,
      validFrom: iso(assignment.validFrom),
      validUntil: iso(assignment.validUntil),
      managingEntity: {
        ...assignment.managingEntity,
        registrationNumber: canReadSensitive
          ? assignment.managingEntity.registrationNumber
          : maskOfficialValue(assignment.managingEntity.registrationNumber)
      }
    })),
    identifiers: identifiers.map((identifier) => ({
      ...identifier,
      value: canReadSensitive ? identifier.value : maskOfficialValue(identifier.value),
      validFrom: iso(identifier.validFrom),
      validUntil: iso(identifier.validUntil),
      createdAt: iso(identifier.createdAt)
    })),
    authorizations: authorizations.map((authorization) => ({
      ...authorization,
      authorizationNumber: canReadSensitive
        ? authorization.authorizationNumber
        : maskOfficialValue(authorization.authorizationNumber),
      issuedAt: iso(authorization.issuedAt),
      validFrom: iso(authorization.validFrom),
      validUntil: iso(authorization.validUntil),
      createdAt: iso(authorization.createdAt)
    })),
    documents: documents.map((document) => ({
      ...document,
      documentNumber: canReadSensitive ? document.documentNumber : maskOfficialValue(document.documentNumber),
      issuedAt: iso(document.issuedAt),
      expiresAt: iso(document.expiresAt),
      createdAt: iso(document.createdAt)
    })),
    capabilities: {
      canManage: permissions.has("campuscore.institution.regulatory.manage"),
      canSubmit: permissions.has("campuscore.institution.regulatory.submit"),
      canDownloadDocuments: permissions.has("campuscore.institution.regulatory.document.download"),
      canReadSensitive
    }
  };
}

export type InstitutionRegulatoryWorkspace = Awaited<ReturnType<typeof getInstitutionRegulatoryWorkspace>>;
