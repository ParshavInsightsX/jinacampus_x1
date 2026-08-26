"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, LoaderCircle, Search, Undo2 } from "lucide-react";
import { ErrorState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-primitives";
import {
  completeStudentAttendanceSessionAction,
  markRemainingStudentsPresentAction,
  mutateStudentAttendanceEntryAction,
  prepareStudentAttendanceSessionAction,
  undoStudentAttendanceBulkAction
} from "@/modules/academia/actions/student-attendance-session.actions";
import type { AttendanceClassSectionOption } from "@/modules/academia/queries";
import type {
  StudentAttendanceSessionEntryView,
  StudentAttendanceSessionView
} from "@/modules/academia/services/student-attendance-session.service";
import { AttendanceEmptyState } from "./attendance-empty-state";
import { AttendanceSessionStudentList } from "./attendance-session-student-list";
import {
  ATTENDANCE_FILTERS,
  attendanceProgressPercent,
  filterAttendanceEntries,
  markRemainingPresentPreview,
  mergeSavedAttendanceEntry,
  recalculateAttendanceSession,
  updateAttendanceEntryStatus,
  type AttendanceCaptureStatus,
  type AttendanceEntrySaveState,
  type AttendanceListFilter
} from "./attendance-session-state";

type AttendanceSessionMarkFormProps = {
  classSections: AttendanceClassSectionOption[];
  defaultDate: string;
  defaultClassSectionId?: string;
  canCorrect?: boolean;
};

const ATTENDANCE_NETWORK_ERROR =
  "Attendance could not reach the server. Check your connection and try again.";

async function safelyRunAttendanceAction<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch {
    return null;
  }
}

function saveStatesForSession(session: StudentAttendanceSessionView) {
  return Object.fromEntries(
    session.entries.map((entry) => [entry.entryId, entry.status ? "saved" : "idle"])
  ) as Record<string, AttendanceEntrySaveState>;
}

function errorMessage(result: { code: string; error: string }) {
  if (result.code === "STUDENT_ATTENDANCE_VERSION_CONFLICT") {
    return "Attendance changed on another device. Reload this class before continuing.";
  }
  if (result.code === "STUDENT_ATTENDANCE_LOCKED" || result.code === "STUDENT_ATTENDANCE_CUTOFF_PASSED") {
    return "Attendance is locked for this class and date. Ask an authorised administrator to make a correction.";
  }
  if (result.code === "STUDENT_ATTENDANCE_SESSION_COMPLETED") {
    return "This attendance session has already been completed.";
  }
  if (result.code === "ATTENDANCE_DUTY_ACKNOWLEDGEMENT_REQUIRED") {
    return "Acknowledge this attendance duty before opening the class.";
  }
  if (result.code === "ATTENDANCE_TAKEOVER_REASON_REQUIRED") {
    return "Enter a clear reason before taking over this attendance session.";
  }
  if (result.code === "ATTENDANCE_SESSION_ASSIGNED_TO_ANOTHER_USER") {
    return "This attendance session is currently assigned to another authorised user.";
  }
  if (result.code === "ATTENDANCE_RESPONSIBILITY_REQUIRED") {
    return "You need an active attendance duty for this class and date.";
  }
  return result.error;
}

export function AttendanceSessionMarkForm({
  classSections,
  defaultDate,
  defaultClassSectionId,
  canCorrect = false
}: AttendanceSessionMarkFormProps) {
  const [classSectionId, setClassSectionId] = useState(
    defaultClassSectionId && classSections.some((item) => item.id === defaultClassSectionId)
      ? defaultClassSectionId
      : classSections[0]?.id ?? ""
  );
  const [attendanceDate, setAttendanceDate] = useState(defaultDate);
  const [delegationReason, setDelegationReason] = useState("");
  const [session, setSession] = useState<StudentAttendanceSessionView | null>(null);
  const [saveStateByEntry, setSaveStateByEntry] = useState<Record<string, AttendanceEntrySaveState>>({});
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AttendanceListFilter>("ALL");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastBulkMutationId, setLastBulkMutationId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isBulkSaving, setIsBulkSaving] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);

  const selectedClassSection = useMemo(
    () => classSections.find((classSection) => classSection.id === classSectionId) ?? null,
    [classSections, classSectionId]
  );
  const visibleEntries = useMemo(
    () => (session ? filterAttendanceEntries(session.entries, search, filter) : []),
    [filter, search, session]
  );
  const pendingSaveCount = Object.values(saveStateByEntry).filter((state) => state === "saving").length;
  const readOnly = session?.state === "COMPLETED" || session?.state === "LOCKED";
  const controlsDisabled = isLoading || isBulkSaving || isFinishing || Boolean(readOnly);

  function clearLoadedSession() {
    setSession(null);
    setSaveStateByEntry({});
    setSearch("");
    setFilter("ALL");
    setError(null);
    setSuccess(null);
    setLastBulkMutationId(null);
  }

  async function openAttendance() {
    if (!classSectionId) {
      setError("Choose a class and section before opening attendance.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    const result = await safelyRunAttendanceAction(prepareStudentAttendanceSessionAction({
      classSectionId,
      attendanceDate,
      sessionType: "FULL_DAY",
      delegationReason: delegationReason || undefined
    }));
    if (result?.ok) {
      setSession(result.data);
      setSaveStateByEntry(saveStatesForSession(result.data));
      setLastBulkMutationId(null);
    } else {
      setSession(null);
      setSaveStateByEntry({});
      setError(result ? errorMessage(result) : ATTENDANCE_NETWORK_ERROR);
    }
    setIsLoading(false);
  }

  async function saveEntry(
    entry: StudentAttendanceSessionEntryView,
    status: AttendanceCaptureStatus
  ) {
    if (!session || entry.status === status || controlsDisabled) return;
    const previousEntry = entry;
    const attemptedRecordVersion = entry.recordVersion;

    setError(null);
    setSuccess(null);
    setLastBulkMutationId(null);
    setSession((current) =>
      current ? updateAttendanceEntryStatus(current, entry.entryId, status) : current
    );
    setSaveStateByEntry((current) => ({ ...current, [entry.entryId]: "saving" }));

    const result = await safelyRunAttendanceAction(mutateStudentAttendanceEntryAction({
      sessionId: session.sessionId,
      entryId: entry.entryId,
      status,
      clientMutationId: globalThis.crypto.randomUUID(),
      baseRecordVersion: attemptedRecordVersion,
      capturedAtClient: new Date().toISOString()
    }));

    if (result?.ok) {
      setSession((current) =>
        current
          ? mergeSavedAttendanceEntry(current, result.data.session, result.data.entry)
          : result.data.session
      );
      setSaveStateByEntry((current) => ({ ...current, [entry.entryId]: "saved" }));
      return;
    }

    setSession((current) => {
      if (!current) return current;
      const currentEntry = current.entries.find((item) => item.entryId === entry.entryId);
      if (!currentEntry || currentEntry.recordVersion !== attemptedRecordVersion || currentEntry.status !== status) {
        return current;
      }
      return recalculateAttendanceSession(
        current,
        current.entries.map((item) => (item.entryId === previousEntry.entryId ? previousEntry : item))
      );
    });
    setSaveStateByEntry((current) => ({ ...current, [entry.entryId]: "error" }));
    setError(result ? errorMessage(result) : ATTENDANCE_NETWORK_ERROR);
  }

  async function markRemainingPresent() {
    if (!session || session.unmarkedCount === 0 || controlsDisabled || pendingSaveCount > 0) return;
    if (!window.confirm(`Mark the remaining ${session.unmarkedCount} students Present? Existing Absent and Leave selections will stay unchanged.`)) {
      return;
    }

    const before = session;
    const clientMutationId = globalThis.crypto.randomUUID();
    setIsBulkSaving(true);
    setError(null);
    setSuccess(null);
    setSession(markRemainingPresentPreview(session));

    const result = await safelyRunAttendanceAction(markRemainingStudentsPresentAction({
      sessionId: session.sessionId,
      clientMutationId,
      baseSessionVersion: session.sessionVersion
    }));
    if (result?.ok) {
      setSession(result.data.session);
      setSaveStateByEntry(saveStatesForSession(result.data.session));
      setLastBulkMutationId(result.data.affectedCount > 0 ? result.data.bulkMutationId : null);
      setSuccess(
        result.data.affectedCount > 0
          ? `${result.data.affectedCount} remaining students were marked Present.`
          : "Every student already has an attendance status."
      );
    } else {
      setSession(before);
      setError(result ? errorMessage(result) : ATTENDANCE_NETWORK_ERROR);
    }
    setIsBulkSaving(false);
  }

  async function undoBulkPresent() {
    if (!session || !lastBulkMutationId || controlsDisabled || pendingSaveCount > 0) return;
    setIsBulkSaving(true);
    setError(null);
    setSuccess(null);

    const result = await safelyRunAttendanceAction(undoStudentAttendanceBulkAction({
      sessionId: session.sessionId,
      targetBulkMutationId: lastBulkMutationId,
      clientMutationId: globalThis.crypto.randomUUID(),
      baseSessionVersion: session.sessionVersion
    }));
    if (result?.ok) {
      setSession(result.data.session);
      setSaveStateByEntry(saveStatesForSession(result.data.session));
      setLastBulkMutationId(null);
      setSuccess(`Undid the bulk Present action for ${result.data.affectedCount} students.`);
    } else {
      setLastBulkMutationId(null);
      setError(result ? errorMessage(result) : ATTENDANCE_NETWORK_ERROR);
    }
    setIsBulkSaving(false);
  }

  async function finishAttendance() {
    if (!session || controlsDisabled) return;
    if (pendingSaveCount > 0) {
      setError("Wait for all student statuses to finish saving before completing attendance.");
      return;
    }
    if (session.unmarkedCount > 0) {
      setFilter("UNMARKED");
      setError(`Mark the remaining ${session.unmarkedCount} students before finishing attendance.`);
      return;
    }
    if (!window.confirm(
      `Finish attendance? Present: ${session.presentCount}, Absent: ${session.absentCount}, Leave: ${session.leaveCount}.`
    )) {
      return;
    }

    setIsFinishing(true);
    setError(null);
    setSuccess(null);
    const result = await safelyRunAttendanceAction(completeStudentAttendanceSessionAction({
      sessionId: session.sessionId,
      expectedSessionVersion: session.sessionVersion
    }));
    if (result?.ok) {
      setSession(result.data);
      setSuccess("Attendance completed successfully.");
      setLastBulkMutationId(null);
    } else {
      setError(result ? errorMessage(result) : ATTENDANCE_NETWORK_ERROR);
    }
    setIsFinishing(false);
  }

  return (
    <div className="space-y-5">
      <section aria-label="Attendance selection" className="premium-card p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.7fr_1.1fr_auto] lg:items-end">
          <FormField
            id="attendance-class-section"
            label="Class and section"
            required
            helpText="Only classes you are authorised to mark are listed."
          >
            <select
              id="attendance-class-section"
              value={classSectionId}
              onChange={(event) => {
                setClassSectionId(event.target.value);
                clearLoadedSession();
              }}
              disabled={classSections.length === 0 || isLoading}
              className="min-h-11 w-full"
            >
              {classSections.length === 0 ? <option value="">No classes available</option> : null}
              {classSections.map((classSection) => (
                <option key={classSection.id} value={classSection.id}>
                  {classSection.displayName} · {classSection.branchName}
                </option>
              ))}
            </select>
          </FormField>

          <FormField id="attendance-date" label="Attendance date" required>
            <input
              id="attendance-date"
              type="date"
              value={attendanceDate}
              onChange={(event) => {
                setAttendanceDate(event.target.value);
                clearLoadedSession();
              }}
              disabled={isLoading}
              className="min-h-11 w-full"
            />
          </FormField>

          <FormField
            id="attendance-delegation-reason"
            label="Takeover reason"
            helpText="Required only when a Principal takes over or responsibility changes."
          >
            <input
              id="attendance-delegation-reason"
              value={delegationReason}
              onChange={(event) => setDelegationReason(event.target.value)}
              maxLength={500}
              disabled={isLoading}
              className="min-h-11 w-full"
              placeholder="For example, class teacher is on approved leave"
            />
          </FormField>

          <button
            type="button"
            onClick={openAttendance}
            disabled={isLoading || !classSectionId}
            className="premium-primary-button min-h-11 w-full lg:w-auto premium-focus"
          >
            {isLoading ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                Opening...
              </span>
            ) : session ? "Reload Attendance" : "Open Attendance"}
          </button>
        </div>

        {selectedClassSection ? (
          <p className="mt-3 text-xs text-slate-600">
            {selectedClassSection.academicYearName}
            {selectedClassSection.classTeacherName ? ` · Class teacher: ${selectedClassSection.classTeacherName}` : ""}
          </p>
        ) : null}
      </section>

      {error ? <ErrorState title="Attendance was not saved" description={error} /> : null}
      {success ? (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          <p>{success}</p>
        </div>
      ) : null}

      {session ? (
        <section className="space-y-4" aria-label="Student attendance session">
          <div className="premium-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-indigo-700">Full-day attendance</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-950">{session.classSectionName}</h2>
                <p className="mt-1 text-sm text-slate-600">{session.attendanceDate}</p>
                <p className="mt-1 text-sm text-slate-600">
                  Responsible: <span className="font-semibold text-slate-800">{session.responsibleUserName}</span>
                  {session.isDelegated ? " - Temporary attendance duty" : " - Class teacher"}
                </p>
              </div>
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                {session.state === "COMPLETED" ? "Completed" : session.state === "LOCKED" ? "Locked" : "In progress"}
              </span>
            </div>

            <div className="mt-4" aria-label={`${session.markedCount} of ${session.totalCount} students marked`}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-slate-700">{session.markedCount} of {session.totalCount} marked</span>
                <span className="tabular-nums text-slate-600">{attendanceProgressPercent(session)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-[width]"
                  style={{ width: `${attendanceProgressPercent(session)}%` }}
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Present", session.presentCount, "text-emerald-700"],
                ["Absent", session.absentCount, "text-rose-700"],
                ["Leave", session.leaveCount, "text-amber-700"],
                ["Unmarked", session.unmarkedCount, "text-slate-700"]
              ].map(([label, value, tone]) => (
                <div key={String(label)} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs text-slate-600">{label}</p>
                  <p className={`mt-1 text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
                </div>
              ))}
            </div>
          </div>

          {session.state === "COMPLETED" ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              This attendance session is complete. Use the authorised correction workflow for later changes.
            </div>
          ) : session.state === "LOCKED" ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              Attendance is locked for this class and date. An authorised administrator must use Attendance Correction.
            </div>
          ) : null}

          <div className="premium-card p-4 sm:p-5">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label htmlFor="attendance-student-search" className="text-sm font-medium text-slate-800">
                  Find a student
                </label>
                <div className="relative mt-2">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="attendance-student-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Name, roll number, or scholar number"
                    className="min-h-11 w-full pl-10"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:flex" aria-label="Attendance list filters">
                {ATTENDANCE_FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    aria-pressed={filter === item.value}
                    onClick={() => setFilter(item.value)}
                    className={`min-h-11 rounded-lg border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${filter === item.value ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={markRemainingPresent}
                disabled={controlsDisabled || pendingSaveCount > 0 || session.unmarkedCount === 0}
                className="inline-flex min-h-11 items-center justify-center rounded-lg border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:border-emerald-500 disabled:cursor-not-allowed disabled:opacity-60 premium-focus"
              >
                {isBulkSaving ? "Saving..." : `Mark Remaining Present (${session.unmarkedCount})`}
              </button>
              {lastBulkMutationId ? (
                <button
                  type="button"
                  onClick={undoBulkPresent}
                  disabled={controlsDisabled || pendingSaveCount > 0}
                  className="premium-secondary-button min-h-11 premium-focus"
                >
                  <Undo2 aria-hidden="true" className="size-4" />
                  Undo bulk action
                </button>
              ) : null}
              {pendingSaveCount > 0 ? (
                <span className="inline-flex min-h-11 items-center gap-2 text-sm text-indigo-700" role="status">
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                  Saving {pendingSaveCount} {pendingSaveCount === 1 ? "student" : "students"}
                </span>
              ) : null}
            </div>
          </div>

          <AttendanceSessionStudentList
            entries={visibleEntries}
            saveStateByEntry={saveStateByEntry}
            disabled={controlsDisabled}
            onStatusChange={saveEntry}
            correction={session && readOnly && canCorrect ? {
              sessionId: session.sessionId,
              enabled: true,
              onCorrected: (correctedSession, message) => {
                setSession(correctedSession);
                setSaveStateByEntry(saveStatesForSession(correctedSession));
                setError(null);
                setSuccess(message);
              }
            } : undefined}
          />

          <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-5xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700">
                {session.unmarkedCount > 0
                  ? `${session.unmarkedCount} students still need a status.`
                  : "Every student has an attendance status."}
              </p>
              <button
                type="button"
                onClick={finishAttendance}
                disabled={controlsDisabled || pendingSaveCount > 0 || session.state === "COMPLETED"}
                className="premium-primary-button min-h-11 w-full sm:w-auto premium-focus"
              >
                {isFinishing ? "Finishing..." : "Finish Attendance"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <AttendanceEmptyState
          title={classSections.length === 0 ? "No classes available" : "Choose a class to begin"}
          description={
            classSections.length === 0
              ? "Configure an active class-section, student enrollments, and teacher assignment before marking attendance."
              : "Choose the class and attendance date, then open attendance to see the roster."
          }
          kind={classSections.length === 0 ? "prerequisite" : "empty"}
        />
      )}
    </div>
  );
}
