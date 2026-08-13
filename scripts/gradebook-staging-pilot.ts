import assert from "node:assert/strict";

import { db } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { hashPassword } from "../src/lib/auth/password";
import type { PlatformAdministratorContext } from "../src/lib/auth/platform-administrator-session";
import type { TenantContext } from "../src/lib/tenant/context";
import { getEffectivePermissions } from "../src/lib/rbac/require-permission";
import { updateSchool } from "../src/modules/campus-core/administrator-services";
import { getGradebookFeatureState } from "../src/modules/gradebook/feature";
import { GRADEBOOK_PERMISSIONS } from "../src/modules/gradebook/permissions";
import {
  getGradebookAssessmentWorkspace,
  getGradebookWorkspace
} from "../src/modules/gradebook/queries/gradebook.queries";
import { assignClassSectionSubjectSchema } from "../src/modules/gradebook/schemas";
import { resolveGradebookRequestContext } from "../src/modules/gradebook/services/request-context.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const CONTROL_SLUG = "gradebook-control";
const COORDINATOR_ROLE = "GRADEBOOK_COORDINATOR";
const OPERATOR_EMAIL = "gradebook-release-operator@qa.invalid";
const UNASSIGNED_EMAIL = "unassigned-teacher@gradebook.qa.invalid";
const CONTROL_EMAIL = "control-principal@gradebook.qa.invalid";
const LOCAL_QA_IDENTITIES = [
  { role: "Principal", email: "principal@demo.jinacampus.test" },
  { role: "Examination Coordinator", email: "office@demo.jinacampus.test" },
  { role: "Assigned Teacher", email: "teacher@demo.jinacampus.test" },
  { role: "Unassigned Teacher", email: UNASSIGNED_EMAIL },
  { role: "Staff denial", email: "staff@demo.jinacampus.test" }
] as const;

const featureFlags = (enabled: boolean) => ({
  gradebookEnabled: enabled,
  gradebookConfigurationEnabled: enabled,
  gradebookMarksEntryEnabled: enabled,
  gradebookImportEnabled: enabled,
  gradebookResultCalculationEnabled: enabled,
  gradebookCoScholasticEnabled: enabled,
  gradebookReportCardsEnabled: enabled,
  gradebookPublicationEnabled: enabled,
  gradebookAnalyticsEnabled: enabled,
  // Parent/student account policy is still deferred.
  gradebookPortalResultsEnabled: false
});

type FixtureIds = {
  pilotTenantId: string;
  controlTenantId: string;
  mainBranchId: string;
  alternateBranchId: string;
  crossInstitutionBranchId: string;
  activeAcademicYearId: string;
  previousAcademicYearId: string;
  mainAssessmentId: string;
  alternateAssessmentId: string;
  crossInstitutionAssessmentId: string;
  previousAssessmentId: string;
  controlAssessmentId: string;
};

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(`${name} does not identify a Supabase project reference.`);
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") throw new Error("Staging pilot tooling is disabled in production mode.");
  if (process.env.GRADEBOOK_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("Unapproved staging project reference.");
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production database target detected. Operation refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) throw new Error("Both database URLs must target GradeBook staging.");
  if (process.env.DEV_DEMO_SEED_ENABLED !== "true") throw new Error("Synthetic staging seed mode is required.");
  if (!process.env.DEV_DEMO_USER_PASSWORD) throw new Error("Synthetic QA password is missing.");
}

async function operatorContext(): Promise<PlatformAdministratorContext> {
  const operator = await db.platformAdministrator.upsert({
    where: { email: OPERATOR_EMAIL },
    create: {
      email: OPERATOR_EMAIL,
      displayName: "GradeBook Staging Release Operator",
      status: "ACTIVE"
    },
    update: { displayName: "GradeBook Staging Release Operator", status: "ACTIVE" }
  });
  return {
    administratorId: operator.id,
    sessionId: "gradebook-staging-release-harness",
    email: operator.email,
    displayName: operator.displayName,
    canManagePrincipalRecovery: false,
    passwordChangeRequired: false,
    userAgent: "gradebook-staging-release-harness"
  };
}

async function setPilotFlags(tenantId: string, enabled: boolean) {
  await updateSchool(await operatorContext(), { tenantId, ...featureFlags(enabled) });
}

async function ensureQaRole(input: {
  tenantId: string;
  code: string;
  name: string;
  description: string;
  permissionCodes: readonly string[];
  createdById?: string;
}) {
  const role = await db.role.upsert({
    where: { tenantId_code: { tenantId: input.tenantId, code: input.code } },
    create: {
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      description: input.description,
      isSystem: false,
      isMutable: true,
      isActive: true,
      createdById: input.createdById
    },
    update: {
      name: input.name,
      description: input.description,
      isActive: true,
      updatedById: input.createdById
    }
  });
  const permissions = await db.permission.findMany({
    where: { code: { in: [...input.permissionCodes] }, isActive: true }
  });
  assert.equal(permissions.length, input.permissionCodes.length, `${input.code} permission registry is incomplete.`);
  await db.rolePermission.createMany({
    data: permissions.map((permission) => ({
      tenantId: input.tenantId,
      roleId: role.id,
      permissionId: permission.id
    })),
    skipDuplicates: true
  });
  return role;
}

async function upsertQaUser(input: {
  tenantId: string;
  branchId: string;
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
}) {
  const user = await db.user.upsert({
    where: { tenantId_email: { tenantId: input.tenantId, email: input.email } },
    create: {
      tenantId: input.tenantId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date()
    },
    update: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName: `${input.firstName} ${input.lastName}`,
      status: "ACTIVE"
    }
  });
  const passwordHash = await hashPassword(process.env.DEV_DEMO_USER_PASSWORD!);
  await db.passwordCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, passwordHash, mustChange: false },
    update: { passwordHash, passwordUpdatedAt: new Date(), mustChange: false }
  });
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  const role = await db.role.findUnique({
    where: { tenantId_code: { tenantId: input.tenantId, code: input.roleCode } }
  });
  if (!role) throw new Error(`Missing ${input.roleCode} role.`);
  await db.userRoleAssignment.upsert({
    where: {
      tenantId_userId_roleId_scopeType_scopeId: {
        tenantId: input.tenantId,
        userId: user.id,
        roleId: role.id,
        scopeType: "TENANT",
        scopeId: "TENANT"
      }
    },
    create: {
      tenantId: input.tenantId,
      userId: user.id,
      roleId: role.id,
      scopeType: "TENANT",
      scopeId: "TENANT",
      isActive: true
    },
    update: { isActive: true, startsAt: null, endsAt: null }
  });
  await db.userBranchAccess.upsert({
    where: {
      tenantId_userId_branchId: {
        tenantId: input.tenantId,
        userId: user.id,
        branchId: input.branchId
      }
    },
    create: {
      tenantId: input.tenantId,
      userId: user.id,
      branchId: input.branchId,
      canAccessAllAcademicYears: true,
      isPrimary: true,
      isActive: true
    },
    update: { canAccessAllAcademicYears: true, isPrimary: true, isActive: true }
  });
  return user;
}

async function upsertAssessment(input: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  classSectionId: string;
  classSectionSubjectId: string;
  code: string;
  title: string;
  assessmentDate: Date;
  createdById: string;
}) {
  return db.gradebookAssessment.upsert({
    where: {
      tenantId_classSectionSubjectId_code: {
        tenantId: input.tenantId,
        classSectionSubjectId: input.classSectionSubjectId,
        code: input.code
      }
    },
    create: { ...input, type: "UNIT_TEST", maxMarks: 50, passMarks: 18, status: "OPEN" },
    update: {
      title: input.title,
      assessmentDate: input.assessmentDate,
      maxMarks: 50,
      passMarks: 18,
      status: "OPEN",
      cancelledAt: null,
      cancelledById: null,
      cancellationReason: null
    }
  });
}

async function preparePilot(): Promise<FixtureIds> {
  const pilot = await db.tenant.findUnique({ where: { slug: PILOT_SLUG } });
  if (!pilot) throw new Error("Run the guarded synthetic seed before pilot setup.");
  const institution = await db.institution.findFirst({
    where: { tenantId: pilot.id, status: "ACTIVE" },
    orderBy: { name: "asc" }
  });
  const branch = await db.branch.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "MAIN" } } });
  const year = institution
    ? await db.academicYear.findFirst({
        where: { tenantId: pilot.id, institutionId: institution.id, status: "ACTIVE", isActive: true }
      })
    : null;
  const [principal, teacher, office] = await Promise.all([
    db.user.findUnique({ where: { tenantId_email: { tenantId: pilot.id, email: "principal@demo.jinacampus.test" } } }),
    db.user.findUnique({ where: { tenantId_email: { tenantId: pilot.id, email: "teacher@demo.jinacampus.test" } } }),
    db.user.findUnique({ where: { tenantId_email: { tenantId: pilot.id, email: "office@demo.jinacampus.test" } } })
  ]);
  if (!institution || !branch || !year || !principal || !teacher || !office) {
    throw new Error("Synthetic pilot institution, scope, or users are incomplete.");
  }
  const anotherEnabled = await db.tenantSettings.findFirst({
    where: { tenantId: { not: pilot.id }, gradebookEnabled: true }
  });
  if (anotherEnabled) throw new Error("Another staging tenant already has GradeBook enabled.");

  const [academicClass, sectionA, sectionB, subject] = await Promise.all([
    db.class.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "CLASS-1" } } }),
    db.section.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "A" } } }),
    db.section.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "B" } } }),
    db.subject.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "ENG" } } })
  ]);
  if (!academicClass || !sectionA || !sectionB || !subject) throw new Error("Synthetic pilot academia is incomplete.");
  const mainClassSection = await db.classSection.findUnique({
    where: {
      tenantId_branchId_academicYearId_classId_sectionId: {
        tenantId: pilot.id,
        branchId: branch.id,
        academicYearId: year.id,
        classId: academicClass.id,
        sectionId: sectionA.id
      }
    }
  });
  if (!mainClassSection) throw new Error("Synthetic main class-section is missing.");

  const unassigned = await upsertQaUser({
    tenantId: pilot.id,
    branchId: branch.id,
    email: UNASSIGNED_EMAIL,
    firstName: "Una",
    lastName: "Assigned",
    roleCode: "TEACHER"
  });
  const coordinatorRole = await ensureQaRole({
    tenantId: pilot.id,
    code: COORDINATOR_ROLE,
    name: "GradeBook Examination Coordinator",
    description: "Pilot-only GradeBook coordination permission bundle.",
    permissionCodes: ["campuscore.tenant.view", ...GRADEBOOK_PERMISSIONS],
    createdById: principal.id
  });
  await db.userRoleAssignment.upsert({
    where: {
      tenantId_userId_roleId_scopeType_scopeId: {
        tenantId: pilot.id,
        userId: office.id,
        roleId: coordinatorRole.id,
        scopeType: "TENANT",
        scopeId: "TENANT"
      }
    },
    create: {
      tenantId: pilot.id,
      userId: office.id,
      roleId: coordinatorRole.id,
      scopeType: "TENANT",
      scopeId: "TENANT",
      assignedById: principal.id,
      isActive: true
    },
    update: { assignedById: principal.id, isActive: true, startsAt: null, endsAt: null }
  });

  const alternateBranch = await db.branch.upsert({
    where: { tenantId_code: { tenantId: pilot.id, code: "NORTH-QA" } },
    create: {
      tenantId: pilot.id,
      institutionId: institution.id,
      name: "North QA Branch",
      code: "NORTH-QA",
      status: "ACTIVE"
    },
    update: { institutionId: institution.id, name: "North QA Branch", status: "ACTIVE" }
  });
  const secondaryInstitution = await db.institution.upsert({
    where: { tenantId_code: { tenantId: pilot.id, code: "SECONDARY-QA" } },
    create: {
      tenantId: pilot.id,
      name: "Synthetic Secondary Institution",
      displayName: "Synthetic Secondary Institution",
      code: "SECONDARY-QA",
      status: "ACTIVE"
    },
    update: { name: "Synthetic Secondary Institution", status: "ACTIVE" }
  });
  const crossInstitutionBranch = await db.branch.upsert({
    where: { tenantId_code: { tenantId: pilot.id, code: "SECOND-INST-QA" } },
    create: {
      tenantId: pilot.id,
      institutionId: secondaryInstitution.id,
      name: "Secondary Institution QA Branch",
      code: "SECOND-INST-QA",
      status: "ACTIVE"
    },
    update: {
      institutionId: secondaryInstitution.id,
      name: "Secondary Institution QA Branch",
      status: "ACTIVE"
    }
  });
  const crossInstitutionYear = await db.academicYear.upsert({
    where: {
      tenantId_institutionId_name: {
        tenantId: pilot.id,
        institutionId: secondaryInstitution.id,
        name: "2026-27 Secondary QA"
      }
    },
    create: {
      tenantId: pilot.id,
      institutionId: secondaryInstitution.id,
      name: "2026-27 Secondary QA",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2027-03-31T00:00:00.000Z"),
      status: "ACTIVE",
      isActive: true
    },
    update: { status: "ACTIVE", isActive: true }
  });
  const previousYear = await db.academicYear.upsert({
    where: {
      tenantId_institutionId_name: {
        tenantId: pilot.id,
        institutionId: institution.id,
        name: "2025-26 QA"
      }
    },
    create: {
      tenantId: pilot.id,
      institutionId: institution.id,
      name: "2025-26 QA",
      startDate: new Date("2025-04-01T00:00:00.000Z"),
      endDate: new Date("2026-03-31T00:00:00.000Z"),
      status: "ARCHIVED",
      isActive: false
    },
    update: { status: "ARCHIVED", isActive: false }
  });

  const alternateClassSection = await db.classSection.upsert({
    where: {
      tenantId_branchId_academicYearId_classId_sectionId: {
        tenantId: pilot.id,
        branchId: alternateBranch.id,
        academicYearId: year.id,
        classId: academicClass.id,
        sectionId: sectionB.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: alternateBranch.id,
      academicYearId: year.id,
      classId: academicClass.id,
      sectionId: sectionB.id,
      displayName: "Class 1-B North QA",
      status: "ACTIVE"
    },
    update: { displayName: "Class 1-B North QA", status: "ACTIVE" }
  });
  const previousClassSection = await db.classSection.upsert({
    where: {
      tenantId_branchId_academicYearId_classId_sectionId: {
        tenantId: pilot.id,
        branchId: branch.id,
        academicYearId: previousYear.id,
        classId: academicClass.id,
        sectionId: sectionA.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: branch.id,
      academicYearId: previousYear.id,
      classId: academicClass.id,
      sectionId: sectionA.id,
      displayName: "Class 1-A 2025-26 QA",
      status: "ACTIVE"
    },
    update: { displayName: "Class 1-A 2025-26 QA", status: "ACTIVE" }
  });
  const crossInstitutionClassSection = await db.classSection.upsert({
    where: {
      tenantId_branchId_academicYearId_classId_sectionId: {
        tenantId: pilot.id,
        branchId: crossInstitutionBranch.id,
        academicYearId: crossInstitutionYear.id,
        classId: academicClass.id,
        sectionId: sectionB.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: crossInstitutionBranch.id,
      academicYearId: crossInstitutionYear.id,
      classId: academicClass.id,
      sectionId: sectionB.id,
      displayName: "Class 1-B Secondary Institution QA",
      status: "ACTIVE"
    },
    update: { displayName: "Class 1-B Secondary Institution QA", status: "ACTIVE" }
  });
  const mainSubject = await db.classSectionSubject.upsert({
    where: {
      tenantId_classSectionId_subjectId: {
        tenantId: pilot.id,
        classSectionId: mainClassSection.id,
        subjectId: subject.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: branch.id,
      academicYearId: year.id,
      classSectionId: mainClassSection.id,
      subjectId: subject.id,
      teacherUserId: teacher.id,
      createdById: principal.id,
      status: "ACTIVE"
    },
    update: { teacherUserId: teacher.id, updatedById: principal.id, status: "ACTIVE" }
  });
  const alternateSubject = await db.classSectionSubject.upsert({
    where: {
      tenantId_classSectionId_subjectId: {
        tenantId: pilot.id,
        classSectionId: alternateClassSection.id,
        subjectId: subject.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: alternateBranch.id,
      academicYearId: year.id,
      classSectionId: alternateClassSection.id,
      subjectId: subject.id,
      createdById: principal.id,
      status: "ACTIVE"
    },
    update: { teacherUserId: null, updatedById: principal.id, status: "ACTIVE" }
  });
  const previousSubject = await db.classSectionSubject.upsert({
    where: {
      tenantId_classSectionId_subjectId: {
        tenantId: pilot.id,
        classSectionId: previousClassSection.id,
        subjectId: subject.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: branch.id,
      academicYearId: previousYear.id,
      classSectionId: previousClassSection.id,
      subjectId: subject.id,
      createdById: principal.id,
      status: "ACTIVE"
    },
    update: { teacherUserId: null, updatedById: principal.id, status: "ACTIVE" }
  });
  const crossInstitutionSubject = await db.classSectionSubject.upsert({
    where: {
      tenantId_classSectionId_subjectId: {
        tenantId: pilot.id,
        classSectionId: crossInstitutionClassSection.id,
        subjectId: subject.id
      }
    },
    create: {
      tenantId: pilot.id,
      branchId: crossInstitutionBranch.id,
      academicYearId: crossInstitutionYear.id,
      classSectionId: crossInstitutionClassSection.id,
      subjectId: subject.id,
      createdById: principal.id,
      status: "ACTIVE"
    },
    update: { teacherUserId: null, updatedById: principal.id, status: "ACTIVE" }
  });
  const mainAssessment = await upsertAssessment({
    tenantId: pilot.id,
    branchId: branch.id,
    academicYearId: year.id,
    classSectionId: mainClassSection.id,
    classSectionSubjectId: mainSubject.id,
    code: "GB-QA-MAIN-001",
    title: "Synthetic Main Branch Assessment",
    assessmentDate: new Date("2026-08-01T00:00:00.000Z"),
    createdById: principal.id
  });
  const alternateAssessment = await upsertAssessment({
    tenantId: pilot.id,
    branchId: alternateBranch.id,
    academicYearId: year.id,
    classSectionId: alternateClassSection.id,
    classSectionSubjectId: alternateSubject.id,
    code: "GB-QA-NORTH-001",
    title: "Synthetic Cross-Branch Assessment",
    assessmentDate: new Date("2026-08-02T00:00:00.000Z"),
    createdById: principal.id
  });
  const previousAssessment = await upsertAssessment({
    tenantId: pilot.id,
    branchId: branch.id,
    academicYearId: previousYear.id,
    classSectionId: previousClassSection.id,
    classSectionSubjectId: previousSubject.id,
    code: "GB-QA-PREV-001",
    title: "Synthetic Cross-Year Assessment",
    assessmentDate: new Date("2025-08-01T00:00:00.000Z"),
    createdById: principal.id
  });
  const crossInstitutionAssessment = await upsertAssessment({
    tenantId: pilot.id,
    branchId: crossInstitutionBranch.id,
    academicYearId: crossInstitutionYear.id,
    classSectionId: crossInstitutionClassSection.id,
    classSectionSubjectId: crossInstitutionSubject.id,
    code: "GB-QA-SECOND-INST-001",
    title: "Synthetic Cross-Institution Assessment",
    assessmentDate: new Date("2026-08-04T00:00:00.000Z"),
    createdById: principal.id
  });

  const control = await db.tenant.upsert({
    where: { slug: CONTROL_SLUG },
    create: { name: "GradeBook Disabled Control School", slug: CONTROL_SLUG, status: "ACTIVE" },
    update: { name: "GradeBook Disabled Control School", status: "ACTIVE" }
  });
  await db.tenantSettings.upsert({
    where: { tenantId: control.id },
    create: {
      tenantId: control.id,
      brandName: "JinaCampus",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      ...featureFlags(false)
    },
    update: featureFlags(false)
  });
  const controlInstitution = await db.institution.upsert({
    where: { tenantId_code: { tenantId: control.id, code: "CONTROL" } },
    create: {
      tenantId: control.id,
      name: "GradeBook Disabled Control Institution",
      displayName: "GradeBook Disabled Control School",
      code: "CONTROL",
      status: "ACTIVE"
    },
    update: { status: "ACTIVE" }
  });
  const controlBranch = await db.branch.upsert({
    where: { tenantId_code: { tenantId: control.id, code: "MAIN" } },
    create: {
      tenantId: control.id,
      institutionId: controlInstitution.id,
      name: "Control Main Branch",
      code: "MAIN",
      status: "ACTIVE"
    },
    update: { institutionId: controlInstitution.id, status: "ACTIVE" }
  });
  const controlYear = await db.academicYear.upsert({
    where: {
      tenantId_institutionId_name: {
        tenantId: control.id,
        institutionId: controlInstitution.id,
        name: "2026-27"
      }
    },
    create: {
      tenantId: control.id,
      institutionId: controlInstitution.id,
      name: "2026-27",
      startDate: new Date("2026-04-01T00:00:00.000Z"),
      endDate: new Date("2027-03-31T00:00:00.000Z"),
      status: "ACTIVE",
      isActive: true
    },
    update: { status: "ACTIVE", isActive: true }
  });
  await ensureQaRole({
    tenantId: control.id,
    code: "PRINCIPAL",
    name: "Control Principal",
    description: "Staging-only role for the disabled-tenant GradeBook gate.",
    permissionCodes: GRADEBOOK_PERMISSIONS
  });
  const controlPrincipal = await upsertQaUser({
    tenantId: control.id,
    branchId: controlBranch.id,
    email: CONTROL_EMAIL,
    firstName: "Control",
    lastName: "Principal",
    roleCode: "PRINCIPAL"
  });
  const controlClass = await db.class.upsert({
    where: { tenantId_code: { tenantId: control.id, code: "CLASS-1" } },
    create: { tenantId: control.id, code: "CLASS-1", name: "Class 1", sortOrder: 1, status: "ACTIVE" },
    update: { status: "ACTIVE" }
  });
  const controlSection = await db.section.upsert({
    where: { tenantId_code: { tenantId: control.id, code: "A" } },
    create: { tenantId: control.id, code: "A", name: "A", sortOrder: 1, status: "ACTIVE" },
    update: { status: "ACTIVE" }
  });
  const controlSubject = await db.subject.upsert({
    where: { tenantId_code: { tenantId: control.id, code: "ENG" } },
    create: { tenantId: control.id, code: "ENG", name: "English", type: "CORE", status: "ACTIVE" },
    update: { status: "ACTIVE" }
  });
  const controlClassSection = await db.classSection.upsert({
    where: {
      tenantId_branchId_academicYearId_classId_sectionId: {
        tenantId: control.id,
        branchId: controlBranch.id,
        academicYearId: controlYear.id,
        classId: controlClass.id,
        sectionId: controlSection.id
      }
    },
    create: {
      tenantId: control.id,
      branchId: controlBranch.id,
      academicYearId: controlYear.id,
      classId: controlClass.id,
      sectionId: controlSection.id,
      displayName: "Control Class 1-A",
      status: "ACTIVE"
    },
    update: { status: "ACTIVE" }
  });
  const controlClassSubject = await db.classSectionSubject.upsert({
    where: {
      tenantId_classSectionId_subjectId: {
        tenantId: control.id,
        classSectionId: controlClassSection.id,
        subjectId: controlSubject.id
      }
    },
    create: {
      tenantId: control.id,
      branchId: controlBranch.id,
      academicYearId: controlYear.id,
      classSectionId: controlClassSection.id,
      subjectId: controlSubject.id,
      createdById: controlPrincipal.id,
      status: "ACTIVE"
    },
    update: { status: "ACTIVE" }
  });
  const controlAssessment = await upsertAssessment({
    tenantId: control.id,
    branchId: controlBranch.id,
    academicYearId: controlYear.id,
    classSectionId: controlClassSection.id,
    classSectionSubjectId: controlClassSubject.id,
    code: "GB-QA-CONTROL-001",
    title: "Synthetic Cross-Tenant Assessment",
    assessmentDate: new Date("2026-08-03T00:00:00.000Z"),
    createdById: controlPrincipal.id
  });

  await db.auditLog.create({
    data: {
      tenantId: pilot.id,
      branchId: branch.id,
      academicYearId: year.id,
      actorUserId: principal.id,
      action: "gradebook.qa.pilot_fixtures_prepared",
      entityType: "Tenant",
      entityId: pilot.id,
      metadataJson: {
        syntheticOnly: true,
        coordinatorRoleCode: COORDINATOR_ROLE,
        unassignedTeacherUserId: unassigned.id,
        secondaryInstitutionId: secondaryInstitution.id,
        controlTenantId: control.id
      }
    }
  });
  await setPilotFlags(pilot.id, true);
  return {
    pilotTenantId: pilot.id,
    controlTenantId: control.id,
    mainBranchId: branch.id,
    alternateBranchId: alternateBranch.id,
    crossInstitutionBranchId: crossInstitutionBranch.id,
    activeAcademicYearId: year.id,
    previousAcademicYearId: previousYear.id,
    mainAssessmentId: mainAssessment.id,
    alternateAssessmentId: alternateAssessment.id,
    crossInstitutionAssessmentId: crossInstitutionAssessment.id,
    previousAssessmentId: previousAssessment.id,
    controlAssessmentId: controlAssessment.id
  };
}

async function loadContext(slug: string, email: string): Promise<TenantContext> {
  const user = await db.user.findFirst({
    where: { tenant: { slug }, email, status: "ACTIVE" },
    include: {
      tenant: true,
      passwordCredential: { select: { mustChange: true } },
      branchAccesses: {
        where: { isActive: true, branch: { status: "ACTIVE" } },
        include: { branch: { include: { institution: true } } },
        orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }]
      },
      roleAssignments: {
        where: { isActive: true, role: { isActive: true } },
        include: { role: true }
      }
    }
  });
  if (!user) throw new Error(`Missing QA user ${email}.`);
  const primary = user.branchAccesses[0];
  if (!primary) throw new Error(`QA user ${email} has no active branch.`);
  const year = await db.academicYear.findFirst({
    where: {
      tenantId: user.tenantId,
      institutionId: primary.branch.institutionId,
      status: "ACTIVE",
      isActive: true
    }
  });
  if (!year) throw new Error(`QA user ${email} has no active academic year.`);
  return {
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantSlug: user.tenant.slug,
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName ?? `${user.firstName} ${user.lastName ?? ""}`.trim(),
    userType: user.userType,
    activeBranchId: primary.branchId,
    activeBranchName: primary.branch.name,
    activeBranchCode: primary.branch.code,
    accessibleBranchIds: user.branchAccesses.map((access) => access.branchId),
    activeAcademicYearId: year.id,
    activeAcademicYearName: year.name,
    institutionId: primary.branch.institution.id,
    institutionName: primary.branch.institution.name,
    institutionDisplayName: primary.branch.institution.displayName,
    roleCodes: user.roleAssignments.map((assignment) => assignment.role.code),
    roleLabels: user.roleAssignments.map((assignment) => assignment.role.name),
    passwordChangeRequired: user.passwordCredential?.mustChange ?? false,
    timeZone: primary.branch.timezone
  };
}

function errorCode(error: unknown) {
  if (error instanceof AppError) return error.code;
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

async function expectError(label: string, expected: string, action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    const actual = errorCode(error);
    assert.ok(
      actual === expected || actual.startsWith(`${expected}:`),
      `${label}: expected ${expected}, received ${actual}`
    );
    return { label, result: "PASS", code: expected };
  }
  throw new Error(`${label}: expected ${expected}, but the action succeeded.`);
}

async function getFixtureIds(): Promise<FixtureIds> {
  const [pilot, control] = await Promise.all([
    db.tenant.findUnique({ where: { slug: PILOT_SLUG } }),
    db.tenant.findUnique({ where: { slug: CONTROL_SLUG } })
  ]);
  if (!pilot || !control) throw new Error("Run PilotPrepare before verification.");
  const [mainBranch, alternateBranch, crossInstitutionBranch] = await Promise.all([
    db.branch.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "MAIN" } } }),
    db.branch.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "NORTH-QA" } } }),
    db.branch.findUnique({ where: { tenantId_code: { tenantId: pilot.id, code: "SECOND-INST-QA" } } })
  ]);
  if (!mainBranch || !alternateBranch || !crossInstitutionBranch) {
    throw new Error("One or more GradeBook staging branches are missing.");
  }
  const [
    activeYear,
    previousYear,
    mainAssessment,
    alternateAssessment,
    crossInstitutionAssessment,
    previousAssessment,
    controlAssessment
  ] = await Promise.all([
    db.academicYear.findFirst({
      where: { tenantId: pilot.id, institutionId: mainBranch.institutionId, status: "ACTIVE", isActive: true }
    }),
    db.academicYear.findFirst({ where: { tenantId: pilot.id, name: "2025-26 QA" } }),
    db.gradebookAssessment.findFirst({ where: { tenantId: pilot.id, code: "GB-QA-MAIN-001" } }),
    db.gradebookAssessment.findFirst({ where: { tenantId: pilot.id, code: "GB-QA-NORTH-001" } }),
    db.gradebookAssessment.findFirst({ where: { tenantId: pilot.id, code: "GB-QA-SECOND-INST-001" } }),
    db.gradebookAssessment.findFirst({ where: { tenantId: pilot.id, code: "GB-QA-PREV-001" } }),
    db.gradebookAssessment.findFirst({ where: { tenantId: control.id, code: "GB-QA-CONTROL-001" } })
  ]);
  if (
    !activeYear || !previousYear || !mainAssessment || !alternateAssessment ||
    !crossInstitutionAssessment || !previousAssessment || !controlAssessment
  ) {
    throw new Error("One or more GradeBook staging fixtures are missing.");
  }
  return {
    pilotTenantId: pilot.id,
    controlTenantId: control.id,
    mainBranchId: mainBranch.id,
    alternateBranchId: alternateBranch.id,
    crossInstitutionBranchId: crossInstitutionBranch.id,
    activeAcademicYearId: activeYear.id,
    previousAcademicYearId: previousYear.id,
    mainAssessmentId: mainAssessment.id,
    alternateAssessmentId: alternateAssessment.id,
    crossInstitutionAssessmentId: crossInstitutionAssessment.id,
    previousAssessmentId: previousAssessment.id,
    controlAssessmentId: controlAssessment.id
  };
}

async function gradebookRowCounts(tenantId: string) {
  const [assignments, assessments, exams, jobs, batches, reportCards, resultRuns] = await Promise.all([
    db.classSectionSubject.count({ where: { tenantId } }),
    db.gradebookAssessment.count({ where: { tenantId } }),
    db.gradebookExam.count({ where: { tenantId } }),
    db.gradebookJob.count({ where: { tenantId } }),
    db.gradebookMarkEntryBatch.count({ where: { tenantId } }),
    db.gradebookReportCard.count({ where: { tenantId } }),
    db.gradebookResultRun.count({ where: { tenantId } })
  ]);
  return { assignments, assessments, exams, jobs, batches, reportCards, resultRuns };
}

async function verifyPilot() {
  const ids = await getFixtureIds();
  // Hosted staging can enforce a small direct-connection allowance. Load the
  // six synthetic identities serially so the authorization matrix remains
  // deterministic without widening the migration or QA connection limits.
  const principal = await loadContext(PILOT_SLUG, "principal@demo.jinacampus.test");
  const coordinator = await loadContext(PILOT_SLUG, "office@demo.jinacampus.test");
  const assignedTeacher = await loadContext(PILOT_SLUG, "teacher@demo.jinacampus.test");
  const unassignedTeacher = await loadContext(PILOT_SLUG, UNASSIGNED_EMAIL);
  const staff = await loadContext(PILOT_SLUG, "staff@demo.jinacampus.test");
  const controlPrincipal = await loadContext(CONTROL_SLUG, CONTROL_EMAIL);
  const evidence: Array<Record<string, unknown>> = [];

  assert.deepEqual(await getGradebookFeatureState({ tenantId: ids.pilotTenantId }), {
    enabled: true,
    configuration: true,
    marksEntry: true,
    import: true,
    resultCalculation: true,
    coScholastic: true,
    reportCards: true,
    publication: true,
    analytics: true,
    portalResults: false
  });
  assert.equal(
    await db.tenantSettings.count({
      where: { tenantId: { not: ids.pilotTenantId }, gradebookEnabled: true }
    }),
    0
  );
  evidence.push({ label: "pilot enabled and every non-pilot tenant disabled", result: "PASS" });

  const principalWorkspace = await getGradebookWorkspace(principal);
  assert.ok(principalWorkspace?.assessments.some((item) => item.id === ids.mainAssessmentId));
  evidence.push({ label: "Principal authorised workspace", result: "PASS" });

  const coordinatorPermissions = await getEffectivePermissions({
    ctx: coordinator,
    branchId: ids.mainBranchId,
    academicYearId: ids.activeAcademicYearId
  });
  assert.ok(coordinatorPermissions.has("gradebook.exam.create"));
  const coordinatorWorkspace = await getGradebookWorkspace(coordinator);
  assert.ok(coordinatorWorkspace?.assessments.some((item) => item.id === ids.mainAssessmentId));
  evidence.push({ label: "Examination Coordinator authorised workspace", result: "PASS" });

  const assignedWorkspace = await getGradebookAssessmentWorkspace(assignedTeacher, ids.mainAssessmentId);
  assert.ok(assignedWorkspace);
  assert.equal(assignedWorkspace.assessment.id, ids.mainAssessmentId);
  evidence.push({ label: "assigned Teacher assessment access", result: "PASS" });

  const unassignedWorkspace = await getGradebookWorkspace(unassignedTeacher);
  assert.equal(unassignedWorkspace?.assessments.length, 0);
  assert.equal(unassignedWorkspace?.classSections.length, 0);
  evidence.push(await expectError(
    "unassigned Teacher direct assessment denial",
    "GRADEBOOK_ASSESSMENT_NOT_FOUND",
    () => getGradebookAssessmentWorkspace(unassignedTeacher, ids.mainAssessmentId)
  ));
  evidence.push(await expectError("Staff role denial", "FORBIDDEN_PERMISSION", () => getGradebookWorkspace(staff)));
  evidence.push(await expectError(
    "cross-branch direct record denial",
    "GRADEBOOK_ASSESSMENT_NOT_FOUND",
    () => getGradebookAssessmentWorkspace(principal, ids.alternateAssessmentId)
  ));
  evidence.push(await expectError(
    "cross-institution direct record denial",
    "GRADEBOOK_ASSESSMENT_NOT_FOUND",
    () => getGradebookAssessmentWorkspace(principal, ids.crossInstitutionAssessmentId)
  ));
  evidence.push(await expectError(
    "cross-academic-year direct record denial",
    "GRADEBOOK_ASSESSMENT_NOT_FOUND",
    () => getGradebookAssessmentWorkspace(principal, ids.previousAssessmentId)
  ));
  evidence.push(await expectError(
    "cross-tenant direct record denial",
    "GRADEBOOK_ASSESSMENT_NOT_FOUND",
    () => getGradebookAssessmentWorkspace(principal, ids.controlAssessmentId)
  ));
  evidence.push(await expectError(
    "unauthorised branch permission denial",
    "FORBIDDEN_BRANCH_ACCESS",
    () => getEffectivePermissions({
      ctx: principal,
      branchId: ids.alternateBranchId,
      academicYearId: ids.activeAcademicYearId
    })
  ));
  evidence.push(await expectError(
    "cross-institution branch permission denial",
    "FORBIDDEN_BRANCH_ACCESS",
    () => getEffectivePermissions({
      ctx: principal,
      branchId: ids.crossInstitutionBranchId,
      academicYearId: ids.activeAcademicYearId
    })
  ));
  evidence.push(await expectError(
    "modified branch context denial",
    "GRADEBOOK_BRANCH_CONTEXT_REQUIRED",
    () => resolveGradebookRequestContext(
      { ...principal, activeBranchId: ids.alternateBranchId },
      { permission: "gradebook.view" }
    )
  ));
  evidence.push(await expectError(
    "disabled control tenant denial",
    "GRADEBOOK_NOT_ENABLED",
    () => getGradebookWorkspace(controlPrincipal)
  ));

  const injectedScope = assignClassSectionSubjectSchema.safeParse({
    classSectionId: ids.mainAssessmentId,
    subjectId: ids.mainAssessmentId,
    tenantId: ids.controlTenantId,
    branchId: ids.alternateBranchId,
    actorUserId: principal.userId,
    role: "PRINCIPAL"
  });
  assert.equal(injectedScope.success, false);
  evidence.push({ label: "client-owned scope fields rejected", result: "PASS" });

  const beforeDisable = await gradebookRowCounts(ids.pilotTenantId);
  await setPilotFlags(ids.pilotTenantId, false);
  try {
    assert.equal((await getGradebookFeatureState({ tenantId: ids.pilotTenantId })).enabled, false);
    evidence.push(await expectError(
      "feature-disable server denial",
      "GRADEBOOK_NOT_ENABLED",
      () => getGradebookWorkspace(principal)
    ));
    assert.deepEqual(await gradebookRowCounts(ids.pilotTenantId), beforeDisable);
    evidence.push({ label: "feature-disable preserves GradeBook data", result: "PASS" });
  } finally {
    await setPilotFlags(ids.pilotTenantId, true);
  }
  assert.equal((await getGradebookFeatureState({ tenantId: ids.pilotTenantId })).enabled, true);
  assert.deepEqual(await gradebookRowCounts(ids.pilotTenantId), beforeDisable);
  evidence.push({ label: "pilot re-enabled after rollback rehearsal", result: "PASS" });

  const auditCount = await db.platformAuditLog.count({
    where: {
      actor: { email: OPERATOR_EMAIL },
      action: "platform.school.updated",
      entityType: "Tenant",
      entityId: ids.pilotTenantId
    }
  });
  assert.ok(auditCount >= 3);
  evidence.push({ label: "feature changes platform-audited", result: "PASS", count: auditCount });
  return { ok: true, evidence, rowCounts: beforeDisable };
}

async function inspectPilot() {
  const [pilot, control] = await Promise.all([
    db.tenant.findUnique({
      where: { slug: PILOT_SLUG },
      include: {
        tenantSettings: true,
        _count: { select: { users: true, branches: true, academicYears: true } }
      }
    }),
    db.tenant.findUnique({
      where: { slug: CONTROL_SLUG },
      include: {
        tenantSettings: true,
        _count: { select: { users: true, branches: true, academicYears: true } }
      }
    })
  ]);
  return {
    pilot: pilot ? {
      slug: pilot.slug,
      enabled: pilot.tenantSettings?.gradebookEnabled === true,
      portalResultsEnabled: pilot.tenantSettings?.gradebookPortalResultsEnabled === true,
      users: pilot._count.users,
      branches: pilot._count.branches,
      academicYears: pilot._count.academicYears
    } : null,
    control: control ? {
      slug: control.slug,
      enabled: control.tenantSettings?.gradebookEnabled === true,
      users: control._count.users,
      branches: control._count.branches,
      academicYears: control._count.academicYears
    } : null
  };
}

async function assertLocalUiReady() {
  const ids = await getFixtureIds();
  const state = await inspectPilot();
  assert.equal(state.pilot?.enabled, true, "The synthetic GradeBook pilot is disabled.");
  assert.equal(state.pilot?.portalResultsEnabled, false, "Deferred portal results must remain disabled.");
  assert.equal(state.control?.enabled, false, "The control tenant must remain disabled.");

  const features = await getGradebookFeatureState({ tenantId: ids.pilotTenantId });
  assert.deepEqual(features, {
    enabled: true,
    configuration: true,
    marksEntry: true,
    import: true,
    resultCalculation: true,
    coScholastic: true,
    reportCards: true,
    publication: true,
    analytics: true,
    portalResults: false
  });

  const users = await db.user.findMany({
    where: {
      tenantId: ids.pilotTenantId,
      email: { in: LOCAL_QA_IDENTITIES.map((identity) => identity.email) },
      status: "ACTIVE"
    },
    select: {
      email: true,
      passwordCredential: { select: { id: true } },
      branchAccesses: { where: { isActive: true }, select: { id: true } }
    }
  });
  assert.equal(users.length, LOCAL_QA_IDENTITIES.length, "One or more local QA identities are missing.");
  for (const user of users) {
    assert.ok(user.passwordCredential, `Local QA identity ${user.email} has no password credential.`);
    assert.ok(user.branchAccesses.length > 0, `Local QA identity ${user.email} has no active branch access.`);
  }

  const principal = await loadContext(PILOT_SLUG, LOCAL_QA_IDENTITIES[0].email);
  const coordinator = await loadContext(PILOT_SLUG, LOCAL_QA_IDENTITIES[1].email);
  const assignedTeacher = await loadContext(PILOT_SLUG, LOCAL_QA_IDENTITIES[2].email);
  const unassignedTeacher = await loadContext(PILOT_SLUG, LOCAL_QA_IDENTITIES[3].email);
  const staff = await loadContext(PILOT_SLUG, LOCAL_QA_IDENTITIES[4].email);

  const principalPermissions = await getEffectivePermissions({
    ctx: principal,
    branchId: ids.mainBranchId,
    academicYearId: ids.activeAcademicYearId
  });
  const coordinatorPermissions = await getEffectivePermissions({
    ctx: coordinator,
    branchId: ids.mainBranchId,
    academicYearId: ids.activeAcademicYearId
  });
  const teacherPermissions = await getEffectivePermissions({
    ctx: assignedTeacher,
    branchId: ids.mainBranchId,
    academicYearId: ids.activeAcademicYearId
  });
  assert.ok(principalPermissions.has("gradebook.dashboard.view"));
  assert.ok(principalPermissions.has("gradebook.scheme.manage"));
  assert.ok(coordinatorPermissions.has("gradebook.exam.create"));
  assert.ok(teacherPermissions.has("gradebook.marks.enter"));

  const principalWorkspace = await getGradebookWorkspace(principal);
  const coordinatorWorkspace = await getGradebookWorkspace(coordinator);
  const assignedWorkspace = await getGradebookAssessmentWorkspace(assignedTeacher, ids.mainAssessmentId);
  const unassignedWorkspace = await getGradebookWorkspace(unassignedTeacher);
  assert.ok(principalWorkspace?.assessments.some((assessment) => assessment.id === ids.mainAssessmentId));
  assert.ok(coordinatorWorkspace?.assessments.some((assessment) => assessment.id === ids.mainAssessmentId));
  assert.equal(assignedWorkspace?.assessment.id, ids.mainAssessmentId);
  assert.equal(unassignedWorkspace?.assessments.length, 0);
  await expectError("Staff local UI denial", "FORBIDDEN_PERMISSION", () => getGradebookWorkspace(staff));

  return {
    ok: true,
    command: "local-ready",
    target: "gradebook-mvp-staging",
    tenant: PILOT_SLUG,
    loginRoute: `/?schoolId=${PILOT_SLUG}`,
    gradebookRoute: "/gradebook",
    identities: LOCAL_QA_IDENTITIES,
    features,
    fixtureScope: {
      branchReady: true,
      academicYearReady: true,
      assessmentReady: true
    }
  };
}

async function main() {
  assertStaging();
  const command = process.argv[2]?.toLowerCase();
  if (command === "prepare") {
    return { ok: true, command, fixtures: await preparePilot(), state: await inspectPilot() };
  }
  if (command === "verify") {
    return { command, ...(await verifyPilot()), state: await inspectPilot() };
  }
  if (command === "disable") {
    const pilot = await db.tenant.findUnique({ where: { slug: PILOT_SLUG } });
    if (!pilot) throw new Error("The approved synthetic pilot tenant is missing.");
    await setPilotFlags(pilot.id, false);
    return { ok: true, command, state: await inspectPilot() };
  }
  if (command === "inspect") return { ok: true, command, state: await inspectPilot() };
  if (command === "local-ready") return assertLocalUiReady();
  throw new Error("Use prepare, verify, disable, inspect, or local-ready.");
}

main()
  .then((result) => process.stdout.write(`${JSON.stringify(result)}\n`))
  .catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: errorCode(error) })}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
