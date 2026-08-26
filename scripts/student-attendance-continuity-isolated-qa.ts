import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { EmploymentStatus } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { listClassSectionsForAttendance } from "@/modules/academia/queries/student-attendance.queries";
import {
  acknowledgeStudentAttendanceDuty,
  createStudentAttendanceDutyAssignment,
  declineStudentAttendanceDuty,
  expireStaleStudentAttendanceDuties,
  listStudentAttendanceCoverage,
  revokeStudentAttendanceDuty
} from "@/modules/academia/services/student-attendance-duty.service";
import { fullDayDutyWindow } from "@/modules/academia/services/student-attendance-duty.shared";
import {
  completeStudentAttendanceSession,
  markRemainingStudentsPresent,
  mutateStudentAttendanceEntry,
  prepareStudentAttendanceSession
} from "@/modules/academia/services/student-attendance-session.service";

const QA_DATABASE = "jinacampus_attendance_qa";
const FIXTURE_PATH = resolve(process.cwd(), ".tmp/student-attendance-qa-fixture.json");
const EVIDENCE_PATH = resolve(process.cwd(), ".tmp/student-attendance-continuity-qa-evidence.json");
const CURRENT_YEAR_START = new Date("2026-04-01T00:00:00.000Z");

type QaRole = "PRINCIPAL" | "OFFICE_STAFF" | "TEACHER";

type AccountFixture = {
  userId: string;
  email: string;
  role: QaRole;
  branchId: string;
  displayName: string;
};

type SchoolFixture = {
  tenant: { id: string; name: string; slug: string };
  institution: { id: string; name: string };
  branches: Array<{ id: string; name: string; code: string }>;
  currentYear: { id: string; name: string };
  previousYear: { id: string; name: string } | null;
};

type ClassSectionFixture = {
  id: string;
  branchId: string;
  academicYearId: string;
  displayName: string;
  studentNames: string[];
};

type BaselineFixture = {
  attendanceDate: string;
  primary: {
    tenantId: string;
    tenantSlug: string;
    institutionId: string;
    branchIds: { main: string; north: string };
    academicYearIds: { current: string; previous: string };
    users: {
      principal: { email: string; role: "PRINCIPAL"; displayName: string };
      assignedTeacher: { email: string; role: "TEACHER"; displayName: string };
      unassignedTeacher: { email: string; role: "TEACHER"; displayName: string };
    };
    classSections: {
      assignedClass: ClassSectionFixture;
      principalClass: ClassSectionFixture;
      northClass: ClassSectionFixture;
      previousYearClass: ClassSectionFixture;
    };
    sessionIds: { principal: string; assignedTeacher: string };
  };
  other: {
    tenantId: string;
    tenantSlug: string;
    branchId: string;
    academicYearId: string;
    principal: { email: string; role: "PRINCIPAL"; displayName: string };
    classSection: ClassSectionFixture;
    sessionId: string;
  };
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

async function expectError(label: string, expected: string, operation: () => Promise<unknown>) {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(message.includes(expected), `${label} returned ${message} instead of ${expected}`);
    return { label, result: "PASS" as const, expected };
  }
  throw new Error(`QA_ASSERTION_FAILED:${label} unexpectedly succeeded`);
}

async function loadSchool(fixture: BaselineFixture): Promise<SchoolFixture> {
  const [tenant, institution, branches, currentYear, previousYear] = await Promise.all([
    db.tenant.findUniqueOrThrow({
      where: { id: fixture.primary.tenantId },
      select: { id: true, name: true, slug: true }
    }),
    db.institution.findFirstOrThrow({
      where: { id: fixture.primary.institutionId, tenantId: fixture.primary.tenantId },
      select: { id: true, name: true }
    }),
    db.branch.findMany({
      where: {
        tenantId: fixture.primary.tenantId,
        id: { in: [fixture.primary.branchIds.main, fixture.primary.branchIds.north] }
      },
      select: { id: true, name: true, code: true }
    }),
    db.academicYear.findFirstOrThrow({
      where: { id: fixture.primary.academicYearIds.current, tenantId: fixture.primary.tenantId },
      select: { id: true, name: true }
    }),
    db.academicYear.findFirst({
      where: { id: fixture.primary.academicYearIds.previous, tenantId: fixture.primary.tenantId },
      select: { id: true, name: true }
    })
  ]);
  return { tenant, institution, branches, currentYear, previousYear };
}

async function loadAccount(input: {
  tenantId: string;
  branchId: string;
  email: string;
  role: QaRole;
}): Promise<AccountFixture> {
  const user = await db.user.findFirstOrThrow({
    where: { tenantId: input.tenantId, email: input.email },
    select: { id: true, email: true, displayName: true }
  });
  return {
    userId: user.id,
    email: user.email,
    role: input.role,
    branchId: input.branchId,
    displayName: user.displayName ?? input.email
  };
}

async function createAccount(input: {
  school: SchoolFixture;
  branchId: string;
  role: "OFFICE_STAFF" | "TEACHER";
  email: string;
  displayName: string;
  employeeCode: string;
  employmentStatus?: EmploymentStatus;
  passwordHash: string;
}): Promise<AccountFixture> {
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
      scopeType: "BRANCH",
      scopeId: input.branchId,
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
  await db.staffProfile.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      userId: user.id,
      employeeCode: input.employeeCode,
      firstName: input.displayName.split(" ")[0] ?? input.displayName,
      staffType: input.role === "TEACHER" ? "TEACHER" : "ADMIN",
      designation: input.role === "TEACHER" ? "Teacher" : "Attendance Operator",
      email: input.email,
      joiningDate: CURRENT_YEAR_START,
      employmentStatus: input.employmentStatus ?? "ACTIVE"
    }
  });
  return {
    userId: user.id,
    email: user.email,
    role: input.role,
    branchId: input.branchId,
    displayName: user.displayName ?? input.displayName
  };
}

async function createClassSection(input: {
  school: SchoolFixture;
  branchId: string;
  academicYearId: string;
  classCode: string;
  displayName: string;
  studentPrefix: string;
  studentCount?: number;
}): Promise<ClassSectionFixture> {
  const academicClass = await db.class.create({
    data: {
      tenantId: input.school.tenant.id,
      code: input.classCode,
      name: input.displayName.replace(/ - A$/, "")
    },
    select: { id: true }
  });
  const section = await db.section.findUniqueOrThrow({
    where: { tenantId_code: { tenantId: input.school.tenant.id, code: "A" } },
    select: { id: true }
  });
  const classSection = await db.classSection.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      classId: academicClass.id,
      sectionId: section.id,
      displayName: input.displayName,
      status: "ACTIVE"
    },
    select: { id: true, branchId: true, academicYearId: true, displayName: true }
  });
  const studentNames: string[] = [];
  for (let index = 1; index <= (input.studentCount ?? 0); index += 1) {
    const displayName = `${input.studentPrefix} Student ${index}`;
    const student = await db.student.create({
      data: {
        tenantId: input.school.tenant.id,
        branchId: input.branchId,
        admissionNumber: `${input.classCode}-${index}`,
        fullName: displayName,
        firstName: input.studentPrefix,
        lastName: `Student ${index}`,
        displayName,
        status: "ACTIVE",
        joinedAt: CURRENT_YEAR_START
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
        enrolledOn: CURRENT_YEAR_START
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
    userAgent: "JinaCampus student attendance continuity isolated QA",
    correlationId: randomUUID()
  };
}

function dutyInput(input: {
  classSectionId: string;
  assignedUserId: string;
  assignmentType: "SUBSTITUTE_TEACHER" | "ATTENDANCE_OPERATOR";
  attendanceDate: Date;
  reasonText: string;
  replaceExisting?: boolean;
  startsAt?: Date;
  expiresAt?: Date;
}) {
  return {
    classSectionId: input.classSectionId,
    assignedUserId: input.assignedUserId,
    attendanceDate: input.attendanceDate,
    sessionType: "FULL_DAY" as const,
    assignmentType: input.assignmentType,
    reasonCode: input.assignmentType === "ATTENDANCE_OPERATOR"
      ? "BRANCH_ATTENDANCE_OPERATOR"
      : "CLASS_TEACHER_UNAVAILABLE",
    reasonText: input.reasonText,
    sourceType: "MANUAL" as const,
    replaceExisting: input.replaceExisting ?? false,
    ...(input.startsAt && input.expiresAt
      ? { startsAt: input.startsAt, expiresAt: input.expiresAt }
      : {})
  };
}

async function main() {
  const target = assertDisposableTarget();
  const qaPassword = requiredQaPassword();
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as BaselineFixture;
  const school = await loadSchool(fixture);
  const mainBranch = school.branches.find((branch) => branch.id === fixture.primary.branchIds.main);
  const northBranch = school.branches.find((branch) => branch.id === fixture.primary.branchIds.north);
  assert(mainBranch && northBranch && school.previousYear, "required synthetic scopes are missing");

  const attendanceDate = new Date(`${fixture.attendanceDate}T00:00:00.000Z`);
  const dutyWindow = fullDayDutyWindow(attendanceDate, "Asia/Kolkata");
  assert(
    dutyWindow.startsAt <= new Date() && dutyWindow.expiresAt.getTime() - Date.now() > 10 * 60 * 1000,
    "QA must run during the synthetic school day with at least ten minutes remaining"
  );

  const passwordHash = await hashPassword(qaPassword);
  const [principal, assignedTeacher, unassignedTeacher, northTeacher] = await Promise.all([
    loadAccount({
      tenantId: school.tenant.id,
      branchId: mainBranch.id,
      email: fixture.primary.users.principal.email,
      role: "PRINCIPAL"
    }),
    loadAccount({
      tenantId: school.tenant.id,
      branchId: mainBranch.id,
      email: fixture.primary.users.assignedTeacher.email,
      role: "TEACHER"
    }),
    loadAccount({
      tenantId: school.tenant.id,
      branchId: mainBranch.id,
      email: fixture.primary.users.unassignedTeacher.email,
      role: "TEACHER"
    }),
    loadAccount({
      tenantId: school.tenant.id,
      branchId: northBranch.id,
      email: "north.teacher@student-attendance-qa.test",
      role: "TEACHER"
    })
  ]);

  const [substitute, office, inactiveTeacher] = await Promise.all([
    createAccount({
      school,
      branchId: mainBranch.id,
      role: "TEACHER",
      email: "substitute.teacher@student-attendance-qa.test",
      displayName: "Substitute Teacher QA",
      employeeCode: "CONT-T-001",
      passwordHash
    }),
    createAccount({
      school,
      branchId: mainBranch.id,
      role: "OFFICE_STAFF",
      email: "attendance.operator@student-attendance-qa.test",
      displayName: "Attendance Operator QA",
      employeeCode: "CONT-O-001",
      passwordHash
    }),
    createAccount({
      school,
      branchId: mainBranch.id,
      role: "TEACHER",
      email: "inactive.teacher@student-attendance-qa.test",
      displayName: "Inactive Teacher QA",
      employeeCode: "CONT-T-002",
      employmentStatus: "INACTIVE",
      passwordHash
    })
  ]);

  const [declineClass, replacementClass, expiryClass, concurrencyClass, browserPendingClass, browserOperatorClass] =
    await Promise.all([
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-DECLINE",
        displayName: "Continuity Decline - A",
        studentPrefix: "Decline"
      }),
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-REPLACE",
        displayName: "Continuity Replace - A",
        studentPrefix: "Replace"
      }),
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-EXPIRE",
        displayName: "Continuity Expiry - A",
        studentPrefix: "Expiry"
      }),
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-CONCURRENT",
        displayName: "Continuity Concurrent - A",
        studentPrefix: "Concurrent"
      }),
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-BROWSER-PENDING",
        displayName: "Continuity Browser Pending - A",
        studentPrefix: "Browser Pending",
        studentCount: 3
      }),
      createClassSection({
        school,
        branchId: mainBranch.id,
        academicYearId: school.currentYear.id,
        classCode: "CONT-BROWSER-OPERATOR",
        displayName: "Continuity Browser Operator - A",
        studentPrefix: "Browser Operator",
        studentCount: 3
      })
    ]);

  const principalCtx = contextFor({
    school,
    account: principal,
    accessibleBranchIds: [mainBranch.id, northBranch.id]
  });
  const assignedTeacherCtx = contextFor({ school, account: assignedTeacher, accessibleBranchIds: [mainBranch.id] });
  const unassignedTeacherCtx = contextFor({ school, account: unassignedTeacher, accessibleBranchIds: [mainBranch.id] });
  const substituteCtx = contextFor({ school, account: substitute, accessibleBranchIds: [mainBranch.id] });
  const officeCtx = contextFor({ school, account: office, accessibleBranchIds: [mainBranch.id] });

  const checks: Array<{ label: string; result: "PASS"; detail: string }> = [];
  const pass = (label: string, detail: string) => checks.push({ label, result: "PASS", detail });

  const classTeacherSession = await prepareStudentAttendanceSession(assignedTeacherCtx, {
    classSectionId: fixture.primary.classSections.assignedClass.id,
    attendanceDate,
    sessionType: "FULL_DAY"
  });
  assert(classTeacherSession.sessionId === fixture.primary.sessionIds.assignedTeacher, "Class Teacher must reuse the seeded session");
  assert(classTeacherSession.responsibilitySource === "CLASS_TEACHER", "Class Teacher responsibility source is incorrect");
  pass("class-teacher-session", "Class Teacher reused the existing official session.");

  const principalSession = await prepareStudentAttendanceSession(principalCtx, {
    classSectionId: fixture.primary.classSections.principalClass.id,
    attendanceDate,
    sessionType: "FULL_DAY",
    delegationReason: "Principal takeover retained for isolated continuity verification."
  });
  assert(principalSession.sessionId === fixture.primary.sessionIds.principal, "Principal must reuse the seeded session");
  assert(principalSession.responsibilitySource === "PRINCIPAL_OVERRIDE", "Principal override source is incorrect");
  pass("principal-override", "Reason-controlled Principal takeover reused the existing official session.");

  const substituteDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: fixture.primary.classSections.assignedClass.id,
    assignedUserId: substitute.userId,
    assignmentType: "SUBSTITUTE_TEACHER",
    attendanceDate,
    reasonText: "The Class Teacher is unavailable for the attendance window."
  }));
  await expectError("pending duty roster", "ATTENDANCE_DUTY_ACKNOWLEDGEMENT_REQUIRED", () =>
    prepareStudentAttendanceSession(substituteCtx, {
      classSectionId: fixture.primary.classSections.assignedClass.id,
      attendanceDate,
      sessionType: "FULL_DAY"
    })
  );
  const pendingOptions = await listClassSectionsForAttendance(substituteCtx, attendanceDate);
  assert(!pendingOptions.some((item) => item.id === fixture.primary.classSections.assignedClass.id), "Pending duty exposed the roster selector");
  await acknowledgeStudentAttendanceDuty(substituteCtx, { assignmentId: substituteDuty.id });
  const acknowledgedOptions = await listClassSectionsForAttendance(substituteCtx, attendanceDate);
  assert(acknowledgedOptions.some((item) => item.id === fixture.primary.classSections.assignedClass.id), "Acknowledged duty did not expose the assigned class");
  assert(!acknowledgedOptions.some((item) => item.id === fixture.primary.classSections.principalClass.id), "Delegate saw an unrelated class");
  pass("acknowledgement-gate", "Pending duty was blocked; acknowledgement exposed only the assigned class.");

  const delegatedSession = await prepareStudentAttendanceSession(substituteCtx, {
    classSectionId: fixture.primary.classSections.assignedClass.id,
    attendanceDate,
    sessionType: "FULL_DAY"
  });
  assert(delegatedSession.sessionId === classTeacherSession.sessionId, "Delegate created a duplicate session");
  assert(delegatedSession.responsibilitySource === "DUTY_ASSIGNMENT", "Delegate source was not stored");
  const firstEntry = delegatedSession.entries[0];
  assert(firstEntry, "Delegated roster is empty");
  const concurrentMutations = await Promise.allSettled([
    mutateStudentAttendanceEntry(substituteCtx, {
      sessionId: delegatedSession.sessionId,
      entryId: firstEntry.entryId,
      status: "ABSENT",
      clientMutationId: randomUUID(),
      baseRecordVersion: firstEntry.recordVersion
    }),
    mutateStudentAttendanceEntry(substituteCtx, {
      sessionId: delegatedSession.sessionId,
      entryId: firstEntry.entryId,
      status: "LEAVE",
      clientMutationId: randomUUID(),
      baseRecordVersion: firstEntry.recordVersion
    })
  ]);
  const mutationSuccesses = concurrentMutations.filter((result) => result.status === "fulfilled");
  const mutationFailures = concurrentMutations.filter((result) => result.status === "rejected");
  assert(mutationSuccesses.length === 1 && mutationFailures.length === 1, "Concurrent entry writes were not safely serialized");
  const mutationFailureMessage = mutationFailures[0]?.status === "rejected"
    ? mutationFailures[0].reason instanceof Error
      ? mutationFailures[0].reason.message
      : String(mutationFailures[0].reason)
    : "";
  assert(mutationFailureMessage.includes("STUDENT_ATTENDANCE_VERSION_CONFLICT"), "Concurrent write did not return a safe version conflict");
  pass("concurrent-entry-write", "Exactly one concurrent write succeeded; the stale write returned a version conflict.");

  const delegatedAfterConflict = await prepareStudentAttendanceSession(substituteCtx, {
    classSectionId: fixture.primary.classSections.assignedClass.id,
    attendanceDate,
    sessionType: "FULL_DAY"
  });
  const bulkResult = await markRemainingStudentsPresent(substituteCtx, {
    sessionId: delegatedAfterConflict.sessionId,
    clientMutationId: randomUUID(),
    baseSessionVersion: delegatedAfterConflict.sessionVersion
  });
  const completedSession = await completeStudentAttendanceSession(substituteCtx, {
    sessionId: bulkResult.session.sessionId,
    expectedSessionVersion: bulkResult.session.sessionVersion
  });
  assert(completedSession.state === "COMPLETED", "Delegated attendance did not complete");
  const completedDuty = await db.studentAttendanceDutyAssignment.findUniqueOrThrow({
    where: { id: substituteDuty.id },
    select: { status: true, assignedUserId: true, sessionId: true }
  });
  assert(completedDuty.status === "COMPLETED", "Delegated duty was not completed with the session");
  assert(completedDuty.assignedUserId === substitute.userId && completedDuty.sessionId === completedSession.sessionId, "Completed duty lost responsibility linkage");
  await expectError("completed duty reuse", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
    prepareStudentAttendanceSession(substituteCtx, {
      classSectionId: fixture.primary.classSections.assignedClass.id,
      attendanceDate,
      sessionType: "FULL_DAY"
    })
  );
  pass("delegated-completion", "Completion closed delegated access and preserved the responsible user and session link.");

  const operatorDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: fixture.primary.classSections.principalClass.id,
    assignedUserId: office.userId,
    assignmentType: "ATTENDANCE_OPERATOR",
    attendanceDate,
    reasonText: "The branch attendance operator will complete this unassigned class register."
  }));
  await acknowledgeStudentAttendanceDuty(officeCtx, { assignmentId: operatorDuty.id });
  const operatorSession = await prepareStudentAttendanceSession(officeCtx, {
    classSectionId: fixture.primary.classSections.principalClass.id,
    attendanceDate,
    sessionType: "FULL_DAY"
  });
  assert(operatorSession.sessionId === principalSession.sessionId, "Attendance operator created a duplicate session");
  assert(operatorSession.responsibilitySource === "ATTENDANCE_OPERATOR", "Attendance operator source was not stored");
  pass("attendance-operator", "Office Staff operator reused the Principal-created official session.");

  const declineDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: declineClass.id,
    assignedUserId: substitute.userId,
    assignmentType: "SUBSTITUTE_TEACHER",
    attendanceDate,
    reasonText: "Synthetic decline lifecycle coverage is required."
  }));
  await expectError("other user decline", "ATTENDANCE_DUTY_NOT_FOUND", () =>
    declineStudentAttendanceDuty(unassignedTeacherCtx, {
      assignmentId: declineDuty.id,
      reason: "This duty is assigned to another Teacher."
    })
  );
  await declineStudentAttendanceDuty(substituteCtx, {
    assignmentId: declineDuty.id,
    reason: "Another Teacher is required for this class."
  });
  await expectError("declined duty reuse", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
    prepareStudentAttendanceSession(substituteCtx, {
      classSectionId: declineClass.id,
      attendanceDate,
      sessionType: "FULL_DAY"
    })
  );
  pass("decline-lifecycle", "Only the assignee could decline, and declined duty could not be reused.");

  const originalReplacementDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: replacementClass.id,
    assignedUserId: substitute.userId,
    assignmentType: "SUBSTITUTE_TEACHER",
    attendanceDate,
    reasonText: "Initial synthetic replacement assignment."
  }));
  const replacementDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: replacementClass.id,
    assignedUserId: office.userId,
    assignmentType: "ATTENDANCE_OPERATOR",
    attendanceDate,
    reasonText: "Coverage changed to the branch attendance operator.",
    replaceExisting: true
  }));
  const replacedStatus = await db.studentAttendanceDutyAssignment.findUniqueOrThrow({
    where: { id: originalReplacementDuty.id },
    select: { status: true }
  });
  assert(replacedStatus.status === "REVOKED", "Replacement did not revoke the previous duty");
  await expectError("replaced assignee acknowledgement", "ATTENDANCE_DUTY_NOT_FOUND", () =>
    acknowledgeStudentAttendanceDuty(substituteCtx, { assignmentId: replacementDuty.id })
  );
  await revokeStudentAttendanceDuty(principalCtx, {
    assignmentId: replacementDuty.id,
    reason: "Synthetic revocation verifies immediate access removal."
  });
  await expectError("revoked operator duty reuse", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
    prepareStudentAttendanceSession(officeCtx, {
      classSectionId: replacementClass.id,
      attendanceDate,
      sessionType: "FULL_DAY"
    })
  );
  pass("replace-and-revoke", "Replacement revoked the prior duty and explicit revocation removed access.");

  const syntheticNow = new Date();
  const expiryDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: expiryClass.id,
    assignedUserId: substitute.userId,
    assignmentType: "SUBSTITUTE_TEACHER",
    attendanceDate,
    reasonText: "Synthetic bounded duty expiry verification.",
    startsAt: new Date(syntheticNow.getTime() - 60_000),
    expiresAt: new Date(syntheticNow.getTime() + 60_000)
  }));
  await acknowledgeStudentAttendanceDuty(substituteCtx, { assignmentId: expiryDuty.id });
  const expiredCount = await expireStaleStudentAttendanceDuties(principalCtx, new Date(syntheticNow.getTime() + 120_000));
  assert(expiredCount >= 1, "Stale duty expiration did not update the bounded assignment");
  await expectError("expired duty reuse", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
    prepareStudentAttendanceSession(substituteCtx, {
      classSectionId: expiryClass.id,
      attendanceDate,
      sessionType: "FULL_DAY"
    })
  );
  pass("expiry-lifecycle", "Expired duty was audited and could not reopen the roster.");

  const concurrentAssignments = await Promise.allSettled([
    createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
      classSectionId: concurrencyClass.id,
      assignedUserId: substitute.userId,
      assignmentType: "SUBSTITUTE_TEACHER",
      attendanceDate,
      reasonText: "Concurrent substitute assignment candidate."
    })),
    createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
      classSectionId: concurrencyClass.id,
      assignedUserId: office.userId,
      assignmentType: "ATTENDANCE_OPERATOR",
      attendanceDate,
      reasonText: "Concurrent attendance operator assignment candidate."
    }))
  ]);
  const assignmentSuccesses = concurrentAssignments.filter((result) => result.status === "fulfilled");
  const assignmentFailures = concurrentAssignments.filter((result) => result.status === "rejected");
  assert(assignmentSuccesses.length === 1 && assignmentFailures.length === 1, "Concurrent duty assignment created an unsafe result");
  const assignmentFailureMessage = assignmentFailures[0]?.status === "rejected"
    ? assignmentFailures[0].reason instanceof Error
      ? assignmentFailures[0].reason.message
      : String(assignmentFailures[0].reason)
    : "";
  assert(assignmentFailureMessage.includes("ATTENDANCE_DUTY_ALREADY_ASSIGNED"), "Concurrent duty assignment did not return a safe conflict");
  const concurrentWinner = assignmentSuccesses[0]?.status === "fulfilled" ? assignmentSuccesses[0].value : null;
  assert(concurrentWinner, "Concurrent duty winner is missing");
  await revokeStudentAttendanceDuty(principalCtx, {
    assignmentId: concurrentWinner.id,
    reason: "Synthetic concurrency fixture cleanup."
  });
  pass("concurrent-duty-assignment", "Exactly one live duty was created for the class/date scope.");

  const denials = [
    await expectError("unassigned Teacher", "ATTENDANCE_RESPONSIBILITY_REQUIRED", () =>
      prepareStudentAttendanceSession(unassignedTeacherCtx, {
        classSectionId: fixture.primary.classSections.assignedClass.id,
        attendanceDate,
        sessionType: "FULL_DAY"
      })
    ),
    await expectError("Teacher coverage management", "FORBIDDEN_PERMISSION:academia.attendance.coverage.manage", () =>
      createStudentAttendanceDutyAssignment(assignedTeacherCtx, dutyInput({
        classSectionId: declineClass.id,
        assignedUserId: substitute.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "Teacher must not manage attendance coverage."
      }))
    ),
    await expectError("inactive staff", "ATTENDANCE_DUTY_STAFF_PROFILE_REQUIRED", () =>
      createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
        classSectionId: declineClass.id,
        assignedUserId: inactiveTeacher.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "Inactive staff must not receive attendance duty."
      }))
    ),
    await expectError("wrong-branch candidate", "ATTENDANCE_DUTY_USER_NOT_ELIGIBLE", () =>
      createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
        classSectionId: declineClass.id,
        assignedUserId: northTeacher.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "North Branch staff must not receive Main Branch duty."
      }))
    ),
    await expectError("cross-branch class", "CLASS_SECTION_NOT_FOUND", () =>
      createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
        classSectionId: fixture.primary.classSections.northClass.id,
        assignedUserId: substitute.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "Cross-branch class access must be denied."
      }))
    ),
    await expectError("cross-year class", "CLASS_SECTION_NOT_FOUND", () =>
      createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
        classSectionId: fixture.primary.classSections.previousYearClass.id,
        assignedUserId: substitute.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "Cross-year class access must be denied."
      }))
    ),
    await expectError("cross-tenant class", "CLASS_SECTION_NOT_FOUND", () =>
      createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
        classSectionId: fixture.other.classSection.id,
        assignedUserId: substitute.userId,
        assignmentType: "SUBSTITUTE_TEACHER",
        attendanceDate,
        reasonText: "Cross-tenant class access must be denied."
      }))
    )
  ];
  pass("scope-denials", "Unassigned, inactive, wrong-branch, wrong-year, cross-tenant, and unauthorised management requests were denied.");

  const browserPendingDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: browserPendingClass.id,
    assignedUserId: unassignedTeacher.userId,
    assignmentType: "SUBSTITUTE_TEACHER",
    attendanceDate,
    reasonText: "Pending browser fixture for acknowledgement workflow."
  }));
  const browserOperatorDuty = await createStudentAttendanceDutyAssignment(principalCtx, dutyInput({
    classSectionId: browserOperatorClass.id,
    assignedUserId: office.userId,
    assignmentType: "ATTENDANCE_OPERATOR",
    attendanceDate,
    reasonText: "Acknowledged browser fixture for Office Staff workflow."
  }));
  await acknowledgeStudentAttendanceDuty(officeCtx, { assignmentId: browserOperatorDuty.id });

  const [coverage, auditLogs, notificationOutbox, assignedClassSessionCount] = await Promise.all([
    listStudentAttendanceCoverage(principalCtx, { attendanceDate, sessionType: "FULL_DAY" }),
    db.auditLog.findMany({
      where: { tenantId: school.tenant.id, action: { startsWith: "academia.student_attendance." } },
      select: { action: true, beforeJson: true, afterJson: true, metadataJson: true }
    }),
    db.inAppNotificationOutbox.findMany({
      where: { tenantId: school.tenant.id, eventType: "student_attendance.duty_assigned" },
      select: { eventType: true, payloadJson: true, lastError: true }
    }),
    db.studentAttendanceSession.count({
      where: {
        tenantId: school.tenant.id,
        classSectionId: fixture.primary.classSections.assignedClass.id,
        attendanceDate,
        sessionType: "FULL_DAY"
      }
    })
  ]);
  assert(assignedClassSessionCount === 1, "Continuity flow created duplicate official attendance sessions");
  assert(coverage.canManageCoverage, "Principal coverage manager state is missing");
  assert(coverage.classes.some((item) => item.classSectionId === browserPendingClass.id), "Browser pending class is absent from coverage view");
  assert(coverage.classes.every((item) => !("studentNames" in item)), "Coverage view exposed roster data");
  const auditActions = new Set(auditLogs.map((item) => item.action));
  for (const action of [
    "academia.student_attendance.duty_assigned",
    "academia.student_attendance.duty_reassigned",
    "academia.student_attendance.duty_acknowledged",
    "academia.student_attendance.duty_declined",
    "academia.student_attendance.duty_revoked",
    "academia.student_attendance.duty_expired",
    "academia.student_attendance.responsibility_transferred",
    "academia.student_attendance.completed_by_delegate"
  ]) {
    assert(auditActions.has(action), `missing audit action ${action}`);
  }
  assert(notificationOutbox.length >= 1, "Duty assignment did not create in-app notification outbox evidence");
  const persistedEvidence = JSON.stringify({ auditLogs, notificationOutbox });
  for (const forbiddenPattern of [
    /password/i,
    /session[_ -]?token/i,
    /provider[_ -]?secret/i,
    /guardian/i,
    /medical/i,
    /caste/i,
    /religion/i
  ]) {
    assert(!forbiddenPattern.test(persistedEvidence), `sensitive audit/outbox content matched ${forbiddenPattern}`);
  }
  pass("audit-and-notification", "All continuity lifecycle events and a secret-safe in-app assignment event were persisted.");

  const evidence = {
    generatedAt: new Date().toISOString(),
    target,
    attendanceDate: fixture.attendanceDate,
    primary: {
      tenantSlug: fixture.primary.tenantSlug,
      branchIds: fixture.primary.branchIds,
      academicYearIds: fixture.primary.academicYearIds,
      users: {
        principal: { email: principal.email, role: principal.role },
        classTeacher: { email: assignedTeacher.email, role: assignedTeacher.role },
        pendingTeacher: { email: unassignedTeacher.email, role: unassignedTeacher.role },
        substitute: { email: substitute.email, role: substitute.role },
        office: { email: office.email, role: office.role },
        inactiveTeacher: { email: inactiveTeacher.email, role: inactiveTeacher.role }
      },
      browser: {
        pendingClass: browserPendingClass,
        pendingDutyId: browserPendingDuty.id,
        operatorClass: browserOperatorClass,
        operatorDutyId: browserOperatorDuty.id
      },
      protectedClassNames: {
        north: fixture.primary.classSections.northClass.displayName,
        previousYear: fixture.primary.classSections.previousYearClass.displayName
      }
    },
    other: fixture.other,
    checks,
    denials,
    database: {
      assignedClassSessionCount,
      auditCount: auditLogs.length,
      notificationOutboxCount: notificationOutbox.length
    }
  };
  await mkdir(resolve(process.cwd(), ".tmp"), { recursive: true });
  await writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: true,
    target,
    roles: ["PRINCIPAL", "OFFICE_STAFF", "CLASS_TEACHER", "SUBSTITUTE_TEACHER", "UNASSIGNED_TEACHER"],
    checks: checks.map((item) => item.label),
    denials: denials.map((item) => item.label),
    evidenceFile: ".tmp/student-attendance-continuity-qa-evidence.json"
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "STUDENT_ATTENDANCE_CONTINUITY_QA_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
