import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getLegalReadinessIssues,
  resolveLegalPublicationConfig
} from "@/config/legal";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("legal and regulatory launch readiness", () => {
  it("fails closed until approved publication details and contacts are configured", () => {
    const draft = resolveLegalPublicationConfig({});
    expect(draft.status).toBe("DRAFT");
    expect(getLegalReadinessIssues(draft)).toEqual(expect.arrayContaining([
      "LEGAL_DOCUMENT_STATUS must be EFFECTIVE",
      "LEGAL_ENTITY_NAME is required",
      "GRIEVANCE_OFFICER_NAME is required"
    ]));

    const approved = resolveLegalPublicationConfig({
      LEGAL_DOCUMENT_STATUS: "EFFECTIVE",
      LEGAL_DOCUMENT_VERSION: "1.0",
      LEGAL_EFFECTIVE_DATE: "2026-09-01",
      LEGAL_LAST_REVIEWED_DATE: "2026-08-22",
      LEGAL_ENTITY_NAME: "Approved Legal Entity",
      LEGAL_ENTITY_ADDRESS: "Approved registered address",
      PRIVACY_CONTACT_EMAIL: "privacy@example.test",
      GRIEVANCE_OFFICER_NAME: "Approved Officer",
      GRIEVANCE_CONTACT_EMAIL: "grievance@example.test",
      SUPPORT_CONTACT_EMAIL: "support@example.test"
    });
    expect(getLegalReadinessIssues(approved)).toEqual([]);
  });

  it("provides public legal routes and keeps drafts out of search indexing", () => {
    for (const route of [
      "privacy",
      "terms",
      "cookies",
      "acceptable-use",
      "data-rights",
      "security",
      "data-processing"
    ]) {
      expect(source("src/config/legal-documents.ts")).toContain(`\"${route}\"`);
    }
    expect(existsSync(resolve(process.cwd(), "src/app/legal/page.tsx"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/app/legal/[document]/page.tsx"))).toBe(true);
    expect(source("src/app/legal/[document]/page.tsx")).toContain("LEGAL_PUBLICATION_READY");
    expect(source("src/app/legal/[document]/page.tsx")).toContain("index: false");
  });

  it("exposes legal links on public auth and authenticated application surfaces", () => {
    expect(source("src/components/auth/auth-shell.tsx")).toContain("<LegalLinks");
    expect(source("src/app/(dashboard)/layout.tsx")).toContain("<LegalLinks />");
    const links = source("src/components/legal/legal-links.tsx");
    expect(links).toContain("/legal/privacy");
    expect(links).toContain("/legal/terms");
    expect(links).toContain("/legal/data-rights");
  });

  it("uses truthful necessary-cookie language and standard response headers", () => {
    const documents = source("src/config/legal-documents.ts");
    expect(documents).toContain("strictly necessary, secure session cookies");
    expect(documents).toContain("does not currently include advertising cookies");
    const config = source("next.config.ts");
    expect(config).toContain('key: "Referrer-Policy"');
    expect(config).toContain('key: "X-Content-Type-Options"');
    expect(config).toContain('key: "X-Frame-Options"');
  });

  it("does not require Aadhaar for student admission and retains masked storage", () => {
    const schema = source("src/modules/academia/schemas/student.schema.ts");
    const action = source("src/modules/academia/actions/profile.actions.ts");
    const service = source("src/modules/academia/services/student.service.ts");
    const form = source("src/modules/academia/components/student-registration-form.tsx");
    const completeness = source("src/modules/academia/student-profile-completeness.ts");

    expect(schema).toContain("aadhaarNumber: aadhaarNumberSchema.optional()");
    expect(action).toContain('aadhaarNumber: stringValue(formData, "aadhaarNumber")');
    expect(service).toContain("aadhaarNumber ? maskAadhaarNumber(aadhaarNumber) : undefined");
    expect(form).toContain("Aadhaar must not be required for admission");
    expect(form).not.toContain("required={isCreate || !hasExistingAadhaar}");
    expect(completeness).not.toContain("Aadhaar reference");
  });

  it("keeps legal contacts out of source and requires environment configuration", () => {
    const template = source(".env.example");
    expect(template).toContain('LEGAL_DOCUMENT_STATUS="DRAFT"');
    expect(template).toContain('GRIEVANCE_CONTACT_EMAIL=""');
    expect(template).toContain('LEGAL_ENTITY_NAME=""');
    expect(template).toContain('PRIVACY_CONTACT_EMAIL=""');
    expect(source("package.json")).toContain('"legal:readiness"');
  });
});
