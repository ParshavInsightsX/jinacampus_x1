import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import { ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import { NAVIGATION_GROUPS } from "@/components/app-shell/navigation";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import { createStudentPromotionBatchSchema } from "@/modules/academia/schemas";
import {
  createStudentPromotionBatch,
  reverseStudentPromotionBatch
} from "@/modules/academia/services/student-promotion.service";

const mocks = vi.hoisted(() => {
  const tx = {
    academicYear: { findMany: vi.fn() },
    branch: { findFirst: vi.fn() },
    classSection: { findMany: vi.fn() },
    enrollment: { count: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    student: { updateMany: vi.fn() },
    studentAttendanceRecord: { count: vi.fn() },
    studentPromotionBatch: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    studentPromotionItem: { createMany: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() }
  };
  const db = {
    classSection: { findFirst: vi.fn() },
    studentPromotionBatch: { findFirst: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx))
  };
  return { db, requirePermission: vi.fn(), tx, writeAuditLog: vi.fn() };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/rbac/require-permission", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));

const tenantId = "00000000-0000-0000-0000-000000000001";
const userId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const sourceYearId = "00000000-0000-0000-0000-000000000004";
const targetYearId = "00000000-0000-0000-0000-000000000005";
const sourceClassSectionId = "00000000-0000-0000-0000-000000000006";
const targetClassSectionId = "00000000-0000-0000-0000-000000000007";
const sourceClassId = "00000000-0000-0000-0000-000000000008";
const targetClassId = "00000000-0000-0000-0000-000000000009";
const sectionId = "00000000-0000-0000-0000-000000000010";
const studentOneId = "00000000-0000-0000-0000-000000000011";
const studentTwoId = "00000000-0000-0000-0000-000000000012";
const enrollmentOneId = "00000000-0000-0000-0000-000000000013";
const enrollmentTwoId = "00000000-0000-0000-0000-000000000014";
const institutionId = "00000000-0000-0000-0000-000000000015";
const batchId = "00000000-0000-0000-0000-000000000016";
const sourceYearEnd = new Date("2026-03-31T00:00:00.000Z");
const effectiveDate = new Date("2026-04-01T00:00:00.000Z");

const ctx: TenantContext = {
  tenantId,
  userId,
  userEmail: "principal@example.test",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: sourceYearId
};

function validInput() {
  return {
    sourceAcademicYearId: sourceYearId,
    sourceClassSectionId,
    targetAcademicYearId: targetYearId,
    defaultTargetClassSectionId: targetClassSectionId,
    effectiveDate: "2026-04-01",
    resultsPublicationConfirmed: true,
    entries: [{
      sourceEnrollmentId: enrollmentOneId,
      studentId: studentOneId,
      outcome: "PROMOTED" as const
    }]
  };
}

function sourceEnrollment(id: string, studentId: string) {
  return {
    id,
    studentId,
    status: "ACTIVE" as const,
    leftOn: null,
    student: { id: studentId, status: "ACTIVE" as const, leftAt: null }
  };
}

function arrangeCreate() {
  mocks.db.classSection.findFirst.mockResolvedValue({
    id: sourceClassSectionId,
    branchId,
    academicYearId: sourceYearId
  });
  mocks.tx.branch.findFirst.mockResolvedValue({ id: branchId, institutionId });
  mocks.tx.academicYear.findMany.mockResolvedValue([
    { id: sourceYearId, name: "2025-26", startDate: new Date("2025-04-01"), endDate: sourceYearEnd },
    { id: targetYearId, name: "2026-27", startDate: effectiveDate, endDate: new Date("2027-03-31") }
  ]);
  mocks.tx.classSection.findMany.mockResolvedValue([
    {
      id: sourceClassSectionId,
      academicYearId: sourceYearId,
      classId: sourceClassId,
      sectionId,
      displayName: "Class 1-A",
      capacity: 40,
      academicClass: { name: "Class 1" },
      section: { name: "A" }
    },
    {
      id: targetClassSectionId,
      academicYearId: targetYearId,
      classId: targetClassId,
      sectionId,
      displayName: "Class 2-A",
      capacity: 40,
      academicClass: { name: "Class 2" },
      section: { name: "A" }
    }
  ]);
  mocks.tx.enrollment.findMany
    .mockResolvedValueOnce([
      sourceEnrollment(enrollmentOneId, studentOneId),
      sourceEnrollment(enrollmentTwoId, studentTwoId)
    ])
    .mockResolvedValueOnce([]);
  mocks.tx.studentPromotionItem.findMany.mockResolvedValue([]);
  mocks.tx.enrollment.count.mockResolvedValue(0);
  mocks.tx.studentPromotionBatch.create.mockImplementation(({ data }) => Promise.resolve(data));
  mocks.tx.enrollment.createMany.mockResolvedValue({ count: 1 });
  mocks.tx.enrollment.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.student.updateMany.mockResolvedValue({ count: 1 });
  mocks.tx.studentPromotionItem.createMany.mockResolvedValue({ count: 2 });
}

function resetMocks() {
  for (const model of Object.values(mocks.tx)) {
    for (const method of Object.values(model)) method.mockReset();
  }
  mocks.db.classSection.findFirst.mockReset();
  mocks.db.studentPromotionBatch.findFirst.mockReset();
  mocks.db.$transaction.mockReset();
  mocks.db.$transaction.mockImplementation((callback: (client: typeof mocks.tx) => unknown) => callback(mocks.tx));
  mocks.requirePermission.mockReset();
  mocks.requirePermission.mockResolvedValue(true);
  mocks.writeAuditLog.mockReset();
  mocks.writeAuditLog.mockResolvedValue({ id: "audit-id" });
}

describe("student promotion", () => {
  beforeEach(resetMocks);

  it("requires result publication confirmation and rejects duplicate student decisions", () => {
    expect(createStudentPromotionBatchSchema.safeParse({
      ...validInput(),
      resultsPublicationConfirmed: false
    }).success).toBe(false);

    const duplicate = validInput().entries[0];
    expect(createStudentPromotionBatchSchema.safeParse({
      ...validInput(),
      entries: [duplicate, duplicate]
    }).success).toBe(false);
  });

  it("grants promotion to Principal by default and keeps Teacher, Staff, and Office Staff denied", () => {
    expect(ROLE_PERMISSION_MAP.PRINCIPAL).toContain("academia.promotion.manage");
    expect(ROLE_PERMISSION_MAP.OFFICE_STAFF).not.toContain("academia.promotion.manage");
    expect(ROLE_PERMISSION_MAP.TEACHER).not.toContain("academia.promotion.manage");
    expect(ROLE_PERMISSION_MAP.STAFF).not.toContain("academia.promotion.manage");

    const promotionNav = NAVIGATION_GROUPS
      .find((group) => group.title === "Academia")
      ?.items.find((item) => item.href === "/academia/promotions");
    expect(promotionNav).toMatchObject({ permissions: ["academia.promotion.manage"] });
  });

  it("rejects client tenant and branch identifiers", () => {
    expect(createStudentPromotionBatchSchema.safeParse({
      ...validInput(),
      tenantId,
      branchId,
      actorUserId: userId
    }).success).toBe(false);
  });

  it("creates target enrollment and records selected and excluded students atomically", async () => {
    arrangeCreate();

    await expect(createStudentPromotionBatch(ctx, validInput())).resolves.toMatchObject({
      selectedCount: 1,
      excludedCount: 1,
      outcomeSummary: { PROMOTED: 1, EXCLUDED: 1 }
    });

    expect(mocks.requirePermission).toHaveBeenCalledWith({
      ctx,
      permission: "academia.promotion.manage",
      branchId,
      academicYearId: sourceYearId
    });
    expect(mocks.tx.enrollment.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        tenantId,
        branchId,
        academicYearId: targetYearId,
        studentId: studentOneId,
        classSectionId: targetClassSectionId,
        status: "ACTIVE",
        createdById: userId
      })]
    });
    const itemRows = mocks.tx.studentPromotionItem.createMany.mock.calls[0][0].data;
    expect(itemRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ studentId: studentOneId, selected: true, outcome: "PROMOTED" }),
      expect.objectContaining({ studentId: studentTwoId, selected: false, outcome: "EXCLUDED" })
    ]));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_PROMOTION_BATCH_COMPLETED,
      entityType: "StudentPromotionBatch",
      branchId,
      academicYearId: targetYearId,
      metadata: expect.objectContaining({ resultsPublicationConfirmed: true })
    }), mocks.tx);
  });

  it("returns a safe not-found error for an inaccessible source class-section", async () => {
    mocks.db.classSection.findFirst.mockResolvedValue(null);

    await expect(createStudentPromotionBatch(ctx, validInput())).rejects.toMatchObject({
      code: "PROMOTION_SOURCE_CLASS_SECTION_NOT_FOUND",
      status: 404
    });
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
  });

  it("blocks reversal after target-year attendance exists", async () => {
    mocks.db.studentPromotionBatch.findFirst.mockResolvedValue({
      id: batchId,
      branchId,
      targetAcademicYearId: targetYearId
    });
    mocks.tx.studentPromotionBatch.findFirst.mockResolvedValue({
      id: batchId,
      tenantId,
      branchId,
      status: "COMPLETED",
      sourceAcademicYearId: sourceYearId,
      targetAcademicYearId: targetYearId,
      effectiveDate,
      selectedCount: 1,
      sourceAcademicYear: { endDate: sourceYearEnd },
      items: [{
        sourceEnrollmentId: enrollmentOneId,
        targetEnrollmentId: "00000000-0000-0000-0000-000000000017",
        studentId: studentOneId,
        outcome: "PROMOTED",
        sourceEnrollmentStatusBefore: "ACTIVE",
        sourceEnrollmentLeftOnBefore: null,
        studentStatusBefore: "ACTIVE",
        studentLeftAtBefore: null,
        sourceEnrollment: { id: enrollmentOneId, status: "PROMOTED", leftOn: sourceYearEnd },
        targetEnrollment: { id: "00000000-0000-0000-0000-000000000017", status: "ACTIVE" },
        student: { id: studentOneId, status: "ACTIVE", leftAt: null }
      }]
    });
    mocks.tx.studentAttendanceRecord.count.mockResolvedValue(1);

    await expect(reverseStudentPromotionBatch(ctx, {
      batchId,
      confirmation: "REVERSE PROMOTION",
      reason: "Incorrect target class selected"
    })).rejects.toMatchObject({
      code: "PROMOTION_REVERSAL_BLOCKED_BY_TARGET_ACTIVITY",
      status: 409
    });
    expect(mocks.tx.enrollment.updateMany).not.toHaveBeenCalled();
  });

  it("reverses without deleting history when no later activity exists", async () => {
    mocks.db.studentPromotionBatch.findFirst.mockResolvedValue({
      id: batchId,
      branchId,
      targetAcademicYearId: targetYearId
    });
    mocks.tx.studentPromotionBatch.findFirst.mockResolvedValue({
      id: batchId,
      tenantId,
      branchId,
      status: "COMPLETED",
      sourceAcademicYearId: sourceYearId,
      targetAcademicYearId: targetYearId,
      effectiveDate,
      selectedCount: 1,
      sourceAcademicYear: { endDate: sourceYearEnd },
      items: [{
        sourceEnrollmentId: enrollmentOneId,
        targetEnrollmentId: "00000000-0000-0000-0000-000000000017",
        studentId: studentOneId,
        outcome: "PROMOTED",
        sourceEnrollmentStatusBefore: "ACTIVE",
        sourceEnrollmentLeftOnBefore: null,
        studentStatusBefore: "ACTIVE",
        studentLeftAtBefore: null,
        sourceEnrollment: { id: enrollmentOneId, status: "PROMOTED", leftOn: sourceYearEnd },
        targetEnrollment: { id: "00000000-0000-0000-0000-000000000017", status: "ACTIVE" },
        student: { id: studentOneId, status: "ACTIVE", leftAt: null }
      }]
    });
    mocks.tx.studentAttendanceRecord.count.mockResolvedValue(0);
    mocks.tx.enrollment.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.studentPromotionItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.studentPromotionBatch.update.mockResolvedValue({ id: batchId, status: "REVERSED" });

    await expect(reverseStudentPromotionBatch(ctx, {
      batchId,
      confirmation: "REVERSE PROMOTION",
      reason: "Incorrect target class selected"
    })).resolves.toEqual({ id: batchId, status: "REVERSED" });

    expect(mocks.tx.enrollment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "CANCELLED" })
    }));
    expect(mocks.tx.enrollment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ACTIVE", leftOn: null })
    }));
    expect(mocks.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_PROMOTION_BATCH_REVERSED
    }), mocks.tx);
  });
});
