import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const STAGING_PROJECT_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_PROJECT_REF = "jcqpmdslmydxjsfdwenc";

type MigrationRow = {
  migration_name: string;
  checksum: string;
  finished: boolean;
  rolled_back: boolean;
};

type ModelScope = {
  model: string;
  table: string;
  fields: Set<string>;
};

type UniqueKey = {
  table: string;
  fields: string[];
};

function requiredArgument(name: string) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) throw new Error(`Missing ${name}.`);
  return path.resolve(value);
}

function projectRefFromUrl(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const directMatch = /^db\.([a-z0-9]+)\.supabase\.co$/i.exec(url.hostname);
  if (directMatch) return directMatch[1].toLowerCase();
  const poolerMatch = /^postgres\.([a-z0-9]+)$/i.exec(decodeURIComponent(url.username));
  if (url.hostname.endsWith(".pooler.supabase.com") && poolerMatch) {
    return poolerMatch[1].toLowerCase();
  }
  throw new Error(`${name} does not identify a Supabase project reference.`);
}

function assertStagingTarget() {
  const configured = process.env.GRADEBOOK_STAGING_PROJECT_REF;
  const runtimeRef = projectRefFromUrl(process.env.DATABASE_URL, "DATABASE_URL");
  const directRef = projectRefFromUrl(process.env.DIRECT_URL, "DIRECT_URL");
  if ([configured, runtimeRef, directRef].includes(PRODUCTION_PROJECT_REF)) {
    throw new Error("Production database target detected. Audit refused.");
  }
  if (configured !== STAGING_PROJECT_REF || runtimeRef !== STAGING_PROJECT_REF || directRef !== STAGING_PROJECT_REF) {
    throw new Error("The catalog audit must target the approved GradeBook staging project.");
  }
}

function parseModelScopes(schema: string): ModelScope[] {
  const models: ModelScope[] = [];
  const pattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  for (const match of schema.matchAll(pattern)) {
    const model = match[1];
    const body = match[2];
    const mapped = /@@map\("([^"]+)"\)/.exec(body)?.[1];
    const fields = new Set<string>();
    for (const line of body.split(/\r?\n/)) {
      const field = /^\s*(\w+)\s+[^@\s]+/.exec(line)?.[1];
      if (field && !field.startsWith("@@")) fields.add(field);
    }
    models.push({ model, table: mapped ?? model, fields });
  }
  return models;
}

function parseUniqueKeys(schema: string): UniqueKey[] {
  const keys: UniqueKey[] = [];
  const pattern = /model\s+\w+\s*\{([\s\S]*?)\n\}/g;
  for (const match of schema.matchAll(pattern)) {
    const body = match[1];
    const table = /@@map\("([^"]+)"\)/.exec(body)?.[1];
    if (!table) continue;

    for (const line of body.split(/\r?\n/)) {
      const field = /^\s*(\w+)\s+[^@\s]+/.exec(line)?.[1];
      if (field && /(?:^|\s)@unique(?:\s|$|\()/.test(line)) {
        keys.push({ table, fields: [field] });
      }
    }

    for (const unique of body.matchAll(/@@unique\s*\(\s*\[([^\]]+)\]/g)) {
      const fields = unique[1]
        .split(",")
        .map((value) => value.trim().replace(/\(.*/, ""))
        .filter(Boolean);
      keys.push({ table, fields });
    }
  }
  return keys;
}

function migrationInventory(schemaPath: string) {
  const migrationsPath = path.join(path.dirname(schemaPath), "migrations");
  const migrations = readdirSync(migrationsPath)
    .filter((name) => statSync(path.join(migrationsPath, name)).isDirectory())
    .filter((name) => statSync(path.join(migrationsPath, name, "migration.sql"), { throwIfNoEntry: false })?.isFile())
    .sort();
  return migrations.map((name) => {
    const content = readFileSync(path.join(migrationsPath, name, "migration.sql"), "utf8");
    const lfContent = content.replace(/\r\n/g, "\n");
    const checksums = Array.from(
      new Set(
        [content, lfContent, lfContent.replace(/\n/g, "\r\n")].map((variant) =>
          createHash("sha256").update(variant).digest("hex")
        )
      )
    );
    return { name, checksums };
  });
}

function sameValues(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function main() {
  assertStagingTarget();
  const schemaPath = requiredArgument("--schema");
  const schema = readFileSync(schemaPath, "utf8");
  const expectedMigrations = migrationInventory(schemaPath);
  const models = parseModelScopes(schema);
  const expectedUniqueKeys = parseUniqueKeys(schema);
  const expectedTables = models.map((item) => item.table).sort();
  const gradebookModels = models.filter((item) => item.table.startsWith("gradebook_"));

  const db = new PrismaClient();
  try {
    const migrations = await db.$queryRawUnsafe<MigrationRow[]>(`
      SELECT
        migration_name,
        checksum,
        finished_at IS NOT NULL AS finished,
        rolled_back_at IS NOT NULL AS rolled_back
      FROM "_prisma_migrations"
      ORDER BY started_at
    `);
    const actualMigrationNames = migrations.map((item) => item.migration_name);
    const expectedMigrationNames = expectedMigrations.map((item) => item.name);
    if (!sameValues(actualMigrationNames, expectedMigrationNames)) {
      throw new Error("Prisma migration history does not match the selected application snapshot.");
    }
    if (migrations.some((item) => !item.finished || item.rolled_back)) {
      throw new Error("Prisma migration history contains an incomplete or rolled-back migration.");
    }
    for (const expected of expectedMigrations) {
      const actual = migrations.find((item) => item.migration_name === expected.name);
      if (!actual || !expected.checksums.includes(actual.checksum)) {
        throw new Error(`Migration checksum mismatch: ${expected.name}.`);
      }
    }

    const tables = await db.$queryRawUnsafe<Array<{ table_name: string }>>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
      ORDER BY table_name
    `);
    const actualTables = tables.map((item) => item.table_name);
    if (!sameValues(actualTables, expectedTables)) {
      throw new Error("Public table inventory does not match the selected Prisma schema.");
    }

    const columns = await db.$queryRawUnsafe<Array<{ table_name: string; column_name: string }>>(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);
    const columnsByTable = new Map<string, Set<string>>();
    for (const column of columns) {
      const set = columnsByTable.get(column.table_name) ?? new Set<string>();
      set.add(column.column_name);
      columnsByTable.set(column.table_name, set);
    }
    for (const model of models) {
      const actual = columnsByTable.get(model.table) ?? new Set<string>();
      for (const scope of ["tenantId", "branchId", "academicYearId"]) {
        if (model.fields.has(scope) && !actual.has(scope)) {
          throw new Error(`Missing ${scope} on ${model.table}.`);
        }
      }
    }
    const unscopedGradebook = gradebookModels.filter((item) => !item.fields.has("tenantId"));
    if (unscopedGradebook.length > 0) {
      throw new Error(`GradeBook tenant scope missing: ${unscopedGradebook.map((item) => item.table).join(", ")}.`);
    }

    const uniqueIndexes = await db.$queryRawUnsafe<Array<{
      table_name: string;
      index_name: string;
      columns: string[];
    }>>(`
      SELECT
        t.relname AS table_name,
        idx.relname AS index_name,
        array_agg(a.attname ORDER BY key.ordinality)::text[] AS columns
      FROM pg_index i
      JOIN pg_class t ON t.oid = i.indrelid
      JOIN pg_class idx ON idx.oid = i.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = key.attnum
      WHERE n.nspname = 'public' AND i.indisunique AND NOT i.indisprimary
      GROUP BY t.relname, idx.relname
      ORDER BY t.relname, idx.relname
    `);
    const actualUniqueKeys = new Set(
      uniqueIndexes.map((item) => item.table_name + "|" + item.columns.join(","))
    );
    const missingUniqueKeys = expectedUniqueKeys.filter(
      (item) => !actualUniqueKeys.has(item.table + "|" + item.fields.join(","))
    );
    if (missingUniqueKeys.length > 0) {
      throw new Error(
        "Missing unique indexes: " +
          missingUniqueKeys.map((item) => item.table + "(" + item.fields.join(",") + ")").join(", ") +
          "."
      );
    }

    const integrity = await db.$queryRawUnsafe<Array<{
      foreign_keys: bigint;
      indexes: bigint;
      invalid_indexes: bigint;
      unvalidated_constraints: bigint;
    }>>(`
      SELECT
        (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND c.contype = 'f') AS foreign_keys,
        (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public') AS indexes,
        (SELECT count(*) FROM pg_index i JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public' AND NOT i.indisvalid) AS invalid_indexes,
        (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace WHERE n.nspname = 'public' AND NOT c.convalidated) AS unvalidated_constraints
    `);
    const catalog = integrity[0];
    if (catalog.invalid_indexes !== 0n || catalog.unvalidated_constraints !== 0n) {
      throw new Error("The database contains invalid indexes or unvalidated constraints.");
    }

    const gradebookRls = await db.$queryRawUnsafe<Array<{ table_name: string; rls_enabled: boolean }>>(`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'gradebook_%'
      ORDER BY c.relname
    `);
    if (gradebookRls.some((item) => !item.rls_enabled)) {
      throw new Error("One or more GradeBook tables do not have RLS enabled.");
    }

    const data = await db.$queryRawUnsafe<Array<{
      tenants: bigint;
      institutions: bigint;
      branches: bigint;
      academic_years: bigint;
      users: bigint;
      students: bigint;
      enrollments: bigint;
      student_attendance: bigint;
      staff_attendance: bigint;
      subjects: bigint;
    }>>(`
      SELECT
        (SELECT count(*) FROM tenants) AS tenants,
        (SELECT count(*) FROM institutions) AS institutions,
        (SELECT count(*) FROM branches) AS branches,
        (SELECT count(*) FROM academic_years) AS academic_years,
        (SELECT count(*) FROM users) AS users,
        (SELECT count(*) FROM students) AS students,
        (SELECT count(*) FROM enrollments) AS enrollments,
        (SELECT count(*) FROM student_attendance_records) AS student_attendance,
        (SELECT count(*) FROM staff_attendance_records) AS staff_attendance,
        (SELECT count(*) FROM subjects) AS subjects
    `);

    const summary = {
      projectRef: STAGING_PROJECT_REF,
      migrationCount: migrations.length,
      lastMigration: migrations.at(-1)?.migration_name ?? null,
      tableCount: actualTables.length,
      gradebookTableCount: gradebookModels.length,
      gradebookBranchScopedTableCount: gradebookModels.filter((item) => item.fields.has("branchId")).length,
      gradebookAcademicYearScopedTableCount: gradebookModels.filter((item) => item.fields.has("academicYearId")).length,
      gradebookRlsTableCount: gradebookRls.length,
      foreignKeyCount: Number(catalog.foreign_keys),
      declaredUniqueKeyCount: expectedUniqueKeys.length,
      uniqueIndexCount: uniqueIndexes.length,
      indexCount: Number(catalog.indexes),
      invalidIndexCount: Number(catalog.invalid_indexes),
      unvalidatedConstraintCount: Number(catalog.unvalidated_constraints),
      syntheticDataCounts: Object.fromEntries(Object.entries(data[0]).map(([key, value]) => [key, Number(value)]))
    };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  }
  finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown catalog audit failure.";
  process.stderr.write(`${JSON.stringify({ ok: false, message })}\n`);
  process.exitCode = 1;
});
