import assert from "node:assert/strict";

import { db } from "../src/lib/db";

const STAGING_REF = "clmbwnulotrviqvnwvvj";
const PRODUCTION_REF = "jcqpmdslmydxjsfdwenc";

function assertStagingTarget() {
  if (process.env.NODE_ENV === "production") throw new Error("SCHOOLCAST_SOURCE_CATALOG_PRODUCTION_MODE_REFUSED");
  if (process.env.SCHOOLCAST_STAGING_PROJECT_REF !== STAGING_REF) {
    throw new Error("SCHOOLCAST_SOURCE_CATALOG_STAGING_REF_INVALID");
  }
  for (const name of ["DATABASE_URL", "DIRECT_URL"] as const) {
    const value = process.env[name] ?? "";
    if (!value.includes(STAGING_REF) || value.includes(PRODUCTION_REF)) {
      throw new Error(`SCHOOLCAST_SOURCE_CATALOG_${name}_TARGET_INVALID`);
    }
  }
}

async function main() {
  assertStagingTarget();
  const tenant = await db.tenant.findUnique({ where: { slug: "jinacampus-demo" }, select: { id: true } });
  assert(tenant, "Synthetic staging pilot is missing.");
  const [
    studentAttendance,
    staffAttendance,
    staffProfiles,
    leaveTypes,
    leaveApplications,
    leaveActions,
    calendarEntries,
    gradebookTerms,
    gradebookExamTypes,
    gradebookExams,
    gradebookResultRuns,
    gradebookPublications,
    enrollments
  ] = await db.$transaction([
    db.studentAttendanceRecord.count({ where: { tenantId: tenant.id } }),
    db.staffAttendanceRecord.count({ where: { tenantId: tenant.id } }),
    db.staffProfile.count({ where: { tenantId: tenant.id, employmentStatus: "ACTIVE" } }),
    db.staffLeaveType.count({ where: { tenantId: tenant.id, isActive: true } }),
    db.staffLeaveApplication.count({ where: { tenantId: tenant.id } }),
    db.staffLeaveApplicationAction.count({ where: { tenantId: tenant.id, actorUserId: { not: null } } }),
    db.academicCalendarEntry.count({ where: { tenantId: tenant.id } }),
    db.gradebookExamTerm.count({ where: { tenantId: tenant.id } }),
    db.gradebookExamType.count({ where: { tenantId: tenant.id } }),
    db.gradebookExam.count({ where: { tenantId: tenant.id } }),
    db.gradebookResultRun.count({ where: { tenantId: tenant.id } }),
    db.gradebookResultPublication.count({ where: { tenantId: tenant.id } }),
    db.enrollment.count({ where: { tenantId: tenant.id, status: "ACTIVE" } })
  ]);

  return {
    ok: true,
    target: "gradebook-mvp-staging",
    syntheticPilot: "jinacampus-demo",
    counts: {
      studentAttendance,
      staffAttendance,
      staffProfiles,
      leaveTypes,
      leaveApplications,
      leaveActions,
      calendarEntries,
      gradebookTerms,
      gradebookExamTypes,
      gradebookExams,
      gradebookResultRuns,
      gradebookPublications,
      enrollments
    }
  };
}

main()
  .then((result) => console.log(JSON.stringify(result)))
  .catch((error: unknown) => {
    console.error(JSON.stringify({
      ok: false,
      code: error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)
        ? error.message
        : "SCHOOLCAST_SOURCE_CATALOG_FAILED"
    }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
