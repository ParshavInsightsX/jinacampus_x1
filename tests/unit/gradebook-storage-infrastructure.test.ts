import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(
  path.join(root, "supabase/migrations/20260812143000_configure_gradebook_private_storage.sql"),
  "utf8"
);
const imports = readFileSync(
  path.join(root, "src/modules/gradebook/services/marks-import.service.ts"),
  "utf8"
);
const reportCards = readFileSync(
  path.join(root, "src/modules/gradebook/services/report-card.service.ts"),
  "utf8"
);

describe("GradeBook private storage infrastructure", () => {
  it("keeps the bucket private and restricts file size and MIME types", () => {
    expect(migration).toContain("'gradebook-private'");
    expect(migration).toContain("public = false");
    expect(migration).toContain("10000000");
    expect(migration).toContain("application/pdf");
    expect(migration).toContain("text/csv");
    expect(migration).not.toMatch(/CREATE\s+POLICY/i);
  });

  it("fails if a direct browser-role policy targets the private bucket", () => {
    expect(migration).toContain("pg_catalog.pg_policies");
    expect(migration).toContain("'authenticated' = ANY(roles)");
    expect(migration).toContain("must not have direct browser-role storage policies");
  });

  it("uses tenant-safe object prefixes and short-lived report-card links", () => {
    expect(imports).toContain("${request.tenantId}/${request.branchId}/${request.academicYearId}/imports/");
    expect(reportCards).toContain("${request.tenantId}/${request.branchId}/${request.academicYearId}/report-cards/");
    expect(reportCards).toContain("createSignedUrl(card.pdfObjectKey, 60");
  });
});
