import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type InstitutionRegulatorySchemaProbeClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const SCHEMA_PROBE_TTL_MS = 30_000;
let schemaAvailabilityCache: { available: boolean; expiresAt: number } | null = null;

export async function isInstitutionRegulatorySchemaAvailable(
  client: InstitutionRegulatorySchemaProbeClient = db
) {
  const now = Date.now();
  const useCache = client === db && process.env.NODE_ENV !== "test";
  if (useCache && schemaAvailabilityCache && schemaAvailabilityCache.expiresAt > now) {
    return schemaAvailabilityCache.available;
  }

  const [probe] = await client.$queryRaw<Array<{
    profilesAvailable: boolean;
    authoritiesAvailable: boolean;
    identifiersAvailable: boolean;
    authorizationsAvailable: boolean;
    documentsAvailable: boolean;
  }>>(Prisma.sql`
    SELECT
      to_regclass('public.institution_regulatory_profiles') IS NOT NULL AS "profilesAvailable",
      to_regclass('public.education_authorities') IS NOT NULL AS "authoritiesAvailable",
      to_regclass('public.institution_identifiers') IS NOT NULL AS "identifiersAvailable",
      to_regclass('public.institution_authorizations') IS NOT NULL AS "authorizationsAvailable",
      to_regclass('public.institution_regulatory_documents') IS NOT NULL AS "documentsAvailable"
  `);

  const available = Boolean(
    probe?.profilesAvailable &&
      probe.authoritiesAvailable &&
      probe.identifiersAvailable &&
      probe.authorizationsAvailable &&
      probe.documentsAvailable
  );

  if (useCache) {
    schemaAvailabilityCache = { available, expiresAt: now + SCHEMA_PROBE_TTL_MS };
  }
  return available;
}

export async function requireInstitutionRegulatorySchema(
  client: InstitutionRegulatorySchemaProbeClient = db
) {
  if (!(await isInstitutionRegulatorySchemaAvailable(client))) {
    throw new AppError(
      "INSTITUTION_REGULATORY_UPGRADE_REQUIRED",
      "INSTITUTION_REGULATORY_UPGRADE_REQUIRED",
      503
    );
  }
}
