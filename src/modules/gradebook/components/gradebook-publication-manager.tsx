"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { prepareResultPublicationAction, publishResultsAction, revokeResultPublicationAction } from "@/modules/gradebook/mvp-actions";

type Props = {
  capabilities: { canPrepare: boolean; canPublish: boolean; canRevoke: boolean };
  runs: Array<{ id: string; examName: string; classSectionName: string; studentCount: number; reportCardCount: number }>;
  publications: Array<{ id: string; status: string; audience: string; examName: string; version: number; publishAt: string; publishedAt: string | null; recipientCount: number }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

export function GradebookPublicationManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [revokeReasons, setRevokeReasons] = useState<Record<string, string>>({});

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error });
      if (result.ok) router.refresh();
    });
  }

  function prepare(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => prepareResultPublicationAction({ resultRunId: String(form.get("resultRunId") ?? ""), audience: String(form.get("audience") ?? "STUDENT_AND_GUARDIAN"), publishAt: String(form.get("publishAt") ?? ""), reason: String(form.get("reason") ?? "") || undefined }));
  }

  return <div className="space-y-6">{feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}{props.capabilities.canPrepare ? <section className="premium-card p-5" aria-labelledby="prepare-publication-title"><h2 id="prepare-publication-title" className="text-lg font-semibold text-ink">Prepare publication</h2><p className="mt-1 text-sm text-slate-500">Every eligible student must have an approved report card. Preparation and publication require different actors.</p><form onSubmit={prepare} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold text-slate-700">Approved result run<select name="resultRunId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select result run</option>{props.runs.map((run) => <option key={run.id} value={run.id}>{run.examName} / {run.classSectionName} ({run.reportCardCount}/{run.studentCount} cards)</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Audience<select name="audience" defaultValue="STUDENT_AND_GUARDIAN" disabled={pending} className={`mt-2 ${fieldClass}`}><option value="STUDENT">Student</option><option value="GUARDIAN">Guardian</option><option value="STUDENT_AND_GUARDIAN">Student and guardian</option></select></label><label className="text-sm font-semibold text-slate-700">Publish at<input name="publishAt" type="datetime-local" required disabled={pending} className={`mt-2 ${fieldClass}`} /></label><label className="text-sm font-semibold text-slate-700">Reason<input name="reason" maxLength={500} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Optional publication note" /></label><div className="xl:col-span-4"><button type="submit" disabled={pending} className="premium-primary-button">{pending ? "Preparing..." : "Prepare publication"}</button></div></form></section> : null}<section className="space-y-4" aria-labelledby="publication-list-title"><div><h2 id="publication-list-title" className="text-lg font-semibold text-ink">Publication versions</h2><p className="mt-1 text-sm text-slate-500">Scheduled, published, and revoked versions remain auditable.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.publications.map((publication) => <article key={publication.id} className="premium-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{publication.examName} / v{publication.version}</p><h3 className="mt-1 font-semibold text-ink">{publication.audience.replaceAll("_", " ")}</h3></div><StatusBadge value={publication.status} /></div><p className="mt-3 text-xs text-slate-500">Scheduled {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(publication.publishAt))} / {publication.recipientCount} recipient rows</p><div className="mt-4 space-y-2">{props.capabilities.canPublish && ["DRAFT", "SCHEDULED"].includes(publication.status) ? <button type="button" disabled={pending || new Date(publication.publishAt) > new Date()} onClick={() => run(() => publishResultsAction({ publicationId: publication.id }))} className="premium-primary-button w-full">Publish due results</button> : null}{props.capabilities.canRevoke && publication.status === "PUBLISHED" ? <><input aria-label={`Revocation reason for ${publication.examName}`} value={revokeReasons[publication.id] ?? ""} onChange={(event) => setRevokeReasons((current) => ({ ...current, [publication.id]: event.target.value }))} disabled={pending} minLength={10} maxLength={500} className={fieldClass} placeholder="Revocation reason" /><button type="button" disabled={pending || (revokeReasons[publication.id]?.trim().length ?? 0) < 10} onClick={() => run(() => revokeResultPublicationAction({ publicationId: publication.id, reason: revokeReasons[publication.id] }))} className="premium-secondary-button w-full">Revoke publication</button></> : null}</div></article>)}</div>{props.publications.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No publication versions exist in this scope.</p> : null}</section></div>;
}
