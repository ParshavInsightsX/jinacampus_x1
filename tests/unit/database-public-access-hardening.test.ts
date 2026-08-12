import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "scripts/sql/harden-gradebook-staging-public-data-api.sql"
  ),
  "utf8"
);

describe("approved GradeBook staging public database access hardening", () => {
  it("removes existing and future Data API grants", () => {
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM anon, authenticated"
    );
    expect(migration).toContain(
      "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated"
    );
    expect(migration).toContain(
      "ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public"
    );
    expect(migration).toContain(
      "REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated"
    );
  });

  it("enables RLS on every legacy table identified by the staging advisor", () => {
    const rlsStatements = migration.match(/ENABLE ROW LEVEL SECURITY;/g) ?? [];

    expect(rlsStatements).toHaveLength(37);
    for (const table of [
      "_prisma_migrations",
      "audit_logs",
      "password_credentials",
      "sessions",
      "staff_attendance_records",
      "student_attendance_records",
      "tenant_settings",
      "tenants",
      "users"
    ]) {
      expect(migration).toContain(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    }
  });

  it("does not grant client roles access or alter application data", () => {
    expect(migration).not.toMatch(/\bGRANT\b/);
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT)\b/);
  });

  it("stays outside deployable migration directories", () => {
    expect(migration).toContain("outside deployable");
    expect(migration).toContain("must not be run against production");
  });
});
