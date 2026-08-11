"use client";

import { useMemo, useState } from "react";
import { ErrorState, LoadingState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-primitives";
import type { AttendanceClassSectionOption, StudentAttendanceMarkingState } from "@/modules/academia/queries";
import type { SubmitDailyStudentAttendanceResult } from "@/modules/academia/services/student-attendance.service";
import {
  loadActiveStudentsForAttendanceAction,
  submitDailyStudentAttendanceAction
} from "@/modules/academia/actions/student-attendance.actions";
import { AttendanceEmptyState } from "./attendance-empty-state";
import { AttendanceLockedAlert } from "./attendance-locked-alert";
import { AttendanceStudentTable } from "./attendance-student-table";
import { AttendanceSummaryCard } from "./attendance-summary-card";
import {
  buildSubmitPayload,
  canSubmitAttendance,
  countRiskStatuses,
  createRowsFromMarkingState,
  markAllPresent,
  updateAttendanceRow,
  type AttendanceRow,
  type AttendanceSubmissionStatus
} from "./attendance-form-state";

type AttendanceMarkFormProps = {
  classSections: AttendanceClassSectionOption[];
  defaultDate: string;
};

function actionMessage(code: string, fallback: string) {
  if (code === "STUDENT_ATTENDANCE_LOCKED" || code === "STUDENT_ATTENDANCE_CUTOFF_PASSED") {
    return "Attendance is locked for this class-section and date. Admin or principal correction is required.";
  }
  if (code === "FORBIDDEN" || code.startsWith("FORBIDDEN_PERMISSION")) {
    return "You do not have permission to complete this attendance action.";
  }
  return fallback;
}

export function AttendanceMarkForm({ classSections, defaultDate }: AttendanceMarkFormProps) {
  const [classSectionId, setClassSectionId] = useState(classSections[0]?.id ?? "");
  const [attendanceDate, setAttendanceDate] = useState(defaultDate);
  const [loadedState, setLoadedState] = useState<StudentAttendanceMarkingState | null>(null);
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SubmitDailyStudentAttendanceResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedClassSection = useMemo(
    () => classSections.find((classSection) => classSection.id === classSectionId) ?? null,
    [classSections, classSectionId]
  );
  const isLocked = Boolean(loadedState?.isLocked);
  const submitEnabled = canSubmitAttendance({ rows, isLocked, isSubmitting });

  async function loadStudents() {
    if (!classSectionId) {
      setError("Select a class-section before loading students.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSummary(null);

    const result = await loadActiveStudentsForAttendanceAction({
      classSectionId,
      attendanceDate
    });

    if (result.ok) {
      setLoadedState(result.data);
      setRows(createRowsFromMarkingState(result.data));
      setError(null);
    } else {
      setLoadedState(null);
      setRows([]);
      setError(actionMessage(result.code, result.error));
    }

    setIsLoading(false);
  }

  function resetRows() {
    setRows(loadedState ? createRowsFromMarkingState(loadedState) : []);
    setSummary(null);
    setError(null);
  }

  async function submitAttendance() {
    const payloadResult = buildSubmitPayload({ classSectionId, attendanceDate, rows });
    if (!payloadResult.ok) {
      setError(payloadResult.error);
      return;
    }

    const riskCount = countRiskStatuses(rows);
    const riskThreshold = Math.max(3, Math.ceil(rows.length * 0.25));
    if (riskCount >= riskThreshold) {
      const confirmed = window.confirm(`${riskCount} students are marked absent, late, or half-day. Submit attendance?`);
      if (!confirmed) return;
    }

    setIsSubmitting(true);
    setError(null);
    setSummary(null);

    const result = await submitDailyStudentAttendanceAction(payloadResult.payload);
    if (result.ok) {
      setSummary(result.data);
    } else {
      setError(actionMessage(result.code, result.error));
      if (result.code === "STUDENT_ATTENDANCE_LOCKED" || result.code === "STUDENT_ATTENDANCE_CUTOFF_PASSED") {
        setLoadedState((state) => state ? { ...state, isLocked: true } : state);
      }
    }

    setIsSubmitting(false);
  }

  return (
    <div className="space-y-5">
      <section aria-label="Attendance selection" className="premium-card p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_0.8fr_auto] lg:items-end">
          <FormField
            id="attendance-class-section"
            label="Class-section"
            required
            helpText="Choose the class and section for the selected academic year."
          >
            <select
              id="attendance-class-section"
              value={classSectionId}
              onChange={(event) => {
                setClassSectionId(event.target.value);
                setLoadedState(null);
                setRows([]);
                setSummary(null);
                setError(null);
              }}
              className="min-h-11 w-full"
              disabled={classSections.length === 0}
            >
              {classSections.length === 0 ? <option value="">No class sections available</option> : null}
              {classSections.map((classSection) => (
                <option key={classSection.id} value={classSection.id}>
                  {classSection.displayName} · {classSection.branchName} · {classSection.academicYearName}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id="attendance-date" label="Attendance date" required helpText="Use the school day being marked.">
            <input
              id="attendance-date"
              type="date"
              value={attendanceDate}
              onChange={(event) => {
                setAttendanceDate(event.target.value);
                setLoadedState(null);
                setRows([]);
                setSummary(null);
                setError(null);
              }}
              className="min-h-11 w-full"
            />
          </FormField>
          <button
            type="button"
            onClick={loadStudents}
            disabled={isLoading || !classSectionId}
            className="premium-primary-button w-full lg:w-auto premium-focus"
          >
            {isLoading ? "Loading..." : "Load Students"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">Session: FULL DAY</span>
          {selectedClassSection?.classTeacherName ? (
            <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 shadow-sm">Class teacher: {selectedClassSection.classTeacherName}</span>
          ) : null}
        </div>
      </section>

      {error ? <ErrorState title="Attendance action could not be completed" description={error} /> : null}

      {loadedState?.calendarEntry ? (
        <div role="status" className="rounded-lg border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-950">
          <p className="font-semibold">{loadedState.calendarEntry.name}</p>
          <p className="mt-1">Student attendance is not required on this {loadedState.calendarEntry.entryType === "HOLIDAY" ? "holiday" : "non-working day"}.</p>
        </div>
      ) : null}

      <AttendanceSummaryCard summary={summary} />

      {isLocked ? <AttendanceLockedAlert /> : null}

      {isLoading ? (
        <LoadingState
          title="Loading students..."
          description="Please wait while we load active enrolled students for this class-section."
        />
      ) : rows.length > 0 ? (
        <section className="space-y-4" aria-label="Student attendance entries">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Active enrolled students</h2>
              <p className="text-sm text-slate-500">{rows.length} students loaded for {attendanceDate}</p>
            </div>
            <div className="grid gap-2 sm:flex sm:flex-wrap">
              <button
                type="button"
                onClick={() => setRows((currentRows) => markAllPresent(currentRows))}
                disabled={isLocked || rows.length === 0}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto premium-focus"
              >
                Mark All Present
              </button>
              <button
                type="button"
                onClick={resetRows}
                disabled={isSubmitting}
                className="premium-secondary-button w-full sm:w-auto premium-focus"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={submitAttendance}
                disabled={!submitEnabled}
                className="premium-primary-button w-full sm:w-auto premium-focus"
              >
                {isSubmitting ? "Submitting..." : "Submit Attendance"}
              </button>
            </div>
          </div>

          <AttendanceStudentTable
            rows={rows}
            disabled={isLocked || isSubmitting}
            onStatusChange={(studentId, status) => {
              setRows((currentRows) => updateAttendanceRow(currentRows, studentId, { status }));
              setSummary(null);
            }}
            onRemarksChange={(studentId, remarks) => {
              setRows((currentRows) => updateAttendanceRow(currentRows, studentId, { remarks }));
              setSummary(null);
            }}
          />
        </section>
      ) : (
        <AttendanceEmptyState
          title={
            classSections.length === 0
              ? "No class sections available"
              : loadedState
                ? loadedState.calendarEntry ? "Attendance not required" : "No active enrolled students"
                : "No students loaded"
          }
          description={
            classSections.length === 0
              ? "Configure class sections and active enrollments before marking attendance."
              : loadedState
                ? loadedState.calendarEntry
                  ? "This date is excluded from student working-day and attendance-percentage calculations."
                  : "Add active enrollments for this class-section before marking attendance."
              : "Select a class-section and date, then load active enrolled students."
          }
          kind={classSections.length === 0 || Boolean(loadedState) ? "prerequisite" : "empty"}
        />
      )}
    </div>
  );
}
