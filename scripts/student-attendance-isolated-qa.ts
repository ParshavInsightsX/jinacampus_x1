import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { TenantContext } from "@/lib/tenant/context";
import {
  prepareStudentAttendanceSession
} from "@/modules/academia/services/student-attendance-session.service";
import { ATTENDANCE_ENTITLEMENT_DEFINITIONS } from "@/modules/campus-core/entitlements/catalog";
import { seedPermissions } from "../prisma/seeds/permissions.seed";
import { seedDefaultRolesForTenant } from "../prisma/seeds/roles.seed";

const QA_DATABASE = "jinacampus_attendance_qa";
const PRIMARY_TENANT_SLUG = "student-attendance-qa";
const OTHER_TENANT_SLUG = "student-attendance-qa-other";
const CURRENT_YEAR_START = new Date("2026-04-01T00:00:00.000Z");
const CURRENT_YEAR_END = new Date("2027-03-31T00:00:00.000Z");
const PREVIOUS_YEAR_START = new Date("2025-04-01T00:00:00.000Z");
const PREVIOUS_YEAR_END = new Date("2026-03-31T00:00:00.000Z");
const ATTENDANCE_DATE_KEY = process.env.STUDENT_ATTENDANCE_QA_DATE ?? "";
if (!/^\d{4}-\d{2}-\d{2}$/.test(ATTENDANCE_DATE_KEY)) {
  throw new Error("STUDENT_ATTENDANCE_QA_DATE_REQUIRED");
}
const ATTENDANCE_DATE = new Date(`${ATTENDANCE_DATE_KEY}T00:00:00.000Z`);

type QaRole = "PRINCIPAL" | "TEACHER";

type SchoolFixture = {
  tenant: { id: string; name: string; slug: string };
  institution: { id: string; name: string };
  branches: Array<{ id: string; name: string; code: string }>;
  currentYear: { id: string; name: string };
  previousYear: { id: string; name: string } | null;
};

type AccountFixture = {
  userId: string;
  email: string;
  role: QaRole;
  branchId: string;
  displayName: string;
};

type ClassSectionFixture = {
  id: string;
  branchId: string;
  academicYearId: string;
  displayName: string;
  studentNames: string[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`QA_ASSERTION_FAILED:${message}`);
}

function assertDisposableTarget() {
  const rawUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!rawUrl) throw new Error("QA_DATABASE_URL_REQUIRED");
  const target = new URL(rawUrl);
  const database = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const localHost = ["127.0.0.1", "localhost", "::1"].includes(target.hostname.toLowerCase());
  if (
    !localHost ||
    database !== QA_DATABASE ||
    process.env.STUDENT_ATTENDANCE_QA_ISOLATED !== "true" ||
    process.env.STUDENT_ATTENDANCE_QA_DATABASE !== QA_DATABASE
  ) {
    throw new Error("REFUSING_NON_DISPOSABLE_STUDENT_ATTENDANCE_QA_TARGET");
  }
  return { host: target.hostname, port: target.port, database };
}

function requiredQaPassword() {
  const value = process.env.STUDENT_ATTENDANCE_QA_PASSWORD;
  if (!value || value.length < 16) throw new Error("STUDENT_ATTENDANCE_QA_PASSWORD_REQUIRED");
  return value;
}

async function createSchool(input: {
  name: string;
  slug: string;
  institutionName: string;
  institutionCode: string;
  branches: Array<{ name: string; code: string }>;
  includePreviousYear: boolean;
}): Promise<SchoolFixture> {
  const tenant = await db.tenant.create({
    data: { name: input.name, slug: input.slug, status: "ACTIVE", plan: "TRIAL" },
    select: { id: true, name: true, slug: true }
  });
  await db.tenantSettings.create({ data: { tenantId: tenant.id, timezone: "Asia/Kolkata" } });
  await seedDefaultRolesForTenant(db, tenant.id);

  const institution = await db.institution.create({
    data: {
      tenantId: tenant.id,
      name: input.institutionName,
      displayName: input.institutionName,
      code: input.institutionCode,
      status: "ACTIVE"
    },
    select: { id: true, name: true }
  });

  const branches: SchoolFixture["branches"] = [];
  for (const branchInput of input.branches) {
    const branch = await db.branch.create({
      data: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: branchInput.name,
        code: branchInput.code,
        status: "ACTIVE",
        timezone: "Asia/Kolkata"
      },
      select: { id: true, name: true, code: true }
    });
    await db.attendanceSetting.create({
      data: {
        tenantId: tenant.id,
        branchId: branch.id,
        studentAutoLockEnabled: false,
        sendStudentAbsentAlert: false,
        studentAttendanceWhatsAppEnabled: false
      }
    });
    branches.push(branch);
  }

  const currentYear = await db.academicYear.create({
    data: {
      tenantId: tenant.id,
      institutionId: institution.id,
      name: "2026-27",
      startDate: CURRENT_YEAR_START,
      endDate: CURRENT_YEAR_END,
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true, name: true }
  });
  const previousYear = input.includePreviousYear
    ? await db.academicYear.create({
      data: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: "2025-26",
        startDate: PREVIOUS_YEAR_START,
        endDate: PREVIOUS_YEAR_END,
        status: "ARCHIVED",
        isActive: false
      },
      select: { id: true, name: true }
    })
    : null;

  await db.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planCode: "QA",
      status: "ACTIVE",
      startsAt: CURRENT_YEAR_START,
      currentPeriodStartsAt: CURRENT_YEAR_START,
      currentPeriodEndsAt: CURRENT_YEAR_END
    }
  });
  await db.institutionEntitlement.createMany({
    data: ATTENDANCE_ENTITLEMENT_DEFINITIONS.map((definition) => ({
      tenantId: tenant.id,
      institutionId: institution.id,
      moduleKey: definition.moduleKey,
      featureKey: definition.featureKey,
      access: "FULL" as const,
      source: "MANUAL" as const,
      startsAt: CURRENT_YEAR_START,
      endsAt: CURRENT_YEAR_END
    }))
  });

  return { tenant, institution, branches, currentYear, previousYear };
}

async function createAccount(input: {
  school: SchoolFixture;
  branchId: string;
  role: QaRole;
  email: string;
  displayName: string;
  passwordHash: string;
}) {
  const user = await db.user.create({
    data: {
      tenantId: input.school.tenant.id,
      email: input.email,
      firstName: input.displayName.split(" ")[0] ?? input.displayName,
      displayName: input.displayName,
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date()
    },
    select: { id: true, email: true, displayName: true }
  });
  await db.passwordCredential.create({
    data: { userId: user.id, passwordHash: input.passwordHash, mustChange: false }
  });
  const role = await db.role.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: input.school.tenant.id, code: input.role } },
    select: { id: true }
  });
  await db.userRoleAssignment.create({
    data: {
      tenantId: input.school.tenant.id,
      userId: user.id,
      roleId: role.id,
      scopeType: input.role === "PRINCIPAL" ? "TENANT" : "BRANCH",
      scopeId: input.role === "PRINCIPAL" ? "TENANT" : input.branchId,
      isActive: true
    }
  });
  await db.userBranchAccess.create({
    data: {
      tenantId: input.school.tenant.id,
      userId: user.id,
      branchId: input.branchId,
      isPrimary: true,
      isActive: true,
      canAccessAllAcademicYears: true
    }
  });
  if (input.role === "TEACHER") {
    await db.staffProfile.create({
      data: {
        tenantId: input.school.tenant.id,
        branchId: input.branchId,
        userId: user.id,
        employeeCode: `QA-${randomUUID().slice(0, 8).toUpperCase()}`,
        firstName: input.displayName.split(" ")[0] ?? input.displayName,
        staffType: "TEACHER",
        designation: "Teacher",
        email: input.email,
        joiningDate: CURRENT_YEAR_START,
        employmentStatus: "ACTIVE"
      }
    });
  }
  return {
    userId: user.id,
    email: user.email,
    role: input.role,
    branchId: input.branchId,
    displayName: user.displayName ?? input.displayName
  } satisfies AccountFixture;
}

async function addBranchAccess(tenantId: string, userId: string, branchId: string) {
  await db.userBranchAccess.create({
    data: { tenantId, userId, branchId, isPrimary: false, isActive: true }
  });
}

async function createClassSectionWithStudents(input: {
  school: SchoolFixture;
  branchId: string;
  academicYearId: string;
  classCode: string;
  className: string;
  sectionCode: string;
  displayName: string;
  classTeacherUserId?: string;
  studentPrefix: string;
}): Promise<ClassSectionFixture> {
  const academicClass = await db.class.upsert({
    where: { tenantId_code: { tenantId: input.school.tenant.id, code: input.classCode } },
    create: { tenantId: input.school.tenant.id, code: input.classCode, name: input.className },
    update: {},
    select: { id: true }
  });
  const section = await db.section.upsert({
    where: { tenantId_code: { tenantId: input.school.tenant.id, code: input.sectionCode } },
    create: { tenantId: input.school.tenant.id, code: input.sectionCode, name: input.sectionCode },
    update: {},
    select: { id: true }
  });
  const classSection = await db.classSection.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      classId: academicClass.id,
      sectionId: section.id,
      classTeacherUserId: input.classTeacherUserId,
      displayName: input.displayName,
      status: "ACTIVE"
    },
    select: { id: true, branchId: true, academicYearId: true, displayName: true }
  });

  const studentNames: string[] = [];
  for (let index = 1; index <= 3; index += 1) {
    const displayName = `${input.studentPrefix} Student ${index}`;
    const student = await db.student.create({
      data: {
        tenantId: input.school.tenant.id,
        branchId: input.branchId,
        admissionNumber: `${input.studentPrefix.toUpperCase().replaceAll(" ", "-")}-${index}`,
        fullName: displayName,
        firstName: input.studentPrefix,
        lastName: `Student ${index}`,
        displayName,
        status: "ACTIVE",
        joinedAt: input.academicYearId === input.school.currentYear.id ? CURRENT_YEAR_START : PREVIOUS_YEAR_START
      },
      select: { id: true }
    });
    await db.enrollment.create({
      data: {
        tenantId: input.school.tenant.id,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        studentId: student.id,
        classSectionId: classSection.id,
        rollNumber: String(index).padStart(2, "0"),
        status: "ACTIVE",
        enrolledOn: input.academicYearId === input.school.currentYear.id ? CURRENT_YEAR_START : PREVIOUS_YEAR_START
      }
    });
    studentNames.push(displayName);
  }
  return { ...classSection, studentNames };
}

function contextFor(input: {
  school: SchoolFixture;
  account: AccountFixture;
  accessibleBranchIds: string[];
  activeAcademicYearId?: string;
}): TenantContext {
  const activeBranch = input.school.branches.find((branch) => branch.id === input.account.branchId);
  const academicYearId = input.activeAcademicYearId ?? input.school.currentYear.id;
  const academicYearName = input.school.previousYear?.id === academicYearId
    ? input.school.previousYear.name
    : input.school.currentYear.name;
  return {
    tenantId: input.school.tenant.id,
    tenantName: input.school.tenant.name,
    tenantSlug: input.school.tenant.slug,
    userId: input.account.userId,
    userEmail: input.account.email,
    userName: input.account.displayName,
    userType: "STAFF",
    activeBranchId: input.account.branchId,
    activeBranchName: activeBranch?.name ?? null,
    activeBranchCode: activeBranch?.code ?? null,
    timeZone: "Asia/Kolkata",
    accessibleBranchIds: input.accessibleBranchIds,
    activeAcademicYearId: academicYearId,
    activeAcademicYearName: academicYearName,
    institutionId: input.school.institution.id,
    institutionName: input.school.institution.name,
    institutionDisplayName: input.school.institution.name,
    roleCodes: [input.account.role],
    roleLabels: [input.account.role],
    passwordChangeRequired: false,
    ipAddress: "127.0.0.1",
    userAgent: "JinaCampus student attendance isolated QA",
    correlationId: randomUUID()
  };
}

async function expectError(label: string, expected: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expected), `${label} returned ${message} instead of ${expected}`);
    return { label, result: "PASS", expected };
  }
  throw new Error(`QA_ASSERTION_FAILED:${label} unexpectedly succeeded`);
}

async function main() {
  const target = assertDisposableTarget();
  const qaPassword = requiredQaPassword();
  const existingQaTenants = await db.tenant.count({
    where: { slug: { in: [PRIMARY_TENANT_SLUG, OTHER_TENANT_SLUG] } }
  });
  assert(existingQaTenants === 0, "synthetic QA tenant slugs already exist");

  await seedPermissions(db);
  const passwordHash = await hashPassword(qaPassword);
  const primarySchool = await createSchool({
    name: "Synthetic Student Attendance School",
    slug: PRIMARY_TENANT_SLUG,
    institutionName: "Synthetic Student Attendance Institution",
    institutionCode: "SSAI",
    branches: [
      { name: "Main QA Branch", code: "MAIN" },
      { name: "North QA Branch", code: "NORTH" }
    ],
    includePreviousYear: true
  });
  const otherSchool = await createSchool({
    name: "Independent Student Attendance School",
    slug: OTHER_TENANT_SLUG,
    institutionName: "Independent Student Attendance Institution",
    institutionCode: "ISAI",
    branches: [{ name: "Independent QA Branch", code: "ONLY" }],
    includePreviousYear: false
  });
  const [mainBranch, northBranch] = primarySchool.branches;
  const otherBranch = otherSchool.branches[0];
  assert(mainBranch && northBranch && otherBranch && primarySchool.previousYear, "required QA scopes missing");

  const principal = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "PRINCIPAL",
    email: "principal@student-attendance-qa.test",
    displayName: "Principal QA",
    passwordHash
  });
  await addBranchAccess(primarySchool.tenant.id, principal.userId, northBranch.id);
  const assignedTeacher = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "TEACHER",
    email: "assigned.teacher@student-attendance-qa.test",
    displayName: "Assigned Teacher QA",
    passwordHash
  });
  const unassignedTeacher = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "TEACHER",
    email: "unassigned.teacher@student-attendance-qa.test",
    displayName: "Unassigned Teacher QA",
    passwordHash
  });
  const northTeacher = await createAccount({
    school: primarySchool,
    branchId: northBranch.id,
    role: "TEACHER",
    email: "north.teacher@student-attendance-qa.test",
    displayName: "North Teacher QA",
    passwordHash
  });
  const otherPrincipal = await createAccount({
    school: otherSchool,
    branchId: otherBranch.id,
    role: "PRINCIPAL",
    email: "principal@student-attendance-qa-other.test",
    displayName: "Other Principal QA",
    passwordHash
  });

  const assignedClass = await createClassSectionWithStudents({
    school: primarySchool,
    branchId: mainBranch.id,
    academicYearId: primarySchool.currentYear.id,
    classCode: "GRADE-1",
    className: "Grade 1",
    sectionCode: "A",
    displayName: "Grade 1 - A",
    classTeacherUserId: assignedTeacher.userId,
    studentPrefix: "Assigned"
  });
  const principalClass = await createClassSectionWithStudents({
    school: primarySchool,
    branchId: mainBranch.id,
    academicYearId: primarySchool.currentYear.id,
    classCode: "GRADE-2",
    className: "Grade 2",
    sectionCode: "A",
    displayName: "Grade 2 - A",
    studentPrefix: "Principal"
  });
  const northClass = await createClassSectionWithStudents({
    school: primarySchool,
    branchId: northBranch.id,
    academicYearId: primarySchool.currentYear.id,
    classCode: "GRADE-3",
    className: "Grade 3",
    sectionCode: "A",
    displayName: "Grade 3 - A",
    classTeacherUserId: northTeacher.userId,
    studentPrefix: "North"
  });
  const previousYearClass = await createClassSectionWithStudents({
    school: primarySchool,
    branchId: mainBranch.id,
    academicYearId: primarySchool.previousYear.id,
    classCode: "GRADE-1",
    className: "Grade 1",
    sectionCode: "B",
    displayName: "Grade 1 - B (Previous Year)",
    classTeacherUserId: assignedTeacher.userId,
    studentPrefix: "Previous"
  });
  const otherClass = await createClassSectionWithStudents({
    school: otherSchool,
    branchId: otherBranch.id,
    academicYearId: otherSchool.currentYear.id,
    classCode: "GRADE-1",
    className: "Grade 1",
    sectionCode: "A",
    displayName: "Independent Grade 1 - A",
    studentPrefix: "Independent"
  });

  const principalCtx = contextFor({
    school: primarySchool,
    account: principal,
    accessibleBranchIds: [mainBranch.id, northBranch.id]
  });
  const assignedTeacherCtx = contextFor({
    school: primarySchool,
    account: assignedTeacher,
    accessibleBranchIds: [mainBranch.id]
  });
  const unassignedTeacherCtx = contextFor({
    school: primarySchool,
    account: unassignedTeacher,
    accessibleBranchIds: [mainBranch.id]
  });
  const otherPrincipalCtx = contextFor({
    school: otherSchool,
    account: otherPrincipal,
    accessibleBranchIds: [otherBranch.id]
  });

  const principalSession = await prepareStudentAttendanceSession(principalCtx, {
    classSectionId: principalClass.id,
    attendanceDate: ATTENDANCE_DATE,
    sessionType: "FULL_DAY",
    delegationReason: "Principal opened attendance because no Class Teacher is assigned."
  });
  const teacherSession = await prepareStudentAttendanceSession(assignedTeacherCtx, {
    classSectionId: assignedClass.id,
    attendanceDate: ATTENDANCE_DATE,
    sessionType: "FULL_DAY"
  });
  const otherTenantSession = await prepareStudentAttendanceSession(otherPrincipalCtx, {
    classSectionId: otherClass.id,
    attendanceDate: ATTENDANCE_DATE,
    sessionType: "FULL_DAY",
    delegationReason: "Principal opened attendance because no Class Teacher is assigned."
  });
  assert(principalSession.entries.length === 3, "Principal roster must contain three students");
  assert(teacherSession.entries.length === 3, "assigned Teacher roster must contain three students");
  assert(otherTenantSession.entries.length === 3, "other tenant roster must contain three students");

  const denials = [
    await expectError("unassigned Teacher", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
      prepareStudentAttendanceSession(unassignedTeacherCtx, {
        classSectionId: assignedClass.id,
        attendanceDate: ATTENDANCE_DATE,
        sessionType: "FULL_DAY"
      })
    ),
    await expectError("cross-branch", "CLASS_SECTION_NOT_FOUND", () =>
      prepareStudentAttendanceSession(assignedTeacherCtx, {
        classSectionId: northClass.id,
        attendanceDate: ATTENDANCE_DATE,
        sessionType: "FULL_DAY"
      })
    ),
    await expectError("cross-year", "CLASS_SECTION_NOT_FOUND", () =>
      prepareStudentAttendanceSession(assignedTeacherCtx, {
        classSectionId: previousYearClass.id,
        attendanceDate: ATTENDANCE_DATE,
        sessionType: "FULL_DAY"
      })
    ),
    await expectError("cross-tenant", "CLASS_SECTION_NOT_FOUND", () =>
      prepareStudentAttendanceSession(assignedTeacherCtx, {
        classSectionId: otherClass.id,
        attendanceDate: ATTENDANCE_DATE,
        sessionType: "FULL_DAY"
      })
    )
  ];

  const sessionCounts = await db.studentAttendanceSession.groupBy({
    by: ["tenantId"],
    _count: { _all: true }
  });
  assert(sessionCounts.find((row) => row.tenantId === primarySchool.tenant.id)?._count._all === 2,
    "negative scope tests must not create primary-tenant sessions");
  assert(sessionCounts.find((row) => row.tenantId === otherSchool.tenant.id)?._count._all === 1,
    "other tenant must retain exactly one independent session");

  const evidence = {
    generatedAt: new Date().toISOString(),
    target,
    attendanceDate: ATTENDANCE_DATE_KEY,
    primary: {
      tenantId: primarySchool.tenant.id,
      tenantSlug: primarySchool.tenant.slug,
      institutionId: primarySchool.institution.id,
      branchIds: { main: mainBranch.id, north: northBranch.id },
      academicYearIds: { current: primarySchool.currentYear.id, previous: primarySchool.previousYear.id },
      users: {
        principal: { email: principal.email, role: principal.role, displayName: principal.displayName },
        assignedTeacher: { email: assignedTeacher.email, role: assignedTeacher.role, displayName: assignedTeacher.displayName },
        unassignedTeacher: { email: unassignedTeacher.email, role: unassignedTeacher.role, displayName: unassignedTeacher.displayName }
      },
      classSections: { assignedClass, principalClass, northClass, previousYearClass },
      sessionIds: { principal: principalSession.sessionId, assignedTeacher: teacherSession.sessionId }
    },
    other: {
      tenantId: otherSchool.tenant.id,
      tenantSlug: otherSchool.tenant.slug,
      branchId: otherBranch.id,
      academicYearId: otherSchool.currentYear.id,
      principal: { email: otherPrincipal.email, role: otherPrincipal.role, displayName: otherPrincipal.displayName },
      classSection: otherClass,
      sessionId: otherTenantSession.sessionId
    },
    checks: {
      principalSession: "PASS",
      assignedTeacherSession: "PASS",
      independentTenantSession: "PASS",
      denials
    }
  };
  await mkdir(resolve(process.cwd(), ".tmp"), { recursive: true });
  await writeFile(
    resolve(process.cwd(), ".tmp/student-attendance-qa-fixture.json"),
    JSON.stringify(evidence, null, 2),
    "utf8"
  );
  console.log(JSON.stringify({
    ok: true,
    target,
    roles: ["PRINCIPAL", "ASSIGNED_TEACHER", "UNASSIGNED_TEACHER"],
    checks: {
      migrationFixture: "PASS",
      principal: "PASS",
      assignedTeacher: "PASS",
      unassignedTeacher: "PASS",
      crossBranch: "PASS",
      crossYear: "PASS",
      crossTenant: "PASS"
    },
    evidenceFile: ".tmp/student-attendance-qa-fixture.json"
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "STUDENT_ATTENDANCE_QA_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
