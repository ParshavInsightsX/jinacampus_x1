import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenantContext } from "@/lib/tenant/context";
import { ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { createGradeScaleSchema } from "@/modules/gradebook/schemas/configuration.schemas";
import { createExamSchema } from "@/modules/gradebook/schemas/exam.schemas";
import { marksImportApplySchema } from "@/modules/gradebook/schemas/import.schemas";
import { saveMarksDraftSchema } from "@/modules/gradebook/schemas/marks.schemas";
import { generateReportCardsSchema } from "@/modules/gradebook/schemas/report-card.schemas";
import { createResultRunSchema } from "@/modules/gradebook/schemas/result.schemas";
import { validateGradeRules } from "@/modules/gradebook/services/configuration.service";
import { parseMarkCell } from "@/modules/gradebook/services/marks-import.service";
import { calculateSubjectResult } from "@/modules/gradebook/services/result-engine";
import { resolveGradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import type { GradeRuleInput, ResultEnginePolicy, SubjectCalculationInput } from "@/modules/gradebook/types/result-engine";
import { requireStateTransition } from "@/modules/gradebook/utils/state-machine";

const mocks = vi.hoisted(() => ({
  getEffectivePermissions: vi.fn(),
  requireGradebookEnabled: vi.fn(),
  requireGradebookSubfeature: vi.fn()
}));

vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions
}));

vi.mock("@/modules/gradebook/feature", () => ({
  requireGradebookEnabled: mocks.requireGradebookEnabled,
  requireGradebookSubfeature: mocks.requireGradebookSubfeature
}));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const institutionId = "00000000-0000-0000-0000-000000000003";
const branchId = "00000000-0000-0000-0000-000000000004";
const academicYearId = "00000000-0000-0000-0000-000000000005";
const examId = "00000000-0000-0000-0000-000000000006";
const classSectionId = "00000000-0000-0000-0000-000000000007";
const subjectId = "00000000-0000-0000-0000-000000000008";
const batchId = "00000000-0000-0000-0000-000000000009";
const enrollmentId = "00000000-0000-0000-0000-000000000010";
const componentId = "00000000-0000-0000-0000-000000000011";

const ctx: TenantContext = {
  tenantId,
  institutionId,
  userId,
  userEmail: "teacher@example.test",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

const gradeRules: GradeRuleInput[] = [
  { minimumInclusive: "0", maximumInclusive: "32.99", letterGrade: "F", gradePoint: "0", isPassing: false },
  { minimumInclusive: "33", maximumInclusive: "100", letterGrade: "P", gradePoint: "4", isPassing: true }
];

const sumPolicy: ResultEnginePolicy = {
  strategy: "SUM_COMPONENTS_RAW",
  roundingMode: "HALF_UP",
  decimalPlaces: 2,
  requireAllSubjectsPassing: true,
  allowPendingResults: false,
  specialStatusTreatment: { ABSENT: "FAIL", RESULT_PENDING: "PENDING", EXEMPTED: "EXCLUDE", NOT_APPLICABLE: "EXCLUDE" }
};

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function subjectInput(overrides: Partial<SubjectCalculationInput> = {}): SubjectCalculationInput {
  return {
    examSubjectId: subjectId,
    maximumMarks: "100",
    passingMarks: "33",
    components: [
      { componentId, maximumMarks: "50", passingMarks: "16.5", weightagePercent: "40", marksObtained: "40", specialStatus: null },
      { componentId: examId, maximumMarks: "50", passingMarks: "16.5", weightagePercent: "60", marksObtained: "30", specialStatus: null }
    ],
    ...overrides
  };
}

describe("GradeBook implementation-ready MVP foundation", () => {
  beforeEach(() => {
    mocks.getEffectivePermissions.mockReset();
    mocks.getEffectivePermissions.mockResolvedValue(new Set(["gradebook.marks.view"]));
    mocks.requireGradebookEnabled.mockReset();
    mocks.requireGradebookEnabled.mockResolvedValue(undefined);
    mocks.requireGradebookSubfeature.mockReset();
    mocks.requireGradebookSubfeature.mockResolvedValue(undefined);
  });

  it("calculates raw and weighted results deterministically with Decimal arithmetic", () => {
    const raw = calculateSubjectResult(subjectInput(), gradeRules, sumPolicy);
    const weighted = calculateSubjectResult(subjectInput(), gradeRules, {
      ...sumPolicy,
      strategy: "WEIGHTED_COMPONENTS"
    });

    expect(raw).toMatchObject({
      rawMarks: "70",
      maximumMarks: "100",
      percentage: "70",
      letterGrade: "P",
      resultStatus: "PASS"
    });
    expect(weighted).toMatchObject({
      rawMarks: "70",
      maximumMarks: "100",
      weightedScore: "68",
      percentage: "68",
      resultStatus: "PASS"
    });
    expect(calculateSubjectResult(subjectInput(), gradeRules, sumPolicy)).toEqual(raw);
  });

  it("handles absent, pending, and fully exempt subjects without inventing marks", () => {
    const absent = calculateSubjectResult(subjectInput({
      components: [
        { componentId, maximumMarks: "50", passingMarks: "16.5", weightagePercent: null, marksObtained: null, specialStatus: "ABSENT" },
        { componentId: examId, maximumMarks: "50", passingMarks: "16.5", weightagePercent: null, marksObtained: "50", specialStatus: null }
      ]
    }), gradeRules, sumPolicy);
    const pending = calculateSubjectResult(subjectInput({
      components: [{ componentId, maximumMarks: "100", passingMarks: "33", weightagePercent: null, marksObtained: null, specialStatus: "RESULT_PENDING" }]
    }), gradeRules, sumPolicy);
    const exempt = calculateSubjectResult(subjectInput({
      components: [{ componentId, maximumMarks: "100", passingMarks: null, weightagePercent: null, marksObtained: null, specialStatus: "EXEMPTED" }]
    }), gradeRules, sumPolicy);

    expect(absent).toMatchObject({ resultStatus: "FAIL", rawMarks: "50", maximumMarks: "100" });
    expect(pending).toMatchObject({ resultStatus: "PENDING", rawMarks: null, percentage: null });
    expect(exempt).toMatchObject({ resultStatus: "EXEMPTED", rawMarks: null, maximumMarks: null });
  });

  it("rejects illegal workflow transitions with a safe conflict", () => {
    expect(() => requireStateTransition({
      current: "DRAFT",
      next: "ACTIVE",
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: [] },
      errorCode: "GRADEBOOK_INVALID_STATE_TRANSITION"
    })).not.toThrow();

    expect(() => requireStateTransition({
      current: "ACTIVE",
      next: "DRAFT",
      transitions: { DRAFT: ["ACTIVE"], ACTIVE: [] },
      errorCode: "GRADEBOOK_INVALID_STATE_TRANSITION"
    })).toThrow(expect.objectContaining({ code: "GRADEBOOK_INVALID_STATE_TRANSITION", status: 409 }));
  });

  it("strictly rejects client-owned tenant, branch, user, and status fields", () => {
    expect(saveMarksDraftSchema.safeParse({
      batchId,
      expectedVersion: 1,
      entries: [{ enrollmentId, componentId, value: { kind: "NUMERIC", marksObtained: 80 } }],
      tenantId,
      branchId,
      actorUserId: userId
    }).success).toBe(false);
    expect(createResultRunSchema.safeParse({ examId, examClassSectionId: classSectionId, status: "APPROVED" }).success).toBe(false);
    expect(marksImportApplySchema.safeParse({ importJobId: examId, expectedBatchVersion: 1, tenantId }).success).toBe(false);
    expect(generateReportCardsSchema.safeParse({ resultRunId: examId, templateVersionId: classSectionId, userId }).success).toBe(false);
  });

  it("validates exam uniqueness, grade-scale coverage, and marks special-status reasons", () => {
    expect(createExamSchema.safeParse({
      termId: examId,
      examTypeId: subjectId,
      code: "TERM_1",
      name: "Term 1",
      resultPublicationPolicy: "MANUAL",
      classSectionIds: [classSectionId, classSectionId],
      subjects: [{
        subjectId,
        displayOrder: 1,
        components: [{ componentCode: "TOTAL", componentName: "Total", maximumMarks: 100, displayOrder: 1, isOptional: false }]
      }]
    }).success).toBe(false);
    const gradeScale = createGradeScaleSchema.parse({
      code: "PRIMARY",
      name: "Primary",
      rules: [
        { minimumInclusive: 0, maximumInclusive: 32.99, letterGrade: "F", isPassing: false, displayOrder: 1 },
        { minimumInclusive: 33, maximumInclusive: 100, letterGrade: "P", isPassing: true, displayOrder: 2 }
      ]
    });
    expect(() => validateGradeRules(gradeScale.rules, gradeScale.decimalPlaces)).not.toThrow();
    expect(() => validateGradeRules([
      { minimumInclusive: 0, maximumInclusive: 50 },
      { minimumInclusive: 40, maximumInclusive: 100 }
    ], 2)).toThrow(expect.objectContaining({ code: "GRADEBOOK_GRADE_SCALE_RANGE_INVALID" }));
    expect(saveMarksDraftSchema.safeParse({
      batchId,
      expectedVersion: 1,
      entries: [{ enrollmentId, componentId, value: { kind: "SPECIAL_STATUS", status: "WITHHELD" } }]
    }).success).toBe(false);
  });

  it("accepts the documented spreadsheet status aliases and keeps import apply atomic", () => {
    expect(parseMarkCell("medical", 100)).toEqual({ entry: { marksObtained: null, specialStatus: "MEDICAL_LEAVE" }, error: null });
    expect(parseMarkCell("exempt", 100)).toEqual({ entry: { marksObtained: null, specialStatus: "EXEMPTED" }, error: null });
    expect(parseMarkCell("pending", 100)).toEqual({ entry: { marksObtained: null, specialStatus: "RESULT_PENDING" }, error: null });
    expect(parseMarkCell("101", 100).error).toContain("between 0 and 100");

    const importService = source("src/modules/gradebook/services/marks-import.service.ts");
    expect(importService).toContain("await persistPreparedMarksDraft(tx, prepared)");
    expect(importService).toContain("Prisma.TransactionIsolationLevel.Serializable");
    expect(importService.indexOf("await persistPreparedMarksDraft(tx, prepared)"))
      .toBeLessThan(importService.indexOf("status: \"APPLIED\", appliedAt"));
  });

  it("derives institution, branch, year, user, and permissions from server context", async () => {
    await expect(resolveGradebookRequestContext(ctx, {
      permission: "gradebook.marks.view",
      feature: "marksEntry"
    })).resolves.toMatchObject({
      tenantId,
      institutionId,
      branchId,
      academicYearId,
      userId
    });
    expect(mocks.getEffectivePermissions).toHaveBeenCalledWith({ ctx, branchId, academicYearId });
    expect(mocks.requireGradebookSubfeature).toHaveBeenCalledWith(ctx, "marksEntry", "READ");
  });

  it("denies missing or unauthorised branch context before reading permissions", async () => {
    await expect(resolveGradebookRequestContext({ ...ctx, activeBranchId: "00000000-0000-0000-0000-000000000099" }, {
      permission: "gradebook.marks.view"
    })).rejects.toMatchObject({ code: "GRADEBOOK_BRANCH_CONTEXT_REQUIRED", status: 403 });
    expect(mocks.getEffectivePermissions).not.toHaveBeenCalled();
  });

  it("keeps platform administration separate and school roles least-privileged", () => {
    expect(ROLE_PERMISSION_MAP.ADMINISTRATOR).toEqual([]);
    expect(ROLE_PERMISSION_MAP.PRINCIPAL).toEqual(expect.arrayContaining([
      "gradebook.scheme.manage",
      "gradebook.result.approve",
      "gradebook.result.publish"
    ]));
    expect(ROLE_PERMISSION_MAP.TEACHER).toEqual(expect.arrayContaining([
      "gradebook.marks.save_draft",
      "gradebook.marks.submit"
    ]));
    expect(ROLE_PERMISSION_MAP.TEACHER).not.toContain("gradebook.result.approve");
    expect(ROLE_PERMISSION_MAP.OFFICE_STAFF).not.toContain("gradebook.view");
    expect(ROLE_PERMISSION_MAP.STAFF).not.toContain("gradebook.view");
  });

  it("guards every GradeBook route with dashboard permission and safe not-found handling", () => {
    const navigationQueries = source("src/modules/gradebook/queries/mvp.queries.ts");
    const layout = source("src/app/(dashboard)/gradebook/layout.tsx");
    const assessmentPage = source("src/app/(dashboard)/gradebook/assessments/[assessmentId]/page.tsx");

    expect(navigationQueries).toContain('permission: "gradebook.dashboard.view"');
    expect(layout).toContain("error instanceof AppError");
    expect(layout).toContain("error.status === 403 || error.status === 404");
    expect(layout).toContain("notFound()");
    expect(assessmentPage).toContain("error instanceof AppError && error.status === 404");
    expect(assessmentPage).toContain("notFound()");
  });

  it("keeps rollout additive, default-off, RLS-enabled, and private-storage-only", () => {
    const migration = source("prisma/migrations/20260811201500_expand_gradebook_phase_0_1/migration.sql");
    const schema = source("prisma/schema.prisma");
    const storage = source("src/lib/storage/supabase-storage.ts");
    const requestContext = source("src/modules/gradebook/services/request-context.service.ts");

    expect(migration).toContain('"gradebookConfigurationEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('ALTER TABLE "gradebook_student_marks" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain("WHERE role.\"code\" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')");
    expect(migration).toContain("WHERE role.\"code\" IN ('TEACHER', 'CLASS_TEACHER')");
    expect(migration).not.toContain("WHERE role.\"code\" IN ('ADMINISTRATOR'");
    expect(schema).toMatch(/gradebookPortalResultsEnabled\s+Boolean\s+@default\(false\)/);
    expect(storage).toContain("public: false");
    expect(storage).toContain("GRADEBOOK_STORAGE_BUCKET_MUST_BE_PRIVATE");
    expect(requestContext).toContain("ctx.accessibleBranchIds.includes(branchId)");
    expect(requestContext).not.toMatch(/input\.(tenantId|branchId|userId|role|permission)/);
  });
});
