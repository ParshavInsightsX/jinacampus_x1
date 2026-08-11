"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import {
  cancelGradebookAssessmentAction,
  publishGradebookAssessmentAction,
  reopenGradebookAssessmentAction,
  saveGradebookMarksAction,
  type GradebookActionResult
} from "@/modules/gradebook/actions";

type MarkStatus = "GRADED" | "ABSENT" | "EXEMPT";

type RosterEntry = {
  enrollmentId: string;
  studentName: string;
  admissionNumber: string;
  rollNumber: string | null;
  status: MarkStatus;
  marksObtained: string;
  remarks: string;
  enteredAt: string | null;
};

type GradebookMarksEditorProps = {
  assessment: {
    id: string;
    code: string;
    title: string;
    status: string;
    maxMarks: string;
    passMarks: string;
    classSectionName: string;
    subjectName: string;
  };
  capabilities: {
    canEnterMarks: boolean;
    canPublish: boolean;
    canManageAssessment: boolean;
  };
  roster: RosterEntry[];
};

type UiMessage = { tone: "success" | "error"; text: string } | null;

const controlClassName = "min-h-11 w-full rounded-lg border border-campus-border bg-white px-3 py-2 text-sm text-ink shadow-sm premium-focus disabled:bg-slate-50 disabled:text-slate-500";

function resultMessage(result: GradebookActionResult<unknown>): UiMessage {
  return result.ok
    ? { tone: "success", text: result.message }
    : { tone: "error", text: result.error };
}

export function GradebookMarksEditor({ assessment, capabilities, roster }: GradebookMarksEditorProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [entries, setEntries] = useState(roster);
  const [message, setMessage] = useState<UiMessage>(null);
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [lifecycleReason, setLifecycleReason] = useState("");

  const summary = useMemo(() => entries.reduce(
    (current, entry) => ({
      graded: current.graded + (entry.status === "GRADED" && entry.marksObtained !== "" ? 1 : 0),
      absent: current.absent + (entry.status === "ABSENT" ? 1 : 0),
      exempt: current.exempt + (entry.status === "EXEMPT" ? 1 : 0)
    }),
    { graded: 0, absent: 0, exempt: 0 }
  ), [entries]);

  function updateEntry(enrollmentId: string, patch: Partial<RosterEntry>) {
    setEntries((current) => current.map((entry) => (
      entry.enrollmentId === enrollmentId ? { ...entry, ...patch } : entry
    )));
  }

  function perform(action: () => Promise<GradebookActionResult<unknown>>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(resultMessage(result));
      if (result.ok) router.refresh();
    });
  }

  function saveMarks() {
    perform(() => saveGradebookMarksAction({
      assessmentId: assessment.id,
      entries: entries.map((entry) => ({
        enrollmentId: entry.enrollmentId,
        status: entry.status,
        ...(entry.status === "GRADED"
          ? { marksObtained: entry.marksObtained === "" ? undefined : Number(entry.marksObtained) }
          : {}),
        remarks: entry.remarks || undefined
      }))
    }));
  }

  return (
    <div className="space-y-6">
      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
            message.tone === "error"
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.text}
        </p>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Assessment summary">
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Class-section</p><p className="mt-1 font-semibold text-ink">{assessment.classSectionName}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Subject</p><p className="mt-1 font-semibold text-ink">{assessment.subjectName}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Pass / maximum</p><p className="mt-1 font-semibold text-ink">{assessment.passMarks} / {assessment.maxMarks}</p></div>
        <div className="premium-card p-4"><p className="text-xs text-slate-500">Status</p><div className="mt-1"><StatusBadge value={assessment.status} /></div></div>
      </section>

      <section className="premium-card p-4 sm:p-5" aria-labelledby="gradebook-marks-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 id="gradebook-marks-title" className="text-lg font-semibold text-ink">Student results</h2>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              Enter marks only for graded students. Absent and exempt outcomes retain a blank marks value.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">Graded {summary.graded}</span>
            <span className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">Absent {summary.absent}</span>
            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700">Exempt {summary.exempt}</span>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {entries.map((entry) => (
            <article key={entry.enrollmentId} className="rounded-lg border border-campus-border bg-white p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="font-semibold text-ink">{entry.studentName}</h3>
                  <p className="text-xs text-slate-500">
                    Scholar {entry.admissionNumber}{entry.rollNumber ? ` / Roll ${entry.rollNumber}` : ""}
                  </p>
                </div>
                {entry.enteredAt ? <p className="text-xs text-slate-500">Saved {entry.enteredAt}</p> : null}
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-[minmax(9rem,0.8fr)_minmax(8rem,0.6fr)_minmax(14rem,1.6fr)]">
                <div>
                  <label htmlFor={`mark-status-${entry.enrollmentId}`} className="text-xs font-semibold text-slate-600">Result status</label>
                  <select
                    id={`mark-status-${entry.enrollmentId}`}
                    value={entry.status}
                    disabled={pending || !capabilities.canEnterMarks}
                    onChange={(event) => {
                      const status = event.target.value as MarkStatus;
                      updateEntry(entry.enrollmentId, {
                        status,
                        ...(status === "GRADED" ? {} : { marksObtained: "" })
                      });
                    }}
                    className={`mt-2 ${controlClassName}`}
                  >
                    {(["GRADED", "ABSENT", "EXEMPT"] as const).map((status) => <option key={status} value={status}>{formatEnumLabel(status)}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`marks-${entry.enrollmentId}`} className="text-xs font-semibold text-slate-600">Marks</label>
                  <input
                    id={`marks-${entry.enrollmentId}`}
                    type="number"
                    min="0"
                    max={assessment.maxMarks}
                    step="0.01"
                    value={entry.marksObtained}
                    required={entry.status === "GRADED"}
                    disabled={pending || !capabilities.canEnterMarks || entry.status !== "GRADED"}
                    onChange={(event) => updateEntry(entry.enrollmentId, { marksObtained: event.target.value })}
                    className={`mt-2 ${controlClassName}`}
                  />
                </div>
                <div>
                  <label htmlFor={`remarks-${entry.enrollmentId}`} className="text-xs font-semibold text-slate-600">Remarks</label>
                  <input
                    id={`remarks-${entry.enrollmentId}`}
                    value={entry.remarks}
                    maxLength={300}
                    disabled={pending || !capabilities.canEnterMarks}
                    onChange={(event) => updateEntry(entry.enrollmentId, { remarks: event.target.value })}
                    className={`mt-2 ${controlClassName}`}
                    placeholder="Optional"
                  />
                </div>
              </div>
            </article>
          ))}
          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-campus-border p-4 text-sm text-slate-500">No active enrolled students are available.</p>
          ) : null}
        </div>

        {capabilities.canEnterMarks ? (
          <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-5 flex justify-end rounded-lg border border-campus-border bg-white/95 p-3 shadow-lg backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
            <button type="button" disabled={pending || entries.length === 0} onClick={saveMarks} className="premium-primary-button w-full sm:w-auto">
              {pending ? "Saving..." : "Save results"}
            </button>
          </div>
        ) : null}
      </section>

      {capabilities.canPublish && assessment.status === "OPEN" ? (
        <section className="premium-card border-emerald-200 p-5" aria-labelledby="gradebook-publish-title">
          <h2 id="gradebook-publish-title" className="text-lg font-semibold text-ink">Publish results</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Publication makes these results available in GradeBook reports. Reopening requires an audited reason.</p>
          <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-slate-700">
            <input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} className="mt-1 size-5 rounded border-slate-300 text-brand-600" />
            <span>I reviewed every active student result and confirm this assessment is ready to publish.</span>
          </label>
          <button
            type="button"
            disabled={pending || !reviewConfirmed || entries.length === 0}
            onClick={() => perform(() => publishGradebookAssessmentAction({ assessmentId: assessment.id }))}
            className="premium-primary-button mt-4 w-full sm:w-auto"
          >
            {pending ? "Publishing..." : "Publish results"}
          </button>
        </section>
      ) : null}

      {(capabilities.canPublish && assessment.status === "PUBLISHED") ||
       (capabilities.canManageAssessment && assessment.status === "OPEN") ? (
        <section className="premium-card p-5" aria-labelledby="gradebook-lifecycle-title">
          <h2 id="gradebook-lifecycle-title" className="text-lg font-semibold text-ink">Assessment lifecycle</h2>
          <p className="mt-1 text-sm text-slate-500">A clear reason is required and retained in the audit record.</p>
          <label htmlFor="gradebook-lifecycle-reason" className="mt-4 block text-sm font-semibold text-ink">Reason</label>
          <textarea
            id="gradebook-lifecycle-reason"
            value={lifecycleReason}
            onChange={(event) => setLifecycleReason(event.target.value)}
            minLength={10}
            maxLength={500}
            disabled={pending}
            className={`mt-2 min-h-24 ${controlClassName}`}
            placeholder="Explain why this assessment state must change."
          />
          <button
            type="button"
            disabled={pending || lifecycleReason.trim().length < 10}
            onClick={() => perform(() => assessment.status === "PUBLISHED"
              ? reopenGradebookAssessmentAction({ assessmentId: assessment.id, reason: lifecycleReason })
              : cancelGradebookAssessmentAction({ assessmentId: assessment.id, reason: lifecycleReason }))}
            className="premium-secondary-button mt-4 w-full sm:w-auto"
          >
            {pending ? "Updating..." : assessment.status === "PUBLISHED" ? "Reopen for correction" : "Cancel assessment"}
          </button>
        </section>
      ) : null}
    </div>
  );
}
