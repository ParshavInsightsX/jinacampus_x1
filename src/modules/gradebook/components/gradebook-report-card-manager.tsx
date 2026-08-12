"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { activateReportCardTemplateAction, approveReportCardAction, createReportCardTemplateAction, generateReportCardsAction } from "@/modules/gradebook/mvp-actions";

type Props = {
  selectedResultRunId: string | null;
  capabilities: { canManageTemplates: boolean; canGenerate: boolean; canApprove: boolean };
  templates: Array<{ id: string; code: string; name: string; status: string; versions: Array<{ id: string; versionNumber: number; status: string }> }>;
  runs: Array<{ id: string; examName: string; classSectionName: string; studentCount: number; reportCardCount: number }>;
  cards: Array<{ id: string; status: string; version: number; studentName: string; scholarNumber: string; examName: string; createdAt: string }>;
};

type Feedback = { tone: "success" | "error"; text: string } | null;
const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

function resultMessage(result: GradebookActionResult<unknown>): Feedback {
  return result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error };
}

export function GradebookReportCardManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const activeVersions = props.templates.flatMap((template) => template.versions.filter((version) => version.status === "ACTIVE").map((version) => ({ id: version.id, label: `${template.name} v${version.versionNumber}` })));
  const [resultRunId, setResultRunId] = useState(props.selectedResultRunId ?? props.runs[0]?.id ?? "");
  const [templateVersionId, setTemplateVersionId] = useState(activeVersions[0]?.id ?? "");

  function run(work: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(async () => {
      const result = await work();
      setFeedback(resultMessage(result));
      if (result.ok) router.refresh();
    });
  }

  function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => createReportCardTemplateAction({
      code: String(form.get("code") ?? "").trim().toUpperCase(),
      name: String(form.get("name") ?? ""),
      description: String(form.get("description") ?? "") || undefined,
      locale: "en-IN",
      configuration: {
        title: String(form.get("title") ?? "Academic Report Card"),
        showAttendance: form.get("showAttendance") === "on",
        showRemarks: form.get("showRemarks") === "on",
        showPromotionStatus: form.get("showPromotionStatus") === "on",
        signatureLabels: ["Class Teacher", "Principal"]
      }
    }));
  }

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() => generateReportCardsAction({
      resultRunId,
      templateVersionId,
      attendancePeriodStart: String(form.get("attendancePeriodStart") ?? "") || undefined,
      attendancePeriodEnd: String(form.get("attendancePeriodEnd") ?? "") || undefined
    }));
  }

  return (
    <div className="space-y-6">
      {feedback ? <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{feedback.text}</p> : null}
      {props.capabilities.canManageTemplates ? (
        <section className="premium-card space-y-4 p-5" aria-labelledby="report-template-title">
          <div><h2 id="report-template-title" className="text-lg font-semibold text-ink">Report-card templates</h2><p className="mt-1 text-sm text-slate-500">Templates are versioned. Activation supersedes the previous active version without changing generated cards.</p></div>
          <form onSubmit={createTemplate} className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold text-slate-700">Template code<input name="code" required maxLength={40} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="STANDARD_RC" /></label><label className="text-sm font-semibold text-slate-700">Template name<input name="name" required maxLength={120} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Standard report card" /></label><label className="text-sm font-semibold text-slate-700">Report title<input name="title" required maxLength={120} defaultValue="Academic Report Card" disabled={pending} className={`mt-2 ${fieldClass}`} /></label><label className="text-sm font-semibold text-slate-700">Description<input name="description" maxLength={500} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Optional" /></label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm"><input name="showAttendance" type="checkbox" defaultChecked />Show attendance</label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm"><input name="showRemarks" type="checkbox" defaultChecked />Show remarks</label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm"><input name="showPromotionStatus" type="checkbox" defaultChecked />Show promotion eligibility</label><div><button type="submit" disabled={pending} className="premium-primary-button w-full">{pending ? "Creating..." : "Create draft template"}</button></div></form>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.templates.map((template) => <article key={template.id} className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-500">{template.code}</p><h3 className="mt-1 font-semibold text-ink">{template.name}</h3></div><StatusBadge value={template.status} /></div><p className="mt-3 text-xs text-slate-500">{template.versions.length} version{template.versions.length === 1 ? "" : "s"}</p>{template.versions.find((version) => version.status === "DRAFT") ? <button type="button" disabled={pending} onClick={() => run(() => activateReportCardTemplateAction({ templateVersionId: template.versions.find((version) => version.status === "DRAFT")!.id }))} className="premium-secondary-button mt-3 w-full">Activate latest draft</button> : null}</article>)}</div>
        </section>
      ) : null}

      {props.capabilities.canGenerate ? (
        <section className="premium-card p-5" aria-labelledby="generate-cards-title">
          <h2 id="generate-cards-title" className="text-lg font-semibold text-ink">Generate immutable report cards</h2>
          <p className="mt-1 text-sm text-slate-500">Generation uses an approved result snapshot and stores PDFs privately. Attendance defaults to the examination term unless an explicit period is supplied.</p>
          <form onSubmit={generate} className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5"><label className="text-sm font-semibold text-slate-700">Approved result run<select value={resultRunId} onChange={(event) => setResultRunId(event.target.value)} disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select result run</option>{props.runs.map((run) => <option key={run.id} value={run.id}>{run.examName} / {run.classSectionName}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Active template<select value={templateVersionId} onChange={(event) => setTemplateVersionId(event.target.value)} disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select template</option>{activeVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><label className="text-sm font-semibold text-slate-700">Attendance from<input name="attendancePeriodStart" type="date" disabled={pending} className={`mt-2 ${fieldClass}`} /></label><label className="text-sm font-semibold text-slate-700">Attendance to<input name="attendancePeriodEnd" type="date" disabled={pending} className={`mt-2 ${fieldClass}`} /></label><button type="submit" disabled={pending || !resultRunId || !templateVersionId} className="premium-primary-button self-end">{pending ? "Generating..." : "Generate cards"}</button></form>
        </section>
      ) : null}

      <section className="space-y-4" aria-labelledby="report-cards-title"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 id="report-cards-title" className="text-lg font-semibold text-ink">Generated report cards</h2><p className="mt-1 text-sm text-slate-500">Generated PDFs require independent approval before publication.</p></div><Link href="/gradebook/publications" className="premium-secondary-button">Publication workspace</Link></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.cards.map((card) => <article key={card.id} className="premium-card p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold text-ink">{card.studentName}</h3><p className="mt-1 text-xs text-slate-500">Scholar {card.scholarNumber} / {card.examName} / v{card.version}</p></div><StatusBadge value={card.status} /></div><div className="mt-4 flex flex-wrap gap-2">{["GENERATED", "APPROVED", "PUBLISHED"].includes(card.status) ? <a href={`/api/gradebook/report-cards/${card.id}/download`} className="premium-secondary-button">Download PDF</a> : null}{props.capabilities.canApprove && card.status === "GENERATED" ? <button type="button" disabled={pending} onClick={() => run(() => approveReportCardAction({ reportCardId: card.id }))} className="premium-primary-button">Approve</button> : null}</div></article>)}</div>{props.cards.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No report cards have been generated in this scope.</p> : null}</section>
    </div>
  );
}
