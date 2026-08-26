import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { StaffType } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_DEFINITIONS } from "@/modules/campus-core/entitlements/catalog";
import { listMyStaffAttendanceHistory } from "@/modules/staffboard-lite/queries/staff-attendance.queries";
import {
  requestManualStaffAttendance,
  requestStaffAttendanceAdjustment,
  reviewStaffAttendanceAdjustment
} from "@/modules/staffboard-lite/services/staff-attendance-adjustments.service";
import { issueStaffAttendanceCredential } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";
import {
  closeStaffAttendanceScanSession,
  recordSupervisedStaffQrScan,
  startStaffAttendanceScanSession
} from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";
import { seedPermissions } from "../prisma/seeds/permissions.seed";
import { seedDefaultRolesForTenant } from "../prisma/seeds/roles.seed";

const QA_DATABASE = "jinacampus_staff_attendance_qa";
const PRIMARY_TENANT_SLUG = "staff-attendance-qa";
const OTHER_TENANT_SLUG = "staff-attendance-qa-other";
const EFFECTIVE_FROM = new Date("2026-04-01T00:00:00.000Z");
const ACADEMIC_YEAR_END = new Date("2027-03-31T00:00:00.000Z");

type QaRole = "PRINCIPAL" | "OFFICE_STAFF" | "TEACHER" | "STAFF";

type SchoolFixture = {
  tenant: { id: string; name: string; slug: string };
  institution: { id: string; name: string };
  academicYear: { id: string; name: string };
  branches: Array<{ id: string; name: string; code: string }>;
};

type AccountFixture = {
  userId: string;
  email: string;
  role: QaRole;
  branchId: string;
  staffId: string | null;
  employeeCode: string | null;
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
  if (!localHost || database !== QA_DATABASE || process.env.STAFF_ATTENDANCE_QA_DATABASE !== QA_DATABASE) {
    throw new Error("REFUSING_NON_DISPOSABLE_STAFF_ATTENDANCE_QA_TARGET");
  }
  return { host: target.hostname, port: target.port, database };
}

function requiredQaPassword() {
  const value = process.env.STAFF_ATTENDANCE_QA_PASSWORD;
  if (!value || value.length < 12) throw new Error("STAFF_ATTENDANCE_QA_PASSWORD_REQUIRED");
  return value;
}

async function createSchool(input: {
  name: string;
  slug: string;
  institutionName: string;
  institutionCode: string;
  branches: Array<{ name: string; code: string }>;
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
  const branches = [];
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
        staffQrAttendanceEnabled: true,
        staffAttendanceCaptureMode: "HYBRID",
        staffSelfScanEnabled: true,
        staffManualAttendanceEnabled: true,
        staffCorrectionApprovalRequired: true,
        staffScanSessionValidityMinutes: 60,
        staffCredentialValidityDays: 365
      }
    });
    branches.push(branch);
  }
  const academicYear = await db.academicYear.create({
    data: {
      tenantId: tenant.id,
      institutionId: institution.id,
      name: "2026-27",
      startDate: EFFECTIVE_FROM,
      endDate: ACADEMIC_YEAR_END,
      status: "ACTIVE",
      isActive: true
    },
    select: { id: true, name: true }
  });
  await db.tenantSubscription.create({
    data: {
      tenantId: tenant.id,
      planCode: "QA",
      status: "ACTIVE",
      startsAt: EFFECTIVE_FROM,
      currentPeriodStartsAt: EFFECTIVE_FROM,
      currentPeriodEndsAt: ACADEMIC_YEAR_END
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
      startsAt: EFFECTIVE_FROM,
      endsAt: ACADEMIC_YEAR_END
    }))
  });
  return { tenant, institution, academicYear, branches };
}

async function createAccount(input: {
  school: SchoolFixture;
  branchId: string;
  role: QaRole;
  email: string;
  firstName: string;
  employeeCode?: string;
  staffType?: StaffType;
  passwordHash: string;
}): Promise<AccountFixture> {
  const user = await db.user.create({
    data: {
      tenantId: input.school.tenant.id,
      email: input.email,
      firstName: input.firstName,
      displayName: `${input.firstName} QA`,
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date()
    },
    select: { id: true, email: true }
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
      isActive: true
    }
  });

  let staffId: string | null = null;
  if (input.employeeCode && input.staffType) {
    const staff = await db.staffProfile.create({
      data: {
        tenantId: input.school.tenant.id,
        branchId: input.branchId,
        userId: user.id,
        employeeCode: input.employeeCode,
        firstName: input.firstName,
        staffType: input.staffType,
        designation: input.role === "TEACHER" ? "Teacher" : "Staff Member",
        email: input.email,
        joiningDate: EFFECTIVE_FROM,
        employmentStatus: "ACTIVE"
      },
      select: { id: true }
    });
    staffId = staff.id;
    await db.staffBranchAssignment.create({
      data: {
        tenantId: input.school.tenant.id,
        institutionId: input.school.institution.id,
        branchId: input.branchId,
        staffId: staff.id,
        effectiveFrom: EFFECTIVE_FROM,
        isPrimary: true,
        createdById: user.id
      }
    });
  }

  return {
    userId: user.id,
    email: user.email,
    role: input.role,
    branchId: input.branchId,
    staffId,
    employeeCode: input.employeeCode ?? null
  };
}

async function addPrincipalBranchAccess(tenantId: string, userId: string, branchId: string) {
  await db.userBranchAccess.create({
    data: { tenantId, userId, branchId, isPrimary: false, isActive: true }
  });
}

async function addAttendancePolicyAndSchedules(
  school: SchoolFixture,
  principalUserId: string,
  accounts: AccountFixture[]
) {
  for (const branch of school.branches) {
    await db.staffAttendancePolicy.create({
      data: {
        tenantId: school.tenant.id,
        institutionId: school.institution.id,
        branchId: branch.id,
        name: "Standard Staff Attendance",
        version: 1,
        status: "PUBLISHED",
        effectiveFrom: EFFECTIVE_FROM,
        shiftStartTime: "08:00",
        shiftEndTime: "16:00",
        graceMinutes: 10,
        duplicateCooldownSeconds: 0,
        correctionApprovalRequired: true,
        createdById: principalUserId,
        publishedById: principalUserId,
        publishedAt: new Date()
      }
    });
    const schedule = await db.staffAttendanceSchedule.create({
      data: {
        tenantId: school.tenant.id,
        institutionId: school.institution.id,
        branchId: branch.id,
        name: "Regular School Day",
        version: 1,
        status: "PUBLISHED",
        startTime: "08:00",
        endTime: "16:00",
        expectedCheckOutTime: "16:00",
        graceMinutes: 10,
        effectiveFrom: EFFECTIVE_FROM,
        createdById: principalUserId
      },
      select: { id: true }
    });
    for (const account of accounts.filter((item) => item.branchId === branch.id && item.staffId)) {
      await db.staffAttendanceScheduleAssignment.create({
        data: {
          tenantId: school.tenant.id,
          branchId: branch.id,
          staffId: account.staffId!,
          scheduleId: schedule.id,
          effectiveFrom: EFFECTIVE_FROM,
          createdById: principalUserId
        }
      });
    }
  }
}

function contextFor(input: {
  school: SchoolFixture;
  account: AccountFixture;
  accessibleBranchIds: string[];
}): TenantContext {
  const activeBranch = input.school.branches.find((branch) => branch.id === input.account.branchId);
  return {
    tenantId: input.school.tenant.id,
    tenantName: input.school.tenant.name,
    tenantSlug: input.school.tenant.slug,
    userId: input.account.userId,
    userEmail: input.account.email,
    userName: `${input.account.role} QA`,
    userType: "STAFF",
    activeBranchId: input.account.branchId,
    activeBranchName: activeBranch?.name ?? null,
    activeBranchCode: activeBranch?.code ?? null,
    timeZone: "Asia/Kolkata",
    accessibleBranchIds: input.accessibleBranchIds,
    activeAcademicYearId: input.school.academicYear.id,
    activeAcademicYearName: input.school.academicYear.name,
    institutionId: input.school.institution.id,
    institutionName: input.school.institution.name,
    institutionDisplayName: input.school.institution.name,
    roleCodes: [input.account.role],
    roleLabels: [input.account.role],
    passwordChangeRequired: false,
    ipAddress: "127.0.0.1",
    userAgent: "JinaCampus Staff Attendance isolated QA",
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

function previousDateOnly() {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - 1);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

async function main() {
  const target = assertDisposableTarget();
  const qaPassword = requiredQaPassword();
  await seedPermissions(db);
  const passwordHash = await hashPassword(qaPassword);

  const primarySchool = await createSchool({
    name: "Synthetic Attendance School",
    slug: PRIMARY_TENANT_SLUG,
    institutionName: "Synthetic Attendance Institution",
    institutionCode: "SAI",
    branches: [
      { name: "Main Branch", code: "MAIN" },
      { name: "North Branch", code: "NORTH" }
    ]
  });
  const otherSchool = await createSchool({
    name: "Independent Synthetic School",
    slug: OTHER_TENANT_SLUG,
    institutionName: "Independent Synthetic Institution",
    institutionCode: "ISI",
    branches: [{ name: "Independent Branch", code: "ONLY" }]
  });

  const [mainBranch, northBranch] = primarySchool.branches;
  const otherBranch = otherSchool.branches[0];
  assert(mainBranch && northBranch && otherBranch, "synthetic branches were not created");

  const principal = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "PRINCIPAL",
    email: "principal@staff-attendance-qa.test",
    firstName: "Principal",
    passwordHash
  });
  const office = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "OFFICE_STAFF",
    email: "office@staff-attendance-qa.test",
    firstName: "Office",
    employeeCode: "QA-O-001",
    staffType: "ADMIN",
    passwordHash
  });
  const teacher = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "TEACHER",
    email: "teacher@staff-attendance-qa.test",
    firstName: "Teacher",
    employeeCode: "QA-T-001",
    staffType: "TEACHER",
    passwordHash
  });
  const staff = await createAccount({
    school: primarySchool,
    branchId: mainBranch.id,
    role: "STAFF",
    email: "staff@staff-attendance-qa.test",
    firstName: "Staff",
    employeeCode: "QA-S-001",
    staffType: "OTHER",
    passwordHash
  });
  const northStaff = await createAccount({
    school: primarySchool,
    branchId: northBranch.id,
    role: "STAFF",
    email: "north.staff@staff-attendance-qa.test",
    firstName: "North",
    employeeCode: "QA-N-001",
    staffType: "OTHER",
    passwordHash
  });
  await addPrincipalBranchAccess(primarySchool.tenant.id, principal.userId, northBranch.id);

  const otherPrincipal = await createAccount({
    school: otherSchool,
    branchId: otherBranch.id,
    role: "PRINCIPAL",
    email: "principal@staff-attendance-qa-other.test",
    firstName: "Other Principal",
    passwordHash
  });
  const otherStaff = await createAccount({
    school: otherSchool,
    branchId: otherBranch.id,
    role: "STAFF",
    email: "staff@staff-attendance-qa-other.test",
    firstName: "Other Staff",
    employeeCode: "QA-X-001",
    staffType: "OTHER",
    passwordHash
  });

  await addAttendancePolicyAndSchedules(primarySchool, principal.userId, [office, teacher, staff, northStaff]);
  await addAttendancePolicyAndSchedules(otherSchool, otherPrincipal.userId, [otherStaff]);

  const principalCtx = contextFor({
    school: primarySchool,
    account: principal,
    accessibleBranchIds: [mainBranch.id, northBranch.id]
  });
  const officeCtx = contextFor({ school: primarySchool, account: office, accessibleBranchIds: [mainBranch.id] });
  const teacherCtx = contextFor({ school: primarySchool, account: teacher, accessibleBranchIds: [mainBranch.id] });
  const staffCtx = contextFor({ school: primarySchool, account: staff, accessibleBranchIds: [mainBranch.id] });
  const otherPrincipalCtx = contextFor({
    school: otherSchool,
    account: otherPrincipal,
    accessibleBranchIds: [otherBranch.id]
  });

  assert(staff.staffId && teacher.staffId && northStaff.staffId && otherStaff.staffId, "staff profiles are required");
  const staffCredential = await issueStaffAttendanceCredential(principalCtx, { staffId: staff.staffId });
  const northCredential = await issueStaffAttendanceCredential(principalCtx, { staffId: northStaff.staffId });
  const otherCredential = await issueStaffAttendanceCredential(otherPrincipalCtx, { staffId: otherStaff.staffId });

  const denials = [];
  denials.push(await expectError("teacher operator scanner denial", "FORBIDDEN_PERMISSION:staffboard.attendance.scan", () =>
    startStaffAttendanceScanSession(teacherCtx, { branchId: mainBranch.id, mode: "AUTO" })
  ));
  denials.push(await expectError("staff operator scanner denial", "FORBIDDEN_PERMISSION:staffboard.attendance.scan", () =>
    startStaffAttendanceScanSession(staffCtx, { branchId: mainBranch.id, mode: "AUTO" })
  ));
  denials.push(await expectError("office cross-branch denial", "FORBIDDEN_BRANCH_ACCESS", () =>
    startStaffAttendanceScanSession(officeCtx, { branchId: northBranch.id, mode: "AUTO" })
  ));
  denials.push(await expectError("office credential management denial", "FORBIDDEN_PERMISSION:staffboard.attendance.credential.manage", () =>
    issueStaffAttendanceCredential(officeCtx, { staffId: staff.staffId })
  ));

  const session = await startStaffAttendanceScanSession(officeCtx, { branchId: mainBranch.id, mode: "AUTO" });
  const firstRequestId = randomUUID();
  const checkIn = await recordSupervisedStaffQrScan(officeCtx, {
    sessionId: session.id,
    qrPayload: staffCredential.qrPayload,
    clientRequestId: firstRequestId
  });
  assert(checkIn.eventType === "CHECK_IN" && !checkIn.duplicateRequest, "first QR scan must check in");
  const duplicate = await recordSupervisedStaffQrScan(officeCtx, {
    sessionId: session.id,
    qrPayload: staffCredential.qrPayload,
    clientRequestId: firstRequestId
  });
  assert(duplicate.duplicateRequest && duplicate.eventId === checkIn.eventId, "client retry must be idempotent");
  const checkOut = await recordSupervisedStaffQrScan(officeCtx, {
    sessionId: session.id,
    qrPayload: staffCredential.qrPayload,
    clientRequestId: randomUUID()
  });
  assert(checkOut.eventType === "CHECK_OUT", "second accepted QR scan must check out");
  denials.push(await expectError("third QR scan denial", "STAFF_ATTENDANCE_ALREADY_RECORDED", () =>
    recordSupervisedStaffQrScan(officeCtx, {
      sessionId: session.id,
      qrPayload: staffCredential.qrPayload,
      clientRequestId: randomUUID()
    })
  ));
  denials.push(await expectError("wrong-branch QR denial", "STAFF_ATTENDANCE_WRONG_BRANCH", () =>
    recordSupervisedStaffQrScan(officeCtx, {
      sessionId: session.id,
      qrPayload: northCredential.qrPayload,
      clientRequestId: randomUUID()
    })
  ));
  denials.push(await expectError("cross-tenant QR denial", "STAFF_ATTENDANCE_QR_INVALID", () =>
    recordSupervisedStaffQrScan(officeCtx, {
      sessionId: session.id,
      qrPayload: otherCredential.qrPayload,
      clientRequestId: randomUUID()
    })
  ));
  denials.push(await expectError("invalid QR denial", "STAFF_ATTENDANCE_QR_INVALID", () =>
    recordSupervisedStaffQrScan(officeCtx, {
      sessionId: session.id,
      qrPayload: "not-a-valid-staff-attendance-card",
      clientRequestId: randomUUID()
    })
  ));
  await closeStaffAttendanceScanSession(officeCtx, { sessionId: session.id, reason: "QA completed" });

  const manualRequest = await requestManualStaffAttendance(officeCtx, {
    branchId: mainBranch.id,
    staffId: teacher.staffId,
    attendanceDate: previousDateOnly(),
    status: "PRESENT",
    reasonCode: "QA_MANUAL_ENTRY",
    reasonText: "Synthetic QA manual attendance request"
  });
  assert(manualRequest.status === "SUBMITTED", "manual attendance must require approval");
  denials.push(await expectError("office approval denial", "FORBIDDEN_PERMISSION:staffboard.attendance.adjustment.approve", () =>
    reviewStaffAttendanceAdjustment(officeCtx, {
      adjustmentId: manualRequest.id,
      decision: "APPROVE",
      reviewComment: "Should not be allowed"
    })
  ));
  const manualApproval = await reviewStaffAttendanceAdjustment(principalCtx, {
    adjustmentId: manualRequest.id,
    decision: "APPROVE",
    reviewComment: "Approved during isolated QA"
  });
  assert(manualApproval.status === "APPLIED", "Principal must apply the manual attendance request");

  const ownCorrection = await requestStaffAttendanceAdjustment(teacherCtx, {
    attendanceRecordId: manualApproval.attendanceRecordId,
    adjustmentType: "ADD_NOTE",
    reasonCode: "QA_SELF_NOTE",
    reasonText: "Synthetic teacher correction note"
  });
  assert(ownCorrection.status === "SUBMITTED", "Teacher must be able to request own correction");
  denials.push(await expectError("staff cannot request another staff record correction", "FORBIDDEN_PERMISSION:staffboard.attendance.correct", () =>
    requestStaffAttendanceAdjustment(staffCtx, {
      attendanceRecordId: manualApproval.attendanceRecordId,
      adjustmentType: "ADD_NOTE",
      reasonCode: "QA_CROSS_STAFF",
      reasonText: "This cross-staff request must be denied"
    })
  ));
  denials.push(await expectError("cross-tenant record denial", "STAFF_ATTENDANCE_RECORD_NOT_FOUND", () =>
    requestStaffAttendanceAdjustment(otherPrincipalCtx, {
      attendanceRecordId: manualApproval.attendanceRecordId,
      adjustmentType: "ADD_NOTE",
      reasonCode: "QA_CROSS_TENANT",
      reasonText: "This cross-tenant request must be denied"
    })
  ));
  const correctionApproval = await reviewStaffAttendanceAdjustment(principalCtx, {
    adjustmentId: ownCorrection.id,
    decision: "APPROVE",
    reviewComment: "Own-record correction request approved"
  });
  assert(correctionApproval.status === "APPLIED", "Principal must apply the teacher correction");

  const staffHistory = await listMyStaffAttendanceHistory(staffCtx, 14);
  const teacherHistory = await listMyStaffAttendanceHistory(teacherCtx, 14);
  assert(staffHistory.length === 1 && staffHistory.every((row) => row.employeeCode === staff.employeeCode), "Staff self-service must show only own attendance");
  assert(teacherHistory.length === 1 && teacherHistory.every((row) => row.employeeCode === teacher.employeeCode), "Teacher self-service must show only own attendance");

  const [events, outboxEvents, audits, otherTenantEvents] = await Promise.all([
    db.staffAttendanceEvent.count({ where: { tenantId: primarySchool.tenant.id } }),
    db.staffAttendanceOutboxEvent.count({ where: { tenantId: primarySchool.tenant.id } }),
    db.auditLog.findMany({
      where: { tenantId: primarySchool.tenant.id, action: { startsWith: "staffboard.attendance" } },
      select: { action: true, entityType: true, entityId: true, metadataJson: true, createdAt: true }
    }),
    db.staffAttendanceEvent.count({ where: { tenantId: otherSchool.tenant.id } })
  ]);
  assert(events >= 4, "accepted QR and adjustment events must be persisted");
  assert(outboxEvents >= 4, "attendance events must create transactional outbox records");
  assert(audits.length >= 8, "critical attendance actions must be audited");
  assert(otherTenantEvents === 0, "primary-tenant QA must not write attendance into the other tenant");
  const auditText = JSON.stringify(audits);
  assert(!auditText.includes(staffCredential.qrPayload), "raw QR payload must not be present in audit data");
  assert(!auditText.includes(qaPassword), "password must not be present in audit data");

  const fixtureEvidence = {
    generatedAt: new Date().toISOString(),
    target,
    tenantSlug: primarySchool.tenant.slug,
    otherTenantSlug: otherSchool.tenant.slug,
    institutionId: primarySchool.institution.id,
    branchIds: { main: mainBranch.id, north: northBranch.id },
    users: {
      principal: { email: principal.email, role: principal.role },
      office: { email: office.email, role: office.role },
      teacher: { email: teacher.email, role: teacher.role },
      staff: { email: staff.email, role: staff.role }
    },
    results: {
      migrationCount: await db.$queryRaw<Array<{ count: bigint }>>`SELECT COUNT(*)::bigint AS count FROM "_prisma_migrations"`,
      checkIn: "PASS",
      idempotentRetry: "PASS",
      checkOut: "PASS",
      manualApproval: "PASS",
      ownCorrection: "PASS",
      selfServiceScope: "PASS",
      denials,
      attendanceEventCount: events,
      outboxEventCount: outboxEvents,
      auditRecordCount: audits.length,
      sensitiveAuditOutput: "PASS"
    }
  };
  await mkdir(resolve(process.cwd(), ".tmp"), { recursive: true });
  await writeFile(
    resolve(process.cwd(), ".tmp/staff-attendance-qa-evidence.json"),
    JSON.stringify(fixtureEvidence, (_key, value) => typeof value === "bigint" ? value.toString() : value, 2),
    "utf8"
  );
  console.log(JSON.stringify({
    ok: true,
    target,
    roles: Object.values(fixtureEvidence.users).map((user) => user.role),
    checks: {
      qrCheckIn: "PASS",
      qrCheckOut: "PASS",
      duplicateRetry: "PASS",
      manualApproval: "PASS",
      selfCorrection: "PASS",
      tenantAndBranchDenials: "PASS",
      selfServiceScope: "PASS",
      auditAndOutbox: "PASS",
      sensitiveAuditOutput: "PASS"
    },
    evidenceFile: ".tmp/staff-attendance-qa-evidence.json"
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "STAFF_ATTENDANCE_QA_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
