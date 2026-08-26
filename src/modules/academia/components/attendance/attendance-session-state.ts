import type {
  StudentAttendanceSessionEntryView,
  StudentAttendanceSessionView
} from "@/modules/academia/services/student-attendance-session.service";

export const ATTENDANCE_CAPTURE_STATUSES = ["PRESENT", "ABSENT", "LEAVE"] as const;
export type AttendanceCaptureStatus = (typeof ATTENDANCE_CAPTURE_STATUSES)[number];
export type AttendanceEntrySaveState = "idle" | "saving" | "saved" | "error";
export type AttendanceListFilter = "ALL" | "UNMARKED" | "ABSENT" | "LEAVE";

export const ATTENDANCE_FILTERS: ReadonlyArray<{
  value: AttendanceListFilter;
  label: string;
}> = [
  { value: "ALL", label: "All" },
  { value: "UNMARKED", label: "Unmarked" },
  { value: "ABSENT", label: "Absent" },
  { value: "LEAVE", label: "Leave" }
];

export function recalculateAttendanceSession(
  session: StudentAttendanceSessionView,
  entries: StudentAttendanceSessionEntryView[],
  patch: Partial<Pick<StudentAttendanceSessionView, "sessionVersion" | "state" | "isLocked">> = {}
): StudentAttendanceSessionView {
  const presentCount = entries.filter((entry) => entry.status === "PRESENT").length;
  const absentCount = entries.filter((entry) => entry.status === "ABSENT").length;
  const leaveCount = entries.filter((entry) => entry.status === "LEAVE").length;
  const markedCount = presentCount + absentCount + leaveCount;

  return {
    ...session,
    ...patch,
    entries,
    totalCount: entries.length,
    markedCount,
    unmarkedCount: entries.length - markedCount,
    presentCount,
    absentCount,
    leaveCount
  };
}

export function updateAttendanceEntryStatus(
  session: StudentAttendanceSessionView,
  entryId: string,
  status: AttendanceCaptureStatus
) {
  return recalculateAttendanceSession(
    session,
    session.entries.map((entry) => (entry.entryId === entryId ? { ...entry, status } : entry))
  );
}

export function mergeSavedAttendanceEntry(
  current: StudentAttendanceSessionView,
  savedSession: StudentAttendanceSessionView,
  savedEntry: StudentAttendanceSessionEntryView
) {
  return recalculateAttendanceSession(
    current,
    current.entries.map((entry) => (entry.entryId === savedEntry.entryId ? savedEntry : entry)),
    {
      sessionVersion: Math.max(current.sessionVersion, savedSession.sessionVersion),
      state: savedSession.state,
      isLocked: savedSession.isLocked
    }
  );
}

export function markRemainingPresentPreview(session: StudentAttendanceSessionView) {
  return recalculateAttendanceSession(
    session,
    session.entries.map((entry) =>
      entry.status === null ? { ...entry, status: "PRESENT" as const } : entry
    )
  );
}

export function filterAttendanceEntries(
  entries: StudentAttendanceSessionEntryView[],
  search: string,
  filter: AttendanceListFilter
) {
  const query = search.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const matchesFilter =
      filter === "ALL" ||
      (filter === "UNMARKED" && entry.status === null) ||
      entry.status === filter;
    if (!matchesFilter) return false;
    if (!query) return true;
    return [entry.displayName, entry.scholarNumber, entry.rollNumber ?? ""]
      .some((value) => value.toLocaleLowerCase().includes(query));
  });
}

export function attendanceProgressPercent(session: StudentAttendanceSessionView) {
  if (session.totalCount === 0) return 0;
  return Math.round((session.markedCount / session.totalCount) * 100);
}
