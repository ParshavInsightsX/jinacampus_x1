import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { hashPassword } from "../src/lib/auth/password";
import { db } from "../src/lib/db";
import { AppError } from "../src/lib/errors";
import { getEffectivePermissions } from "../src/lib/rbac/require-permission";
import type { TenantContext } from "../src/lib/tenant/context";
import { getSchoolCastFeatureState } from "../src/modules/schoolcast/feature";
import { getSchoolCastCommunication, getSchoolCastDashboard } from "../src/modules/schoolcast/queries";
import { createSchoolCastTemplateSchema } from "../src/modules/schoolcast/schemas";
import {
  archiveSchoolCastCommunication,
  cancelSchoolCastCommunication,
  createSchoolCastCommunication,
  decideSchoolCastApproval,
  publishSchoolCastCommunication,
  scheduleSchoolCastCommunication,
  submitSchoolCastCommunication
} from "../src/modules/schoolcast/services/communication.service";
import {
  cancelSchoolCastHomework,
  createSchoolCastHomework
} from "../src/modules/schoolcast/services/homework.service";
import {
  acknowledgeSchoolCastCommunication,
  markSchoolCastInboxRead
} from "../src/modules/schoolcast/services/inbox.service";
import { processSchoolCastOutbox } from "../src/modules/schoolcast/services/outbox-worker.service";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const CONTROL_SLUG = "gradebook-control";
const CONTROL_SOURCE_ID = "schoolcast-staging-cross-tenant-control";
const QA_SOURCE = "SCHOOLCAST_STAGING_QA";
const APPROVER_EMAIL = "schoolcast-approver@qa.invalid";
const BROWSER_QA_IDENTITIES = [
  { tenantSlug: PILOT_SLUG, email: "teacher@demo.jinacampus.test" },
  { tenantSlug: PILOT_SLUG, email: "staff@demo.jinacampus.test" },
  { tenantSlug: PILOT_SLUG, email: "office@demo.jinacampus.test" },
  { tenantSlug: CONTROL_SLUG, email: "control-principal@gradebook.qa.invalid" }
] as const;

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required.");
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(name + " does not identify a Supabase project.");
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") throw new Error("SchoolCast staging QA is disabled in production mode.");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) throw new Error("Unapproved SchoolCast staging reference.");
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production database target detected. QA refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) throw new Error("Database URLs do not target approved staging.");
}

function disabledFlags() {
  return {
    schoolCastEnabled: false,
    schoolCastInAppEnabled: false,
    schoolCastNoticesEnabled: false,
    schoolCastHomeworkEnabled: false,
    schoolCastApprovalsEnabled: false,
    schoolCastEmailEnabled: false,
    schoolCastWhatsAppEnabled: false,
    schoolCastAutomationEnabled: false,
    schoolCastAnalyticsEnabled: false,
    schoolCastDeliveryMode: "DRY_RUN" as const,
    schoolCastTeacherDirectPublish: false
  };
}

function pilotFlags() {
  return {
    schoolCastEnabled: true,
    schoolCastInAppEnabled: true,
    schoolCastNoticesEnabled: true,
    schoolCastHomeworkEnabled: true,
    schoolCastApprovalsEnabled: true,
    schoolCastEmailEnabled: false,
    schoolCastWhatsAppEnabled: false,
    schoolCastAutomationEnabled: false,
    schoolCastAnalyticsEnabled: true,
    schoolCastDeliveryMode: "DRY_RUN" as const,
    schoolCastTeacherDirectPublish: false
  };
}

async function tenantBySlug(slug: string) {
  const tenant = await db.tenant.findUnique({ where: { slug } });
  if (!tenant) throw new Error("Missing synthetic staging tenant: " + slug + ".");
  return tenant;
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
  if (!user) throw new Error("Missing synthetic QA identity: " + email + ".");
  const primary = user.branchAccesses.find((access) => access.branch.code === "MAIN")
    ?? user.branchAccesses[0];
  if (!primary) throw new Error("Synthetic QA identity has no branch access: " + email + ".");
  const year = await db.academicYear.findFirst({
    where: {
      tenantId: user.tenantId,
      institutionId: primary.branch.institutionId,
      status: "ACTIVE",
      isActive: true
    },
    orderBy: { startDate: "desc" }
  });
  if (!year) throw new Error("Synthetic QA identity has no active academic year: " + email + ".");
  return {
    tenantId: user.tenantId,
    tenantName: user.tenant.name,
    tenantSlug: user.tenant.slug,
    userId: user.id,
    userEmail: user.email,
    userName: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
    userType: user.userType,
    activeBranchId: primary.branchId,
    activeBranchName: primary.branch.name,
    activeBranchCode: primary.branch.code,
    timeZone: primary.branch.timezone,
    accessibleBranchIds: user.branchAccesses.map((access) => access.branchId),
    activeAcademicYearId: year.id,
    activeAcademicYearName: year.name,
    institutionId: primary.branch.institution.id,
    institutionName: primary.branch.institution.name,
    institutionDisplayName: primary.branch.institution.displayName,
    institutionLogoUrl: primary.branch.institution.logoUrl,
    roleCodes: user.roleAssignments.map((assignment) => assignment.role.code),
    roleLabels: user.roleAssignments.map((assignment) => assignment.role.name),
    passwordChangeRequired: user.passwordCredential?.mustChange ?? false,
    userAgent: "schoolcast-staging-qa",
    correlationId: "schoolcast-staging-qa:" + randomUUID()
  };
}

async function ensureSyntheticApprover(principal: TenantContext) {
  const password = process.env.DEV_DEMO_USER_PASSWORD;
  if (!password) throw new Error("DEV_DEMO_USER_PASSWORD is required for synthetic browser QA.");
  if (!principal.activeBranchId) throw new Error("Synthetic Principal branch is required.");
  const user = await db.user.upsert({
    where: { tenantId_email: { tenantId: principal.tenantId, email: APPROVER_EMAIL } },
    create: {
      tenantId: principal.tenantId,
      email: APPROVER_EMAIL,
      firstName: "SchoolCast",
      lastName: "Approver",
      displayName: "SchoolCast QA Approver",
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date()
    },
    update: {
      firstName: "SchoolCast",
      lastName: "Approver",
      displayName: "SchoolCast QA Approver",
      status: "ACTIVE",
      activatedAt: new Date()
    }
  });
  const passwordHash = await hashPassword(password);
  await db.passwordCredential.upsert({
    where: { userId: user.id },
    create: { userId: user.id, passwordHash, mustChange: false },
    update: { passwordHash, passwordUpdatedAt: new Date(), mustChange: false }
  });
  await db.session.updateMany({
    where: { userId: user.id, revokedAt: null },
    data: { revokedAt: new Date() }
  });
  const role = await db.role.findUnique({
    where: { tenantId_code: { tenantId: principal.tenantId, code: "PRINCIPAL" } }
  });
  if (!role) throw new Error("Synthetic pilot Principal role is missing.");
  await db.userRoleAssignment.upsert({
    where: {
      tenantId_userId_roleId_scopeType_scopeId: {
        tenantId: principal.tenantId,
        userId: user.id,
        roleId: role.id,
        scopeType: "TENANT",
        scopeId: "TENANT"
      }
    },
    create: {
      tenantId: principal.tenantId,
      userId: user.id,
      roleId: role.id,
      scopeType: "TENANT",
      scopeId: "TENANT",
      assignedById: principal.userId,
      isActive: true
    },
    update: {
      assignedById: principal.userId,
      isActive: true,
      startsAt: null,
      endsAt: null
    }
  });
  await db.userBranchAccess.upsert({
    where: {
      tenantId_userId_branchId: {
        tenantId: principal.tenantId,
        userId: user.id,
        branchId: principal.activeBranchId
      }
    },
    create: {
      tenantId: principal.tenantId,
      userId: user.id,
      branchId: principal.activeBranchId,
      canAccessAllAcademicYears: true,
      isPrimary: true,
      isActive: true
    },
    update: {
      canAccessAllAcademicYears: true,
      isPrimary: true,
      isActive: true
    }
  });
  return user;
}

async function prepareSyntheticBrowserCredentials() {
  const password = process.env.DEV_DEMO_USER_PASSWORD;
  if (!password) throw new Error("DEV_DEMO_USER_PASSWORD is required for synthetic browser QA.");

  for (const identity of BROWSER_QA_IDENTITIES) {
    const user = await db.user.findFirst({
      where: {
        tenant: { slug: identity.tenantSlug },
        email: identity.email,
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!user) throw new Error("Missing synthetic browser QA identity: " + identity.email + ".");
    const passwordHash = await hashPassword(password);
    await db.$transaction([
      db.passwordCredential.upsert({
        where: { userId: user.id },
        create: { userId: user.id, passwordHash, mustChange: false },
        update: { passwordHash, passwordUpdatedAt: new Date(), mustChange: false }
      }),
      db.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() }
      })
    ]);
  }
}

function errorCode(error: unknown) {
  if (error instanceof AppError) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return error instanceof Error ? error.message : "UNKNOWN_ERROR";
}

async function expectError(
  label: string,
  expected: string | readonly string[],
  action: () => Promise<unknown>
) {
  try {
    await action();
  } catch (error) {
    const actual = errorCode(error);
    const allowed = Array.isArray(expected) ? expected : [expected];
    assert(
      allowed.some((code) => actual === code || actual.startsWith(code + ":")),
      label + ": expected " + allowed.join(" or ") + ", received " + actual
    );
    return { label, result: "PASS", code: actual.split(":")[0] };
  }
  throw new Error(label + ": expected a denial.");
}

async function ensureControlCommunication() {
  const control = await tenantBySlug(CONTROL_SLUG);
  const context = await loadContext(CONTROL_SLUG, "control-principal@gradebook.qa.invalid");
  const existing = await db.schoolCastCommunication.findFirst({
    where: {
      tenantId: control.id,
      sourceModule: QA_SOURCE,
      sourceEntityType: "CrossTenantControl",
      sourceEntityId: CONTROL_SOURCE_ID,
      sourceEntityVersionId: "1"
    },
    select: { id: true }
  });
  if (existing) return existing.id;

  return db.$transaction(async (tx) => {
    const communication = await tx.schoolCastCommunication.create({
      data: {
        tenantId: control.id,
        institutionId: context.institutionId,
        branchId: context.activeBranchId,
        academicYearId: context.activeAcademicYearId,
        type: "NOTICE",
        category: "QA_CONTROL",
        status: "DRAFT",
        sourceModule: QA_SOURCE,
        sourceEntityType: "CrossTenantControl",
        sourceEntityId: CONTROL_SOURCE_ID,
        sourceEntityVersionId: "1",
        timeZoneId: context.timeZone ?? "Asia/Kolkata",
        createdById: context.userId,
        updatedById: context.userId
      }
    });
    const contentText = "Synthetic cross-tenant control record.";
    const version = await tx.schoolCastCommunicationVersion.create({
      data: {
        tenantId: control.id,
        communicationId: communication.id,
        versionNo: 1,
        title: "Synthetic SchoolCast control",
        contentText,
        contentHash: createHash("sha256").update(contentText).digest("hex"),
        createdById: context.userId
      }
    });
    await tx.schoolCastCommunication.update({
      where: { id: communication.id },
      data: { currentVersionId: version.id }
    });
    return communication.id;
  });
}

async function prepare() {
  const tenants = await db.tenant.findMany({ select: { id: true, slug: true } });
  const pilot = tenants.find((tenant) => tenant.slug === PILOT_SLUG);
  const control = tenants.find((tenant) => tenant.slug === CONTROL_SLUG);
  if (!pilot || !control) throw new Error("Synthetic pilot and control tenants are required.");

  for (const tenant of tenants) {
    const flags = tenant.id === pilot.id ? pilotFlags() : disabledFlags();
    await db.tenantSettings.upsert({
      where: { tenantId: tenant.id },
      create: { tenantId: tenant.id, ...flags },
      update: flags
    });
  }
  await db.schoolCastProviderConfiguration.updateMany({
    data: {
      mode: "DRY_RUN",
      status: "DISABLED",
      secretRef: null,
      webhookSecretRef: null,
      isDefault: false,
      healthStatus: "STAGING_EXTERNAL_DELIVERY_DISABLED"
    }
  });
  const principal = await loadContext(PILOT_SLUG, "principal@demo.jinacampus.test");
  await ensureSyntheticApprover(principal);
  await prepareSyntheticBrowserCredentials();
  const controlCommunicationId = await ensureControlCommunication();
  await db.auditLog.create({
    data: {
      tenantId: pilot.id,
      branchId: principal.activeBranchId,
      academicYearId: principal.activeAcademicYearId,
      actorUserId: principal.userId,
      action: "schoolcast.qa.pilot_enabled",
      entityType: "TenantSettings",
      entityId: pilot.id,
      metadataJson: {
        syntheticOnly: true,
        inAppOnly: true,
        deliveryMode: "DRY_RUN",
        externalProvidersDisabled: true,
        controlCommunicationPresent: Boolean(controlCommunicationId)
      }
    }
  });
  return {
    ok: true,
    command: "prepare",
    target: "gradebook-mvp-staging",
    pilotTenant: PILOT_SLUG,
    enabledTenants: 1,
    inAppOnly: true,
    deliveryMode: "DRY_RUN",
    externalProviders: "disabled"
  };
}

async function inspect() {
  const pilot = await tenantBySlug(PILOT_SLUG);
  const control = await tenantBySlug(CONTROL_SLUG);
  const enabled = await db.tenantSettings.findMany({
    where: { schoolCastEnabled: true },
    select: {
      tenantId: true,
      schoolCastEnabled: true,
      schoolCastInAppEnabled: true,
      schoolCastNoticesEnabled: true,
      schoolCastHomeworkEnabled: true,
      schoolCastApprovalsEnabled: true,
      schoolCastEmailEnabled: true,
      schoolCastWhatsAppEnabled: true,
      schoolCastAutomationEnabled: true,
      schoolCastAnalyticsEnabled: true,
      schoolCastDeliveryMode: true,
      schoolCastTeacherDirectPublish: true
    }
  });
  assert.equal(enabled.length, 1, "Exactly one synthetic tenant may have SchoolCast enabled.");
  assert.equal(enabled[0].tenantId, pilot.id);
  assert.deepEqual(enabled[0], { tenantId: pilot.id, ...pilotFlags() });
  assert.equal(
    await db.tenantSettings.count({ where: { tenantId: control.id, schoolCastEnabled: true } }),
    0,
    "Control tenant must remain disabled."
  );
  assert.equal(
    await db.schoolCastProviderConfiguration.count({
      where: {
        OR: [
          { mode: { not: "DRY_RUN" } },
          { status: { not: "DISABLED" } },
          { secretRef: { not: null } },
          { webhookSecretRef: { not: null } },
          { isDefault: true }
        ]
      }
    }),
    0,
    "External provider configuration is not fully disabled."
  );

  const identities = await Promise.all([
    loadContext(PILOT_SLUG, "principal@demo.jinacampus.test"),
    loadContext(PILOT_SLUG, APPROVER_EMAIL),
    loadContext(PILOT_SLUG, "teacher@demo.jinacampus.test"),
    loadContext(PILOT_SLUG, "staff@demo.jinacampus.test"),
    loadContext(PILOT_SLUG, "office@demo.jinacampus.test")
  ]);
  return {
    ok: true,
    command: "inspect",
    target: "gradebook-mvp-staging",
    pilotTenant: PILOT_SLUG,
    controlDisabled: true,
    identities: identities.map((ctx) => ctx.roleCodes?.join("+") ?? "UNASSIGNED"),
    inAppOnly: true,
    deliveryMode: enabled[0].schoolCastDeliveryMode,
    externalProviders: "disabled"
  };
}

async function functional() {
  await inspect();
  const runId = randomUUID();
  const titlePrefix = "SchoolCast staging QA " + runId.slice(0, 8);
  const principal = await loadContext(PILOT_SLUG, "principal@demo.jinacampus.test");
  const approver = await loadContext(PILOT_SLUG, APPROVER_EMAIL);
  const teacher = await loadContext(PILOT_SLUG, "teacher@demo.jinacampus.test");
  const staff = await loadContext(PILOT_SLUG, "staff@demo.jinacampus.test");
  const office = await loadContext(PILOT_SLUG, "office@demo.jinacampus.test");
  const control = await loadContext(CONTROL_SLUG, "control-principal@gradebook.qa.invalid");
  const evidence: Array<Record<string, unknown>> = [];

  await db.auditLog.create({
    data: {
      tenantId: principal.tenantId,
      branchId: principal.activeBranchId,
      academicYearId: principal.activeAcademicYearId,
      actorUserId: principal.userId,
      action: "schoolcast.qa.functional_started",
      entityType: "SchoolCastQaRun",
      entityId: runId,
      metadataJson: { syntheticOnly: true, inAppOnly: true, deliveryMode: "DRY_RUN" }
    }
  });

  const feature = await getSchoolCastFeatureState(principal);
  assert.deepEqual(feature, {
    enabled: true,
    inApp: true,
    notices: true,
    homework: true,
    approvals: true,
    email: false,
    whatsApp: false,
    automation: false,
    analytics: true,
    deliveryMode: "DRY_RUN",
    teacherDirectPublish: false
  });
  evidence.push({ label: "synthetic pilot feature state", result: "PASS" });

  const dashboard = await getSchoolCastDashboard(principal);
  assert.equal(dashboard.features.enabled, true);
  evidence.push({ label: "Principal dashboard access", result: "PASS" });
  assert.equal((await getSchoolCastDashboard(teacher)).features.enabled, true);
  evidence.push({ label: "Teacher dashboard access", result: "PASS" });
  evidence.push(await expectError(
    "Office Staff dashboard denial",
    "FORBIDDEN_PERMISSION",
    () => getSchoolCastDashboard(office)
  ));
  evidence.push(await expectError(
    "Staff communication creation denial",
    "FORBIDDEN_PERMISSION",
    () => createSchoolCastCommunication(staff, {
      type: "NOTICE",
      category: "QA",
      title: titlePrefix + " forbidden",
      content: "This mutation must be denied.",
      audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
      channels: ["IN_APP"]
    })
  ));
  evidence.push(await expectError(
    "disabled control tenant denial",
    "SCHOOLCAST_NOT_ENABLED",
    () => getSchoolCastDashboard(control)
  ));

  const controlRecord = await db.schoolCastCommunication.findFirstOrThrow({
    where: { tenantId: control.tenantId, sourceModule: QA_SOURCE, sourceEntityId: CONTROL_SOURCE_ID },
    select: { id: true }
  });
  evidence.push(await expectError(
    "cross-tenant direct-record denial",
    "SCHOOLCAST_COMMUNICATION_NOT_FOUND",
    () => getSchoolCastCommunication(principal, controlRecord.id)
  ));

  const assignment = await db.classSectionSubject.findFirst({
    where: {
      tenantId: teacher.tenantId,
      branchId: teacher.activeBranchId!,
      academicYearId: teacher.activeAcademicYearId!,
      status: "ACTIVE",
      OR: [
        { teacherUserId: teacher.userId },
        { classSection: { classTeacherUserId: teacher.userId } }
      ]
    },
    include: { classSection: true, subject: true }
  });
  assert(assignment, "Assigned Teacher requires one active class-section subject.");
  const assignmentDate = new Date().toISOString().slice(0, 10);
  const homework = await createSchoolCastHomework(teacher, {
    branchId: assignment.branchId,
    academicYearId: assignment.academicYearId,
    classSectionId: assignment.classSectionId,
    subjectId: assignment.subjectId,
    workType: "HOMEWORK",
    title: titlePrefix + " homework",
    instructions: "Complete the synthetic staging exercise.",
    assignmentDate
  });
  assert.equal(homework.status, "DRAFT");
  await cancelSchoolCastHomework(teacher, {
    homeworkItemId: homework.id,
    reason: "Synthetic staging lifecycle cleanup."
  });
  evidence.push({ label: "assigned Teacher homework create/cancel", result: "PASS" });

  const unsupportedSubject = await db.subject.findFirst({
    where: { tenantId: teacher.tenantId, status: "ACTIVE", id: { not: assignment.subjectId } },
    select: { id: true }
  });
  if (unsupportedSubject) {
    evidence.push(await expectError(
      "unassigned Teacher subject denial",
      "SCHOOLCAST_TEACHING_SCOPE_NOT_FOUND",
      () => createSchoolCastHomework(teacher, {
        branchId: assignment.branchId,
        academicYearId: assignment.academicYearId,
        classSectionId: assignment.classSectionId,
        subjectId: unsupportedSubject.id,
        workType: "HOMEWORK",
        title: titlePrefix + " unassigned",
        instructions: "This must be denied.",
        assignmentDate
      })
    ));
  }

  const otherBranch = await db.branch.findFirst({
    where: { tenantId: teacher.tenantId, id: { notIn: teacher.accessibleBranchIds }, status: "ACTIVE" },
    select: { id: true }
  });
  if (otherBranch) {
    evidence.push(await expectError(
      "cross-branch Teacher denial",
      "FORBIDDEN_BRANCH_ACCESS",
      () => createSchoolCastHomework(teacher, {
        branchId: otherBranch.id,
        academicYearId: assignment.academicYearId,
        classSectionId: assignment.classSectionId,
        subjectId: assignment.subjectId,
        workType: "HOMEWORK",
        title: titlePrefix + " cross branch",
        instructions: "This must be denied.",
        assignmentDate
      })
    ));
  }

  const previousYear = await db.academicYear.findFirst({
    where: {
      tenantId: teacher.tenantId,
      institutionId: teacher.institutionId!,
      id: { not: teacher.activeAcademicYearId! }
    },
    orderBy: { startDate: "desc" },
    select: { id: true }
  });
  if (previousYear) {
    evidence.push(await expectError(
      "cross-academic-year Teacher assignment denial",
      "SCHOOLCAST_TEACHING_SCOPE_NOT_FOUND",
      () => createSchoolCastHomework(teacher, {
        branchId: assignment.branchId,
        academicYearId: previousYear.id,
        classSectionId: assignment.classSectionId,
        subjectId: assignment.subjectId,
        workType: "HOMEWORK",
        title: titlePrefix + " cross year",
        instructions: "This must be denied.",
        assignmentDate
      })
    ));
  }

  const communication = await createSchoolCastCommunication(principal, {
    type: "NOTICE",
    category: "STAGING_QA",
    title: titlePrefix + " publication",
    summary: "Synthetic recipient and delivery lifecycle.",
    content: "This is a synthetic staging-only in-application communication.",
    validUntil: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    acknowledgementRequired: true,
    audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
    channels: ["IN_APP"]
  });
  assert(communication.previewRecipientCount > 0);
  await submitSchoolCastCommunication(principal, { communicationId: communication.id });
  evidence.push(await expectError(
    "self-approval denial",
    "SCHOOLCAST_SELF_APPROVAL_FORBIDDEN",
    () => decideSchoolCastApproval(principal, {
      communicationId: communication.id,
      decision: "APPROVED"
    })
  ));

  const approverPermissions = await getEffectivePermissions({
    ctx: approver,
    branchId: principal.activeBranchId,
    academicYearId: principal.activeAcademicYearId
  });
  assert(approverPermissions.has("schoolcast.communication.approve"), "Second Principal identity lacks approval permission.");
  await decideSchoolCastApproval(approver, {
    communicationId: communication.id,
    decision: "APPROVED",
    reason: "Synthetic staging approval."
  });
  const published = await publishSchoolCastCommunication(principal, { communicationId: communication.id });
  assert.equal(published.status, "PUBLISHED");
  assert.equal(published.alreadyPublished, false);
  assert(published.recipientCount > 0);
  assert((published.inAppCount ?? 0) > 0);
  assert.equal(published.externalQueuedCount ?? 0, 0);
  const duplicate = await publishSchoolCastCommunication(principal, { communicationId: communication.id });
  assert.equal(duplicate.alreadyPublished, true);
  assert.equal(
    await db.notificationOutbox.count({
      where: {
        tenantId: principal.tenantId,
        schoolCastCommunicationId: communication.id,
        channel: { in: ["EMAIL", "WHATSAPP"] }
      }
    }),
    0
  );
  assert.equal(
    await db.schoolCastRecipientSnapshot.count({
      where: { communicationId: communication.id, tenantId: { not: principal.tenantId } }
    }),
    0
  );
  evidence.push({ label: "approval, IN_APP publication, audience isolation, duplicate prevention", result: "PASS" });

  const staffNotification = await db.inAppNotification.findFirst({
    where: {
      tenantId: staff.tenantId,
      userId: staff.userId,
      communicationId: communication.id,
      acknowledgementRequired: true
    },
    select: { id: true }
  });
  assert(staffNotification, "Published communication did not create the Staff inbox item.");
  const read = await markSchoolCastInboxRead(staff, { notificationId: staffNotification.id });
  assert.equal(read.alreadyRead, false);
  const duplicateRead = await markSchoolCastInboxRead(staff, { notificationId: staffNotification.id });
  assert.equal(duplicateRead.alreadyRead, true);
  const acknowledgement = await acknowledgeSchoolCastCommunication(staff, {
    notificationId: staffNotification.id,
    acknowledgementText: "Synthetic staging acknowledgement."
  });
  const duplicateAcknowledgement = await acknowledgeSchoolCastCommunication(staff, {
    notificationId: staffNotification.id
  });
  assert.equal(duplicateAcknowledgement.id, acknowledgement.id);
  evidence.push({ label: "inbox read and acknowledgement idempotency", result: "PASS" });

  const scheduled = await createSchoolCastCommunication(principal, {
    type: "NOTICE",
    category: "STAGING_QA",
    title: titlePrefix + " scheduled cancellation",
    content: "Synthetic scheduling and cancellation test.",
    audienceRules: [{ ruleType: "ROLE", mode: "INCLUDE", targetIds: [], roleCodes: ["TEACHER"] }],
    channels: ["IN_APP"]
  });
  await submitSchoolCastCommunication(principal, { communicationId: scheduled.id });
  await decideSchoolCastApproval(approver, {
    communicationId: scheduled.id,
    decision: "APPROVED",
    reason: "Synthetic staging approval."
  });
  await scheduleSchoolCastCommunication(principal, {
    communicationId: scheduled.id,
    scheduledAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  await cancelSchoolCastCommunication(principal, {
    communicationId: scheduled.id,
    reason: "Synthetic staging cancellation."
  });
  const archived = await archiveSchoolCastCommunication(principal, {
    communicationId: scheduled.id,
    reason: "Synthetic staging archive."
  });
  assert.equal(archived.status, "ARCHIVED");
  evidence.push({ label: "schedule, cancel, and archive lifecycle", result: "PASS" });

  const rejected = await createSchoolCastCommunication(principal, {
    type: "NOTICE",
    category: "STAGING_QA",
    title: titlePrefix + " rejection",
    content: "Synthetic rejection workflow test.",
    audienceRules: [{ ruleType: "ALL_USERS", mode: "INCLUDE", targetIds: [], roleCodes: [] }],
    channels: ["IN_APP"]
  });
  await submitSchoolCastCommunication(principal, { communicationId: rejected.id });
  const rejection = await decideSchoolCastApproval(approver, {
    communicationId: rejected.id,
    decision: "REJECTED",
    reason: "Synthetic staging rejection."
  });
  assert.equal(rejection.status, "REJECTED");
  evidence.push({ label: "rejection lifecycle", result: "PASS" });

  const publishedRow = await db.schoolCastCommunication.findFirstOrThrow({
    where: { id: communication.id, tenantId: principal.tenantId },
    select: { currentVersionId: true }
  });
  assert(publishedRow.currentVersionId);
  const workerKeys = {
    queued: "schoolcast-qa-queued-" + runId,
    retrying: "schoolcast-qa-retrying-" + runId,
    expired: "schoolcast-qa-expired-" + runId
  };
  await db.notificationOutbox.createMany({
    data: [
      {
        tenantId: principal.tenantId,
        branchId: principal.activeBranchId,
        academicYearId: principal.activeAcademicYearId,
        schoolCastCommunicationId: communication.id,
        communicationVersionId: publishedRow.currentVersionId,
        channel: "IN_APP",
        templateKey: "schoolcast.qa.in_app",
        recipientType: "USER",
        recipientId: principal.userId,
        payloadJson: { syntheticOnly: true },
        payloadHash: createHash("sha256").update(runId).digest("hex"),
        status: "QUEUED",
        mode: "DRY_RUN",
        idempotencyKey: workerKeys.queued,
        scheduledFor: new Date(Date.now() - 1_000),
        availableAt: new Date(Date.now() - 1_000)
      },
      {
        tenantId: principal.tenantId,
        branchId: principal.activeBranchId,
        academicYearId: principal.activeAcademicYearId,
        schoolCastCommunicationId: communication.id,
        communicationVersionId: publishedRow.currentVersionId,
        channel: "IN_APP",
        templateKey: "schoolcast.qa.in_app",
        recipientType: "USER",
        recipientId: principal.userId,
        payloadJson: { syntheticOnly: true },
        status: "RETRYING",
        mode: "DRY_RUN",
        idempotencyKey: workerKeys.retrying,
        scheduledFor: new Date(Date.now() - 1_000),
        availableAt: new Date(Date.now() - 1_000)
      },
      {
        tenantId: principal.tenantId,
        branchId: principal.activeBranchId,
        academicYearId: principal.activeAcademicYearId,
        schoolCastCommunicationId: communication.id,
        communicationVersionId: publishedRow.currentVersionId,
        channel: "IN_APP",
        templateKey: "schoolcast.qa.in_app",
        recipientType: "USER",
        recipientId: principal.userId,
        payloadJson: { syntheticOnly: true },
        status: "QUEUED",
        mode: "DRY_RUN",
        idempotencyKey: workerKeys.expired,
        scheduledFor: new Date(Date.now() - 60_000),
        availableAt: new Date(Date.now() - 60_000),
        expiresAt: new Date(Date.now() - 30_000)
      }
    ]
  });
  const worker = await processSchoolCastOutbox({
    limit: 10,
    workerId: "schoolcast-staging-qa-" + runId,
    leaseSeconds: 30
  });
  assert(worker.simulated >= 2);
  assert(worker.expired >= 1);
  const workerRows = await db.notificationOutbox.findMany({
    where: { idempotencyKey: { in: Object.values(workerKeys) } },
    select: { id: true, idempotencyKey: true, status: true }
  });
  assert.equal(workerRows.find((row) => row.idempotencyKey === workerKeys.queued)?.status, "SENT");
  assert.equal(workerRows.find((row) => row.idempotencyKey === workerKeys.retrying)?.status, "SENT");
  assert.equal(workerRows.find((row) => row.idempotencyKey === workerKeys.expired)?.status, "EXPIRED");
  evidence.push({ label: "DRY_RUN worker claim, retry-resume, delivery, and expiry transitions", result: "PASS" });

  const validTemplate = createSchoolCastTemplateSchema.safeParse({
    channel: "EMAIL",
    templateKey: "qa." + runId.slice(0, 8),
    providerTemplateName: "synthetic_qa",
    languageCode: "en",
    bodyText: "Hello studentName",
    variableNames: ["studentName", "attendanceDate"],
    activate: false
  });
  const invalidTemplate = createSchoolCastTemplateSchema.safeParse({
    channel: "EMAIL",
    templateKey: "qa." + runId.slice(0, 8),
    providerTemplateName: "synthetic_qa",
    languageCode: "en",
    bodyText: "Hello",
    variableNames: ["invalid-variable"],
    activate: false
  });
  assert.equal(validTemplate.success, true);
  assert.equal(invalidTemplate.success, false);
  evidence.push({ label: "template-variable schema validation", result: "PASS" });

  const requiredEntityActions = [
    "schoolcast.communication.created",
    "schoolcast.communication.submitted",
    "schoolcast.communication.approved",
    "schoolcast.communication.published",
    "schoolcast.communication.scheduled",
    "schoolcast.communication.cancelled",
    "schoolcast.communication.archived",
    "schoolcast.communication.rejected",
    "schoolcast.homework.created",
    "schoolcast.homework.cancelled"
  ];
  const auditActions = new Set((await db.auditLog.findMany({
    where: {
      tenantId: principal.tenantId,
      action: { in: requiredEntityActions },
      entityId: { in: [communication.id, scheduled.id, rejected.id, homework.id] }
    },
    select: { action: true }
  })).map((row) => row.action));
  for (const action of requiredEntityActions) {
    assert(auditActions.has(action), "Missing audit evidence: " + action + ".");
  }
  assert.equal(
    await db.auditLog.count({
      where: {
        tenantId: principal.tenantId,
        action: "schoolcast.outbox.simulated",
        entityId: {
          in: workerRows
            .filter((row) => row.status === "SENT")
            .map((row) => row.id)
        }
      }
    }),
    2
  );
  evidence.push({ label: "critical audit ledger", result: "PASS" });

  await db.auditLog.create({
    data: {
      tenantId: principal.tenantId,
      branchId: principal.activeBranchId,
      academicYearId: principal.activeAcademicYearId,
      actorUserId: principal.userId,
      action: "schoolcast.qa.functional_completed",
      entityType: "SchoolCastQaRun",
      entityId: runId,
      metadataJson: {
        syntheticOnly: true,
        passed: evidence.length,
        inAppOnly: true,
        deliveryMode: "DRY_RUN"
      }
    }
  });

  return {
    ok: true,
    command: "functional",
    target: "gradebook-mvp-staging",
    pilotTenant: PILOT_SLUG,
    evidence,
    externalProviderRequests: 0,
    deliveryMode: "DRY_RUN"
  };
}

async function main() {
  assertStaging();
  const command = process.argv[2];
  if (command === "prepare") return prepare();
  if (command === "inspect") return inspect();
  if (command === "functional") return functional();
  throw new Error("Use prepare, inspect, or functional.");
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      name: error instanceof Error ? error.name : "SchoolCastStagingQaError",
      code: errorCode(error)
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });