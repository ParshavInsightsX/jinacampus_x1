import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";

type CompletenessClient = Pick<
  Prisma.TransactionClient,
  | "institution"
  | "institutionManagingEntityAssignment"
  | "institutionIdentifier"
  | "institutionAuthorization"
  | "institutionRegulatoryProfile"
>;

export async function refreshRegulatoryCompleteness(
  client: CompletenessClient,
  ctx: TenantContext,
  institutionId: string,
  branchId: string | null = null
) {
  const scope = { tenantId: ctx.tenantId, institutionId, branchId };
  const [institution, managingEntityCount, identifiers, authorizations] = await Promise.all([
    client.institution.findFirst({
      where: { id: institutionId, tenantId: ctx.tenantId },
      select: { legalName: true }
    }),
    client.institutionManagingEntityAssignment.count({
      where: { ...scope, isPrimary: true }
    }),
    client.institutionIdentifier.findMany({
      where: { ...scope, status: { notIn: ["REVOKED", "REJECTED", "SUPERSEDED"] } },
      select: { availability: true, status: true, verificationStatus: true, validUntil: true }
    }),
    client.institutionAuthorization.findMany({
      where: { ...scope, status: { notIn: ["REVOKED", "REJECTED", "SUPERSEDED"] } },
      select: { status: true, verificationStatus: true, validUntil: true }
    })
  ]);

  const now = new Date();
  const records = [...identifiers, ...authorizations];
  const actionRequired = records.some((record) =>
    record.verificationStatus === "VERIFICATION_FAILED" ||
    record.status === "EXPIRED" ||
    Boolean(record.validUntil && record.validUntil < now)
  );
  const structurallyComplete = Boolean(
    institution?.legalName && managingEntityCount > 0 && identifiers.length > 0 && authorizations.length > 0
  );
  const verified = structurallyComplete && records.every((record) =>
    record.status === "ACTIVE" &&
    (record.verificationStatus === "DOCUMENT_VERIFIED" || record.verificationStatus === "AUTHORITY_VERIFIED")
  );
  const started = Boolean(institution?.legalName || managingEntityCount || identifiers.length || authorizations.length);
  const completenessStatus = actionRequired
    ? "ACTION_REQUIRED"
    : verified
      ? "COMPLETE"
      : structurallyComplete
        ? "PENDING_VERIFICATION"
        : started
          ? "INCOMPLETE"
          : "NOT_STARTED";

  const existing = await client.institutionRegulatoryProfile.findFirst({
    where: scope,
    select: { id: true }
  });
  if (existing) {
    return client.institutionRegulatoryProfile.update({
      where: { id: existing.id },
      data: { completenessStatus, updatedById: ctx.userId }
    });
  }
  return client.institutionRegulatoryProfile.create({
    data: {
      ...scope,
      completenessStatus,
      countryCode: "IN",
      createdById: ctx.userId,
      updatedById: ctx.userId
    }
  });
}
