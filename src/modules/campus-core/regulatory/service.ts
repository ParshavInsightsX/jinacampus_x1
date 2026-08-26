import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { requireInstitutionRegulatorySchema } from "@/lib/schema-readiness/institution-regulatory";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { refreshRegulatoryCompleteness } from "@/modules/campus-core/regulatory/completeness";
import {
  maskOfficialValue,
  normalizeAuthorizationNumber,
  normalizeOfficialIdentifier,
  officialIdentifierClaimFingerprint
} from "@/modules/campus-core/regulatory/normalization";
import {
  createInstitutionAuthorizationSchema,
  createInstitutionIdentifierSchema,
  createManagingEntitySchema,
  submitRegulatoryRecordSchema,
  updateInstitutionLegalIdentitySchema
} from "@/modules/campus-core/regulatory/schemas";
import {
  requireRegulatoryBranchScope,
  requireRegulatoryInstitutionScope
} from "@/modules/campus-core/regulatory/scope";

const REGULATORY_TRANSACTION_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  maxWait: 10_000,
  timeout: 30_000
} as const;

async function requireManageScope(
  ctx: TenantContext,
  institutionId: string,
  branchId?: string | null
) {
  await requireInstitutionRegulatorySchema();
  await requirePermission({
    ctx,
    permission: "campuscore.institution.regulatory.manage",
    branchId: branchId ?? undefined
  });
  const institution = await requireRegulatoryInstitutionScope(db, ctx, institutionId);
  const branch = await requireRegulatoryBranchScope(db, ctx, institutionId, branchId);
  return { institution, branch };
}

export async function updateInstitutionLegalIdentity(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = updateInstitutionLegalIdentitySchema.parse(rawInput);
  const { institution } = await requireManageScope(ctx, input.institutionId);

  return db.$transaction(async (tx) => {
    const updated = await tx.institution.update({
      where: { id: institution.id },
      data: {
        legalName: input.legalName,
        formerLegalNames: input.formerLegalNames,
        establishedYear: input.establishedYear ?? null,
        schoolType: input.schoolType ?? null,
        district: input.district ?? null,
        block: input.block ?? null,
        officialEmail: input.officialEmail?.toLowerCase() ?? null,
        officialPhone: input.officialPhone ?? null,
        website: input.website ?? null,
        updatedById: ctx.userId
      },
      select: {
        id: true,
        legalName: true,
        formerLegalNames: true,
        establishedYear: true,
        schoolType: true,
        district: true,
        block: true,
        officialEmail: true,
        officialPhone: true,
        website: true
      }
    });

    const profile = await tx.institutionRegulatoryProfile.findFirst({
      where: { tenantId: ctx.tenantId, institutionId: institution.id, branchId: null },
      select: { id: true }
    });
    if (profile) {
      await tx.institutionRegulatoryProfile.update({
        where: { id: profile.id },
        data: {
          countryCode: input.countryCode,
          stateCode: input.stateCode ?? null,
          boardCode: input.boardCode ?? null,
          updatedById: ctx.userId
        }
      });
    } else {
      await tx.institutionRegulatoryProfile.create({
        data: {
          tenantId: ctx.tenantId,
          institutionId: institution.id,
          countryCode: input.countryCode,
          stateCode: input.stateCode ?? null,
          boardCode: input.boardCode ?? null,
          completenessStatus: "INCOMPLETE",
          createdById: ctx.userId,
          updatedById: ctx.userId
        }
      });
    }

    await refreshRegulatoryCompleteness(tx, ctx, institution.id);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_REGULATORY_PROFILE_UPDATED,
      entityType: "Institution",
      entityId: institution.id,
      before: {
        legalName: institution.legalName,
        formerLegalNames: institution.formerLegalNames,
        establishedYear: institution.establishedYear,
        schoolType: institution.schoolType,
        district: institution.district,
        block: institution.block,
        officialEmail: institution.officialEmail,
        officialPhone: institution.officialPhone,
        website: institution.website
      },
      after: updated,
      metadata: { countryCode: input.countryCode, stateCode: input.stateCode, boardCode: input.boardCode }
    }, tx);
    return updated;
  }, REGULATORY_TRANSACTION_OPTIONS);
}

export async function createInstitutionManagingEntity(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = createManagingEntitySchema.parse(rawInput);
  await requireManageScope(ctx, input.institutionId, input.branchId);

  return db.$transaction(async (tx) => {
    const entity = await tx.institutionManagingEntity.create({
      data: {
        tenantId: ctx.tenantId,
        legalName: input.legalName,
        type: input.type,
        registrationNumber: input.registrationNumber ?? null,
        registrationAuthority: input.registrationAuthority ?? null,
        registrationStateCode: input.registrationStateCode ?? null,
        registrationDate: input.registrationDate ?? null,
        registeredOfficeAddress: input.registeredOfficeAddress ?? null,
        authorisedRepresentative: input.authorisedRepresentative ?? null,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });

    const assignmentStart = input.validFrom ?? new Date();
    await tx.institutionManagingEntityAssignment.updateMany({
      where: {
        tenantId: ctx.tenantId,
        institutionId: input.institutionId,
        branchId: input.branchId ?? null,
        isPrimary: true
      },
      data: { isPrimary: false, validUntil: assignmentStart, updatedById: ctx.userId }
    });
    const assignment = await tx.institutionManagingEntityAssignment.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: input.institutionId,
        branchId: input.branchId ?? null,
        managingEntityId: entity.id,
        isPrimary: true,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        createdById: ctx.userId,
        updatedById: ctx.userId
      }
    });

    await refreshRegulatoryCompleteness(tx, ctx, input.institutionId, input.branchId ?? null);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_MANAGING_ENTITY_CREATED,
      entityType: "InstitutionManagingEntity",
      entityId: entity.id,
      branchId: input.branchId ?? null,
      after: {
        legalName: entity.legalName,
        type: entity.type,
        registrationNumber: maskOfficialValue(entity.registrationNumber)
      }
    }, tx);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_MANAGING_ENTITY_ASSIGNED,
      entityType: "InstitutionManagingEntityAssignment",
      entityId: assignment.id,
      branchId: input.branchId ?? null,
      after: {
        managingEntityId: entity.id,
        institutionId: input.institutionId,
        isPrimary: true,
        validFrom: assignment.validFrom,
        validUntil: assignment.validUntil
      }
    }, tx);
    return assignment;
  }, REGULATORY_TRANSACTION_OPTIONS);
}

export async function createInstitutionIdentifier(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = createInstitutionIdentifierSchema.parse(rawInput);
  await requireManageScope(ctx, input.institutionId, input.branchId);
  const normalizedValue = input.value ? normalizeOfficialIdentifier(input.type, input.value) : null;

  try {
    return await db.$transaction(async (tx) => {
      const authority = await tx.educationAuthority.findFirst({
        where: { id: input.authorityId, isActive: true },
        select: { id: true }
      });
      if (!authority) throw notFound("EDUCATION_AUTHORITY_NOT_FOUND");

      let superseded: { id: string; value: string | null } | null = null;
      if (input.supersedesId) {
        superseded = await tx.institutionIdentifier.findFirst({
          where: {
            id: input.supersedesId,
            tenantId: ctx.tenantId,
            institutionId: input.institutionId,
            branchId: input.branchId ?? null,
            authorityId: input.authorityId,
            type: input.type,
            status: { not: "SUPERSEDED" }
          },
          select: { id: true, value: true }
        });
        if (!superseded) throw notFound("INSTITUTION_IDENTIFIER_NOT_FOUND");
      }

      let claimFingerprint: string | null = null;
      let existingClaim: { institutionIdentifierId: string } | null = null;
      if (normalizedValue) {
        claimFingerprint = officialIdentifierClaimFingerprint({
          authorityId: input.authorityId,
          type: input.type,
          normalizedValue
        });
        existingClaim = await tx.officialIdentifierClaim.findUnique({
          where: { claimFingerprint },
          select: { institutionIdentifierId: true }
        });
        if (existingClaim && existingClaim.institutionIdentifierId !== input.supersedesId) {
          throw new AppError("OFFICIAL_IDENTIFIER_ALREADY_REGISTERED", "OFFICIAL_IDENTIFIER_ALREADY_REGISTERED", 409);
        }
      }

      if (input.isPrimary) {
        await tx.institutionIdentifier.updateMany({
          where: {
            tenantId: ctx.tenantId,
            institutionId: input.institutionId,
            branchId: input.branchId ?? null,
            authorityId: input.authorityId,
            type: input.type,
            isPrimary: true,
            status: { notIn: ["REVOKED", "REJECTED", "SUPERSEDED"] }
          },
          data: { isPrimary: false, updatedById: ctx.userId }
        });
      }

      const identifier = await tx.institutionIdentifier.create({
        data: {
          tenantId: ctx.tenantId,
          institutionId: input.institutionId,
          branchId: input.branchId ?? null,
          authorityId: input.authorityId,
          type: input.type,
          availability: input.availability,
          value: input.value ?? null,
          normalizedValue,
          dataClassification: input.dataClassification,
          isPrimary: input.isPrimary,
          issuedAt: input.issuedAt ?? null,
          validFrom: input.validFrom ?? null,
          validUntil: input.validUntil ?? null,
          supersedesId: input.supersedesId ?? null,
          supersessionReason: input.supersessionReason ?? null,
          createdById: ctx.userId,
          updatedById: ctx.userId
        }
      });

      if (claimFingerprint && !existingClaim) {
        await tx.officialIdentifierClaim.create({
          data: {
            claimFingerprint,
            tenantId: ctx.tenantId,
            institutionIdentifierId: identifier.id
          }
        });
      }
      if (superseded) {
        await tx.institutionIdentifier.update({
          where: { id: superseded.id },
          data: { status: "SUPERSEDED", isPrimary: false, updatedById: ctx.userId }
        });
        await writeAuditLog({
          ctx,
          action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_IDENTIFIER_SUPERSEDED,
          entityType: "InstitutionIdentifier",
          entityId: superseded.id,
          branchId: input.branchId ?? null,
          before: { value: maskOfficialValue(superseded.value) },
          after: { supersededById: identifier.id, reason: input.supersessionReason }
        }, tx);
      }

      await refreshRegulatoryCompleteness(tx, ctx, input.institutionId, input.branchId ?? null);
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_IDENTIFIER_CREATED,
        entityType: "InstitutionIdentifier",
        entityId: identifier.id,
        branchId: input.branchId ?? null,
        after: {
          institutionId: input.institutionId,
          authorityId: input.authorityId,
          type: input.type,
          availability: input.availability,
          value: maskOfficialValue(input.value),
          dataClassification: input.dataClassification,
          isPrimary: input.isPrimary
        }
      }, tx);
      return identifier;
    }, REGULATORY_TRANSACTION_OPTIONS);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new AppError("OFFICIAL_IDENTIFIER_ALREADY_REGISTERED", "OFFICIAL_IDENTIFIER_ALREADY_REGISTERED", 409);
    }
    throw error;
  }
}

export async function createInstitutionAuthorization(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = createInstitutionAuthorizationSchema.parse(rawInput);
  await requireManageScope(ctx, input.institutionId, input.branchId);

  return db.$transaction(async (tx) => {
    const authority = await tx.educationAuthority.findFirst({
      where: { id: input.authorityId, isActive: true },
      select: { id: true }
    });
    if (!authority) throw notFound("EDUCATION_AUTHORITY_NOT_FOUND");

    const superseded = input.supersedesId
      ? await tx.institutionAuthorization.findFirst({
        where: {
          id: input.supersedesId,
          tenantId: ctx.tenantId,
          institutionId: input.institutionId,
          branchId: input.branchId ?? null,
          authorityId: input.authorityId,
          type: input.type,
          status: { not: "SUPERSEDED" }
        },
        select: { id: true, authorizationNumber: true }
      })
      : null;
    if (input.supersedesId && !superseded) throw notFound("INSTITUTION_AUTHORIZATION_NOT_FOUND");

    const authorization = await tx.institutionAuthorization.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: input.institutionId,
        branchId: input.branchId ?? null,
        authorityId: input.authorityId,
        type: input.type,
        authorizationNumber: input.authorizationNumber ?? null,
        normalizedNumber: input.authorizationNumber
          ? normalizeAuthorizationNumber(input.authorizationNumber)
          : null,
        applicationReference: input.applicationReference ?? null,
        categoryCode: input.categoryCode ?? null,
        dataClassification: input.dataClassification,
        issuedAt: input.issuedAt ?? null,
        validFrom: input.validFrom ?? null,
        validUntil: input.validUntil ?? null,
        supersedesId: input.supersedesId ?? null,
        supersessionReason: input.supersessionReason ?? null,
        createdById: ctx.userId,
        updatedById: ctx.userId,
        coverage: input.stage ? {
          create: {
            tenant: { connect: { id: ctx.tenantId } },
            stage: input.stage,
            gradeFrom: input.gradeFrom ?? null,
            gradeTo: input.gradeTo ?? null,
            programmeCode: input.programmeCode ?? null,
            streamCode: input.streamCode ?? null,
            mediumCode: input.mediumCode ?? null
          }
        } : undefined
      }
    });

    if (superseded) {
      await tx.institutionAuthorization.update({
        where: { id: superseded.id },
        data: { status: "SUPERSEDED", updatedById: ctx.userId }
      });
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_AUTHORIZATION_SUPERSEDED,
        entityType: "InstitutionAuthorization",
        entityId: superseded.id,
        branchId: input.branchId ?? null,
        before: { authorizationNumber: maskOfficialValue(superseded.authorizationNumber) },
        after: { supersededById: authorization.id, reason: input.supersessionReason }
      }, tx);
    }

    await refreshRegulatoryCompleteness(tx, ctx, input.institutionId, input.branchId ?? null);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_AUTHORIZATION_CREATED,
      entityType: "InstitutionAuthorization",
      entityId: authorization.id,
      branchId: input.branchId ?? null,
      after: {
        institutionId: input.institutionId,
        authorityId: input.authorityId,
        type: input.type,
        authorizationNumber: maskOfficialValue(input.authorizationNumber),
        categoryCode: input.categoryCode,
        dataClassification: input.dataClassification
      }
    }, tx);
    return authorization;
  }, REGULATORY_TRANSACTION_OPTIONS);
}

export async function submitInstitutionRegulatoryRecord(
  ctx: TenantContext,
  rawInput: unknown
) {
  const input = submitRegulatoryRecordSchema.parse(rawInput);
  await requireInstitutionRegulatorySchema();
  await requirePermission({ ctx, permission: "campuscore.institution.regulatory.submit" });
  await requireRegulatoryInstitutionScope(db, ctx, input.institutionId);

  return db.$transaction(async (tx) => {
    if (input.recordType === "IDENTIFIER") {
      const record = await tx.institutionIdentifier.findFirst({
        where: { id: input.recordId, tenantId: ctx.tenantId, institutionId: input.institutionId },
        select: { id: true, branchId: true, status: true }
      });
      if (!record) throw notFound("INSTITUTION_IDENTIFIER_NOT_FOUND");
      await requirePermission({
        ctx,
        permission: "campuscore.institution.regulatory.submit",
        branchId: record.branchId ?? undefined
      });
      if (record.status !== "DRAFT") {
        throw new AppError("REGULATORY_RECORD_NOT_DRAFT", "REGULATORY_RECORD_NOT_DRAFT", 409);
      }
      const updated = await tx.institutionIdentifier.update({
        where: { id: record.id },
        data: { status: "PENDING_REVIEW", verificationStatus: "SELF_DECLARED", updatedById: ctx.userId }
      });
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_IDENTIFIER_SUBMITTED,
        entityType: "InstitutionIdentifier",
        entityId: record.id,
        branchId: record.branchId,
        before: { status: record.status },
        after: { status: updated.status, verificationStatus: updated.verificationStatus }
      }, tx);
      return updated;
    }

    const record = await tx.institutionAuthorization.findFirst({
      where: { id: input.recordId, tenantId: ctx.tenantId, institutionId: input.institutionId },
      select: { id: true, branchId: true, status: true }
    });
    if (!record) throw notFound("INSTITUTION_AUTHORIZATION_NOT_FOUND");
    await requirePermission({
      ctx,
      permission: "campuscore.institution.regulatory.submit",
      branchId: record.branchId ?? undefined
    });
    if (record.status !== "DRAFT") {
      throw new AppError("REGULATORY_RECORD_NOT_DRAFT", "REGULATORY_RECORD_NOT_DRAFT", 409);
    }
    const updated = await tx.institutionAuthorization.update({
      where: { id: record.id },
      data: { status: "PENDING_REVIEW", verificationStatus: "SELF_DECLARED", updatedById: ctx.userId }
    });
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.INSTITUTION_AUTHORIZATION_SUBMITTED,
      entityType: "InstitutionAuthorization",
      entityId: record.id,
      branchId: record.branchId,
      before: { status: record.status },
      after: { status: updated.status, verificationStatus: updated.verificationStatus }
    }, tx);
    return updated;
  }, REGULATORY_TRANSACTION_OPTIONS);
}
