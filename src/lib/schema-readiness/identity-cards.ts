import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type IdentityCardSchemaProbeClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const SCHEMA_PROBE_TTL_MS = 30_000;
let schemaAvailabilityCache: { available: boolean; expiresAt: number } | null = null;

export async function isIdentityCardSchemaAvailable(
  client: IdentityCardSchemaProbeClient = db
) {
  const now = Date.now();
  const useCache = client === db && process.env.NODE_ENV !== "test";
  if (useCache && schemaAvailabilityCache && schemaAvailabilityCache.expiresAt > now) {
    return schemaAvailabilityCache.available;
  }

  const [probe] = await client.$queryRaw<Array<{
    staffPhotoTableAvailable: boolean;
    studentCardTableAvailable: boolean;
  }>>(Prisma.sql`
    SELECT
      to_regclass('public.staff_profile_photos') IS NOT NULL AS "staffPhotoTableAvailable",
      to_regclass('public.student_identity_cards') IS NOT NULL AS "studentCardTableAvailable"
  `);
  const available = Boolean(
    probe?.staffPhotoTableAvailable &&
      probe.studentCardTableAvailable
  );

  if (useCache) {
    schemaAvailabilityCache = {
      available,
      expiresAt: now + SCHEMA_PROBE_TTL_MS
    };
  }
  return available;
}

export async function requireIdentityCardSchema(
  client: IdentityCardSchemaProbeClient = db
) {
  if (!(await isIdentityCardSchemaAvailable(client))) {
    throw new AppError(
      "IDENTITY_CARD_UPGRADE_REQUIRED",
      "IDENTITY_CARD_UPGRADE_REQUIRED",
      503
    );
  }
}
