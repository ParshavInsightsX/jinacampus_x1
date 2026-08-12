"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { returnMarksBatchAction, transitionMarksBatchAction } from "@/modules/gradebook/mvp-actions";

type Props = {
  mode: "SUBMISSIONS" | "VERIFICATION" | "APPROVALS";
  batches: Array<{ id: string; version: number; status: string; examName: string; classSectionName: string; subjectName: string; teacherName: string; updatedAt: string }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

export function GradebookWorkflowQueue({ mode, batches }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {batches.map((batch) => (
          <article key={batch.id} className="premium-card p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{batch.examName}</p><h2 className="mt-1 font-semibold text-ink">{batch.classSectionName} / {batch.subjectName}</h2></div><StatusBadge value={batch.status} /></div>
            <p className="mt-3 text-xs text-slate-500">Teacher: {batch.teacherName}</p>
            <p className="mt-1 text-xs text-slate-500">Updated {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(batch.updatedAt))}</p>
            <Link href={`/gradebook/marks/${batch.id}`} className="premium-secondary-button mt-4 w-full">Review batch</Link>
            {mode !== "SUBMISSIONS" ? (
              <div className="mt-3 space-y-2">
                <textarea aria-label={`Return reason for ${batch.subjectName}`} value={reasons[batch.id] ?? ""} onChange={(event) => setReasons((current) => ({ ...current, [batch.id]: event.target.value }))} disabled={pending} maxLength={1000} className={`min-h-20 ${fieldClass}`} placeholder="Return reason (minimum 10 characters)" />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={pending} onClick={() => run(() => transitionMarksBatchAction({ batchId: batch.id, expectedVersion: batch.version, action: mode === "VERIFICATION" ? "VERIFY" : "APPROVE" }))} className="premium-primary-button">{mode === "VERIFICATION" ? "Verify" : "Approve"}</button>
                  <button type="button" disabled={pending || (reasons[batch.id]?.trim().length ?? 0) < 10} onClick={() => run(() => returnMarksBatchAction({ batchId: batch.id, expectedVersion: batch.version, reason: reasons[batch.id] }))} className="premium-secondary-button">Return</button>
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
      {batches.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No marks batches currently require action in this queue.</p> : null}
    </div>
  );
}
