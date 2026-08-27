import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createStudentAttendanceDutyAssignmentSchema,
  declineStudentAttendanceDutySchema,
  revokeStudentAttendanceDutySchema,
  studentAttendanceDutyIdSchema
} from "@/modules/academia/schemas/student-attendance-duty.schema";

const id = "00000000-0000-0000-0000-000000000001";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("student attendance continuity", () => {
  it("accepts a bounded duty assignment and rejects client-provided security scope", () => {
    const valid = {
      classSectionId: id,
      assignedUserId: "00000000-0000-0000-0000-000000000002",
      attendanceDate: "2026-08-24",
      sessionType: "FULL_DAY",
      assignmentType: "SUBSTITUTE_TEACHER",
      reasonCode: "CLASS_TEACHER_ABSENT",
      reasonText: "Class teacher is on approved leave.",
      sourceType: "MANUAL"
    };

    expect(createStudentAttendanceDutyAssignmentSchema.safeParse(valid).success).toBe(true);
    expect(createStudentAttendanceDutyAssignmentSchema.safeParse({
      ...valid,
      tenantId: id,
      branchId: id,
      academicYearId: id,
      role: "PRINCIPAL",
      status: "ACTIVE"
    }).success).toBe(false);
    expect(studentAttendanceDutyIdSchema.safeParse({ assignmentId: id, userId: id }).success).toBe(false);
    expect(declineStudentAttendanceDutySchema.safeParse({
      assignmentId: id,
      reason: "Another teacher is required.",
      tenantId: id
    }).success).toBe(false);
    expect(revokeStudentAttendanceDutySchema.safeParse({
      assignmentId: id,
      reason: "Coverage plan changed.",
      branchId: id
    }).success).toBe(false);
  });

  it("adds an additive tenant-scoped duty ledger and stored session responsibility", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source(
      "prisma/migrations/20260824183000_add_student_attendance_continuity/migration.sql"
    );

    expect(schema).toContain("model StudentAttendanceDutyAssignment {");
    expect(schema).toContain("responsibilitySource        StudentAttendanceResponsibilitySource");
    expect(schema).toContain("responsibleUserId           String");
    expect(schema).toContain(
      'map: "student_attendance_sessions_tenantId_originalClassTeacherUserId"'
    );
    expect(schema).toContain(
      'map: "student_attendance_duty_assignments_tenantId_assignedByUserId_f"'
    );
    expect(schema).toContain(
      'map: "student_attendance_duty_assignments_tenantId_revokedByUserId_fk"'
    );
    expect(migration).toContain('CREATE TABLE "student_attendance_duty_assignments"');
    expect(migration).toContain('ADD COLUMN "responsibleUserId" UUID');
    expect(migration).toContain('CREATE UNIQUE INDEX "student_attendance_duty_one_live_scope_key"');
    expect(migration).toContain(
      'ALTER TABLE "student_attendance_duty_assignments" ENABLE ROW LEVEL SECURITY'
    );
    expect(migration).toContain("academia.attendance.coverage.manage");
    expect(migration).toContain('FOREIGN KEY ("tenantId", "classSectionId")');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "assignedUserId")');
  });

  it("enforces acknowledgement, assignment scope, versioned takeover, and audit server-side", () => {
    const dutyService = source(
      "src/modules/academia/services/student-attendance-duty.service.ts"
    );
    const markAttendanceUi = source(
      "src/modules/academia/components/attendance/attendance-session-mark-form.tsx"
    );
    const responsibilityService = source(
      "src/modules/academia/services/student-attendance-responsibility.service.ts"
    );
    const sessionService = source(
      "src/modules/academia/services/student-attendance-session.service.ts"
    );
    const actions = source(
      "src/modules/academia/actions/student-attendance-duty.actions.ts"
    );
    const auditEvents = source("src/modules/academia/audit-events.ts");

    expect(dutyService).toContain("requireCoverageManager(ctx)");
    expect(dutyService).toContain("loadEligibleDutyUser(");
    expect(dutyService).toContain("queueInAppNotificationEvent");
    expect(dutyService).toContain("assignedUserId: scope.userId");
    expect(dutyService).toContain("status: { in: [...LIVE_DUTY_STATUSES] }");
    expect(responsibilityService).toContain("USABLE_DUTY_STATUSES");
    expect(responsibilityService).toContain("ATTENDANCE_DUTY_ACKNOWLEDGEMENT_REQUIRED");
    expect(responsibilityService).toContain("ATTENDANCE_SESSION_ASSIGNED_TO_ANOTHER_USER");
    expect(responsibilityService).toContain("sessionVersion: { increment: 1 }");
    expect(sessionService).toContain("resolveStudentAttendanceResponsibility(");
    expect(sessionService).toContain("requireStudentAttendanceSessionResponsibility(");
    expect(auditEvents).toContain("STUDENT_ATTENDANCE_DUTY_ASSIGNED");
    expect(auditEvents).toContain("STUDENT_ATTENDANCE_COMPLETED_BY_DELEGATE");
    expect(actions).toContain("getTenantContext()");
    expect(actions).not.toContain("export const INITIAL_ATTENDANCE_DUTY_ACTION_STATE");
    expect(actions).not.toMatch(/formData\.get\(["']tenantId["']\)/);
    expect(actions).not.toMatch(/formData\.get\(["']branchId["']\)/);
    expect(actions).not.toMatch(/formData\.get\(["']role["']\)/);
  });

  it("keeps coverage permission-aware and prevents pending duty from opening the register", () => {
    const roles = source("src/lib/rbac/roles.ts");
    const navigation = source("src/components/app-shell/navigation.ts");
    const coverageUi = source(
      "src/modules/academia/components/attendance/attendance-coverage-manager.tsx"
    );
    const dutyService = source(
      "src/modules/academia/services/student-attendance-duty.service.ts"
    );
    const markAttendanceUi = source(
      "src/modules/academia/components/attendance/attendance-session-mark-form.tsx"
    );

    expect(roles).toContain('"academia.attendance.coverage.manage"');
    expect(navigation).toContain('href: "/academia/attendance/coverage"');
    expect(navigation).toContain('permissions: ["academia.attendance.coverage.manage"]');
    expect(coverageUi).toContain("item.canOpenAttendance");
    expect(coverageUi).toContain("Acknowledge this duty before opening the attendance register.");
    expect(dutyService).toContain("canOpenAttendance:");
    expect(dutyService).toContain('["ACKNOWLEDGED", "ACTIVE"].includes(duty.status)');
    expect(markAttendanceUi).toContain('" - Temporary attendance duty"');
    expect(markAttendanceUi).not.toContain("\uFFFD");
  });
});
