"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { approveResultRunAction, calculateResultRunAction } from "@/modules/gradebook/mvp-actions";

type Props = {
  capabilities: { canCalculate: boolean; canApprove: boolean; canGenerateReportCards: boolean };
  exams: Array<{ id: string; name: string; status: string; classSections: Array<{ id: string; name: string }> }>;
  runs: Array<{ id: string; status: string; examName: string; classSectionName: string; createdAt: string; subjectCount: number; studentCount: number; reportCardCount: number }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

export function GradebookResultsManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [examId, setExamId] = useState(props.exams[0]?.id ?? "");
  const exam = props.exams.find((item) => item.id === examId);
  const [classSectionId, setClassSectionId] = useState(exam?.classSections[0]?.id ?? "");

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}
      {props.capabilities.canCalculate ? (
        <section className="premium-card p-5" aria-labelledby="calculate-results-title">
          <h2 id="calculate-results-title" className="text-lg font-semibold text-ink">Calculate result snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">Calculation is deterministic and requires every primary marks batch to be approved or locked. Repeating unchanged inputs returns the same run.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <label className="text-sm font-semibold text-slate-700">Examination<select value={examId} disabled={pending} onChange={(event) => { const selectedId = event.target.value; setExamId(selectedId); setClassSectionId(props.exams.find((item) => item.id === selectedId)?.classSections[0]?.id ?? ""); }} className={`mt-2 ${fieldClass}`}><option value="">Select exam</option>{props.exams.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Class-section<select value={classSectionId} disabled={pending} onChange={(event) => setClassSectionId(event.target.value)} className={`mt-2 ${fieldClass}`}><option value="">Select class-section</option>{exam?.classSections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <button type="button" disabled={pending || !examId || !classSectionId} onClick={() => run(() => calculateResultRunAction({ examId, examClassSectionId: classSectionId }))} className="premium-primary-button">{pending ? "Calculating..." : "Calculate results"}</button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4" aria-labelledby="result-runs-title">
        <div><h2 id="result-runs-title" className="text-lg font-semibold text-ink">Result runs</h2><p className="mt-1 text-sm text-slate-500">Every run retains its input and configuration hashes. Approval cannot be performed by the calculation actor.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.runs.map((run) => <article key={run.id} className="premium-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{run.examName}</p><h3 className="mt-1 font-semibold text-ink">{run.classSectionName}</h3></div><StatusBadge value={run.status} /></div><dl className="mt-4 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-slate-500">Students</dt><dd className="font-semibold text-ink">{run.studentCount}</dd></div><div><dt className="text-slate-500">Subjects</dt><dd className="font-semibold text-ink">{run.subjectCount}</dd></div><div><dt className="text-slate-500">Cards</dt><dd className="font-semibold text-ink">{run.reportCardCount}</dd></div></dl><p className="mt-3 text-xs text-slate-500">Created {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(run.createdAt))}</p><div className="mt-4 flex flex-wrap gap-2"><Link href={`/gradebook/results/${run.id}`} className="premium-secondary-button">Review results</Link>{props.capabilities.canApprove && ["COMPLETED", "UNDER_REVIEW"].includes(run.status) ? <button type="button" disabled={pending} onClick={() => runAction(run.id)} className="premium-primary-button">Approve</button> : null}{props.capabilities.canGenerateReportCards && run.status === "APPROVED" ? <Link href={`/gradebook/report-cards?resultRunId=${run.id}`} className="premium-secondary-button">Report cards</Link> : null}</div></article>)}
        </div>
        {props.runs.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No result runs exist in this authorised scope.</p> : null}
      </section>
    </div>
  );

  function runAction(resultRunId: string) {
    run(() => approveResultRunAction({ resultRunId }));
  }
}
