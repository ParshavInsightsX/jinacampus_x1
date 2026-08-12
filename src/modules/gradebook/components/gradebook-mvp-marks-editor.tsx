"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { returnMarksBatchAction, saveMarksDraftAction, transitionMarksBatchAction } from "@/modules/gradebook/mvp-actions";

type SpecialStatus = "ABSENT" | "EXEMPTED" | "MEDICAL_LEAVE" | "NOT_APPLICABLE" | "WITHHELD" | "RESULT_PENDING";
type EntryValue = { mode: "NUMERIC"; marks: string; reason: string; remark: string } | { mode: SpecialStatus; marks: string; reason: string; remark: string };

type Props = {
  batch: {
    id: string;
    status: string;
    version: number;
    subjectName: string;
    subjectCode: string;
    returnReason: string | null;
  };
  capabilities: { canSave: boolean; canSubmit: boolean; canVerify: boolean; canApprove: boolean; canLock: boolean; canReturn: boolean; canImport: boolean };
  roster: Array<{ enrollmentId: string; studentId: string; scholarNumber: string | null; rollNumber: string | null; displayName: string }>;
  components: Array<{ id: string; code: string; name: string; maximumMarks: string; passingMarks: string | null }>;
  marks: Array<{ enrollmentId: string; componentId: string; marksObtained: string | null; specialStatus: SpecialStatus | null; statusReason: string | null; publicRemark: string | null; teacherRemark: string | null }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";
const specialStatuses: SpecialStatus[] = ["ABSENT", "EXEMPTED", "MEDICAL_LEAVE", "NOT_APPLICABLE", "WITHHELD", "RESULT_PENDING"];

function key(enrollmentId: string, componentId: string) {
  return `${enrollmentId}:${componentId}`;
}

function messageFor(result: GradebookActionResult<unknown>): Feedback {
  return result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error };
}

export function GradebookMvpMarksEditor(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [workflowComment, setWorkflowComment] = useState("");
  const initialEntries = useMemo(() => {
    const byKey = new Map(props.marks.map((mark) => [key(mark.enrollmentId, mark.componentId), mark]));
    return Object.fromEntries(props.roster.flatMap((student) => props.components.map((component) => {
      const mark = byKey.get(key(student.enrollmentId, component.id));
      const mode = mark?.specialStatus ?? "NUMERIC";
      return [key(student.enrollmentId, component.id), {
        mode,
        marks: mark?.marksObtained ?? "",
        reason: mark?.statusReason ?? "",
        remark: mark?.teacherRemark ?? mark?.publicRemark ?? ""
      } satisfies EntryValue];
    })));
  }, [props.components, props.marks, props.roster]);
  const [entries, setEntries] = useState<Record<string, EntryValue>>(initialEntries);

  function updateEntry(entryKey: string, patch: Partial<EntryValue>) {
    setEntries((current) => ({ ...current, [entryKey]: { ...current[entryKey], ...patch } as EntryValue }));
  }

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(messageFor(result));
      if (result.ok) router.refresh();
    });
  }

  function saveDraft() {
    const payload = props.roster.flatMap((student) => props.components.flatMap((component) => {
      const value = entries[key(student.enrollmentId, component.id)];
      if (!value || (value.mode === "NUMERIC" && value.marks === "")) return [];
      return [{
        enrollmentId: student.enrollmentId,
        componentId: component.id,
        value: value.mode === "NUMERIC"
          ? { kind: "NUMERIC" as const, marksObtained: Number(value.marks) }
          : { kind: "SPECIAL_STATUS" as const, status: value.mode, reason: value.reason || undefined, publicRemark: value.remark || undefined },
        teacherRemark: value.remark || undefined
      }];
    }));
    if (payload.length === 0) {
      setFeedback({ tone: "error", text: "Enter at least one mark or special status before saving." });
      return;
    }
    run(() => saveMarksDraftAction({ batchId: props.batch.id, expectedVersion: props.batch.version, entries: payload }));
  }

  function transition(action: "SUBMIT" | "VERIFY" | "APPROVE" | "LOCK") {
    run(() => transitionMarksBatchAction({ batchId: props.batch.id, expectedVersion: props.batch.version, action, comment: workflowComment || undefined }));
  }

  const editable = props.capabilities.canSave && ["NOT_STARTED", "IN_PROGRESS", "RETURNED", "REOPENED"].includes(props.batch.status);

  return (
    <div className="space-y-6">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}
      {props.batch.returnReason ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><strong>Returned:</strong> {props.batch.returnReason}</p> : null}

      <section className="premium-card p-4 sm:p-5" aria-labelledby="marks-grid-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h2 id="marks-grid-title" className="text-lg font-semibold text-ink">{props.batch.subjectCode} - {props.batch.subjectName}</h2><p className="mt-1 text-sm text-slate-500">Save drafts repeatedly. Submission validates every frozen student and component before changing workflow state.</p></div><StatusBadge value={props.batch.status} /></div>
        <div className="mt-5 space-y-4">
          {props.roster.map((student) => (
            <article key={student.enrollmentId} className="rounded-lg border border-slate-200 bg-white p-4">
              <div><h3 className="font-semibold text-ink">{student.displayName}</h3><p className="mt-1 text-xs text-slate-500">Scholar {student.scholarNumber ?? "Not set"}{student.rollNumber ? ` / Roll ${student.rollNumber}` : ""}</p></div>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                {props.components.map((component) => {
                  const entryKey = key(student.enrollmentId, component.id);
                  const entry = entries[entryKey];
                  return (
                    <fieldset key={component.id} className="rounded-lg border border-slate-200 p-3" disabled={pending || !editable}>
                      <legend className="px-1 text-sm font-semibold text-slate-700">{component.code} - {component.name} (max {component.maximumMarks})</legend>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label className="text-xs font-semibold text-slate-600">Entry type<select aria-label={`${student.displayName} ${component.name} entry type`} value={entry.mode} onChange={(event) => updateEntry(entryKey, { mode: event.target.value as EntryValue["mode"], marks: event.target.value === "NUMERIC" ? entry.marks : "" })} className={`mt-1 ${fieldClass}`}><option value="NUMERIC">Numeric marks</option>{specialStatuses.map((status) => <option key={status} value={status}>{formatEnumLabel(status)}</option>)}</select></label>
                        {entry.mode === "NUMERIC" ? <label className="text-xs font-semibold text-slate-600">Marks<input aria-label={`${student.displayName} ${component.name} marks`} type="number" min="0" max={component.maximumMarks} step="0.01" value={entry.marks} onChange={(event) => updateEntry(entryKey, { marks: event.target.value })} className={`mt-1 ${fieldClass}`} /></label> : <label className="text-xs font-semibold text-slate-600">Status reason<input aria-label={`${student.displayName} ${component.name} status reason`} value={entry.reason} onChange={(event) => updateEntry(entryKey, { reason: event.target.value })} className={`mt-1 ${fieldClass}`} placeholder={entry.mode === "ABSENT" || entry.mode === "NOT_APPLICABLE" ? "Optional" : "Required"} /></label>}
                        <label className="text-xs font-semibold text-slate-600">Teacher remark<input aria-label={`${student.displayName} ${component.name} teacher remark`} value={entry.remark} maxLength={500} onChange={(event) => updateEntry(entryKey, { remark: event.target.value })} className={`mt-1 ${fieldClass}`} placeholder="Optional" /></label>
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </article>
          ))}
          {props.roster.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">The frozen marks roster contains no students.</p> : null}
        </div>
        {editable ? <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 mt-5 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"><button type="button" disabled={pending || props.roster.length === 0} onClick={saveDraft} className="premium-primary-button w-full sm:w-auto">{pending ? "Saving..." : "Save marks draft"}</button></div> : null}
      </section>

      <section className="premium-card p-5" aria-labelledby="marks-workflow-title">
        <h2 id="marks-workflow-title" className="text-lg font-semibold text-ink">Review and approval</h2>
        <p className="mt-1 text-sm text-slate-500">Actor separation is checked server-side. The submitter cannot verify, and submitter/verifier cannot approve the same batch.</p>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Comment or return reason<textarea value={workflowComment} onChange={(event) => setWorkflowComment(event.target.value)} maxLength={1000} disabled={pending} className={`mt-2 min-h-24 ${fieldClass}`} placeholder="Required when returning; optional for workflow approval" /></label>
        <div className="mt-4 flex flex-wrap gap-2">
          {props.capabilities.canSubmit && ["IN_PROGRESS", "RETURNED", "REOPENED"].includes(props.batch.status) ? <button type="button" disabled={pending} onClick={() => transition("SUBMIT")} className="premium-primary-button">Submit complete batch</button> : null}
          {props.capabilities.canVerify && props.batch.status === "SUBMITTED" ? <button type="button" disabled={pending} onClick={() => transition("VERIFY")} className="premium-primary-button">Verify batch</button> : null}
          {props.capabilities.canApprove && props.batch.status === "VERIFIED" ? <button type="button" disabled={pending} onClick={() => transition("APPROVE")} className="premium-primary-button">Approve batch</button> : null}
          {props.capabilities.canLock && props.batch.status === "APPROVED" ? <button type="button" disabled={pending} onClick={() => transition("LOCK")} className="premium-primary-button">Lock batch</button> : null}
          {props.capabilities.canReturn && ["SUBMITTED", "VERIFIED"].includes(props.batch.status) ? <button type="button" disabled={pending || workflowComment.trim().length < 10} onClick={() => run(() => returnMarksBatchAction({ batchId: props.batch.id, expectedVersion: props.batch.version, reason: workflowComment }))} className="premium-secondary-button">Return for correction</button> : null}
          {props.capabilities.canImport && editable ? <Link href={`/gradebook/imports?batchId=${props.batch.id}`} className="premium-secondary-button">Import spreadsheet</Link> : null}
        </div>
      </section>
    </div>
  );
}
