import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { getUserSafeErrorMessage } from "@/lib/errors";
import {
  isInstitutionRegulatorySchemaAvailable,
  requireInstitutionRegulatorySchema,
  type InstitutionRegulatorySchemaProbeClient
} from "@/lib/schema-readiness/institution-regulatory";
import {
  maskOfficialValue,
  normalizeAuthorizationNumber,
  normalizeOfficialIdentifier
} from "@/modules/campus-core/regulatory/normalization";
import {
  createInstitutionAuthorizationSchema,
  createInstitutionIdentifierSchema,
  updateInstitutionLegalIdentitySchema
} from "@/modules/campus-core/regulatory/schemas";

const institutionId = "00000000-0000-0000-0000-000000000001";
const authorityId = "00000000-0000-0000-0000-000000000002";

describe("institution legal identity and regulatory records", () => {
  it("accepts a practical legal identity and preserves former legal names", () => {
    const parsed = updateInstitutionLegalIdentitySchema.parse({
      institutionId,
      legalName: "JinaCampus Public School Society",
      formerLegalNames: ["JinaCampus Learning Centre"],
      establishedYear: "2012",
      countryCode: "in",
      stateCode: "mp",
      boardCode: "cbse",
      officialEmail: "office@example.edu"
    });
    expect(parsed.countryCode).toBe("IN");
    expect(parsed.stateCode).toBe("MP");
    expect(parsed.boardCode).toBe("CBSE");
    expect(parsed.formerLegalNames).toEqual(["JinaCampus Learning Centre"]);
  });

  it("requires exactly 11 digits for an assigned UDISE Code", () => {
    const base = {
      institutionId,
      authorityId,
      type: "UDISE",
      availability: "ASSIGNED",
      dataClassification: "INTERNAL",
      isPrimary: true
    } as const;
    expect(createInstitutionIdentifierSchema.safeParse({ ...base, value: "12345678901" }).success).toBe(true);
    expect(createInstitutionIdentifierSchema.safeParse({ ...base, value: "12345" }).success).toBe(false);
    expect(createInstitutionIdentifierSchema.safeParse({ ...base, value: "N/A" }).success).toBe(false);
  });

  it("uses explicit assignment states instead of placeholder identifier values", () => {
    expect(createInstitutionIdentifierSchema.safeParse({
      institutionId,
      authorityId,
      type: "STATE_SCHOOL_CODE",
      availability: "PENDING_ASSIGNMENT",
      dataClassification: "INTERNAL",
      isPrimary: false
    }).success).toBe(true);
    expect(createInstitutionIdentifierSchema.safeParse({
      institutionId,
      authorityId,
      type: "STATE_SCHOOL_CODE",
      availability: "PENDING_ASSIGNMENT",
      value: "PENDING",
      dataClassification: "INTERNAL",
      isPrimary: false
    }).success).toBe(false);
  });

  it("keeps recognition coverage and validity internally consistent", () => {
    const base = {
      institutionId,
      authorityId,
      type: "AFFILIATION",
      dataClassification: "INTERNAL",
      stage: "SECONDARY",
      gradeFrom: "6",
      gradeTo: "10"
    } as const;
    expect(createInstitutionAuthorizationSchema.safeParse({
      ...base,
      validFrom: "2026-04-01",
      validUntil: "2031-03-31"
    }).success).toBe(true);
    expect(createInstitutionAuthorizationSchema.safeParse({
      ...base,
      gradeFrom: "10",
      gradeTo: "6"
    }).success).toBe(false);
  });

  it("normalizes duplicate-comparison values without changing display data", () => {
    expect(normalizeOfficialIdentifier("UDISE", " 12345678901 ")).toBe("12345678901");
    expect(normalizeOfficialIdentifier("BOARD_SCHOOL_CODE", "CBSE / 12-34")).toBe("CBSE1234");
    expect(normalizeAuthorizationNumber("Aff / 2026-01")).toBe("AFF202601");
    expect(maskOfficialValue("12345678901")).toBe("*******8901");
  });

  it("fails closed while any required regulatory table is unavailable", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{
      profilesAvailable: true,
      authoritiesAvailable: true,
      identifiersAvailable: false,
      authorizationsAvailable: true,
      documentsAvailable: true
    }]);
    const client = { $queryRaw: queryRaw } as unknown as InstitutionRegulatorySchemaProbeClient;
    await expect(isInstitutionRegulatorySchemaAvailable(client)).resolves.toBe(false);
    await expect(requireInstitutionRegulatorySchema(client)).rejects.toMatchObject({
      code: "INSTITUTION_REGULATORY_UPGRADE_REQUIRED",
      status: 503
    });
    expect(getUserSafeErrorMessage("INSTITUTION_REGULATORY_UPGRADE_REQUIRED")).toContain("temporarily unavailable");
  });

  it("keeps the migration additive, scoped, constrained, seeded, and RLS-enabled", () => {
    const migration = readFileSync(path.join(
      process.cwd(),
      "prisma/migrations/20260826120000_add_institution_regulatory_identity/migration.sql"
    ), "utf8");
    expect(migration).toContain('CREATE TABLE "institution_regulatory_profiles"');
    expect(migration).toContain('CREATE TABLE "official_identifier_claims"');
    expect(migration).toContain('branches_tenant_institution_id_regulatory_scope_key');
    expect(migration).toContain('"normalizedValue" ~ \'^[0-9]{11}$\'');
    expect(migration).toContain("CBSE");
    expect(migration).toContain("CISCE");
    expect(migration).toContain("NIOS");
    expect(migration).toContain('ALTER TABLE "institution_regulatory_documents" ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/DROP TABLE|DROP COLUMN|TRUNCATE/);
  });

  it("keeps verification and publication outside Principal defaults", () => {
    const roles = readFileSync(path.join(process.cwd(), "src/lib/rbac/roles.ts"), "utf8");
    const migration = readFileSync(path.join(
      process.cwd(),
      "prisma/migrations/20260826120000_add_institution_regulatory_identity/migration.sql"
    ), "utf8");
    expect(roles).toContain('"campuscore.institution.regulatory.manage"');
    expect(roles).toContain('"campuscore.institution.regulatory.submit"');
    const principalGrant = migration
      .split('INSERT INTO "role_permissions"')[1]
      ?.split('ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;')[0] ?? "";
    expect(principalGrant).toContain("campuscore.institution.regulatory.manage");
    expect(principalGrant).not.toContain("campuscore.institution.regulatory.verify");
    expect(principalGrant).not.toContain("campuscore.institution.regulatory.publish");
  });

  it("keeps Principal submission tenant and branch scoped without reviewer controls", () => {
    const manager = readFileSync(path.join(
      process.cwd(),
      "src/modules/campus-core/regulatory/components/regulatory-profile-manager.tsx"
    ), "utf8");
    const scope = readFileSync(path.join(
      process.cwd(),
      "src/modules/campus-core/regulatory/scope.ts"
    ), "utf8");
    expect(manager).toContain("Independent review required");
    expect(manager).toContain("submitInstitutionRegulatoryRecordAction");
    expect(manager).not.toContain("verifyInstitutionRegulatoryRecordAction");
    expect(manager).not.toContain("publishInstitutionRegulatoryRecordAction");
    expect(scope).toContain("tenantId: ctx.tenantId");
    expect(scope).toContain("id: { in: ctx.accessibleBranchIds }");
  });

  it("uses private short-lived evidence access and does not return storage keys in the workspace", () => {
    const documentService = readFileSync(path.join(
      process.cwd(),
      "src/modules/campus-core/regulatory/document.service.ts"
    ), "utf8");
    const workspaceQuery = readFileSync(path.join(
      process.cwd(),
      "src/modules/campus-core/regulatory/queries.ts"
    ), "utf8");
    expect(documentService).toContain("ensureInstitutionRegulatoryDocumentsBucket");
    expect(documentService).toContain("createSignedUrl(document.privateObjectKey, 60");
    expect(documentService).toContain("dataClassification: \"RESTRICTED\"");
    expect(readFileSync(path.join(
      process.cwd(),
      "src/modules/campus-core/regulatory/components/regulatory-profile-manager.tsx"
    ), "utf8")).not.toContain('encType="multipart/form-data"');
    expect(workspaceQuery).not.toContain("privateObjectKey:");
    expect(workspaceQuery).not.toContain("storageBucket:");
    expect(workspaceQuery).not.toContain("normalizedValue:");
  });
});
