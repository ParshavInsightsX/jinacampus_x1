import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_CAPTURE_STATUSES,
  attendanceProgressPercent,
  filterAttendanceEntries,
  markRemainingPresentPreview,
  mergeSavedAttendanceEntry,
  updateAttendanceEntryStatus
} from "@/modules/academia/components/attendance/attendance-session-state";
import type {
  StudentAttendanceSessionEntryView,
  StudentAttendanceSessionView
} from "@/modules/academia/services/student-attendance-session.service";

const entries: StudentAttendanceSessionEntryView[] = [
  {
    entryId: "00000000-0000-0000-0000-000000000001",
    enrollmentId: "00000000-0000-0000-0000-000000000011",
    studentId: "00000000-0000-0000-0000-000000000021",
    scholarNumber: "SCH-001",
    rollNumber: "1",
    displayName: "Aarav Shah",
    status: null,
    legacyStatus: null,
    recordVersion: 0,
    markedAt: null
  },
  {
    entryId: "00000000-0000-0000-0000-000000000002",
    enrollmentId: "00000000-0000-0000-0000-000000000012",
    studentId: "00000000-0000-0000-0000-000000000022",
    scholarNumber: "SCH-002",
    rollNumber: "2",
    displayName: "Diya Patel",
    status: "ABSENT",
    legacyStatus: "ABSENT",
    recordVersion: 1,
    markedAt: "2026-08-24T03:30:00.000Z"
  },
  {
    entryId: "00000000-0000-0000-0000-000000000003",
    enrollmentId: "00000000-0000-0000-0000-000000000013",
    studentId: "00000000-0000-0000-0000-000000000023",
    scholarNumber: "SCH-003",
    rollNumber: null,
    displayName: "Kabir Rao",
    status: "LEAVE",
    legacyStatus: "ON_LEAVE",
    recordVersion: 2,
    markedAt: "2026-08-24T03:31:00.000Z"
  }
];

function session(overrides: Partial<StudentAttendanceSessionView> = {}): StudentAttendanceSessionView {
  return {
    sessionId: "00000000-0000-0000-0000-000000000100",
    classSectionId: "00000000-0000-0000-0000-000000000101",
    classSectionName: "Class 5 - A",
    attendanceDate: "2026-08-24",
    sessionType: "FULL_DAY",
    state: "IN_PROGRESS",
    sessionVersion: 3,
    totalCount: 3,
    markedCount: 2,
    unmarkedCount: 1,
    presentCount: 0,
    absentCount: 1,
    leaveCount: 1,
    isLocked: false,
    responsibleUserName: "Meera Joshi",
    responsibilitySource: "CLASS_TEACHER",
    delegationReason: null,
    isDelegated: false,
    entries,
    ...overrides
  };
}

describe("modern student attendance session UI state", () => {
  it("offers only the approved teacher-facing statuses", () => {
    expect(ATTENDANCE_CAPTURE_STATUSES).toEqual(["PRESENT", "ABSENT", "LEAVE"]);
  });

  it("marks only unmarked students present and preserves exceptions", () => {
    const preview = markRemainingPresentPreview(session());

    expect(preview.entries.map((entry) => entry.status)).toEqual(["PRESENT", "ABSENT", "LEAVE"]);
    expect(preview.presentCount).toBe(1);
    expect(preview.absentCount).toBe(1);
    expect(preview.leaveCount).toBe(1);
    expect(preview.unmarkedCount).toBe(0);
    expect(attendanceProgressPercent(preview)).toBe(100);
  });

  it("recalculates progress during an optimistic individual update", () => {
    const updated = updateAttendanceEntryStatus(session(), entries[0].entryId, "PRESENT");

    expect(updated.markedCount).toBe(3);
    expect(updated.unmarkedCount).toBe(0);
    expect(updated.presentCount).toBe(1);
  });

  it("filters by workflow state and searches familiar student identifiers", () => {
    expect(filterAttendanceEntries(entries, "", "UNMARKED").map((entry) => entry.scholarNumber))
      .toEqual(["SCH-001"]);
    expect(filterAttendanceEntries(entries, "diya", "ALL").map((entry) => entry.scholarNumber))
      .toEqual(["SCH-002"]);
    expect(filterAttendanceEntries(entries, "sch-003", "LEAVE").map((entry) => entry.displayName))
      .toEqual(["Kabir Rao"]);
  });

  it("merges a saved row without allowing an older response to lower the session version", () => {
    const optimistic = updateAttendanceEntryStatus(session({ sessionVersion: 8 }), entries[0].entryId, "PRESENT");
    const savedEntry: StudentAttendanceSessionEntryView = {
      ...optimistic.entries[0],
      recordVersion: 1,
      markedAt: "2026-08-24T03:32:00.000Z"
    };
    const merged = mergeSavedAttendanceEntry(
      optimistic,
      session({ sessionVersion: 7, entries: [savedEntry, ...entries.slice(1)] }),
      savedEntry
    );

    expect(merged.sessionVersion).toBe(8);
    expect(merged.entries[0].recordVersion).toBe(1);
    expect(merged.entries[0].status).toBe("PRESENT");
  });
});
