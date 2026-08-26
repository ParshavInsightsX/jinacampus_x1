import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  completeStudentAttendanceSessionSchema,
  correctStudentAttendanceSessionEntrySchema,
  markRemainingStudentsPresentSchema,
  mutateStudentAttendanceEntrySchema,
  prepareStudentAttendanceSessionSchema,
  undoStudentAttendanceBulkSchema
} from "@/modules/academia/schemas/student-attendance.schema";

const id = "00000000-0000-0000-0000-000000000001";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("student attendance session foundation", () => {
  it("keeps every browser action schema strict and free of trusted scope fields", () => {
    const untrusted = {
      tenantId: id,
      branchId: id,
      academicYearId: id,
      userId: id,
      role: "PRINCIPAL"
    };

    expect(prepareStudentAttendanceSessionSchema.safeParse({
      classSectionId: id,
      attendanceDate: "2026-08-24",
      ...untrusted
    }).success).toBe(false);

    expect(mutateStudentAttendanceEntrySchema.safeParse({
      sessionId: id,
      entryId: id,
      status: "PRESENT",
      clientMutationId: id,
      baseRecordVersion: 0,
      ...untrusted
    }).success).toBe(false);

    expect(markRemainingStudentsPresentSchema.safeParse({
      sessionId: id,
      clientMutationId: id,
      baseSessionVersion: 0,
      ...untrusted
    }).success).toBe(false);

    expect(undoStudentAttendanceBulkSchema.safeParse({
      sessionId: id,
      targetBulkMutationId: id,
      clientMutationId: id,
      baseSessionVersion: 0,
      ...untrusted
    }).success).toBe(false);

    expect(completeStudentAttendanceSessionSchema.safeParse({
      sessionId: id,
      expectedSessionVersion: 0,
      ...untrusted
    }).success).toBe(false);

    expect(correctStudentAttendanceSessionEntrySchema.safeParse({
      sessionId: id,
      entryId: "00000000-0000-0000-0000-000000000002",
      status: "EXCUSED",
      correctionReason: "Approved correction",
      ...untrusted
    }).success).toBe(false);
    expect(correctStudentAttendanceSessionEntrySchema.safeParse({
      sessionId: id,
      entryId: "00000000-0000-0000-0000-000000000002",
      status: "NOT_MARKED",
      correctionReason: "Approved correction"
    }).success).toBe(false);
  });

  it("adds a tenant-scoped session, frozen roster, entry, and immutable mutation ledger", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source(
      "prisma/migrations/20260824120000_modernize_student_attendance_phase_1/migration.sql"
    );

    expect(schema).toContain("model StudentAttendanceSession {");
    expect(schema).toContain("model StudentAttendanceSessionRoster {");
    expect(schema).toContain("model StudentAttendanceSessionEntry {");
    expect(schema).toContain("model StudentAttendanceMutation {");
    expect(schema).toContain("student_attendance_mutations_client_key");
    expect(migration).toContain('CREATE TABLE "student_attendance_sessions"');
    expect(migration).toContain('CREATE TABLE "student_attendance_session_roster"');
    expect(migration).toContain('CREATE TABLE "student_attendance_session_entries"');
    expect(migration).toContain('CREATE TABLE "student_attendance_mutations"');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "classSectionId")');
    expect(migration).toContain('FOREIGN KEY ("tenantId", "enrollmentId")');
    expect(migration).toContain('ALTER TABLE "student_attendance_sessions" ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE "student_attendance_mutations" ENABLE ROW LEVEL SECURITY');
  });

  it("enforces entitlements, permission, assignment, versioning, and legacy projection server-side", () => {
    const service = source(
      "src/modules/academia/services/student-attendance-session.service.ts"
    );
    const actions = source(
      "src/modules/academia/actions/student-attendance-session.actions.ts"
    );
    const legacyService = source(
      "src/modules/academia/services/student-attendance.service.ts"
    );

    expect(service).toContain("requireAttendanceEntitlements(");
    expect(service).toContain("requirePermission({");
    expect(service).toContain("classTeacherUserId");
    expect(service).toContain("baseRecordVersion");
    expect(service).toContain("baseSessionVersion");
    expect(service).toContain("clientMutationId");
    expect(service).toContain("tx.studentAttendanceMutation.create");
    expect(service).toContain("tx.studentAttendanceRecord");
    expect(service).toContain("findApplicableCalendarEntry");
    expect(service).toContain("previousMutation.newStatus !== data.status");
    expect(service).toContain("correctStudentAttendanceSessionEntry");
    expect(service).toContain('permission: "academia.attendance.correct"');
    expect(service).toContain('state: { in: ["COMPLETED", "LOCKED"] }');
    expect(service).toContain("attendanceRecordId: attendanceRecord.id");
    expect(legacyService).toContain('source: "ADMIN_CORRECTION"');
    expect(legacyService).toContain("tx.studentAttendanceSessionEntry.update");
    expect(actions).toContain("getTenantContext()");
    expect(actions).toContain("correctStudentAttendanceSessionEntryAction");
    expect(actions).not.toMatch(/formData\.get\(["']tenantId["']\)/);
    expect(actions).not.toMatch(/formData\.get\(["']role["']\)/);
  });
});
