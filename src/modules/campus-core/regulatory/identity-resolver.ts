import { db } from "@/lib/db";
import { getEffectivePermissions, requirePermission } from "@/lib/rbac/require-permission";
import { requireInstitutionRegulatorySchema } from "@/lib/schema-readiness/institution-regulatory";
import type { TenantContext } from "@/lib/tenant/context";
import { maskOfficialValue } from "@/modules/campus-core/regulatory/normalization";
import {
  requireRegulatoryBranchScope,
  requireRegulatoryInstitutionScope
} from "@/modules/campus-core/regulatory/scope";

export type InstitutionIdentityPurpose =
  | "INTERNAL_OPERATIONS"
  | "PRINTED_DOCUMENT"
  | "PUBLIC_DISCLOSURE"
  | "REGULATORY_REPORT";

export async function resolveInstitutionIdentityForPurpose(
  ctx: TenantContext,
  input: {
    institutionId: string;
    branchId?: string | null;
    purpose: InstitutionIdentityPurpose;
  }
) {
  await requireInstitutionRegulatorySchema();
  await requirePermission({
    ctx,
    permission: "campuscore.institution.regulatory.read",
    branchId: input.branchId ?? undefined
  });
  const permissions = await getEffectivePermissions({ ctx, branchId: input.branchId ?? undefined });
  const institution = await requireRegulatoryInstitutionScope(db, ctx, input.institutionId);
  const branch = await requireRegulatoryBranchScope(db, ctx, input.institutionId, input.branchId);
  const publicOnly = input.purpose === "PUBLIC_DISCLOSURE" || input.purpose === "PRINTED_DOCUMENT";
  const canReadSensitive = permissions.has("campuscore.institution.regulatory.read_sensitive");
  const scope = {
    tenantId: ctx.tenantId,
    institutionId: input.institutionId,
    branchId: input.branchId ?? null
  };

  const [identifiers, authorizations] = await Promise.all([
    db.institutionIdentifier.findMany({
      where: {
        ...scope,
        status: "ACTIVE",
        ...(publicOnly ? {
          publicationStatus: "PUBLISHED" as const,
          dataClassification: { in: ["PUBLIC" as const, "PUBLIC_ELIGIBLE" as const] }
        } : {})
      },
      select: {
        type: true,
        availability: true,
        value: true,
        isPrimary: true,
        validUntil: true,
        verificationStatus: true,
        authority: { select: { code: true, name: true, shortName: true } }
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }]
    }),
    db.institutionAuthorization.findMany({
      where: {
        ...scope,
        status: "ACTIVE",
        ...(publicOnly ? {
          publicationStatus: "PUBLISHED" as const,
          dataClassification: { in: ["PUBLIC" as const, "PUBLIC_ELIGIBLE" as const] }
        } : {})
      },
      select: {
        type: true,
        authorizationNumber: true,
        categoryCode: true,
        validFrom: true,
        validUntil: true,
        verificationStatus: true,
        authority: { select: { code: true, name: true, shortName: true } },
        coverage: {
          select: { stage: true, gradeFrom: true, gradeTo: true, programmeCode: true, streamCode: true, mediumCode: true }
        }
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  const exposeFullValues = publicOnly || canReadSensitive;
  return {
    purpose: input.purpose,
    institution: {
      id: institution.id,
      legalName: institution.legalName ?? institution.name,
      displayName: institution.displayName ?? institution.name,
      code: institution.code,
      logoUrl: institution.logoUrl,
      address: [
        institution.addressLine1,
        institution.addressLine2,
        institution.city,
        institution.district,
        institution.state,
        institution.postalCode,
        institution.country
      ].filter(Boolean).join(", "),
      officialEmail: institution.officialEmail,
      officialPhone: institution.officialPhone,
      website: institution.website
    },
    branch,
    identifiers: identifiers.map((identifier) => ({
      type: identifier.type,
      availability: identifier.availability,
      value: exposeFullValues ? identifier.value : maskOfficialValue(identifier.value),
      isPrimary: identifier.isPrimary,
      validUntil: identifier.validUntil?.toISOString() ?? null,
      verificationStatus: identifier.verificationStatus,
      authority: identifier.authority
    })),
    authorizations: authorizations.map((authorization) => ({
      type: authorization.type,
      authorizationNumber: exposeFullValues
        ? authorization.authorizationNumber
        : maskOfficialValue(authorization.authorizationNumber),
      categoryCode: authorization.categoryCode,
      validFrom: authorization.validFrom?.toISOString() ?? null,
      validUntil: authorization.validUntil?.toISOString() ?? null,
      verificationStatus: authorization.verificationStatus,
      authority: authorization.authority,
      coverage: authorization.coverage
    }))
  };
}
