"use client";

import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
import type {
  StudentAttendanceSessionEntryView,
  StudentAttendanceSessionView
} from "@/modules/academia/services/student-attendance-session.service";
import { AttendanceSessionCorrectionForm } from "./attendance-session-correction-form";
import { AttendanceStatusSegmented } from "./attendance-status-segmented";
import type {
  AttendanceCaptureStatus,
  AttendanceEntrySaveState
} from "./attendance-session-state";

function rowTone(status: AttendanceCaptureStatus | null) {
  if (status === "ABSENT") return "border-rose-200 bg-rose-50/70";
  if (status === "LEAVE") return "border-amber-200 bg-amber-50/70";
  if (status === "PRESENT") return "border-emerald-200 bg-white";
  return "border-slate-200 bg-white";
}

function studentInitials(displayName: string) {
  return displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || "ST";
}

function SaveState({ state }: { state: AttendanceEntrySaveState }) {
  if (state === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700" role="status">
        <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
        Saving
      </span>
    );
  }
  if (state === "saved") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700" role="status">
        <Check aria-hidden="true" className="size-3.5" />
        Saved
      </span>
    );
  }
  if (state === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-700" role="status">
        <TriangleAlert aria-hidden="true" className="size-3.5" />
        Not saved
      </span>
    );
  }
  return <span className="text-xs text-slate-500">Not marked</span>;
}

export function AttendanceSessionStudentList({
  entries,
  saveStateByEntry,
  disabled,
  onStatusChange,
  correction
}: {
  entries: StudentAttendanceSessionEntryView[];
  saveStateByEntry: Record<string, AttendanceEntrySaveState>;
  disabled?: boolean;
  onStatusChange: (entry: StudentAttendanceSessionEntryView, status: AttendanceCaptureStatus) => void;
  correction?: {
    sessionId: string;
    enabled: boolean;
    onCorrected: (session: StudentAttendanceSessionView, message: string) => void;
  };
}) {
  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
        <p className="text-sm font-semibold text-slate-900">No students match this view</p>
        <p className="mt-1 text-sm text-slate-600">Clear the search or choose another attendance filter.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-student-attendance-session-list="true">
      {entries.map((entry) => {
        const saveState = saveStateByEntry[entry.entryId] ?? "idle";
        return (
          <article
            key={entry.entryId}
            className={`rounded-lg border p-3 shadow-sm transition-colors sm:p-4 ${rowTone(entry.status)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-sm font-bold text-indigo-700"
                >
                  {studentInitials(entry.displayName)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-950 sm:text-base">
                    {entry.displayName}
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Roll {entry.rollNumber ?? "-"} · Scholar {entry.scholarNumber}
                  </p>
                </div>
              </div>
              <SaveState state={saveState} />
            </div>

            <div className="mt-3">
              <AttendanceStatusSegmented
                studentName={entry.displayName}
                value={entry.status}
                disabled={disabled || saveState === "saving"}
                onChange={(status) => onStatusChange(entry, status)}
              />
            </div>
            {correction?.enabled ? (
              <AttendanceSessionCorrectionForm
                sessionId={correction.sessionId}
                entry={entry}
                onCorrected={correction.onCorrected}
              />
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
