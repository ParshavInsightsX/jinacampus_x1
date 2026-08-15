import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "scripts", "backup-schoolcast-staging.ps1"),
  "utf8"
);
const evidence = JSON.parse(
  readFileSync(
    join(
      process.cwd(),
      "docs",
      "evidence",
      "schoolcast-recovery-rehearsal-2026-08-15.json"
    ),
    "utf8"
  )
) as {
  environment: string;
  productionRecoveryGate: string;
  productionRpoCertified: boolean;
  productionRtoCertified: boolean;
  storageObjectsIncluded: boolean;
};

describe("SchoolCast recovery rehearsal", () => {
  it("is guarded to the approved synthetic staging project", () => {
    expect(source).toContain('$expectedStagingRef = "clmbwnulotrviqvnwvvj"');
    expect(source).toContain('$productionRef = "jcqpmdslmydxjsfdwenc"');
    expect(source).toContain('throw "Production target detected. Backup refused."');
    expect(source).toContain('throw "The staging environment must be a protected .local file."');
  });

  it("creates and verifies a portable logical backup in an isolated restore", () => {
    expect(source).toContain("--format=custom --no-owner --no-privileges");
    expect(source).toContain('"pg_restore",');
    expect(source).toContain('"--exit-on-error",');
    expect(source).toContain("failedMigrationCount");
    expect(source).toContain("invalidIndexCount");
    expect(source).toContain("unvalidatedConstraintCount");
    expect(source).toContain("schoolCastTablePresent");
  });

  it("records measured evidence without claiming production RPO or RTO", () => {
    expect(source).toContain('recoveryScope = "PUBLIC_SCHEMA_LOGICAL_BACKUP"');
    expect(source).toContain("backupDurationSeconds");
    expect(source).toContain("restoreDurationSeconds");
    expect(source).toContain("storageObjectsIncluded = $false");
    expect(source).toContain("continuousRecoveryEnabled = $false");
    expect(source).toContain("productionRpoCertified = $false");
    expect(source).toContain("productionRtoCertified = $false");
    expect(source).toContain('productionRecoveryGate = "BLOCKED"');
  });

  it("keeps the checked-in evidence explicitly staging-only and blocked", () => {
    expect(evidence.environment).toBe("STAGING");
    expect(evidence.productionRecoveryGate).toBe("BLOCKED");
    expect(evidence.productionRpoCertified).toBe(false);
    expect(evidence.productionRtoCertified).toBe(false);
    expect(evidence.storageObjectsIncluded).toBe(false);
  });
});
