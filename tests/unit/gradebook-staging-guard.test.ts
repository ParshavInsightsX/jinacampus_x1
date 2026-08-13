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
const pilot = readFileSync(path.join(root, "scripts/gradebook-staging-pilot.ts"), "utf8");
const recoveryQa = readFileSync(path.join(root, "scripts/principal-recovery-staging-qa.ts"), "utf8");

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

  it("keeps browser QA bounded without changing the protected staging secret", () => {
    expect(runner).toContain("protectedStagingRuntimeUrl");
    expect(runner).toContain("connection_limit=3");
    expect(runner).toContain("pool_timeout=30");
    expect(runner).toContain("Using the bounded staging QA runtime connection.");
    expect(runner).not.toContain("Set-Content $EnvironmentFile");
  });

  it("uses the bounded runtime for every application-level pilot command", () => {
    for (const command of ["PilotPrepare", "PilotVerify", "PilotDisable", "PilotInspect", "PilotLocalReady"]) {
      expect(runner).toMatch(new RegExp(`"${command}" \\{\\s+Use-StagingQaRuntimeConnection`));
    }
  });

  it("pins recovery provisioning and QA to synthetic staging identities", () => {
    for (const command of [
      "RecoveryPrepare",
      "RecoveryInspect",
      "RecoveryExpireLatestPilot",
      "RecoveryExpireActiveSynthetic",
      "RecoveryVerify",
      "RecoveryRestoreSyntheticPasswords"
    ]) {
      expect(runner).toMatch(new RegExp('"' + command + '" \\{\\s+Use-StagingQaRuntimeConnection'));
    }
    expect(runner).toContain('"gradebook-release-operator@qa.invalid" "grant"');
    expect(runner).toContain('"principal-recovery-observer@qa.invalid" "revoke"');
    expect(runner).toContain("CONFIRM_PRINCIPAL_RECOVERY_ACCESS_CHANGE");
    expect(runner).not.toMatch(/Get-Clipboard|Set-Clipboard/);
    expect(recoveryQa).toContain('const STAGING_REF = "clmbwnulotrviqvnwvvj"');
    expect(recoveryQa).toContain('const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc"');
    expect(recoveryQa).toContain("Production database target detected. Operation refused.");
    expect(recoveryQa).toContain('externalDelivery: "MANUAL_DELIVERY_REQUIRED"');
    expect(recoveryQa).toContain("crossTenantApiDenied: true");
    expect(recoveryQa).toContain("unauthorizedRoleDenied: true");
  });

  it("provides a production-safe localhost launcher with an authenticated pilot preflight", () => {
    const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      scripts?: Record<string, string>;
    };
    const devServerBlock = runner.slice(runner.indexOf('"DevServer" {'));
    expect(packageJson.scripts?.["dev:gradebook:staging"]).toContain("-Command DevServer -Port 3000");
    expect(packageJson.scripts?.["qa:gradebook:staging:ready"]).toContain("-Command PilotLocalReady");
    expect(runner).toContain("Assert-LocalPortAvailable");
    expect(runner).toContain("Get-NetTCPConnection -State Listen -LocalPort");
    expect(runner).toContain("Assert-StagingStorageEnvironment");
    expect(devServerBlock.indexOf("Assert-LocalPortAvailable $Port")).toBeLessThan(
      devServerBlock.indexOf("Assert-StagingStorageEnvironment")
    );
    expect(runner).toContain('"gradebook-staging-pilot.ts") local-ready');
    expect(runner).toContain('$env:APP_URL = $localOrigin');
    expect(runner).toContain('$env:WEBAUTHN_RP_ID = "localhost"');
    expect(pilot).toContain('command: "local-ready"');
    expect(pilot).toContain("Staff local UI denial");
    expect(pilot).toContain("gradebookPortalResultsEnabled: false");
  });

  it("pins synthetic pilot mutations to staging and keeps portal results disabled", () => {
    expect(pilot).toContain('const STAGING_REF = "clmbwnulotrviqvnwvvj"');
    expect(pilot).toContain('const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc"');
    expect(pilot).toContain("Production database target detected. Operation refused.");
    expect(pilot).toContain('const PILOT_SLUG = "jinacampus-demo"');
    expect(pilot).toContain('const CONTROL_SLUG = "gradebook-control"');
    expect(pilot).toContain("gradebookPortalResultsEnabled: false");
    expect(pilot).toContain("client-owned scope fields rejected");
    expect(pilot).toContain("cross-institution direct record denial");
    expect(pilot).toContain("cross-institution branch permission denial");
    expect(pilot).toContain("six synthetic identities serially");
    expect(pilot).not.toMatch(/Get-Clipboard|Set-Clipboard/);
  });
});
