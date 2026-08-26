import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type { TenantContext } from "@/lib/tenant/context";
import {
  deactivateStudentIdentityCard,
  getStudentIdentityCard,
  getStudentIdentityCardWorkspace,
  issueStudentIdentityCard,
  recordStudentIdentityCardPrint
} from "@/modules/academia/services/student-identity-card.service";
import { ATTENDANCE_ENTITLEMENT_DEFINITIONS } from "@/modules/campus-core/entitlements/catalog";
import {
  getMyStaffAttendanceCredentialCard,
  getStaffAttendanceCredentialCard,
  issueStaffAttendanceCredential,
  listStaffAttendanceCredentials,
  recordStaffAttendanceCredentialPrint,
  revokeStaffAttendanceCredential
} from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";
import {
  closeStaffAttendanceScanSession,
  recordSupervisedStaffQrScan,
  startStaffAttendanceScanSession
} from "@/modules/staffboard-lite/services/staff-attendance-scanner.service";
import {
  buildStaffAttendanceCredentialPayload,
  hashStaffAttendanceCredential
} from "@/modules/staffboard-lite/services/staff-attendance-domain.shared";
import { scanStaffAttendanceQr } from "@/modules/staffboard-lite/services/staff-qr.service";
import { seedPermissions } from "../prisma/seeds/permissions.seed";
import { seedDefaultRolesForTenant } from "../prisma/seeds/roles.seed";

const QA_DATABASE = "jinacampus_identity_qa";
const PRIMARY_TENANT_SLUG = "identity-card-qa";
const OTHER_TENANT_SLUG = "identity-card-qa-other";
const CURRENT_YEAR_START = new Date("2026-04-01T00:00:00.000Z");
const CURRENT_YEAR_END = new Date("2027-03-31T00:00:00.000Z");
const PREVIOUS_YEAR_START = new Date("2025-04-01T00:00:00.000Z");
const PREVIOUS_YEAR_END = new Date("2026-03-31T00:00:00.000Z");

type QaRole = "PRINCIPAL" | "OFFICE_STAFF" | "TEACHER" | "STAFF";

type InstitutionFixture = {
  id: string;
  name: string;
  branches: Array<{ id: string; name: string; code: string }>;
  currentYear: { id: string; name: string };
  previousYear: { id: string; name: string } | null;
};

type SchoolFixture = {
  tenant: { id: string; name: string; slug: string };
  institutions: InstitutionFixture[];
};

type AccountFixture = {
  userId: string;
  email: string;
  role: QaRole;
  branchId: string;
  staffId: string | null;
};

type StudentFixture = {
  id: string;
  enrollmentId: string;
  branchId: string;
  academicYearId: string;
  name: string;
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
    process.env.IDENTITY_CARD_QA_ISOLATED !== "true" ||
    process.env.IDENTITY_CARD_QA_DATABASE !== QA_DATABASE
  ) {
    throw new Error("REFUSING_NON_DISPOSABLE_IDENTITY_CARD_QA_TARGET");
  }
  return { host: target.hostname, port: target.port, database };
}

function requiredQaPassword() {
  const value = process.env.IDENTITY_CARD_QA_PASSWORD;
  if (!value || value.length < 16) throw new Error("IDENTITY_CARD_QA_PASSWORD_REQUIRED");
  return value;
}

async function createSchool(input: {
  name: string;
  slug: string;
  institutions: Array<{
    name: string;
    code: string;
    branches: Array<{ name: string; code: string }>;
    includePreviousYear?: boolean;
  }>;
}): Promise<SchoolFixture> {
  const tenant = await db.tenant.create({
    data: { name: input.name, slug: input.slug, status: "ACTIVE", plan: "TRIAL" },
    select: { id: true, name: true, slug: true }
  });
  await db.tenantSettings.create({ data: { tenantId: tenant.id, timezone: "Asia/Kolkata" } });
  await seedDefaultRolesForTenant(db, tenant.id);
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

  const institutions: InstitutionFixture[] = [];
  for (const institutionInput of input.institutions) {
    const institution = await db.institution.create({
      data: {
        tenantId: tenant.id,
        name: institutionInput.name,
        displayName: institutionInput.name,
        code: institutionInput.code,
        status: "ACTIVE"
      },
      select: { id: true, name: true }
    });
    const branches: InstitutionFixture["branches"] = [];
    for (const branchInput of institutionInput.branches) {
      const branch = await db.branch.create({
        data: {
          tenantId: tenant.id,
          institutionId: institution.id,
          name: branchInput.name,
          code: branchInput.code,
          status: "ACTIVE",
          timezone: "Asia/Kolkata",
          addressLine1: "1 Synthetic School Road",
          city: "Indore",
          state: "Madhya Pradesh",
          postalCode: "452001",
          phone: "+919900000001",
          email: `office-${branchInput.code.toLowerCase()}@identity-card-qa.test`
        },
        select: { id: true, name: true, code: true }
      });
      await db.attendanceSetting.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          staffQrAttendanceEnabled: true,
          staffAttendanceCaptureMode: "SUPERVISED_QR",
          staffSelfScanEnabled: false,
          staffManualAttendanceEnabled: true,
          staffScanSessionValidityMinutes: 60,
          staffCredentialValidityDays: 365
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
    const previousYear = institutionInput.includePreviousYear
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
    institutions.push({ ...institution, branches, currentYear, previousYear });
  }
  return { tenant, institutions };
}

async function createAccount(input: {
  school: SchoolFixture;
  branchId: string;
  role: QaRole;
  email: string;
  firstName: string;
  passwordHash: string;
  employeeCode?: string;
  staffType?: "TEACHER" | "ADMIN" | "OTHER";
}) {
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
      isActive: true,
      canAccessAllAcademicYears: input.role === "PRINCIPAL"
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
        lastName: "User",
        staffType: input.staffType,
        designation: input.staffType === "TEACHER" ? "Teacher" : "Office Assistant",
        department: input.staffType === "TEACHER" ? "Academics" : "Administration",
        email: input.email,
        joiningDate: CURRENT_YEAR_START,
        employmentStatus: "ACTIVE"
      },
      select: { id: true }
    });
    staffId = staff.id;
    const institutionId = input.school.institutions.find((institution) =>
      institution.branches.some((branch) => branch.id === input.branchId)
    )?.id;
    assert(institutionId, "account branch must belong to a synthetic institution");
    await db.staffBranchAssignment.create({
      data: {
        tenantId: input.school.tenant.id,
        institutionId,
        branchId: input.branchId,
        staffId: staff.id,
        effectiveFrom: CURRENT_YEAR_START,
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
    staffId
  } satisfies AccountFixture;
}

async function addBranchAccess(tenantId: string, userId: string, branchId: string) {
  await db.userBranchAccess.create({
    data: { tenantId, userId, branchId, isPrimary: false, isActive: true, canAccessAllAcademicYears: true }
  });
}

async function createStudent(input: {
  school: SchoolFixture;
  institution: InstitutionFixture;
  branchId: string;
  code: string;
  name: string;
}): Promise<StudentFixture> {
  const academicClass = await db.class.create({
    data: { tenantId: input.school.tenant.id, code: input.code, name: `Class ${input.code}` },
    select: { id: true }
  });
  const section = await db.section.create({
    data: { tenantId: input.school.tenant.id, code: input.code, name: `Section ${input.code}` },
    select: { id: true }
  });
  const classSection = await db.classSection.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      academicYearId: input.institution.currentYear.id,
      classId: academicClass.id,
      sectionId: section.id,
      displayName: `Class ${input.code} - A`,
      status: "ACTIVE"
    },
    select: { id: true }
  });
  const student = await db.student.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      admissionNumber: `QA-${input.code}-001`,
      fullName: input.name,
      displayName: input.name,
      firstName: input.name.split(" ")[0] ?? input.name,
      lastName: input.name.split(" ").slice(1).join(" ") || null,
      dateOfBirth: new Date("2015-06-15T00:00:00.000Z"),
      bloodGroup: "B_POSITIVE",
      fatherName: "Synthetic Guardian",
      status: "ACTIVE",
      joinedAt: CURRENT_YEAR_START
    },
    select: { id: true }
  });
  const guardianPhoneSuffix = input.code.replace(/\D/g, "").padStart(4, "0").slice(-4);
  const guardian = await db.guardian.create({
    data: {
      tenantId: input.school.tenant.id,
      firstName: "Synthetic",
      lastName: "Guardian",
      displayName: "Synthetic Guardian",
      phone: `+91980000${guardianPhoneSuffix}`
    },
    select: { id: true }
  });
  await db.studentGuardianLink.create({
    data: {
      tenantId: input.school.tenant.id,
      studentId: student.id,
      guardianId: guardian.id,
      relation: "FATHER",
      isPrimary: true,
      isEmergencyContact: true
    }
  });
  const enrollment = await db.enrollment.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      academicYearId: input.institution.currentYear.id,
      studentId: student.id,
      classSectionId: classSection.id,
      rollNumber: "01",
      status: "ACTIVE",
      enrolledOn: CURRENT_YEAR_START
    },
    select: { id: true }
  });
  return {
    id: student.id,
    enrollmentId: enrollment.id,
    branchId: input.branchId,
    academicYearId: input.institution.currentYear.id,
    name: input.name
  };
}

async function addStaffAttendancePolicy(input: {
  school: SchoolFixture;
  institution: InstitutionFixture;
  branchId: string;
  principalId: string;
  staffId: string;
}) {
  await db.staffAttendancePolicy.create({
    data: {
      tenantId: input.school.tenant.id,
      institutionId: input.institution.id,
      branchId: input.branchId,
      name: "Synthetic Card QA Policy",
      version: 1,
      status: "PUBLISHED",
      effectiveFrom: CURRENT_YEAR_START,
      shiftStartTime: "08:00",
      shiftEndTime: "16:00",
      graceMinutes: 10,
      duplicateCooldownSeconds: 0,
      createdById: input.principalId,
      publishedById: input.principalId,
      publishedAt: new Date()
    }
  });
  const schedule = await db.staffAttendanceSchedule.create({
    data: {
      tenantId: input.school.tenant.id,
      institutionId: input.institution.id,
      branchId: input.branchId,
      name: "Synthetic Regular Day",
      version: 1,
      status: "PUBLISHED",
      startTime: "08:00",
      endTime: "16:00",
      expectedCheckOutTime: "16:00",
      graceMinutes: 10,
      effectiveFrom: CURRENT_YEAR_START,
      createdById: input.principalId
    },
    select: { id: true }
  });
  await db.staffAttendanceScheduleAssignment.create({
    data: {
      tenantId: input.school.tenant.id,
      branchId: input.branchId,
      staffId: input.staffId,
      scheduleId: schedule.id,
      effectiveFrom: CURRENT_YEAR_START,
      createdById: input.principalId
    }
  });
}

function contextFor(input: {
  school: SchoolFixture;
  institution: InstitutionFixture;
  account: AccountFixture;
  accessibleBranchIds: string[];
  activeAcademicYearId?: string;
}): TenantContext {
  const branch = input.institution.branches.find((item) => item.id === input.account.branchId);
  const academicYearId = input.activeAcademicYearId ?? input.institution.currentYear.id;
  return {
    tenantId: input.school.tenant.id,
    tenantName: input.school.tenant.name,
    tenantSlug: input.school.tenant.slug,
    userId: input.account.userId,
    userEmail: input.account.email,
    userName: `${input.account.role} QA`,
    userType: "STAFF",
    activeBranchId: input.account.branchId,
    activeBranchName: branch?.name ?? null,
    activeBranchCode: branch?.code ?? null,
    timeZone: "Asia/Kolkata",
    accessibleBranchIds: input.accessibleBranchIds,
    activeAcademicYearId: academicYearId,
    activeAcademicYearName: input.institution.previousYear?.id === academicYearId
      ? input.institution.previousYear.name
      : input.institution.currentYear.name,
    institutionId: input.institution.id,
    institutionName: input.institution.name,
    institutionDisplayName: input.institution.name,
    roleCodes: [input.account.role],
    roleLabels: [input.account.role],
    passwordChangeRequired: false,
    ipAddress: "127.0.0.1",
    userAgent: "JinaCampus identity-card isolated QA",
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
  await seedPermissions(db);
  const passwordHash = await hashPassword(qaPassword);

  const primary = await createSchool({
    name: "Synthetic Identity School",
    slug: PRIMARY_TENANT_SLUG,
    institutions: [
      {
        name: "Synthetic Identity Institution",
        code: "SII",
        includePreviousYear: true,
        branches: [
          { name: "Main Branch", code: "MAIN" },
          { name: "North Branch", code: "NORTH" }
        ]
      },
      {
        name: "Separate Synthetic Institution",
        code: "SSI",
        branches: [{ name: "Annex Branch", code: "ANNEX" }]
      }
    ]
  });
  const other = await createSchool({
    name: "Independent Identity School",
    slug: OTHER_TENANT_SLUG,
    institutions: [{
      name: "Independent Identity Institution",
      code: "III",
      branches: [{ name: "Independent Branch", code: "ONLY" }]
    }]
  });

  const [primaryInstitution, separateInstitution] = primary.institutions;
  const [otherInstitution] = other.institutions;
  const [mainBranch, northBranch] = primaryInstitution?.branches ?? [];
  const [annexBranch] = separateInstitution?.branches ?? [];
  const [otherBranch] = otherInstitution?.branches ?? [];
  assert(primaryInstitution && separateInstitution && otherInstitution, "synthetic institutions are required");
  assert(mainBranch && northBranch && annexBranch && otherBranch, "synthetic branches are required");

  const principal = await createAccount({
    school: primary,
    branchId: mainBranch.id,
    role: "PRINCIPAL",
    email: "principal@identity-card-qa.test",
    firstName: "Principal",
    passwordHash
  });
  const office = await createAccount({
    school: primary,
    branchId: mainBranch.id,
    role: "OFFICE_STAFF",
    email: "office@identity-card-qa.test",
    firstName: "Office",
    employeeCode: "IC-O-001",
    staffType: "ADMIN",
    passwordHash
  });
  const teacher = await createAccount({
    school: primary,
    branchId: mainBranch.id,
    role: "TEACHER",
    email: "teacher@identity-card-qa.test",
    firstName: "Teacher",
    employeeCode: "IC-T-001",
    staffType: "TEACHER",
    passwordHash
  });
  const staff = await createAccount({
    school: primary,
    branchId: mainBranch.id,
    role: "STAFF",
    email: "staff@identity-card-qa.test",
    firstName: "Staff",
    employeeCode: "IC-S-001",
    staffType: "OTHER",
    passwordHash
  });
  const northStaff = await createAccount({
    school: primary,
    branchId: northBranch.id,
    role: "STAFF",
    email: "north.staff@identity-card-qa.test",
    firstName: "North",
    employeeCode: "IC-N-001",
    staffType: "OTHER",
    passwordHash
  });
  const annexStaff = await createAccount({
    school: primary,
    branchId: annexBranch.id,
    role: "STAFF",
    email: "annex.staff@identity-card-qa.test",
    firstName: "Annex",
    employeeCode: "IC-A-001",
    staffType: "OTHER",
    passwordHash
  });
  const otherPrincipal = await createAccount({
    school: other,
    branchId: otherBranch.id,
    role: "PRINCIPAL",
    email: "principal@identity-card-qa-other.test",
    firstName: "OtherPrincipal",
    passwordHash
  });
  const otherStaff = await createAccount({
    school: other,
    branchId: otherBranch.id,
    role: "STAFF",
    email: "staff@identity-card-qa-other.test",
    firstName: "OtherStaff",
    employeeCode: "IC-X-001",
    staffType: "OTHER",
    passwordHash
  });
  await addBranchAccess(primary.tenant.id, principal.userId, northBranch.id);
  await addBranchAccess(primary.tenant.id, principal.userId, annexBranch.id);

  assert(staff.staffId && northStaff.staffId && annexStaff.staffId && otherStaff.staffId, "staff fixtures are required");
  await addStaffAttendancePolicy({
    school: primary,
    institution: primaryInstitution,
    branchId: mainBranch.id,
    principalId: principal.userId,
    staffId: staff.staffId
  });

  const mainStudent = await createStudent({
    school: primary,
    institution: primaryInstitution,
    branchId: mainBranch.id,
    code: "05A",
    name: "Aarav Synthetic"
  });
  const northStudent = await createStudent({
    school: primary,
    institution: primaryInstitution,
    branchId: northBranch.id,
    code: "06A",
    name: "North Synthetic"
  });
  const annexStudent = await createStudent({
    school: primary,
    institution: separateInstitution,
    branchId: annexBranch.id,
    code: "07A",
    name: "Annex Synthetic"
  });
  const otherStudent = await createStudent({
    school: other,
    institution: otherInstitution,
    branchId: otherBranch.id,
    code: "08A",
    name: "Other Synthetic"
  });

  const principalCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: principal,
    accessibleBranchIds: [mainBranch.id, northBranch.id]
  });
  const principalMainOnlyCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: principal,
    accessibleBranchIds: [mainBranch.id]
  });
  const principalWithAnnexAccessCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: principal,
    accessibleBranchIds: [mainBranch.id, annexBranch.id]
  });
  const officeCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: office,
    accessibleBranchIds: [mainBranch.id]
  });
  const teacherCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: teacher,
    accessibleBranchIds: [mainBranch.id]
  });
  const staffCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: staff,
    accessibleBranchIds: [mainBranch.id]
  });
  const otherPrincipalCtx = contextFor({
    school: other,
    institution: otherInstitution,
    account: otherPrincipal,
    accessibleBranchIds: [otherBranch.id]
  });
  const previousYearCtx = contextFor({
    school: primary,
    institution: primaryInstitution,
    account: principal,
    accessibleBranchIds: [mainBranch.id],
    activeAcademicYearId: primaryInstitution.previousYear?.id
  });

  const denials: Array<{ label: string; result: string; expected: string }> = [];
  const legacyToken = randomBytes(32).toString("base64url");
  await db.staffAttendanceCredential.create({
    data: {
      tenantId: primary.tenant.id,
      institutionId: primaryInstitution.id,
      staffId: staff.staffId,
      tokenHash: hashStaffAttendanceCredential(legacyToken),
      keyVersion: 1,
      credentialVersion: 1,
      status: "ACTIVE",
      issuedById: principal.userId,
      issuedAt: new Date()
    }
  });
  const legacyOwnState = await getMyStaffAttendanceCredentialCard(staffCtx);
  assert(legacyOwnState.state === "REISSUE_REQUIRED", "legacy QR must remain valid but require reissue for digital rendering");

  const staffCard = await issueStaffAttendanceCredential(principalCtx, {
    staffId: staff.staffId,
    replacementReason: "POLICY_REISSUE",
    reason: "Enable secure digital card display"
  });
  const ownState = await getMyStaffAttendanceCredentialCard(staffCtx);
  assert(ownState.state === "AVAILABLE" && ownState.card.credentialId === staffCard.credentialId, "staff must view own active card");
  assert(ownState.card.photoUrl === null, "missing staff photograph must render as a safe placeholder");
  const managerPreview = await getStaffAttendanceCredentialCard(principalCtx, staffCard.credentialId);
  assert(managerPreview.staffId === staff.staffId, "Principal preview must remain staff-scoped");
  await recordStaffAttendanceCredentialPrint(principalCtx, staffCard.credentialId);

  denials.push(await expectError("staff credential print denial", "FORBIDDEN_ROLE", () =>
    recordStaffAttendanceCredentialPrint(staffCtx, staffCard.credentialId)
  ));
  denials.push(await expectError("staff credential issue denial", "FORBIDDEN_ROLE", () =>
    issueStaffAttendanceCredential(staffCtx, { staffId: staff.staffId })
  ));
  denials.push(await expectError("office credential issue denial", "FORBIDDEN_ROLE", () =>
    issueStaffAttendanceCredential(officeCtx, { staffId: staff.staffId })
  ));
  denials.push(await expectError("teacher credential issue denial", "FORBIDDEN_ROLE", () =>
    issueStaffAttendanceCredential(teacherCtx, { staffId: staff.staffId })
  ));
  denials.push(await expectError("staff self-camera denial", "STAFF_SELF_SCAN_DISABLED", () =>
    scanStaffAttendanceQr(staffCtx, { token: buildStaffAttendanceCredentialPayload(legacyToken) })
  ));
  denials.push(await expectError("cross-branch credential denial", "STAFF_PROFILE_NOT_FOUND", () =>
    issueStaffAttendanceCredential(principalMainOnlyCtx, { staffId: northStaff.staffId })
  ));
  denials.push(await expectError("cross-institution credential denial", "STAFF_PROFILE_NOT_FOUND", () =>
    issueStaffAttendanceCredential(principalWithAnnexAccessCtx, { staffId: annexStaff.staffId })
  ));
  denials.push(await expectError("cross-tenant credential denial", "STAFF_ATTENDANCE_CREDENTIAL_NOT_FOUND", () =>
    getStaffAttendanceCredentialCard(otherPrincipalCtx, staffCard.credentialId)
  ));

  const scanSession = await startStaffAttendanceScanSession(officeCtx, { branchId: mainBranch.id, mode: "AUTO" });
  const scanRequestId = randomUUID();
  const checkIn = await recordSupervisedStaffQrScan(officeCtx, {
    sessionId: scanSession.id,
    qrPayload: staffCard.qrPayload,
    clientRequestId: scanRequestId
  });
  const duplicate = await recordSupervisedStaffQrScan(officeCtx, {
    sessionId: scanSession.id,
    qrPayload: staffCard.qrPayload,
    clientRequestId: scanRequestId
  });
  assert(checkIn.eventType === "CHECK_IN" && duplicate.duplicateRequest, "operator scan must check in and deduplicate retries");
  await closeStaffAttendanceScanSession(officeCtx, { sessionId: scanSession.id, reason: "Identity-card QA completed" });

  const northCard = await issueStaffAttendanceCredential(principalCtx, { staffId: northStaff.staffId });
  await revokeStaffAttendanceCredential(principalCtx, {
    credentialId: northCard.credentialId,
    reason: "Synthetic lost-card revocation test"
  });
  const staffHistory = await listStaffAttendanceCredentials(principalCtx, staff.staffId);
  assert(staffHistory.filter((item) => item.status === "ACTIVE").length === 1, "staff must have only one active credential");
  assert(staffHistory.some((item) => item.status === "SUPERSEDED"), "legacy credential must be superseded during reissue");

  const studentCardV1 = await issueStudentIdentityCard(principalCtx, {
    studentId: mainStudent.id,
    enrollmentId: mainStudent.enrollmentId,
    validFrom: CURRENT_YEAR_START,
    validUntil: CURRENT_YEAR_END
  });
  assert(studentCardV1.studentName === mainStudent.name, "Student ID card must render the scoped student");
  assert(studentCardV1.photoUrl === null, "missing student photograph must render as a safe placeholder");
  const studentPreview = await getStudentIdentityCard(principalCtx, studentCardV1.cardId);
  assert(studentPreview.cardId === studentCardV1.cardId, "Principal must preview the active Student ID card");
  const printResult = await recordStudentIdentityCardPrint(principalCtx, studentCardV1.cardId);
  assert(printResult.printCount === 1, "Student ID print count must be audited and incremented");
  denials.push(await expectError("Student ID reissue reason required", "STUDENT_ID_CARD_REISSUE_REASON_REQUIRED", () =>
    issueStudentIdentityCard(principalCtx, {
      studentId: mainStudent.id,
      enrollmentId: mainStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START,
      validUntil: CURRENT_YEAR_END
    })
  ));
  denials.push(await expectError("teacher Student ID management denial", "FORBIDDEN_PERMISSION:academia.student.id_card.manage", () =>
    issueStudentIdentityCard(teacherCtx, {
      studentId: mainStudent.id,
      enrollmentId: mainStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START
    })
  ));
  denials.push(await expectError("office Student ID management denial", "FORBIDDEN_PERMISSION:academia.student.id_card.manage", () =>
    issueStudentIdentityCard(officeCtx, {
      studentId: mainStudent.id,
      enrollmentId: mainStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START
    })
  ));
  denials.push(await expectError("cross-branch Student ID denial", "STUDENT_ENROLLMENT_NOT_FOUND", () =>
    issueStudentIdentityCard(principalMainOnlyCtx, {
      studentId: northStudent.id,
      enrollmentId: northStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START
    })
  ));
  denials.push(await expectError("cross-institution Student ID denial", "STUDENT_ENROLLMENT_NOT_FOUND", () =>
    issueStudentIdentityCard(principalWithAnnexAccessCtx, {
      studentId: annexStudent.id,
      enrollmentId: annexStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START
    })
  ));
  denials.push(await expectError("cross-tenant Student ID denial", "STUDENT_ID_CARD_NOT_FOUND", () =>
    getStudentIdentityCard(otherPrincipalCtx, studentCardV1.cardId)
  ));
  denials.push(await expectError("cross-tenant enrollment denial", "STUDENT_ENROLLMENT_NOT_FOUND", () =>
    issueStudentIdentityCard(principalCtx, {
      studentId: otherStudent.id,
      enrollmentId: otherStudent.enrollmentId,
      validFrom: CURRENT_YEAR_START
    })
  ));

  const studentCardV2 = await issueStudentIdentityCard(principalCtx, {
    studentId: mainStudent.id,
    enrollmentId: mainStudent.enrollmentId,
    validFrom: CURRENT_YEAR_START,
    validUntil: CURRENT_YEAR_END,
    reason: "Replacement after synthetic damage report"
  });
  assert(studentCardV2.cardVersion === 2, "Student ID replacement must increment the version");
  await deactivateStudentIdentityCard(principalCtx, {
    cardId: studentCardV2.cardId,
    reason: "Synthetic deactivation workflow test"
  });
  const studentCardV3 = await issueStudentIdentityCard(principalCtx, {
    studentId: mainStudent.id,
    enrollmentId: mainStudent.enrollmentId,
    validFrom: CURRENT_YEAR_START,
    validUntil: CURRENT_YEAR_END
  });
  assert(studentCardV3.cardVersion === 3, "Student ID reactivation must preserve version history");
  const activeStudentCards = await db.studentIdentityCard.count({
    where: {
      tenantId: primary.tenant.id,
      studentId: mainStudent.id,
      academicYearId: mainStudent.academicYearId,
      status: "ACTIVE"
    }
  });
  assert(activeStudentCards === 1, "Student must have only one active card per academic year");
  const previousYearWorkspace = await getStudentIdentityCardWorkspace(previousYearCtx, mainStudent.id);
  assert(previousYearWorkspace.enrollments.length === 0 && previousYearWorkspace.cards.length === 0, "workspace must filter cards by active academic year");

  const [audits, cardPermission, selfScanPermission, selfScanAssignments, settings, migrationRows] = await Promise.all([
    db.auditLog.findMany({
      where: {
        tenantId: primary.tenant.id,
        OR: [
          { action: { startsWith: "academia.student.id_card." } },
          { action: { startsWith: "staffboard.attendance.credential." } }
        ]
      },
      select: { action: true, entityType: true, entityId: true, metadataJson: true }
    }),
    db.permission.findUnique({ where: { code: "academia.student.id_card.manage" }, select: { isActive: true } }),
    db.permission.findUnique({ where: { code: "staffboard.attendance.self_scan" }, select: { id: true, isActive: true } }),
    db.rolePermission.count({
      where: { permission: { code: "staffboard.attendance.self_scan" } }
    }),
    db.attendanceSetting.findMany({
      where: { tenantId: primary.tenant.id },
      select: { staffAttendanceCaptureMode: true, staffSelfScanEnabled: true }
    }),
    db.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      WHERE migration_name = '20260825120000_add_identity_cards'
    `
  ]);
  assert(cardPermission?.isActive, "Student ID permission must be active");
  assert((!selfScanPermission || !selfScanPermission.isActive) && selfScanAssignments === 0, "retired self-scan permission must be absent or inactive and unassigned");
  assert(settings.every((setting) => setting.staffAttendanceCaptureMode !== "HYBRID" && !setting.staffSelfScanEnabled), "synthetic settings must remain supervised-only");
  assert(migrationRows.length === 1 && migrationRows[0]?.finished_at, "identity-card migration must be recorded as applied");
  assert(audits.length >= 10, "critical card lifecycle actions must be audited");
  const auditText = JSON.stringify(audits);
  assert(!auditText.includes(staffCard.qrPayload), "raw QR payload must not appear in audit data");
  assert(!auditText.includes(qaPassword), "QA password must not appear in audit data");

  const evidence = {
    generatedAt: new Date().toISOString(),
    target,
    migration: "20260825120000_add_identity_cards",
    syntheticTenantSlug: primary.tenant.slug,
    secondTenantSlug: other.tenant.slug,
    browserFixtures: {
      principalEmail: principal.email,
      officeEmail: office.email,
      teacherEmail: teacher.email,
      staffEmail: staff.email,
      studentId: mainStudent.id,
      staffId: staff.staffId
    },
    checks: {
      migrationLedger: "PASS",
      staffLegacyCompatibility: "PASS",
      staffOwnDigitalView: "PASS",
      staffPrintAndManagementDenial: "PASS",
      staffSelfCameraDenial: "PASS",
      operatorScanAndDuplicatePrevention: "PASS",
      staffSingleActiveCredential: "PASS",
      studentIssuePreviewPrintReissueDeactivate: "PASS",
      studentSingleActiveCard: "PASS",
      crossTenantInstitutionBranchYearScope: "PASS",
      auditOutputAndSensitiveData: "PASS",
      privateStorageUploadDownload: "PENDING_APPROVED_PRIVATE_STORAGE_TARGET",
      denials
    },
    counts: {
      auditRecords: audits.length,
      staffCredentialHistory: staffHistory.length,
      activeStudentCards
    }
  };
  await mkdir(resolve(process.cwd(), ".tmp"), { recursive: true });
  await writeFile(
    resolve(process.cwd(), ".tmp/identity-card-isolated-qa-evidence.json"),
    JSON.stringify(evidence, null, 2),
    "utf8"
  );
  console.log(JSON.stringify({
    ok: true,
    target,
    migration: evidence.migration,
    checks: evidence.checks,
    evidenceFile: ".tmp/identity-card-isolated-qa-evidence.json"
  }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "IDENTITY_CARD_QA_FAILED");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
