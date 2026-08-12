"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type FormEvent } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";

type Props = {
  selectedBatchId: string | null;
  capabilities: { canCreate: boolean; canApply: boolean; canCancel: boolean };
  batches: Array<{ id: string; version: number; status: string; examName: string; classSectionName: string; subjectName: string }>;
  jobs: Array<{ id: string; batchId: string; fileName: string; status: string; total: number; valid: number; invalid: number; warnings: number; createdAt: string }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function safeError(payload: Record<string, unknown>, fallback: string) {
  return typeof payload.error === "string" ? payload.error : fallback;
}

export function GradebookImportManager(props: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [batchId, setBatchId] = useState(props.selectedBatchId ?? props.batches[0]?.id ?? "");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  const selectedBatch = props.batches.find((batch) => batch.id === batchId);

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("batchId", batchId);
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/gradebook/imports", { method: "POST", body: form });
        const payload = await safeJson(response);
        if (!response.ok) {
          setFeedback({ tone: "error", text: safeError(payload, "Unable to validate this marks file.") });
          return;
        }
        setFeedback({ tone: "success", text: "The file was uploaded to private storage and validated. Review row counts before applying it." });
        formRef.current?.reset();
        router.refresh();
      } catch {
        setFeedback({ tone: "error", text: "The import request could not be completed. Check the connection and try again." });
      }
    });
  }

  function post(path: string, body?: Record<string, unknown>) {
    setFeedback(null);
    startTransition(async () => {
      try {
        const response = await fetch(path, { method: "POST", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
        const payload = await safeJson(response);
        if (!response.ok) {
          setFeedback({ tone: "error", text: safeError(payload, "Unable to update this import job.") });
          return;
        }
        setFeedback({ tone: "success", text: path.endsWith("/apply") ? "Validated rows were applied to a new marks-batch version." : "Import job cancelled." });
        router.refresh();
      } catch {
        setFeedback({ tone: "error", text: "The import request could not be completed. Check the connection and try again." });
      }
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}
      <section className="premium-card p-5" aria-labelledby="marks-import-title">
        <h2 id="marks-import-title" className="text-lg font-semibold text-ink">Validated spreadsheet import</h2>
        <p className="mt-1 text-sm text-slate-500">Download a batch-specific template, complete marks without changing identifiers, then validate before applying. Files remain private.</p>
        <label className="mt-4 block text-sm font-semibold text-slate-700">Marks batch<select value={batchId} onChange={(event) => setBatchId(event.target.value)} disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select a batch</option>{props.batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.examName} / {batch.classSectionName} / {batch.subjectName}</option>)}</select></label>
        <div className="mt-4 flex flex-wrap gap-2">
          <a aria-disabled={!batchId} href={batchId ? `/api/gradebook/imports/template?batchId=${encodeURIComponent(batchId)}&format=xlsx` : undefined} className={`premium-secondary-button ${!batchId ? "pointer-events-none opacity-50" : ""}`}>Download Excel template</a>
          <a aria-disabled={!batchId} href={batchId ? `/api/gradebook/imports/template?batchId=${encodeURIComponent(batchId)}&format=csv` : undefined} className={`premium-secondary-button ${!batchId ? "pointer-events-none opacity-50" : ""}`}>Download CSV template</a>
        </div>
        {props.capabilities.canCreate ? <form ref={formRef} onSubmit={upload} className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="text-sm font-semibold text-slate-700">Marks file<input name="file" type="file" required accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" disabled={pending || !batchId} className={`mt-2 ${fieldClass}`} /></label><button type="submit" disabled={pending || !batchId} className="premium-primary-button self-end">{pending ? "Validating..." : "Upload and validate"}</button></form> : null}
      </section>

      <section className="space-y-4" aria-labelledby="import-jobs-title">
        <div><h2 id="import-jobs-title" className="text-lg font-semibold text-ink">Import jobs</h2><p className="mt-1 text-sm text-slate-500">Valid rows can be applied independently; invalid rows remain visible for correction and re-upload.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.jobs.map((job) => {
            const batch = props.batches.find((item) => item.id === job.batchId);
            return <article key={job.id} className="premium-card p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-ink">{job.fileName}</h3><p className="mt-1 text-xs text-slate-500">{batch ? `${batch.examName} / ${batch.classSectionName} / ${batch.subjectName}` : "Scoped marks batch"}</p></div><StatusBadge value={job.status} /></div><dl className="mt-4 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-500">Total rows</dt><dd className="font-semibold text-ink">{job.total}</dd></div><div><dt className="text-slate-500">Valid</dt><dd className="font-semibold text-emerald-700">{job.valid}</dd></div><div><dt className="text-slate-500">Invalid</dt><dd className="font-semibold text-rose-700">{job.invalid}</dd></div><div><dt className="text-slate-500">Warnings</dt><dd className="font-semibold text-amber-700">{job.warnings}</dd></div></dl><p className="mt-3 text-xs text-slate-500">Created {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(job.createdAt))}</p><div className="mt-4 flex flex-wrap gap-2">{props.capabilities.canApply && job.status === "VALIDATED" && batch ? <button type="button" disabled={pending} onClick={() => post(`/api/gradebook/imports/${job.id}/apply`, { expectedBatchVersion: batch.version })} className="premium-primary-button">Apply valid rows</button> : null}{props.capabilities.canCancel && ["UPLOADED", "VALIDATING", "VALIDATED"].includes(job.status) ? <button type="button" disabled={pending} onClick={() => post(`/api/gradebook/imports/${job.id}/cancel`)} className="premium-secondary-button">Cancel</button> : null}</div></article>;
          })}
        </div>
        {props.jobs.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No marks import jobs have been created in this scope.</p> : null}
      </section>
    </div>
  );
}
