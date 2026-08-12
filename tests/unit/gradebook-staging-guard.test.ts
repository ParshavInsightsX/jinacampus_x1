import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const runner = readFileSync(path.join(root, "scripts/gradebook-staging.ps1"), "utf8");
const configurator = readFileSync(path.join(root, "scripts/configure-gradebook-staging-env.ps1"), "utf8");
const resetSql = readFileSync(
  path.join(root, "scripts/sql/reset-gradebook-staging-application-schema.sql"),
  "utf8"
);
const connectivitySql = readFileSync(
  path.join(root, "scripts/sql/check-staging-connectivity.sql"),
  "utf8"
);
const audit = readFileSync(path.join(root, "scripts/audit-gradebook-staging-catalog.ts"), "utf8");

describe("GradeBook staging database guard", () => {
  it("pins the isolated staging project and explicitly rejects production", () => {
    expect(runner).toContain('expectedStagingRef = "clmbwnulotrviqvnwvvj"');
    expect(runner).toContain('productionRef = "jcqpmdslmydxjsfdwenc"');
    expect(runner).toContain("Production database target detected. Operation refused.");
    expect(runner).toContain("Assert-StagingTarget");
  });

  it("loads secrets only from the protected local app-data directory without clipboard access", () => {
    expect(runner).toContain('EndsWith(".local"');
    expect(runner).toContain('Join-Path $env:LOCALAPPDATA "JinaCampus\\secrets"');
    expect(runner).toContain("protected local JinaCampus secrets directory");
    expect(runner).not.toContain("git check-ignore");
    expect(runner).not.toMatch(/Get-Clipboard|Set-Clipboard/);
    expect(configurator).toContain("Read-Host");
    expect(configurator).toContain("-AsSecureString");
    expect(configurator).toContain('Join-Path $env:LOCALAPPDATA "JinaCampus\\secrets"');
    expect(configurator).not.toMatch(/Get-Clipboard|Set-Clipboard/);
  });

  it("keeps destructive reset SQL behind the guarded runner", () => {
    expect(runner).toContain('"ResetApplicationSchema"');
    expect(runner).toContain("reset-gradebook-staging-application-schema.sql");
    expect(resetSql).toContain("DROP TABLE IF EXISTS public.%I CASCADE");
    expect(resetSql).toContain("DROP TYPE IF EXISTS public.%I CASCADE");
    expect(resetSql).not.toMatch(/storage\.|auth\.|drop schema/i);
  });

  it("audits migration checksums, catalog integrity, scope columns, and RLS", () => {
    expect(runner).toContain('"Audit"');
    expect(audit).toContain("Migration checksum mismatch");
    expect(audit).toContain('replace(/\\r\\n/g, "\\n")');
    expect(audit).toContain('replace(/\\n/g, "\\r\\n")');
    expect(audit).toContain("expected.checksums.includes(actual.checksum)");
    expect(audit).toContain('["tenantId", "branchId", "academicYearId"]');
    expect(audit).toContain("invalid_indexes");
    expect(audit).toContain("unvalidated_constraints");
    expect(audit).toContain("relrowsecurity");
    expect(audit).toContain("Missing unique indexes");
    expect(audit).toContain("declaredUniqueKeyCount");
    expect(audit).toContain("uniqueIndexCount");
    expect(audit).not.toMatch(/Get-Clipboard|Set-Clipboard/);
  });

  it("requires the approved expansion to be the pending upgrade", () => {
    expect(runner).toContain('"Status"');
    expect(runner).toContain("statusCode -notin @(0, 1)");
    expect(runner).toContain('"ExpectedGradebookPending"');
    expect(runner).toContain("20260811201500_expand_gradebook_phase_0_1");
    expect(runner).toContain("statusCode -ne 1");
  });

  it("uses the project-specific direct host for staging migration commands", () => {
    expect(runner).toContain("Use-StagingDirectConnection");
    expect(runner).toContain('directHost = "db.$expectedStagingRef.supabase.co"');
    expect(runner).toContain('"Connectivity"');
    expect(runner).toContain("check-staging-connectivity.sql");
    expect(runner).not.toContain("--stdin");
    expect(connectivitySql.trim()).toBe("SELECT current_database();");
    expect(runner).not.toContain("aws-1-ap-northeast-2.pooler.supabase.com");
  });
});
