import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  MINIMUM_STUDENT_IMPORT_COLUMNS,
  STUDENT_IMPORT_COLUMNS,
  type StudentImportColumnKey
} from "@/modules/academia/student-bulk-columns";
import {
  buildStudentExportWorkbook,
  buildStudentImportTemplate,
  parseStudentImportFile
} from "@/modules/academia/services/student-bulk-workbook.service";
import {
  buildClassSectionReferenceMap,
  classSectionAliases,
  rowsExceedingClassCapacity,
  type ClassSectionReference
} from "@/modules/academia/services/student-bulk.service";
import {
  getStudentProfileStatus,
  missingStudentProfileFields
} from "@/modules/academia/student-profile-completeness";

const branchId = "00000000-0000-0000-0000-000000000003";

const baseValues: Record<string, string> = {
  admissionNumber: "SCH-1001",
  fullName: "Aarav Shah",
  dateOfBirth: "2018-01-10",
  classSection: "Grade 1-A",
  guardianPhone: "9876543210",
  fatherName: "Nilesh Shah",
  motherName: "Kavita Shah"
};

function csvFile(
  overrides: Record<string, string> = {},
  columns: ReadonlyArray<{ key: StudentImportColumnKey; header: string }> = MINIMUM_STUDENT_IMPORT_COLUMNS.map((column) => ({
    key: column.key,
    header: column.label
  }))
) {
  const values = { ...baseValues, ...overrides };
  const headers = columns.map((column) => column.header);
  const row = columns.map((column) => values[column.key] ?? "");
  return new File([`${headers.join(",")}\r\n${row.join(",")}\r\n`], "students.csv", { type: "text/csv" });
}

function classSection(overrides: Partial<ClassSectionReference> = {}): ClassSectionReference {
  return {
    id: "class-section-1",
    academicYearId: "academic-year-1",
    displayName: "Grade 1-A",
    capacity: 40,
    currentEnrollmentCount: 0,
    academicClass: { code: "G1", name: "Grade 1" },
    section: { code: "A", name: "A" },
    ...overrides
  };
}

describe("student bulk import and export", () => {
  it("uses only the seven essential columns as the minimum import contract", () => {
    expect(MINIMUM_STUDENT_IMPORT_COLUMNS.map((column) => column.label)).toEqual([
      "Scholar Number",
      "Student Name",
      "Date of Birth",
      "Current Class",
      "Contact Number",
      "Father's Name",
      "Mother's Name"
    ]);
    expect(STUDENT_IMPORT_COLUMNS.filter((column) => column.required)).toHaveLength(7);
  });

  it("does not treat aliases from one class section as an ambiguous match", () => {
    expect(classSectionAliases(classSection())).toEqual(["grade 1-a", "grade 1 a", "g1-a"]);
  });

  it("accepts a class-only value only when it resolves to one active section", () => {
    const onlySection = classSection();
    const uniqueMap = buildClassSectionReferenceMap([onlySection]);
    expect(uniqueMap.get("grade 1")?.id).toBe(onlySection.id);

    const ambiguousMap = buildClassSectionReferenceMap([
      onlySection,
      classSection({
        id: "class-section-2",
        displayName: "Grade 1-B",
        section: { code: "B", name: "B" }
      })
    ]);
    expect(ambiguousMap.get("grade 1")).toBeNull();
    expect(ambiguousMap.has("unsupported class")).toBe(false);
  });

  it("allocates remaining class capacity deterministically without consuming invalid rows", () => {
    expect(rowsExceedingClassCapacity(null, 99, [8, 3, 5])).toEqual([]);
    expect(rowsExceedingClassCapacity(40, 38, [8, 3, 5])).toEqual([8]);
    expect(rowsExceedingClassCapacity(40, 40, [8, 3])).toEqual([3, 8]);
  });

  it("parses the minimal Google Sheets-compatible CSV using server-derived branch scope", async () => {
    const parsed = await parseStudentImportFile(csvFile(), branchId);

    expect(parsed.errors).toEqual([]);
    expect(parsed.totalRows).toBe(1);
    expect(parsed.rows[0]).toMatchObject({ classSectionLabel: "Grade 1-A" });
    expect(parsed.rows[0]?.registration.student).toMatchObject({
      branchId,
      admissionNumber: "SCH-1001",
      fullName: "Aarav Shah",
      fatherName: "Nilesh Shah",
      motherName: "Kavita Shah"
    });
    expect(parsed.rows[0]?.registration.student.admissionDate).toBeUndefined();
    expect(parsed.rows[0]?.registration.student.aadhaarNumber).toBeUndefined();
    expect(parsed.rows[0]?.registration.student.dateOfBirth).toBeInstanceOf(Date);
    expect(parsed.rows[0]?.registration.primaryGuardian.phone).toBe("9876543210");
  });

  it("recognizes common school headers and interprets optional null markers as blank", async () => {
    const columns: Array<{ key: StudentImportColumnKey; header: string }> = [
      { key: "admissionNumber", header: "Scholar No" },
      { key: "fullName", header: "Name of Student" },
      { key: "dateOfBirth", header: "DOB" },
      { key: "classSection", header: "Class" },
      { key: "guardianPhone", header: "Mobile Number" },
      { key: "fatherName", header: "Father Name" },
      { key: "motherName", header: "Mother Name" },
      { key: "category", header: "Category" }
    ];
    const parsed = await parseStudentImportFile(
      csvFile({ dateOfBirth: "10/01/2018", category: "N/A" }, columns),
      branchId
    );

    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.registration.student.dateOfBirth.toISOString().slice(0, 10)).toBe("2018-01-10");
    expect(parsed.rows[0]?.registration.student.category).toBeUndefined();
  });

  it("reports invalid date of birth and contact number without echoing cell values", async () => {
    const parsed = await parseStudentImportFile(
      csvFile({ dateOfBirth: "31/02/2018", guardianPhone: "12345" }),
      branchId
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: "dateOfBirth" }),
      expect.objectContaining({ row: 2, field: "guardian.phone" })
    ]));
    expect(JSON.stringify(parsed.errors)).not.toContain("12345");
  });

  it("validates optional fields only when they are provided", async () => {
    const columns: Array<{ key: StudentImportColumnKey; header: string }> = [
      ...MINIMUM_STUDENT_IMPORT_COLUMNS.map((column) => ({ key: column.key, header: column.label })),
      { key: "aadhaarNumber", header: "Aadhaar" },
      { key: "category", header: "Category" }
    ];
    const parsed = await parseStudentImportFile(
      csvFile({ aadhaarNumber: "123", category: "Unknown" }, columns),
      branchId
    );

    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ row: 2, field: "aadhaarNumber" }),
      expect.objectContaining({ row: 2, field: "category" })
    ]));
  });

  it("builds a seven-column Excel template with a sample row and class references", async () => {
    const buffer = await buildStudentImportTemplate("xlsx", {
      branchName: "Main Branch",
      academicYearName: "2026-27",
      classSections: ["Class 1-A"]
    });
    const workbook = new ExcelJS.Workbook();
    const workbookBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
    await workbook.xlsx.load(workbookBuffer);

    const students = workbook.getWorksheet("Students");
    expect(students).toBeTruthy();
    expect(students?.columnCount).toBe(7);
    expect(students?.getRow(1).values).toEqual([
      undefined,
      "Scholar Number *",
      "Student Name *",
      "Date of Birth *",
      "Current Class *",
      "Contact Number *",
      "Father's Name *",
      "Mother's Name *"
    ]);
    expect(students?.getCell("A2").value).toBe("EXAMPLE-001");
    expect(workbook.getWorksheet("Instructions")?.getCell("B2").value).toBe("Main Branch");
    expect(workbook.getWorksheet("Reference Data")?.getCell("D2").value).toBe("Class 1-A");
  });

  it("builds a simple CSV template with clear headers and a guidance row", async () => {
    const csv = (await buildStudentImportTemplate("csv", {
      branchName: "Main Branch",
      academicYearName: "2026-27",
      classSections: ["Class 1-A"]
    })).toString("utf8");

    expect(csv).toContain("Scholar Number,Student Name,Date of Birth,Current Class,Contact Number,Father's Name,Mother's Name");
    expect(csv).toContain("EXAMPLE-001,Example Student,2012-04-15,Class 1-A");
  });

  it("computes profile readiness from stored admission details", () => {
    const minimal = {
      fullName: "Aarav Shah",
      dateOfBirth: new Date("2018-01-10T00:00:00.000Z"),
      fatherName: "Nilesh Shah",
      motherName: "Kavita Shah"
    };
    expect(getStudentProfileStatus(minimal)).toBe("INCOMPLETE");
    expect(missingStudentProfileFields(minimal)).toContain("Admission date");
    expect(getStudentProfileStatus({
      ...minimal,
      admissionDate: new Date("2026-04-01T00:00:00.000Z"),
      aadhaarMasked: "XXXX-XXXX-1234",
      religion: "Hindu",
      caste: "General",
      category: "General",
      nationality: "India",
      city: "Ahmedabad",
      state: "Gujarat"
    })).toBe("COMPLETE");
  });

  it("guards CSV cells against spreadsheet formula injection", async () => {
    const buffer = await buildStudentExportWorkbook(
      "csv",
      [{ key: "fullName", label: "Full Name" }],
      [{ fullName: "=HYPERLINK(\"https://example.invalid\")" }]
    );

    expect(buffer.toString("utf8")).toContain("'=HYPERLINK");
  });

  it("keeps bulk persistence tenant-scoped, partial-row safe, transactional, and audited", () => {
    const source = readFileSync(resolve(process.cwd(), "src/modules/academia/services/student-bulk.service.ts"), "utf8");
    const commitRoute = readFileSync(resolve(process.cwd(), "src/app/api/academia/students/import/commit/route.ts"), "utf8");
    const exportRoute = readFileSync(resolve(process.cwd(), "src/app/api/academia/students/export/route.ts"), "utf8");

    expect(source).toContain("tenantId: ctx.tenantId");
    expect(source).toContain('requireBranchPermission(ctx, "academia.student.create", branchId)');
    expect(source).toContain('requireBranchPermission(ctx, "academia.guardian.manage", branchId)');
    expect(source).toContain('requireBranchPermission(ctx, "academia.enrollment.manage", branchId)');
    expect(source).toContain("maskAadhaarNumber(student.aadhaarNumber)");
    expect(source).toContain("maskBankAccountNumber(student.bankAccountNumber)");
    expect(source).toContain("STUDENT_BULK_IMPORTED");
    expect(source).toContain("db.$transaction");
    expect(commitRoute).toContain("validated.rows");
    expect(commitRoute).toContain("invalid rows were skipped");
    expect(exportRoute).toContain('"Cache-Control": "private, no-store"');
  });
});
