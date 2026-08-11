import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  maskAadhaarNumber,
  maskBankAccountNumber
} from "@/modules/academia/schemas/student.schema";
import { getStudentProfileStatus } from "@/modules/academia/student-profile-completeness";
import type {
  ParsedStudentImportRow,
  StudentExportRow,
  StudentImportError
} from "./student-bulk-workbook.service";
import { ensureActiveBranch, requireBranchPermission } from "./shared";

export type ClassSectionReference = {
  id: string;
  academicYearId: string;
  displayName: string;
  capacity: number | null;
  currentEnrollmentCount: number;
  academicClass: { code: string; name: string };
  section: { code: string; name: string };
};

type PreparedRow = ParsedStudentImportRow & {
  classSection?: ClassSectionReference;
};

type GuardianReference = {
  id: string;
  phone?: string | null;
  email?: string | null;
  isNew: boolean;
};

const EXPORT_COLUMNS = [
  { key: "admissionNumber", label: "Admission Number" },
  { key: "admissionDate", label: "Admission Date" },
  { key: "fullName", label: "Full Name" },
  { key: "displayName", label: "Display Name" },
  { key: "dateOfBirth", label: "Date of Birth" },
  { key: "gender", label: "Gender" },
  { key: "bloodGroup", label: "Blood Group" },
  { key: "fatherName", label: "Father Name" },
  { key: "fatherOccupation", label: "Father Occupation" },
  { key: "motherName", label: "Mother Name" },
  { key: "guardianName", label: "Guardian Name" },
  { key: "guardianPhone", label: "Guardian Mobile" },
  { key: "guardianEmail", label: "Guardian Email" },
  { key: "aadhaarMasked", label: "Aadhaar (Masked)" },
  { key: "familyIdNumber", label: "Family ID" },
  { key: "sssmIdNumber", label: "SSSM ID" },
  { key: "apaarIdNumber", label: "APAAR ID" },
  { key: "religion", label: "Religion" },
  { key: "caste", label: "Caste" },
  { key: "category", label: "Category" },
  { key: "nationality", label: "Nationality" },
  { key: "currentAddress", label: "Current Address" },
  { key: "permanentAddress", label: "Permanent Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State / UT" },
  { key: "pincode", label: "Pincode" },
  { key: "bankAccountMasked", label: "Bank Account (Masked)" },
  { key: "bankBranchName", label: "Bank Branch" },
  { key: "ifscCode", label: "IFSC" },
  { key: "branch", label: "Branch" },
  { key: "academicYear", label: "Academic Year" },
  { key: "classSection", label: "Class Section" },
  { key: "rollNumber", label: "Roll Number" },
  { key: "status", label: "Student Status" },
  { key: "profileStatus", label: "Profile Status" }
] as const;

function normalizedLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function lastFourDigits(value: string) {
  return digitsOnly(value).slice(-4);
}

function guardianDisplayName(row: ParsedStudentImportRow) {
  const { registration } = row;
  switch (registration.primaryGuardian.relation) {
    case "MOTHER": return registration.student.motherName;
    case "GUARDIAN": return registration.student.guardianName ?? registration.student.fatherName;
    default: return registration.student.fatherName;
  }
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  const firstName = parts.shift() ?? name;
  return {
    firstName: firstName.slice(0, 80),
    lastName: parts.join(" ").slice(0, 80) || undefined,
    displayName: name.slice(0, 180)
  };
}

export function classSectionAliases(classSection: ClassSectionReference) {
  return Array.from(new Set([
    classSection.displayName,
    `${classSection.academicClass.name}-${classSection.section.name}`,
    `${classSection.academicClass.name} ${classSection.section.name}`,
    `${classSection.academicClass.code}-${classSection.section.code}`
  ].map(normalizedLabel)));
}

function classAliases(classSection: ClassSectionReference) {
  return Array.from(new Set([
    classSection.academicClass.name,
    classSection.academicClass.code
  ].map(normalizedLabel)));
}

function addClassSectionAlias(
  aliases: Map<string, ClassSectionReference | null>,
  alias: string,
  classSection: ClassSectionReference
) {
  if (!aliases.has(alias)) {
    aliases.set(alias, classSection);
    return;
  }
  if (aliases.get(alias)?.id !== classSection.id) aliases.set(alias, null);
}

export function buildClassSectionReferenceMap(classSections: ClassSectionReference[]) {
  const aliases = new Map<string, ClassSectionReference | null>();
  for (const classSection of classSections) {
    for (const alias of classSectionAliases(classSection)) {
      addClassSectionAlias(aliases, alias, classSection);
    }
    for (const alias of classAliases(classSection)) {
      addClassSectionAlias(aliases, alias, classSection);
    }
  }
  return aliases;
}

export function rowsExceedingClassCapacity(
  capacity: number | null,
  currentEnrollmentCount: number,
  eligibleRowNumbers: number[]
) {
  if (capacity === null) return [];
  const availablePlaces = Math.max(0, capacity - currentEnrollmentCount);
  return [...eligibleRowNumbers].sort((left, right) => left - right).slice(availablePlaces);
}

async function loadClassSectionReferences(ctx: TenantContext, branchId: string) {
  const records = await db.classSection.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      status: "ACTIVE",
      academicYear: { tenantId: ctx.tenantId, isActive: true, status: "ACTIVE" }
    },
    select: {
      id: true,
      academicYearId: true,
      displayName: true,
      capacity: true,
      academicClass: { select: { code: true, name: true } },
      section: { select: { code: true, name: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } }
    },
    orderBy: { displayName: "asc" }
  });
  return records.map(({ _count, ...record }) => ({
    ...record,
    currentEnrollmentCount: _count.enrollments
  }));
}

export async function getStudentBulkReferenceData(ctx: TenantContext, branchId: string) {
  await requireBranchPermission(ctx, "academia.student.create", branchId);
  await ensureActiveBranch(db, ctx, branchId);
  const [branch, classSections] = await Promise.all([
    db.branch.findFirst({
      where: { id: branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { name: true }
    }),
    loadClassSectionReferences(ctx, branchId)
  ]);
  if (!branch) throw new AppError("BRANCH_NOT_FOUND", "BRANCH_NOT_FOUND", 404);
  return {
    branchName: branch.name,
    academicYearName: ctx.activeAcademicYearName,
    classSections: classSections.map((section) => section.displayName)
  };
}

export async function validateStudentBulkImport(
  ctx: TenantContext,
  branchId: string,
  rows: ParsedStudentImportRow[],
  parseErrors: StudentImportError[] = []
) {
  await requireBranchPermission(ctx, "academia.student.create", branchId);
  await requireBranchPermission(ctx, "academia.guardian.manage", branchId);
  await ensureActiveBranch(db, ctx, branchId);

  const errors = [...parseErrors];
  const admissionRows = new Map<string, number[]>();
  for (const row of rows) {
    const key = row.registration.student.admissionNumber.toLowerCase();
    const matchingRows = admissionRows.get(key) ?? [];
    matchingRows.push(row.rowNumber);
    admissionRows.set(key, matchingRows);
  }
  for (const matchingRows of admissionRows.values()) {
    if (matchingRows.length > 1) {
      for (const rowNumber of matchingRows) {
        errors.push({
          row: rowNumber,
          field: "admissionNumber",
          message: "This Scholar Number appears more than once in the file."
        });
      }
    }
  }

  const [existingStudents, classSections] = await Promise.all([
    admissionRows.size ? db.student.findMany({
      where: {
        tenantId: ctx.tenantId,
        admissionNumber: {
          in: rows.map((row) => row.registration.student.admissionNumber),
          mode: "insensitive"
        }
      },
      select: { admissionNumber: true }
    }) : [],
    loadClassSectionReferences(ctx, branchId)
  ]);
  const existingAdmissions = new Set(existingStudents.map((student) => student.admissionNumber.toLowerCase()));
  for (const row of rows) {
    if (existingAdmissions.has(row.registration.student.admissionNumber.toLowerCase())) {
      errors.push({ row: row.rowNumber, field: "admissionNumber", message: "This Scholar Number already exists." });
    }
  }

  const classSectionMap = buildClassSectionReferenceMap(classSections);

  const preparedRows: PreparedRow[] = [];
  const rollKeys = new Map<string, number[]>();
  if (rows.length) {
    await requireBranchPermission(ctx, "academia.enrollment.manage", branchId);
  }
  for (const row of rows) {
    let classSection: ClassSectionReference | undefined;
    if (row.classSectionLabel) {
      const matched = classSectionMap.get(normalizedLabel(row.classSectionLabel));
      if (matched === undefined) {
        errors.push({ row: row.rowNumber, field: "classSection", message: "Current Class was not found in the active academic year." });
      } else if (matched === null) {
        errors.push({
          row: row.rowNumber,
          field: "classSection",
          message: "This class has multiple sections. Enter an exact class-section or add a Section column."
        });
      } else {
        classSection = matched;
        if (row.rollNumber) {
          const rollKey = `${matched.id}:${row.rollNumber.toLowerCase()}`;
          const matchingRows = rollKeys.get(rollKey) ?? [];
          matchingRows.push(row.rowNumber);
          rollKeys.set(rollKey, matchingRows);
        }
      }
    } else if (row.rollNumber || row.enrollmentDate) {
      errors.push({ row: row.rowNumber, field: "classSection", message: "Select a class section when roll number or enrollment date is provided." });
    }
    preparedRows.push({ ...row, classSection });
  }

  for (const matchingRows of rollKeys.values()) {
    if (matchingRows.length > 1) {
      for (const rowNumber of matchingRows) {
        errors.push({
          row: rowNumber,
          field: "rollNumber",
          message: "This roll number appears more than once for the class section."
        });
      }
    }
  }

  if (rollKeys.size) {
    const existingRolls = await db.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId,
        status: "ACTIVE",
        classSectionId: { in: classSections.map((section) => section.id) },
        rollNumber: { in: preparedRows.flatMap((row) => row.rollNumber ? [row.rollNumber] : []) }
      },
      select: { classSectionId: true, rollNumber: true }
    });
    const existingRollKeys = new Set(existingRolls.flatMap((item) => item.rollNumber
      ? [`${item.classSectionId}:${item.rollNumber.toLowerCase()}`]
      : []));
    for (const row of preparedRows) {
      if (row.classSection && row.rollNumber && existingRollKeys.has(`${row.classSection.id}:${row.rollNumber.toLowerCase()}`)) {
        errors.push({ row: row.rowNumber, field: "rollNumber", message: "This roll number is already assigned in the class section." });
      }
    }
  }

  const phones = Array.from(new Set(rows.flatMap((row) => row.registration.primaryGuardian.phone ? [row.registration.primaryGuardian.phone] : [])));
  const emails = Array.from(new Set(rows.flatMap((row) => row.registration.primaryGuardian.email ? [row.registration.primaryGuardian.email] : [])));
  if (phones.length || emails.length) {
    const guardians = await db.guardian.findMany({
      where: {
        tenantId: ctx.tenantId,
        OR: [
          ...(phones.length ? [{ phone: { in: phones } }] : []),
          ...(emails.length ? [{ email: { in: emails } }] : [])
        ]
      },
      select: { id: true, phone: true, email: true }
    });
    const byPhone = new Map(guardians.flatMap((guardian) => guardian.phone ? [[guardian.phone, guardian.id] as const] : []));
    const byEmail = new Map(guardians.flatMap((guardian) => guardian.email ? [[guardian.email, guardian.id] as const] : []));
    for (const row of rows) {
      const phoneGuardianId = row.registration.primaryGuardian.phone
        ? byPhone.get(row.registration.primaryGuardian.phone)
        : undefined;
      const emailGuardianId = row.registration.primaryGuardian.email
        ? byEmail.get(row.registration.primaryGuardian.email)
        : undefined;
      if (phoneGuardianId && emailGuardianId && phoneGuardianId !== emailGuardianId) {
        errors.push({
          row: row.rowNumber,
          field: "guardianPhone",
          message: "Guardian mobile and email belong to different existing guardian records."
        });
      }
    }
  }

  const invalidBeforeCapacity = new Set(
    errors.filter((error) => error.row > 1).map((error) => error.row)
  );
  for (const classSection of classSections) {
    const eligibleRows = preparedRows
      .filter((row) => row.classSection?.id === classSection.id && !invalidBeforeCapacity.has(row.rowNumber))
      .map((row) => row.rowNumber);
    for (const rowNumber of rowsExceedingClassCapacity(
      classSection.capacity,
      classSection.currentEnrollmentCount,
      eligibleRows
    )) {
      errors.push({
        row: rowNumber,
        field: "classSection",
        message: `${classSection.displayName} has no remaining capacity for this row.`
      });
    }
  }

  const invalidParsedRows = new Set(errors.filter((error) => error.row > 1).map((error) => error.row));
  const validPreparedRows = preparedRows.filter((row) => !invalidParsedRows.has(row.rowNumber));

  return {
    rows: validPreparedRows,
    errors,
    validRows: validPreparedRows.length
  };
}

async function resolveGuardians(ctx: TenantContext, rows: PreparedRow[]) {
  const phones = Array.from(new Set(rows.flatMap((row) => row.registration.primaryGuardian.phone ? [row.registration.primaryGuardian.phone] : [])));
  const emails = Array.from(new Set(rows.flatMap((row) => row.registration.primaryGuardian.email ? [row.registration.primaryGuardian.email] : [])));
  const existing = phones.length || emails.length ? await db.guardian.findMany({
    where: {
      tenantId: ctx.tenantId,
      OR: [
        ...(phones.length ? [{ phone: { in: phones } }] : []),
        ...(emails.length ? [{ email: { in: emails } }] : [])
      ]
    },
    select: { id: true, phone: true, email: true }
  }) : [];
  const byContact = new Map<string, GuardianReference>();
  for (const guardian of existing) {
    const reference = { ...guardian, isNew: false };
    if (guardian.phone) byContact.set(`phone:${guardian.phone}`, reference);
    if (guardian.email) byContact.set(`email:${guardian.email}`, reference);
  }

  const result = new Map<number, GuardianReference>();
  const newGuardians: Prisma.GuardianCreateManyInput[] = [];
  for (const row of rows) {
    const phoneKey = row.registration.primaryGuardian.phone ? `phone:${row.registration.primaryGuardian.phone}` : null;
    const emailKey = row.registration.primaryGuardian.email ? `email:${row.registration.primaryGuardian.email}` : null;
    const phoneMatch = phoneKey ? byContact.get(phoneKey) : undefined;
    const emailMatch = emailKey ? byContact.get(emailKey) : undefined;
    if (phoneMatch && emailMatch && phoneMatch.id !== emailMatch.id) {
      throw new AppError("GUARDIAN_CONTACTS_BELONG_TO_DIFFERENT_RECORDS", "GUARDIAN_CONTACTS_BELONG_TO_DIFFERENT_RECORDS", 409);
    }
    let reference = phoneMatch ?? emailMatch;
    if (!reference) {
      const id = randomUUID();
      const names = splitName(guardianDisplayName(row));
      reference = {
        id,
        phone: row.registration.primaryGuardian.phone,
        email: row.registration.primaryGuardian.email,
        isNew: true
      };
      newGuardians.push({
        id,
        tenantId: ctx.tenantId,
        ...names,
        phone: reference.phone,
        email: reference.email,
        occupation: row.registration.primaryGuardian.relation === "FATHER"
          ? row.registration.student.fatherOccupation
          : undefined,
        addressLine1: row.registration.student.permanentAddress ?? row.registration.student.currentAddress,
        city: row.registration.student.city,
        state: row.registration.student.state,
        postalCode: row.registration.student.pincode,
        country: "India",
        createdById: ctx.userId
      });
    }
    if (phoneKey) byContact.set(phoneKey, reference);
    if (emailKey) byContact.set(emailKey, reference);
    result.set(row.rowNumber, reference);
  }
  return { byRow: result, newGuardians };
}

async function createManyInChunks<T>(items: T[], create: (chunk: T[]) => Promise<unknown>) {
  for (let index = 0; index < items.length; index += 250) {
    await create(items.slice(index, index + 250));
  }
}

export async function importStudentRows(ctx: TenantContext, branchId: string, rows: PreparedRow[]) {
  if (!rows.length) throw new AppError("STUDENT_IMPORT_EMPTY", "STUDENT_IMPORT_EMPTY", 400);
  await requireBranchPermission(ctx, "academia.student.create", branchId);
  await requireBranchPermission(ctx, "academia.guardian.manage", branchId);
  await requireBranchPermission(ctx, "academia.enrollment.manage", branchId);
  await ensureActiveBranch(db, ctx, branchId);
  const { byRow: guardiansByRow, newGuardians } = await resolveGuardians(ctx, rows);
  const now = new Date();
  const students: Prisma.StudentCreateManyInput[] = [];
  const links: Prisma.StudentGuardianLinkCreateManyInput[] = [];
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  const audits: Prisma.AuditLogCreateManyInput[] = [];
  let incompleteProfiles = 0;

  for (const row of rows) {
    const studentId = randomUUID();
    const student = row.registration.student;
    const guardian = guardiansByRow.get(row.rowNumber);
    if (!guardian) throw new AppError("STUDENT_IMPORT_GUARDIAN_RESOLUTION_FAILED", "STUDENT_IMPORT_GUARDIAN_RESOLUTION_FAILED", 500);
    const names = splitName(student.fullName);
    const profileStatus = getStudentProfileStatus(student);
    if (profileStatus === "INCOMPLETE") incompleteProfiles += 1;
    students.push({
      id: studentId,
      tenantId: ctx.tenantId,
      branchId,
      admissionNumber: student.admissionNumber,
      admissionDate: student.admissionDate,
      fullName: student.fullName,
      firstName: names.firstName,
      lastName: names.lastName,
      displayName: student.displayName ?? student.fullName,
      dateOfBirth: student.dateOfBirth,
      gender: student.gender,
      bloodGroup: student.bloodGroup,
      fatherName: student.fatherName,
      fatherOccupation: student.fatherOccupation,
      motherName: student.motherName,
      guardianName: student.guardianName,
      aadhaarMasked: student.aadhaarNumber ? maskAadhaarNumber(student.aadhaarNumber) : undefined,
      aadhaarLast4: student.aadhaarNumber ? lastFourDigits(student.aadhaarNumber) : undefined,
      familyIdNumber: student.familyIdNumber,
      sssmIdNumber: student.sssmIdNumber,
      apaarIdNumber: student.apaarIdNumber,
      religion: student.religion,
      caste: student.caste,
      category: student.category,
      nationality: student.nationality,
      currentAddress: student.currentAddress,
      permanentAddress: student.permanentAddress,
      city: student.city,
      state: student.state,
      pincode: student.pincode,
      bankAccountMasked: student.bankAccountNumber ? maskBankAccountNumber(student.bankAccountNumber) : undefined,
      bankAccountLast4: student.bankAccountNumber ? lastFourDigits(student.bankAccountNumber) : undefined,
      bankBranchName: student.bankBranchName,
      ifscCode: student.ifscCode,
      status: student.status,
      joinedAt: student.admissionDate,
      createdById: ctx.userId,
      createdAt: now,
      updatedAt: now
    });
    const linkId = randomUUID();
    links.push({
      id: linkId,
      tenantId: ctx.tenantId,
      studentId,
      guardianId: guardian.id,
      relation: row.registration.primaryGuardian.relation,
      isPrimary: true,
      isEmergencyContact: row.registration.primaryGuardian.isEmergencyContact,
      hasPickupPermission: row.registration.primaryGuardian.hasPickupPermission,
      createdById: ctx.userId,
      createdAt: now,
      updatedAt: now
    });
    audits.push({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId,
      actorUserId: ctx.userId,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_CREATED,
      entityType: "Student",
      entityId: studentId,
      afterJson: {
        admissionNumber: student.admissionNumber,
        importRow: row.rowNumber,
        profileStatus
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      createdAt: now
    }, {
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId,
      actorUserId: ctx.userId,
      action: ACADEMIA_AUDIT_EVENTS.GUARDIAN_LINKED,
      entityType: "StudentGuardianLink",
      entityId: linkId,
      afterJson: { studentId, guardianId: guardian.id, relation: row.registration.primaryGuardian.relation },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      createdAt: now
    });
    if (row.classSection) {
      const enrollmentId = randomUUID();
      enrollments.push({
        id: enrollmentId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId: row.classSection.academicYearId,
        studentId,
        classSectionId: row.classSection.id,
        rollNumber: row.rollNumber,
        status: "ACTIVE",
        enrolledOn: row.enrollmentDate ?? student.admissionDate ?? now,
        createdById: ctx.userId,
        createdAt: now,
        updatedAt: now
      });
      audits.push({
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId,
        academicYearId: row.classSection.academicYearId,
        actorUserId: ctx.userId,
        action: ACADEMIA_AUDIT_EVENTS.ENROLLMENT_CREATED,
        entityType: "Enrollment",
        entityId: enrollmentId,
        afterJson: { studentId, classSectionId: row.classSection.id, rollNumber: row.rollNumber ?? null },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        createdAt: now
      });
    }
  }

  for (const guardian of newGuardians) {
    audits.push({
      id: randomUUID(),
      tenantId: ctx.tenantId,
      branchId,
      actorUserId: ctx.userId,
      action: ACADEMIA_AUDIT_EVENTS.GUARDIAN_CREATED,
      entityType: "Guardian",
      entityId: guardian.id,
      afterJson: { imported: true },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      createdAt: now
    });
  }

  await db.$transaction(async (tx) => {
    await createManyInChunks(newGuardians, (chunk) => tx.guardian.createMany({ data: chunk }));
    await createManyInChunks(students, (chunk) => tx.student.createMany({ data: chunk }));
    await createManyInChunks(links, (chunk) => tx.studentGuardianLink.createMany({ data: chunk }));
    await createManyInChunks(enrollments, (chunk) => tx.enrollment.createMany({ data: chunk }));
    await createManyInChunks(audits, (chunk) => tx.auditLog.createMany({ data: chunk }));
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_BULK_IMPORTED,
      entityType: "StudentImport",
      branchId,
      metadata: {
        totalStudents: students.length,
        newGuardians: newGuardians.length,
        enrollments: enrollments.length,
        incompleteProfiles
      }
    }, tx);
  }, { maxWait: 10_000, timeout: 240_000 });

  return {
    total: students.length,
    guardiansCreated: newGuardians.length,
    enrollmentsCreated: enrollments.length,
    incompleteProfiles
  };
}

export async function exportStudentRecords(ctx: TenantContext, branchId: string) {
  await requireBranchPermission(ctx, "academia.student.view", branchId);
  await ensureActiveBranch(db, ctx, branchId);
  const students = await db.student.findMany({
    where: { tenantId: ctx.tenantId, branchId },
    select: {
      admissionNumber: true,
      admissionDate: true,
      fullName: true,
      firstName: true,
      middleName: true,
      lastName: true,
      displayName: true,
      dateOfBirth: true,
      gender: true,
      bloodGroup: true,
      fatherName: true,
      fatherOccupation: true,
      motherName: true,
      guardianName: true,
      aadhaarMasked: true,
      familyIdNumber: true,
      sssmIdNumber: true,
      apaarIdNumber: true,
      religion: true,
      caste: true,
      category: true,
      nationality: true,
      currentAddress: true,
      permanentAddress: true,
      city: true,
      state: true,
      pincode: true,
      bankAccountMasked: true,
      bankBranchName: true,
      ifscCode: true,
      status: true,
      branch: { select: { name: true } },
      guardianLinks: {
        where: { isPrimary: true },
        take: 1,
        select: { guardian: { select: { phone: true, email: true } } }
      },
      enrollments: {
        where: { status: "ACTIVE", academicYear: { isActive: true, status: "ACTIVE" } },
        take: 1,
        orderBy: { createdAt: "desc" },
        select: {
          rollNumber: true,
          academicYear: { select: { name: true } },
          classSection: { select: { displayName: true } }
        }
      }
    },
    orderBy: [{ admissionNumber: "asc" }],
    take: 20_000
  });

  const rows: StudentExportRow[] = students.map((student) => {
    const guardian = student.guardianLinks[0]?.guardian;
    const enrollment = student.enrollments[0];
    return {
      ...student,
      fullName: student.fullName ?? [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" "),
      guardianPhone: guardian?.phone,
      guardianEmail: guardian?.email,
      branch: student.branch.name,
      academicYear: enrollment?.academicYear.name,
      classSection: enrollment?.classSection.displayName,
      rollNumber: enrollment?.rollNumber,
      profileStatus: getStudentProfileStatus(student),
      guardianLinks: undefined,
      enrollments: undefined
    };
  });

  await writeAuditLog({
    ctx,
    action: ACADEMIA_AUDIT_EVENTS.STUDENT_RECORDS_EXPORTED,
    entityType: "StudentExport",
    branchId,
    metadata: { recordCount: rows.length, sensitiveValues: "masked" }
  });
  return { columns: EXPORT_COLUMNS, rows };
}
