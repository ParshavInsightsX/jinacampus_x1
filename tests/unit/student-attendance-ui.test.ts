import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_SUBMISSION_STATUSES,
  buildSubmitPayload,
  canSubmitAttendance,
  countRiskStatuses,
  createRowsFromMarkingState,
  markAllPresent,
  updateAttendanceRow,
  type AttendanceRow
} from "@/modules/academia/components/attendance/attendance-form-state";
import type { StudentAttendanceMarkingState } from "@/modules/academia/queries";

const rows: AttendanceRow[] = [
  {
    enrollmentId: "00000000-0000-0000-0000-000000000001",
    studentId: "00000000-0000-0000-0000-000000000011",
    admissionNo: "ADM-001",
    rollNumber: "1",
    displayName: "Aarav Shah",
    status: "",
    remarks: "",
    lockedAt: null
  },
  {
    enrollmentId: "00000000-0000-0000-0000-000000000002",
    studentId: "00000000-0000-0000-0000-000000000012",
    admissionNo: "ADM-002",
    rollNumber: "2",
    displayName: "Diya Patel",
    status: "ABSENT",
    remarks: "Parent informed",
    lockedAt: null
  }
];

describe("attendance form state helpers", () => {
  it("does not expose NOT_MARKED as a submitted status", () => {
    expect(ATTENDANCE_SUBMISSION_STATUSES).toEqual([
      "PRESENT",
      "ABSENT",
      "LATE",
      "HALF_DAY",
      "ON_LEAVE",
      "EXCUSED"
    ]);
    expect(ATTENDANCE_SUBMISSION_STATUSES).not.toContain("NOT_MARKED");
  });

  it("sets all loaded students to PRESENT when mark-all-present is used", () => {
    expect(markAllPresent(rows).map((row) => row.status)).toEqual(["PRESENT", "PRESENT"]);
  });

  it("rejects a submit payload with no loaded students", () => {
    expect(buildSubmitPayload({
      classSectionId: "00000000-0000-0000-0000-000000000003",
      attendanceDate: "2026-05-04",
      rows: []
    })).toEqual({
      ok: false,
      error: "Load active enrolled students before submitting attendance."
    });
  });

  it("requires every loaded student to have a submitted status", () => {
    expect(buildSubmitPayload({
      classSectionId: "00000000-0000-0000-0000-000000000003",
      attendanceDate: "2026-05-04",
      rows
    })).toEqual({
      ok: false,
      error: "Select a status for Aarav Shah."
    });
  });

  it("builds a full-day submit payload from status and remarks rows", () => {
    const markedRows = updateAttendanceRow(markAllPresent(rows), rows[1].studentId, {
      status: "LATE",
      remarks: "Bus delay"
    });

    expect(buildSubmitPayload({
      classSectionId: "00000000-0000-0000-0000-000000000003",
      attendanceDate: "2026-05-04",
      rows: markedRows
    })).toEqual({
      ok: true,
      payload: {
        classSectionId: "00000000-0000-0000-0000-000000000003",
        attendanceDate: "2026-05-04",
        sessionType: "FULL_DAY",
        entries: [
          { studentId: rows[0].studentId, status: "PRESENT", remarks: undefined },
          { studentId: rows[1].studentId, status: "LATE", remarks: "Bus delay" }
        ]
      }
    });
  });

  it("disables normal submission when attendance is locked", () => {
    expect(canSubmitAttendance({ rows: markAllPresent(rows), isLocked: true, isSubmitting: false })).toBe(false);
  });

  it("maps existing NOT_MARKED records to an empty editable status", () => {
    const state: StudentAttendanceMarkingState = {
      classSectionId: "00000000-0000-0000-0000-000000000003",
      attendanceDate: "2026-05-04",
      sessionType: "FULL_DAY",
      existingRecordCount: 1,
          lockedCount: 0,
          isLocked: false,
          calendarEntry: null,
          students: [
        {
          enrollmentId: rows[0].enrollmentId,
          studentId: rows[0].studentId,
          admissionNo: rows[0].admissionNo,
          rollNumber: rows[0].rollNumber,
          firstName: "Aarav",
          middleName: null,
          lastName: "Shah",
          displayName: "Aarav Shah",
          gender: "MALE",
          status: "ACTIVE",
          classSectionId: "00000000-0000-0000-0000-000000000003",
          attendanceRecordId: "00000000-0000-0000-0000-000000000004",
          attendanceStatus: "NOT_MARKED",
          remarks: "",
          lockedAt: null
        }
      ]
    };

    expect(createRowsFromMarkingState(state)[0].status).toBe("");
  });

  it("counts absent, late, and half-day rows for high-risk submit confirmation", () => {
    expect(countRiskStatuses([
      { ...rows[0], status: "PRESENT" },
      { ...rows[1], status: "HALF_DAY" }
    ])).toBe(1);
  });
});
