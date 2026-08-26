import type { Prisma } from "@prisma/client";
import { notFound } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";

type ScopeClient = Pick<Prisma.TransactionClient, "institution" | "branch">;

export async function requireRegulatoryInstitutionScope(
  client: ScopeClient,
  ctx: TenantContext,
  institutionId: string
) {
  const institution = await client.institution.findFirst({
    where: {
      id: institutionId,
      tenantId: ctx.tenantId,
      status: { not: "ARCHIVED" },
      branches: {
        some: {
          tenantId: ctx.tenantId,
          id: { in: ctx.accessibleBranchIds },
          status: { not: "ARCHIVED" }
        }
      }
    },
    select: {
      id: true,
      tenantId: true,
      name: true,
      displayName: true,
      legalName: true,
      formerLegalNames: true,
      establishedYear: true,
      schoolType: true,
      code: true,
      board: true,
      medium: true,
      logoUrl: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      district: true,
      block: true,
      state: true,
      postalCode: true,
      country: true,
      officialEmail: true,
      officialPhone: true,
      website: true
    }
  });
  if (!institution) throw notFound("INSTITUTION_NOT_FOUND");
  return institution;
}

export async function requireRegulatoryBranchScope(
  client: ScopeClient,
  ctx: TenantContext,
  institutionId: string,
  branchId?: string | null
) {
  if (!branchId) return null;
  if (!ctx.accessibleBranchIds.includes(branchId)) throw notFound("INSTITUTION_NOT_FOUND");

  const branch = await client.branch.findFirst({
    where: {
      id: branchId,
      tenantId: ctx.tenantId,
      institutionId,
      status: { not: "ARCHIVED" }
    },
    select: { id: true, name: true, code: true }
  });
  if (!branch) throw notFound("INSTITUTION_NOT_FOUND");
  return branch;
}
