import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import { ALL_PERMISSIONS, type PermissionCode } from "@/lib/rbac/permissions";
import { ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { getVisibleNavigationGroups } from "@/components/app-shell/navigation";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  assignClassSectionSubjectSchema,
  createGradebookAssessmentSchema,
  saveGradebookMarksSchema
} from "@/modules/gradebook/schemas";
import {
  publishGradebookAssessment,
  saveGradebookMarks
} from "@/modules/gradebook/services";

const mocks = vi.hoisted(() => {
  const tx = {
    enrollment: { findMany: vi.fn() },
    gradebookAssessment: { update: vi.fn(), updateMany: vi.fn() },
    gradebookMark: { count: vi.fn(), findMany: vi.fn(), upsert: vi.fn() }
  };
  const db = {
    gradebookAssessment: { findFirst: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  return {
    db,
    getEffectivePermissions: vi.fn(),
    requireGradebookEnabled: vi.fn(),
    requirePermission: vi.fn(),
    tx,
    writeAuditLog: vi.fn()
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/lib/rbac/require-permission", () => ({
  getEffectivePermissions: mocks.getEffectivePermissions,
  requirePermission: mocks.requirePermission
}));
vi.mock("@/modules/gradebook/feature", () => ({ requireGradebookEnabled: mocks.requireGradebookEnabled }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";
const assessmentId = "00000000-0000-0000-0000-000000000005";
const assignmentId = "00000000-0000-0000-0000-000000000006";
const classSectionId = "00000000-0000-0000-0000-000000000007";
const enrollmentId = "00000000-0000-0000-0000-000000000008";
const studentId = "00000000-0000-0000-0000-000000000009";
const otherUserId = "00000000-0000-0000-0000-000000000010";

const ctx: TenantContext = {
  tenantId,
  userId,
  userEmail: "teacher@example.test",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

function assessmentScope(overrides: Record<string, unknown> = {}) {
  return {
    id: assessmentId,
    tenantId,
    branchId,
    academicYearId,
    classSectionId,
    classSectionSubjectId: assignmentId,
    code: "UT1",
    title: "Unit Test 1",
    type: "UNIT_TEST",
    assessmentDate: new Date("2026-08-01"),
    maxMarks: { toString: () => "100", valueOf: () => 100 },
    passMarks: { toString: () => "33", valueOf: () => 33 },
    status: "OPEN",
    publishedAt: null,
    cancelledAt: null,
    classSection: { classTeacherUserId: userId },
    classSectionSubject: { teacherUserId: null },
    ...overrides
  };
}

function resetMocks() {
  for (const model of Object.values(mocks.tx)) {
    for (const method of Object.values(model)) method.mockReset();
  }
  mocks.db.gradebookAssessment.findFirst.mockReset();
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.getEffectivePermissions.mockReset();
  mocks.getEffectivePermissions.mockResolvedValue(new Set(["gradebook.marks.enter"]));
  mocks.requireGradebookEnabled.mockReset();
  mocks.requireGradebookEnabled.mockResolvedValue(true);
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
  mocks.tx.gradebookAssessment.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.gradebookMark.findMany.mockResolvedValue([]);
}

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("GradeBook MVP", () => {
  beforeEach(resetMocks);

  it("rejects client-owned scope and duplicate result entries", () => {
    expect(assignClassSectionSubjectSchema.safeParse({
      classSectionId,
      subjectId: studentId,
      tenantId,
      branchId,
      actorUserId: userId
    }).success).toBe(false);

    const entry = { enrollmentId, status: "GRADED", marksObtained: 80 };
    expect(saveGradebookMarksSchema.safeParse({ assessmentId, entries: [entry, entry] }).success).toBe(false);
    expect(saveGradebookMarksSchema.safeParse({
      assessmentId,
      entries: [{ enrollmentId, status: "ABSENT", marksObtained: 0 }]
    }).success).toBe(false);
    expect(createGradebookAssessmentSchema.safeParse({
      classSectionSubjectId: assignmentId,
      code: "UT1",
      title: "Unit Test 1",
      type: "UNIT_TEST",
      assessmentDate: "2026-08-01",
      maxMarks: 50,
      passMarks: 60
    }).success).toBe(false);
  });

  it("keeps the tenant feature disabled by default and exposes navigation only when enabled", () => {
    const permissions = new Set<PermissionCode>(ALL_PERMISSIONS);
    expect(getVisibleNavigationGroups(permissions).some((group) => group.title === "GradeBook")).toBe(false);
    expect(getVisibleNavigationGroups(permissions, { gradebookEnabled: true }).find((group) => group.title === "GradeBook")?.items)
      .toEqual(expect.arrayContaining([expect.objectContaining({ href: "/gradebook" })]));
  });

  it("grants governance to Principal, assigned marks entry to Teacher, and no access to Staff", () => {
    expect(ROLE_PERMISSION_MAP.PRINCIPAL).toEqual(expect.arrayContaining([
      "gradebook.setup.manage",
      "gradebook.assessment.manage",
      "gradebook.publish"
    ]));
    expect(ROLE_PERMISSION_MAP.TEACHER).toEqual(expect.arrayContaining([
      "gradebook.view",
      "gradebook.marks.enter",
      "gradebook.report"
    ]));
    expect(ROLE_PERMISSION_MAP.TEACHER).not.toContain("gradebook.publish");
    expect(ROLE_PERMISSION_MAP.OFFICE_STAFF).not.toContain("gradebook.view");
    expect(ROLE_PERMISSION_MAP.STAFF).not.toContain("gradebook.view");
  });

  it("derives the student identity from the eligible enrollment and audits no marks values", async () => {
    mocks.db.gradebookAssessment.findFirst.mockResolvedValue(assessmentScope());
    mocks.tx.enrollment.findMany.mockResolvedValue([{ id: enrollmentId, studentId }]);
    mocks.tx.gradebookMark.upsert.mockResolvedValue({ id: "mark-id" });

    await expect(saveGradebookMarks(ctx, {
      assessmentId,
      entries: [{ enrollmentId, status: "GRADED", marksObtained: 82, remarks: "Consistent work" }]
    })).resolves.toEqual({ assessmentId, savedCount: 1 });

    expect(mocks.tx.gradebookMark.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        tenantId,
        branchId,
        academicYearId,
        assessmentId,
        enrollmentId,
        studentId,
        enteredById: userId
      })
    }));
    const auditCall = mocks.writeAuditLog.mock.calls[0][0];
    expect(auditCall).toMatchObject({
      action: GRADEBOOK_AUDIT_EVENTS.MARKS_SAVED,
      branchId,
      academicYearId,
      metadata: { entryCount: 1, statusSummary: { GRADED: 1 } }
    });
    expect(auditCall.after).toEqual([expect.objectContaining({
      enrollmentId,
      status: "GRADED",
      marksObtained: 82
    })]);
    expect(JSON.stringify(auditCall)).not.toMatch(/passwordHash|tokenHash|rawToken/);
  });

  it("returns safe not-found behavior when a teacher is not assigned to the class or subject", async () => {
    mocks.db.gradebookAssessment.findFirst.mockResolvedValue(assessmentScope({
      classSection: { classTeacherUserId: otherUserId },
      classSectionSubject: { teacherUserId: otherUserId }
    }));

    await expect(saveGradebookMarks(ctx, {
      assessmentId,
      entries: [{ enrollmentId, status: "GRADED", marksObtained: 82 }]
    })).rejects.toMatchObject({ code: "GRADEBOOK_ASSESSMENT_NOT_FOUND", status: 404 });
    expect(mocks.tx.enrollment.findMany).not.toHaveBeenCalled();
  });

  it("blocks publication until every active roster enrollment has a result", async () => {
    mocks.db.gradebookAssessment.findFirst.mockResolvedValue(assessmentScope());
    mocks.tx.enrollment.findMany.mockResolvedValue([{ id: enrollmentId }, { id: "00000000-0000-0000-0000-000000000011" }]);
    mocks.tx.gradebookMark.count.mockResolvedValue(1);

    await expect(publishGradebookAssessment(ctx, { assessmentId })).rejects.toMatchObject({
      code: "GRADEBOOK_RESULTS_INCOMPLETE",
      status: 400
    });
    expect(mocks.tx.gradebookAssessment.update).not.toHaveBeenCalled();
  });

  it("short-circuits all GradeBook data access when the tenant feature is disabled", async () => {
    mocks.requireGradebookEnabled.mockRejectedValue(new Error("GRADEBOOK_NOT_ENABLED"));

    await expect(saveGradebookMarks(ctx, {
      assessmentId,
      entries: [{ enrollmentId, status: "GRADED", marksObtained: 82 }]
    })).rejects.toThrow("GRADEBOOK_NOT_ENABLED");
    expect(mocks.db.gradebookAssessment.findFirst).not.toHaveBeenCalled();
  });

  it("keeps feature control in the Administrator Portal and migration rollout additive", () => {
    const administratorForm = source("src/modules/campus-core/components/administrator-school-forms.tsx");
    const migration = source("prisma/migrations/20260810213000_add_gradebook_foundation/migration.sql");
    const entitlementMigration = source("prisma/migrations/20260818233000_add_institution_entitlements/migration.sql");
    const marksEditor = source("src/modules/gradebook/components/gradebook-marks-editor.tsx");
    const workspace = source("src/modules/gradebook/components/gradebook-workspace.tsx");
    const queries = source("src/modules/gradebook/queries/gradebook.queries.ts");

    expect(administratorForm).toContain("InstitutionEntitlementForm");
    expect(administratorForm).toContain("entitlementFormFieldName");
    expect(administratorForm).toContain("Module access:");
    expect(migration).toContain('ADD COLUMN "gradebookEnabled" BOOLEAN NOT NULL DEFAULT false');
    expect(entitlementMigration).toContain("institution_entitlements");
    expect(entitlementMigration).toContain("gradebook_features");
    expect(migration).toContain('ALTER TABLE "gradebook_marks" ENABLE ROW LEVEL SECURITY');
    expect(workspace).toContain("selectedAssessmentAssignmentId");
    expect(queries).toContain("{ endsAt: { gt: now } }");
    expect(marksEditor).not.toMatch(/tenantId|branchId|actorUserId|studentId/);
    expect(marksEditor).not.toMatch(/passwordHash|tokenHash/);
  });
});
