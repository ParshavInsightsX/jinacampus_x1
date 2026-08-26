"use client";

import { useState } from "react";
import { correctStudentAttendanceSessionEntryAction } from "@/modules/academia/actions/student-attendance-session.actions";
import type {
  StudentAttendanceSessionEntryView,
  StudentAttendanceSessionView
} from "@/modules/academia/services/student-attendance-session.service";

const correctionStatuses = [
  ["PRESENT", "Present"],
  ["ABSENT", "Absent"],
  ["LATE", "Late"],
  ["HALF_DAY", "Half Day"],
  ["ON_LEAVE", "On Leave"],
  ["EXCUSED", "Excused"]
] as const;

type CorrectionStatus = (typeof correctionStatuses)[number][0];

function correctionLabel(status: CorrectionStatus) {
  return correctionStatuses.find(([value]) => value === status)?.[1] ?? status;
}

function initialStatus(entry: StudentAttendanceSessionEntryView): CorrectionStatus {
  if (entry.legacyStatus && entry.legacyStatus !== "NOT_MARKED") return entry.legacyStatus;
  if (entry.status === "LEAVE") return "ON_LEAVE";
  return entry.status ?? "PRESENT";
}

export function AttendanceSessionCorrectionForm({
  sessionId,
  entry,
  onCorrected
}: {
  sessionId: string;
  entry: StudentAttendanceSessionEntryView;
  onCorrected: (session: StudentAttendanceSessionView, message: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<CorrectionStatus>(() => initialStatus(entry));
  const [reason, setReason] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submitCorrection() {
    if (reason.trim().length < 5) {
      setError("Enter a clear correction reason using at least 5 characters.");
      return;
    }
    if (!window.confirm(
      "Correct " + entry.displayName + "'s attendance to " + correctionLabel(status) + "?"
    )) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await correctStudentAttendanceSessionEntryAction({
        sessionId,
        entryId: entry.entryId,
        status,
        correctionReason: reason,
        remarks
      });
      if (result.ok) {
        setIsOpen(false);
        setReason("");
        setRemarks("");
        onCorrected(
          result.data.session,
          entry.displayName + "'s attendance was corrected to " + correctionLabel(status) + "."
        );
      } else {
        setError(result.error);
      }
    } catch {
      setError("Unable to save this attendance correction. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="premium-secondary-button mt-3 min-h-11 w-full sm:w-auto premium-focus"
        aria-label={"Correct " + entry.displayName + " attendance"}
      >
        Correct Attendance
      </button>
    );
  }

  const statusId = "attendance-correction-status-" + entry.entryId;
  const reasonId = "attendance-correction-reason-" + entry.entryId;
  const remarksId = "attendance-correction-remarks-" + entry.entryId;

  return (
    <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
      <p className="text-sm font-semibold text-slate-950">Attendance Correction</p>
      <p className="mt-1 text-xs text-slate-600">Current status: {correctionLabel(initialStatus(entry))}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={statusId} className="text-sm font-medium text-slate-800">
            Correct status
          </label>
          <select
            id={statusId}
            value={status}
            onChange={(event) => setStatus(event.target.value as CorrectionStatus)}
            disabled={isSubmitting}
            className="mt-2 min-h-11 w-full"
          >
            {correctionStatuses.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={reasonId} className="text-sm font-medium text-slate-800">
            Correction reason
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
            maxLength={500}
            className="mt-2 min-h-11 w-full"
            placeholder="Why is this correction required?"
          />
        </div>
      </div>
      <div className="mt-3">
        <label htmlFor={remarksId} className="text-sm font-medium text-slate-800">
          Remarks (optional)
        </label>
        <input
          id={remarksId}
          value={remarks}
          onChange={(event) => setRemarks(event.target.value)}
          disabled={isSubmitting}
          maxLength={300}
          className="mt-2 min-h-11 w-full"
        />
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-medium text-rose-700">{error}</p> : null}
      <div className="mt-3 grid gap-2 sm:flex sm:justify-end">
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            setError(null);
          }}
          disabled={isSubmitting}
          className="premium-secondary-button min-h-11 w-full sm:w-auto premium-focus"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submitCorrection}
          disabled={isSubmitting}
          className="premium-primary-button min-h-11 w-full sm:w-auto premium-focus"
        >
          {isSubmitting ? "Saving correction..." : "Save Correction"}
        </button>
      </div>
    </div>
  );
}
