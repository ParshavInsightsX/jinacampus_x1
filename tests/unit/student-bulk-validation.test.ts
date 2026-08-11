import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@/lib/tenant/context";
import type { ParsedStudentImportRow } from "@/modules/academia/services/student-bulk-workbook.service";
import { validateStudentBulkImport } from "@/modules/academia/services/student-bulk.service";

const mocks = vi.hoisted(() => ({
  db: {
    student: { findMany: vi.fn() },
    classSection: { findMany: vi.fn() },
    enrollment: { findMany: vi.fn() },
    guardian: { findMany: vi.fn() }
  },
  ensureActiveBranch: vi.fn(),
  requireBranchPermission: vi.fn(),
  writeAuditLog: vi.fn()
}));

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/audit-log", () => ({ writeAuditLog: mocks.writeAuditLog }));
vi.mock("@/modules/academia/services/shared", () => ({
  ensureActiveBranch: mocks.ensureActiveBranch,
  requireBranchPermission: mocks.requireBranchPermission
}));

const tenantId = "00000000-0000-0000-0000-000000000001";
const actorUserId = "00000000-0000-0000-0000-000000000002";
const branchId = "00000000-0000-0000-0000-000000000003";
const academicYearId = "00000000-0000-0000-0000-000000000004";

const ctx: TenantContext = {
  tenantId,
  userId: actorUserId,
  userEmail: "principal@example.com",
  userType: "STAFF",
  activeBranchId: branchId,
  accessibleBranchIds: [branchId],
  activeAcademicYearId: academicYearId
};

function importRow(rowNumber: number, admissionNumber: string): ParsedStudentImportRow {
  return {
    rowNumber,
    classSectionLabel: "Class 1-A",
    registration: {
      student: {
        branchId,
        admissionNumber,
        fullName: `Student ${rowNumber}`,
        dateOfBirth: new Date("2018-01-10T00:00:00.000Z"),
        gender: "NOT_SPECIFIED",
        fatherName: "Parent One",
        motherName: "Parent Two",
        status: "ACTIVE"
      },
      primaryGuardian: {
        relation: "FATHER",
        phone: `98765432${String(rowNumber).padStart(2, "0")}`,
        isEmergencyContact: true,
        hasPickupPermission: true
      }
    }
  };
}

function activeClassSection(currentEnrollmentCount = 0, capacity = 40) {
  return {
    id: "class-section-1",
    academicYearId,
    displayName: "Class 1-A",
    capacity,
    academicClass: { code: "C1", name: "Class 1" },
    section: { code: "A", name: "A" },
    _count: { enrollments: currentEnrollmentCount }
  };
}

describe("student bulk validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.student.findMany.mockResolvedValue([]);
    mocks.db.classSection.findMany.mockResolvedValue([activeClassSection()]);
    mocks.db.enrollment.findMany.mockResolvedValue([]);
    mocks.db.guardian.findMany.mockResolvedValue([]);
    mocks.ensureActiveBranch.mockResolvedValue({ id: branchId });
    mocks.requireBranchPermission.mockResolvedValue(undefined);
  });

  it("rejects every duplicate Scholar Number row while preserving unrelated valid rows", async () => {
    const result = await validateStudentBulkImport(ctx, branchId, [
      importRow(2, "SCH-001"),
      importRow(3, "sch-001"),
      importRow(4, "SCH-002")
    ]);

    expect(result.rows.map((row) => row.rowNumber)).toEqual([4]);
    expect(result.errors.filter((error) => error.field === "admissionNumber")).toEqual([
      expect.objectContaining({ row: 2 }),
      expect.objectContaining({ row: 3 })
    ]);
  });

  it("does not let a pre-existing Scholar Number consume remaining class capacity", async () => {
    mocks.db.student.findMany.mockResolvedValue([{ admissionNumber: "SCH-OLD" }]);
    mocks.db.classSection.findMany.mockResolvedValue([activeClassSection(39, 40)]);

    const result = await validateStudentBulkImport(ctx, branchId, [
      importRow(2, "SCH-OLD"),
      importRow(3, "SCH-NEW")
    ]);

    expect(result.rows.map((row) => row.rowNumber)).toEqual([3]);
    expect(result.errors).toContainEqual(expect.objectContaining({ row: 2, field: "admissionNumber" }));
    expect(result.errors).not.toContainEqual(expect.objectContaining({ row: 3, field: "classSection" }));
  });
});
