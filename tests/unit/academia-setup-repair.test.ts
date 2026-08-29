import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Academia setup and school governance repair", () => {
  it("keeps institution provisioning in the Administrator Portal", () => {
    const schoolProfilePage = source("src/app/(dashboard)/campus-core/institutions/page.tsx");
    const campusCoreServices = source("src/modules/campus-core/services/index.ts");

    expect(schoolProfilePage).toContain("New schools are provisioned by an authorised JinaCampus platform administrator");
    expect(schoolProfilePage).not.toContain("createInstitutionAction");
    expect(campusCoreServices).toContain('permission: "platform.institution.manage"');
    expect(campusCoreServices).toContain("requireAccessibleInstitution");
  });

  it("provides one guided create workflow for classes, sections, mappings, and subjects", () => {
    const page = source("src/app/(dashboard)/academia/setup/page.tsx");
    const forms = source("src/modules/academia/components/academic-setup-forms.tsx");

    expect(page).toContain("Academic Setup");
    expect(page).toContain("CreateClassSetupForm");
    expect(page).toContain("CreateSectionSetupForm");
    expect(page).toContain("CreateClassSectionSetupForm");
    expect(page).toContain("CreateSubjectSetupForm");
    expect(forms).toContain("Select an active branch and academic year");
    expect(forms).toContain("Only active teachers with branch access are listed");
  });

  it("embeds guardian and initial class assignment in student registration", () => {
    const form = source("src/modules/academia/components/student-registration-form.tsx");
    const service = source("src/modules/academia/services/student-registration.service.ts");
    const profile = source("src/app/(dashboard)/academia/students/[studentId]/page.tsx");

    expect(form).toContain("Create and link the primary guardian as part of registration.");
    expect(form).toContain('name="primaryGuardianRelation"');
    expect(form).toContain('name="initialClassSectionId"');
    expect(service).toContain("db.$transaction");
    expect(service).toContain("createStudentRecord");
    expect(service).toContain("studentGuardianLink.create");
    expect(service).toContain("createEnrollmentRecord");
    expect(profile).toContain("AssignStudentClassForm");
    expect(service).not.toMatch(/passwordHash|tokenHash|raw QR/i);
  });
});
