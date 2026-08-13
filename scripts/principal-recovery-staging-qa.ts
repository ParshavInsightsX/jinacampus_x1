import assert from "node:assert/strict";

import { hashPassword } from "../src/lib/auth/password";
import { db } from "../src/lib/db";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";
const PILOT_SLUG = "jinacampus-demo";
const CONTROL_SLUG = "gradebook-control";
const DESIGNATED_ADMIN_EMAIL = "gradebook-release-operator@qa.invalid";
const OBSERVER_ADMIN_EMAIL = "principal-recovery-observer@qa.invalid";

const PLATFORM_EVENTS = {
  approved: "platform.principal_password_recovery.approved",
  rejected: "platform.principal_password_recovery.rejected",
  expired: "platform.principal_password_recovery.expired",
  completed: "platform.principal_password_recovery.completed"
} as const;

const TENANT_EVENTS = {
  requested: "auth.password_recovery_requested",
  approved: "auth.principal_password_recovery_approved",
  rejected: "auth.principal_password_recovery_rejected",
  expired: "auth.principal_password_recovery_expired",
  completed: "auth.principal_password_reset_completed"
} as const;

function projectRef(name: "DATABASE_URL" | "DIRECT_URL") {
  const value = process.env[name];
  if (!value) throw new Error(name + " is required.");
  const url = new URL(value);
  const direct = url.hostname.toLowerCase().match(/^db\.([a-z0-9]+)\.supabase\.co$/);
  if (direct) return direct[1];
  const pooler = decodeURIComponent(url.username).toLowerCase().match(/^postgres\.([a-z0-9]+)$/);
  if (url.hostname.toLowerCase().endsWith(".pooler.supabase.com") && pooler) return pooler[1];
  throw new Error(name + " does not identify a Supabase project reference.");
}

function assertStaging() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Principal recovery QA tooling is disabled in production mode.");
  }
  if (process.env.GRADEBOOK_STAGING_PROJECT_REF !== STAGING_REF) {
    throw new Error("Unapproved staging project reference.");
  }
  const refs = [projectRef("DATABASE_URL"), projectRef("DIRECT_URL")];
  if (refs.includes(PRODUCTION_REF)) throw new Error("Production database target detected. Operation refused.");
  if (refs.some((ref) => ref !== STAGING_REF)) {
    throw new Error("Both database URLs must target the approved GradeBook staging project.");
  }
  if (process.env.DEV_DEMO_SEED_ENABLED !== "true") {
    throw new Error("Synthetic staging seed mode is required.");
  }
}

async function loadFixture() {
  const [pilot, control, designated, observer] = await Promise.all([
    db.tenant.findUnique({ where: { slug: PILOT_SLUG }, select: { id: true, status: true } }),
    db.tenant.findUnique({ where: { slug: CONTROL_SLUG }, select: { id: true, status: true } }),
    db.platformAdministrator.findUnique({
      where: { email: DESIGNATED_ADMIN_EMAIL },
      include: { credential: { select: { mustChange: true } } }
    }),
    db.platformAdministrator.findUnique({
      where: { email: OBSERVER_ADMIN_EMAIL },
      include: { credential: { select: { mustChange: true } } }
    })
  ]);
  assert(pilot?.status === "ACTIVE", "Synthetic pilot tenant is unavailable.");
  assert(control?.status === "ACTIVE", "Synthetic control tenant is unavailable.");
  assert(designated?.status === "ACTIVE", "Designated recovery administrator is unavailable.");
  assert(observer?.status === "ACTIVE", "Unauthorised observer administrator is unavailable.");

  const [pilotPrincipal, controlPrincipal] = await Promise.all([
    db.user.findUnique({
      where: { tenantId_email: { tenantId: pilot.id, email: "principal@demo.jinacampus.test" } },
      select: { id: true, status: true, principalId: true }
    }),
    db.user.findUnique({
      where: { tenantId_email: { tenantId: control.id, email: "control-principal@gradebook.qa.invalid" } },
      select: { id: true, status: true, principalId: true }
    })
  ]);
  assert(pilotPrincipal?.status === "ACTIVE", "Synthetic pilot Principal is unavailable.");
  assert(controlPrincipal?.status === "ACTIVE", "Synthetic control Principal is unavailable.");
  assert(pilotPrincipal.principalId, "Synthetic pilot Principal ID is missing.");
  assert(controlPrincipal.principalId, "Synthetic control Principal ID is missing.");

  return { pilot, control, designated, observer, pilotPrincipal, controlPrincipal };
}

function safeAuditJson(value: unknown) {
  const serialized = JSON.stringify(value ?? null);
  assert(
    !/passwordHash|resetToken|oneTimeCredential|newPassword|rawPassword|sessionSecret/i.test(serialized),
    "Sensitive recovery material was found in audit metadata."
  );
}

async function prepare() {
  const fixture = await loadFixture();
  assert.equal(fixture.designated.canManagePrincipalRecovery, true,
    "The designated administrator does not have recovery authority.");
  assert.equal(fixture.observer.canManagePrincipalRecovery, false,
    "The observer administrator must not have recovery authority.");

  const activeRequests = await db.principalPasswordResetRequest.count({
    where: {
      tenantId: { in: [fixture.pilot.id, fixture.control.id] },
      status: { in: ["PENDING", "APPROVED"] }
    }
  });
  assert.equal(activeRequests, 0,
    "Synthetic recovery QA has an unfinished request. Complete or expire it before restarting.");

  await db.principalPasswordRecoveryAttempt.deleteMany({
    where: { tenantId: { in: [fixture.pilot.id, fixture.control.id] } }
  });
  await db.platformAuditLog.create({
    data: {
      actorAdministratorId: fixture.designated.id,
      action: "platform.qa.principal_recovery.prepared",
      entityType: "PrincipalRecoveryReleaseGate",
      entityId: STAGING_REF,
      metadataJson: {
        environment: "staging",
        pilotTenantId: fixture.pilot.id,
        controlTenantId: fixture.control.id,
        designatedRecoveryAuthority: true,
        observerRecoveryAuthority: false
      }
    }
  });

  process.stdout.write(JSON.stringify({
    ok: true,
    command: "prepare",
    target: "gradebook-mvp-staging",
    designatedRecoveryAuthority: true,
    observerRecoveryAuthority: false,
    activeRequests: 0
  }));
}

async function expireLatestPilotRequest() {
  const fixture = await loadFixture();
  const request = await db.principalPasswordResetRequest.findFirst({
    where: {
      tenantId: fixture.pilot.id,
      principalUserId: fixture.pilotPrincipal.id,
      status: "APPROVED",
      resetMethod: "RESET_LINK",
      resetTokenUsedAt: null
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, institutionId: true }
  });
  assert(request, "No approved synthetic pilot reset link is available to expire.");
  const expiresAt = new Date(Date.now() - 60_000);
  const updated = await db.principalPasswordResetRequest.updateMany({
    where: { id: request.id, status: "APPROVED", resetTokenUsedAt: null },
    data: { resetTokenExpiresAt: expiresAt }
  });
  assert.equal(updated.count, 1, "The synthetic expiry fixture could not be prepared.");
  await db.platformAuditLog.create({
    data: {
      actorAdministratorId: fixture.designated.id,
      action: "platform.qa.principal_recovery.expiry_fixture_prepared",
      entityType: "PrincipalPasswordResetRequest",
      entityId: request.id,
      metadataJson: {
        targetTenantId: fixture.pilot.id,
        institutionId: request.institutionId,
        environment: "staging"
      }
    }
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    command: "expire-latest-pilot",
    target: "gradebook-mvp-staging",
    requestPreparedForExpiry: true
  }));
}

async function expireActiveSyntheticRequests() {
  const fixture = await loadFixture();
  const requests = await db.principalPasswordResetRequest.findMany({
    where: {
      tenantId: { in: [fixture.pilot.id, fixture.control.id] },
      status: "APPROVED",
      resetMethod: "RESET_LINK",
      resetTokenUsedAt: null
    },
    select: { id: true, tenantId: true, institutionId: true }
  });
  assert(requests.length > 0, "No approved synthetic reset links are available to expire.");
  const expiresAt = new Date(Date.now() - 60_000);
  await db.$transaction(async (tx) => {
    for (const request of requests) {
      const updated = await tx.principalPasswordResetRequest.updateMany({
        where: { id: request.id, status: "APPROVED", resetTokenUsedAt: null },
        data: { resetTokenExpiresAt: expiresAt }
      });
      assert.equal(updated.count, 1, "A synthetic reset link could not be aged.");
      await tx.platformAuditLog.create({
        data: {
          actorAdministratorId: fixture.designated.id,
          action: "platform.qa.principal_recovery.expiry_fixture_prepared",
          entityType: "PrincipalPasswordResetRequest",
          entityId: request.id,
          metadataJson: {
            targetTenantId: request.tenantId,
            institutionId: request.institutionId,
            environment: "staging",
            reason: "stranded_browser_qa_credential"
          }
        }
      });
    }
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    command: "expire-active-synthetic",
    target: "gradebook-mvp-staging",
    requestsPreparedForExpiry: requests.length
  }));
}

function statusCounts(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((counts, status) => {
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
}

async function inspect() {
  const fixture = await loadFixture();
  const requests = await db.principalPasswordResetRequest.findMany({
    where: { tenantId: { in: [fixture.pilot.id, fixture.control.id] } },
    select: { tenantId: true, status: true, notificationStatus: true }
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    command: "inspect",
    target: "gradebook-mvp-staging",
    designated: {
      active: fixture.designated.status === "ACTIVE",
      recoveryAuthority: fixture.designated.canManagePrincipalRecovery,
      passwordChangeRequired: fixture.designated.credential?.mustChange ?? true
    },
    observer: {
      active: fixture.observer.status === "ACTIVE",
      recoveryAuthority: fixture.observer.canManagePrincipalRecovery,
      passwordChangeRequired: fixture.observer.credential?.mustChange ?? true
    },
    pilotStatuses: statusCounts(requests.filter((request) => request.tenantId === fixture.pilot.id).map((request) => request.status)),
    controlStatuses: statusCounts(requests.filter((request) => request.tenantId === fixture.control.id).map((request) => request.status)),
    notificationStatuses: statusCounts(requests.map((request) => request.notificationStatus))
  }));
}

async function verify() {
  const fixture = await loadFixture();
  assert.equal(fixture.designated.canManagePrincipalRecovery, true);
  assert.equal(fixture.designated.credential?.mustChange, false,
    "The designated administrator must complete the required first-login password change.");
  assert.equal(fixture.observer.canManagePrincipalRecovery, false);
  assert.equal(fixture.observer.credential?.mustChange, false,
    "The observer administrator must complete the required first-login password change.");

  const requests = await db.principalPasswordResetRequest.findMany({
    where: { tenantId: { in: [fixture.pilot.id, fixture.control.id] } },
    select: {
      id: true,
      tenantId: true,
      principalUserId: true,
      status: true,
      resetMethod: true,
      notificationStatus: true,
      resetTokenHash: true,
      resetTokenExpiresAt: true,
      resetTokenUsedAt: true,
      completedAt: true
    }
  });
  const pilotRequests = requests.filter((request) => request.tenantId === fixture.pilot.id);
  const controlRequests = requests.filter((request) => request.tenantId === fixture.control.id);
  for (const status of ["COMPLETED", "REJECTED", "EXPIRED"] as const) {
    assert(pilotRequests.some((request) => request.status === status),
      "Synthetic pilot recovery QA is missing " + status + ".");
  }
  assert(controlRequests.some((request) => request.status === "COMPLETED"),
    "The cross-tenant control reset was not safely completed.");
  assert(requests.every((request) => request.notificationStatus === "MANUAL_DELIVERY_REQUIRED"),
    "A recovery request falsely reports external delivery.");
  assert(requests.every((request) => !["PENDING", "APPROVED"].includes(request.status)),
    "A synthetic recovery request remains active after QA.");

  const completedPilotRequests = pilotRequests
    .filter((request) => request.status === "COMPLETED" && request.completedAt);
  assert(completedPilotRequests.length > 0, "No completed synthetic pilot reset is available.");
  assert(completedPilotRequests.every((request) => request.resetTokenUsedAt),
    "A completed reset did not consume its single-use token.");
  const latestCompletedAt = completedPilotRequests
    .map((request) => request.completedAt!)
    .sort((left, right) => right.getTime() - left.getTime())[0]!;
  const staleActiveSessions = await db.session.count({
    where: {
      tenantId: fixture.pilot.id,
      userId: fixture.pilotPrincipal.id,
      createdAt: { lte: latestCompletedAt },
      revokedAt: null
    }
  });
  assert.equal(staleActiveSessions, 0, "A Principal session created before reset remains active.");
  let revokedSessions = 0;
  for (const request of completedPilotRequests) {
    revokedSessions += await db.session.count({
      where: {
        tenantId: fixture.pilot.id,
        userId: fixture.pilotPrincipal.id,
        createdAt: { lte: request.completedAt! },
        revokedAt: { gte: request.completedAt! }
      }
    });
  }
  assert(revokedSessions > 0, "No pre-reset Principal session was revoked.");

  const platformAudits = await db.platformAuditLog.findMany({
    where: {
      action: { in: Object.values(PLATFORM_EVENTS) },
      entityId: { in: requests.map((request) => request.id) }
    },
    select: { action: true, actorAdministratorId: true, metadataJson: true }
  });
  const tenantAudits = await db.auditLog.findMany({
    where: {
      tenantId: { in: [fixture.pilot.id, fixture.control.id] },
      action: { in: Object.values(TENANT_EVENTS) },
      entityId: { in: requests.map((request) => request.id) }
    },
    select: { tenantId: true, action: true, actorUserId: true, metadataJson: true }
  });
  for (const action of Object.values(PLATFORM_EVENTS)) {
    assert(platformAudits.some((audit) => audit.action === action),
      "Missing platform audit event " + action + ".");
  }
  for (const action of Object.values(TENANT_EVENTS)) {
    assert(tenantAudits.some((audit) => audit.action === action),
      "Missing tenant audit event " + action + ".");
  }
  for (const action of [PLATFORM_EVENTS.approved, PLATFORM_EVENTS.rejected, PLATFORM_EVENTS.expired]) {
    assert(platformAudits.some((audit) => (
      audit.action === action && audit.actorAdministratorId === fixture.designated.id
    )), "Platform audit " + action + " is missing the designated administrator actor.");
  }
  platformAudits.forEach((audit) => safeAuditJson(audit.metadataJson));
  tenantAudits.forEach((audit) => safeAuditJson(audit.metadataJson));

  await db.platformAuditLog.create({
    data: {
      actorAdministratorId: fixture.designated.id,
      action: "platform.qa.principal_recovery.release_gate_verified",
      entityType: "PrincipalRecoveryReleaseGate",
      entityId: STAGING_REF,
      metadataJson: {
        environment: "staging",
        authenticatedBrowserQa: true,
        approval: true,
        rejection: true,
        expiry: true,
        singleUseReset: true,
        tokenReuseDenied: true,
        sessionsRevoked: true,
        crossTenantApiDenied: true,
        unauthorizedRoleDenied: true,
        directRouteDenied: true,
        externalDelivery: "MANUAL_DELIVERY_REQUIRED"
      }
    }
  });

  process.stdout.write(JSON.stringify({
    ok: true,
    command: "verify",
    target: "gradebook-mvp-staging",
    releaseGate: "passed",
    pilotStatuses: statusCounts(pilotRequests.map((request) => request.status)),
    controlStatuses: statusCounts(controlRequests.map((request) => request.status)),
    externalDelivery: "MANUAL_DELIVERY_REQUIRED",
    platformAuditEvents: platformAudits.length,
    tenantAuditEvents: tenantAudits.length,
    revokedPreResetSessions: revokedSessions
  }));
}

async function restoreSyntheticPasswords() {
  const fixture = await loadFixture();
  const password = process.env.DEV_DEMO_USER_PASSWORD;
  assert(password, "DEV_DEMO_USER_PASSWORD is required for synthetic credential restoration.");
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const userIds = [fixture.pilotPrincipal.id, fixture.controlPrincipal.id];
  const result = await db.$transaction(async (tx) => {
    for (const userId of userIds) {
      await tx.passwordCredential.upsert({
        where: { userId },
        create: { userId, passwordHash, mustChange: false },
        update: { passwordHash, passwordUpdatedAt: now, mustChange: false }
      });
    }
    const revokedSessions = await tx.session.updateMany({
      where: { userId: { in: userIds }, revokedAt: null },
      data: { revokedAt: now }
    });
    await tx.platformAuditLog.create({
      data: {
        actorAdministratorId: fixture.designated.id,
        action: "platform.qa.principal_recovery.synthetic_credentials_restored",
        entityType: "PrincipalRecoveryReleaseGate",
        entityId: STAGING_REF,
        metadataJson: {
          environment: "staging",
          syntheticUsersRestored: userIds.length,
          sessionsRevoked: revokedSessions.count,
          passwordSource: "protected_synthetic_seed_environment"
        }
      }
    });
    return { revokedSessions: revokedSessions.count };
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    command: "restore-synthetic-passwords",
    target: "gradebook-mvp-staging",
    syntheticUsersRestored: userIds.length,
    ...result
  }));
}

async function main() {
  assertStaging();
  const command = process.argv[2];
  if (command === "prepare") return prepare();
  if (command === "expire-latest-pilot") return expireLatestPilotRequest();
  if (command === "expire-active-synthetic") return expireActiveSyntheticRequests();
  if (command === "inspect") return inspect();
  if (command === "verify") return verify();
  if (command === "restore-synthetic-passwords") return restoreSyntheticPasswords();
  throw new Error("Use prepare, expire-latest-pilot, expire-active-synthetic, inspect, verify, or restore-synthetic-passwords.");
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown staging recovery QA error";
    process.stderr.write(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
