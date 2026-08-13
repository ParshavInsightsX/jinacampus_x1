import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const configurator = readFileSync(
  path.join(root, "scripts/configure-gradebook-staging-storage.ps1"),
  "utf8"
);
const runner = readFileSync(path.join(root, "scripts/gradebook-staging.ps1"), "utf8");
const probe = readFileSync(path.join(root, "scripts/gradebook-staging-storage-probe.ts"), "utf8");

describe("GradeBook staging storage guard", () => {
  it("accepts the staging server key only through a masked prompt outside the repository", () => {
    expect(configurator).toContain('Read-Host "Enter the server-only Supabase secret/service-role key');
    expect(configurator).toContain("-AsSecureString");
    expect(configurator).toContain('Join-Path $env:LOCALAPPDATA "JinaCampus\\secrets"');
    expect(configurator).toContain("icacls.exe");
    expect(configurator).toContain("AreAccessRulesProtected");
    expect(configurator).not.toContain("Set-Acl");
    expect(configurator).not.toMatch(/Get-Clipboard|Set-Clipboard/);
    expect(configurator).not.toMatch(/Write-Host.*plainKey|Write-Output.*plainKey/);
  });

  it("pins database and storage access to the isolated staging project", () => {
    for (const source of [configurator, runner, probe]) {
      expect(source).toContain("clmbwnulotrviqvnwvvj");
      expect(source).toContain("jcqpmdslmydxjsfdwenc");
      expect(source).toContain("Production database target detected. Operation refused.");
    }
    expect(configurator).toContain("https://$stagingProjectRef.supabase.co");
    expect(runner).toContain('"StorageAssert"');
    expect(runner).toContain('"StorageProbe"');
    expect(runner).toContain("Assert-StagingStorageEnvironment");
  });

  it("uses the validated GradeBook environment names and never exposes the server key", () => {
    for (const source of [configurator, runner, probe]) {
      expect(source).toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source).toContain("GRADEBOOK_STORAGE_BUCKET");
      expect(source).toContain("gradebook-private");
      expect(source).not.toContain("GRADEBOOK_PRIVATE_BUCKET");
    }
    expect(runner).toContain("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
    expect(probe).toContain("The server-only storage key must never be public.");
  });

  it("probes private access, signed expiry, MIME rejection, cleanup, and a synthetic audit ledger", () => {
    expect(probe).toContain("A private object was readable without authorization.");
    expect(probe).toContain("createSignedUrl(csvKey, SIGNED_URL_TTL_SECONDS");
    expect(probe).toContain("The signed URL remained valid after its expiry window.");
    expect(probe).toContain("The bucket accepted a forbidden MIME type.");
    expect(probe).toContain("remove([csvKey, pdfKey])");
    expect(probe).toContain("gradebook.qa.storage_probe_started");
    expect(probe).toContain("gradebook.qa.storage_probe_completed");
    expect(probe).toContain("gradebook.qa.storage_probe_failed");
  });
});
