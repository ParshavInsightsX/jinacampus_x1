import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { db } from "../src/lib/db";
import { SCHOOLCAST_PERMISSIONS } from "../src/modules/schoolcast/permissions";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const MIGRATION = "20260814120000_add_schoolcast_mvp_foundation";

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(`${name} does not identify a Supabase project.`);
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") throw new Error("SchoolCast staging audit is disabled in production mode.");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("Unapproved SchoolCast staging reference.");
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production database target detected. Audit refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) throw new Error("Database URLs do not target approved staging.");
}

async function main() {
  assertStaging();
  const migrationPath = resolve("prisma", "migrations", MIGRATION, "migration.sql");
  const migrationSql = readFileSync(migrationPath, "utf8");
  const checksums = new Set([
    migrationSql,
    migrationSql.replace(/\r\n/g, "\n"),
    migrationSql.replace(/\r?\n/g, "\r\n")
  ].map((value) => createHash("sha256").update(value).digest("hex")));

  const migrationRows = await db.$queryRawUnsafe<Array<{
    migration_name: string;
    checksum: string;
    finished: boolean;
    rolled_back: boolean;
  }>>(`
    SELECT migration_name, checksum,
      finished_at IS NOT NULL AS finished,
      rolled_back_at IS NOT NULL AS rolled_back
    FROM "_prisma_migrations"
    WHERE migration_name = '${MIGRATION}'
  `);
  assert.equal(migrationRows.length, 1, "SchoolCast migration history is missing or duplicated.");
  assert.equal(migrationRows[0].finished, true);
  assert.equal(migrationRows[0].rolled_back, false);
  assert(checksums.has(migrationRows[0].checksum), "SchoolCast migration checksum differs from source.");

  const expectedTables = [...migrationSql.matchAll(/CREATE TABLE "(schoolcast_[^"]+)"/g)]
    .map((match) => match[1])
    .sort();
  assert.equal(expectedTables.length, 18, "Expected 18 SchoolCast tables in the migration.");

  const tables = await db.$queryRawUnsafe<Array<{ table_name: string; rls_enabled: boolean }>>(`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relname LIKE 'schoolcast_%'
    ORDER BY c.relname
  `);
  assert.deepEqual(tables.map((row) => row.table_name), expectedTables);
  assert(tables.every((row) => row.rls_enabled), "Every SchoolCast table must have RLS enabled.");

  const tenantColumns = await db.$queryRawUnsafe<Array<{ table_name: string }>>(`
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name LIKE 'schoolcast_%'
      AND column_name = 'tenantId'
    ORDER BY table_name
  `);
  assert.deepEqual(tenantColumns.map((row) => row.table_name), expectedTables);

  const scanColumns = await db.$queryRawUnsafe<Array<{ column_name: string }>>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'schoolcast_attachments'
      AND column_name IN (
        'scanAttemptCount', 'scanAvailableAt', 'scanLockedAt', 'scanLeaseUntil',
        'scanLockOwner', 'scanCompletedAt', 'scanEngine', 'scanReference', 'scanFailureCode'
      )
    ORDER BY column_name
  `);
  assert.equal(scanColumns.length, 9, "Attachment scanner lease/result columns are incomplete.");

  const invalidIndexes = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT count(*)::bigint AS count
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname LIKE 'schoolcast_%'
      AND NOT i.indisvalid
  `);
  assert.equal(Number(invalidIndexes[0].count), 0);

  const unvalidatedConstraints = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT count(*)::bigint AS count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname LIKE 'schoolcast_%'
      AND NOT c.convalidated
  `);
  assert.equal(Number(unvalidatedConstraints[0].count), 0);

  const foreignKeys = await db.$queryRawUnsafe<Array<{ count: bigint }>>(`
    SELECT count(*)::bigint AS count
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname LIKE 'schoolcast_%'
      AND c.contype = 'f'
  `);
  assert(Number(foreignKeys[0].count) > 0, "SchoolCast foreign keys are missing.");

  const permissions = await db.permission.findMany({
    where: { code: { in: [...SCHOOLCAST_PERMISSIONS] }, isActive: true },
    select: { code: true }
  });
  assert.equal(permissions.length, SCHOOLCAST_PERMISSIONS.length, "SchoolCast permission registry is incomplete.");

  const liveProviders = await db.schoolCastProviderConfiguration.count({ where: { mode: "LIVE" } });
  assert.equal(liveProviders, 0, "Live SchoolCast providers are forbidden in staging.");

  const enabledBeforePilot = await db.tenantSettings.count({ where: { schoolCastEnabled: true } });

  return {
    ok: true,
    projectRef: STAGING_REF,
    migration: MIGRATION,
    schoolCastTables: tables.length,
    rlsEnabledTables: tables.filter((row) => row.rls_enabled).length,
    permissions: permissions.length,
    foreignKeys: Number(foreignKeys[0].count),
    invalidIndexes: Number(invalidIndexes[0].count),
    unvalidatedConstraints: Number(unvalidatedConstraints[0].count),
    liveProviders,
    enabledTenants: enabledBeforePilot
  };
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : "SchoolCastCatalogAuditError"
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
