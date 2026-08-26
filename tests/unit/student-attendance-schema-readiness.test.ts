import { describe, expect, it, vi } from "vitest";
import { getUserSafeErrorMessage } from "@/lib/errors";
import {
  isStudentAttendanceSessionSchemaAvailable,
  requireStudentAttendanceSessionSchema,
  type StudentAttendanceSchemaProbeClient
} from "@/modules/academia/services/student-attendance-schema-readiness";

function schemaProbe(overrides: Partial<Record<
  | "sessionTableAvailable"
  | "rosterTableAvailable"
  | "entryTableAvailable"
  | "mutationTableAvailable"
  | "dutyTableAvailable"
  | "continuityColumnsAvailable",
  boolean
>> = {}) {
  const result = {
    sessionTableAvailable: true,
    rosterTableAvailable: true,
    entryTableAvailable: true,
    mutationTableAvailable: true,
    dutyTableAvailable: true,
    continuityColumnsAvailable: true,
    ...overrides
  };
  const queryRaw = vi.fn().mockResolvedValue([result]);
  return {
    client: { $queryRaw: queryRaw } as unknown as StudentAttendanceSchemaProbeClient,
    queryRaw
  };
}

describe("student attendance schema readiness", () => {
  it("reports ready only when the complete attendance-session schema exists", async () => {
    const ready = schemaProbe();
    const incomplete = schemaProbe({ mutationTableAvailable: false });
    const continuityIncomplete = schemaProbe({ continuityColumnsAvailable: false });

    await expect(isStudentAttendanceSessionSchemaAvailable(ready.client)).resolves.toBe(true);
    await expect(isStudentAttendanceSessionSchemaAvailable(incomplete.client)).resolves.toBe(false);
    await expect(isStudentAttendanceSessionSchemaAvailable(continuityIncomplete.client)).resolves.toBe(false);
    expect(ready.queryRaw).toHaveBeenCalledOnce();
    expect(incomplete.queryRaw).toHaveBeenCalledOnce();
    expect(continuityIncomplete.queryRaw).toHaveBeenCalledOnce();
  });

  it("maps the pending migration state to safe, actionable copy", () => {
    expect(getUserSafeErrorMessage("STUDENT_ATTENDANCE_UPGRADE_REQUIRED")).toBe(
      "Student Attendance is temporarily unavailable while setup is completed. Please contact the JinaCampus Administrator."
    );
  });

  it("fails closed with a safe service-unavailable error while migration is pending", async () => {
    const { client } = schemaProbe({ sessionTableAvailable: false });

    await expect(requireStudentAttendanceSessionSchema(client)).rejects.toMatchObject({
      code: "STUDENT_ATTENDANCE_UPGRADE_REQUIRED",
      status: 503
    });
  });
});