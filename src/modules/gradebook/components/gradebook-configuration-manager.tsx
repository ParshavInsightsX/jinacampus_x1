"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";

import type { GradebookActionResult } from "@/modules/gradebook/actions";
import {
  activateAssessmentSchemeAction,
  activateCalculationRuleSetAction,
  activateGradeScaleAction,
  createAssessmentSchemeAction,
  createCalculationRuleSetAction,
  createExamTermAction,
  createExamTypeAction,
  createGradeScaleAction,
  transitionExamTermAction,
  transitionExamTypeAction
} from "@/modules/gradebook/mvp-actions";

type Feedback = { kind: "success" | "error"; message: string } | null;

type Props = {
  capabilities: {
    canManageSchemes: boolean;
    canActivateSchemes: boolean;
    canManageTerms: boolean;
    canTransitionTerms: boolean;
    canManageExamTypes: boolean;
    canManageGradeScales: boolean;
    canActivateGradeScales: boolean;
    canManageCalculationRules: boolean;
    canActivateCalculationRules: boolean;
  };
  schemes: Array<{ id: string; code: string; name: string; description: string | null; status: string; versions: Array<{ id: string; versionNumber: number; status: string }> }>;
  terms: Array<{ id: string; code: string; name: string; displayName: string | null; sequence: number; startDate: string; endDate: string; isReportCardTerm: boolean; status: string; version: number; examCount: number }>;
  examTypes: Array<{ id: string; code: string; name: string; category: string; maximumMarks: string | null; passingMarks: string | null; status: string; version: number }>;
  gradeScales: Array<{ id: string; code: string; name: string; status: string; versions: Array<{ id: string; versionNumber: number; status: string; ruleCount: number }> }>;
  calculationRuleSets: Array<{ id: string; code: string; name: string; status: string; versions: Array<{ id: string; versionNumber: number; strategy: string; status: string }> }>;
};

const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}

function FeedbackMessage({ value }: { value: Feedback }) {
  if (!value) return null;
  return (
    <p role={value.kind === "error" ? "alert" : "status"} className={value.kind === "error" ? "rounded-lg bg-rose-50 p-3 text-sm text-rose-800" : "rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"}>
      {value.message}
    </p>
  );
}

function asFeedback(result: GradebookActionResult<unknown>): Feedback {
  return result.ok ? { kind: "success", message: result.message } : { kind: "error", message: result.error };
}

function useGradebookMutation() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();
  function run(action: () => Promise<GradebookActionResult<unknown>>) {
    setFeedback(null);
    startTransition(() => {
      void action().then((result) => setFeedback(asFeedback(result)));
    });
  }
  return { feedback, pending, run };
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return <button type="submit" disabled={pending} className="premium-primary-button min-h-11 w-full sm:w-auto">{pending ? "Saving..." : children}</button>;
}

const defaultGradeRules = [
  { minimumInclusive: 80, maximumInclusive: 100, letterGrade: "A", gradePoint: 4, isPassing: true },
  { minimumInclusive: 60, maximumInclusive: 79.99, letterGrade: "B", gradePoint: 3, isPassing: true },
  { minimumInclusive: 45, maximumInclusive: 59.99, letterGrade: "C", gradePoint: 2, isPassing: true },
  { minimumInclusive: 33, maximumInclusive: 44.99, letterGrade: "D", gradePoint: 1, isPassing: true },
  { minimumInclusive: 0, maximumInclusive: 32.99, letterGrade: "E", gradePoint: 0, isPassing: false }
];

export function GradebookConfigurationManager(props: Props) {
  const mutation = useGradebookMutation();
  const [gradeRules, setGradeRules] = useState(defaultGradeRules);
  const activeSchemeVersions = props.schemes.flatMap((scheme) => scheme.versions.filter((version) => version.status === "ACTIVE").map((version) => ({ id: version.id, label: `${scheme.name} v${version.versionNumber}` })));

  function submitScheme(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() => createAssessmentSchemeAction({ code: data.get("code"), name: data.get("name"), description: data.get("description") || undefined, configuration: {} }));
  }

  function submitTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() => createExamTermAction({
      schemeVersionId: data.get("schemeVersionId") || undefined,
      code: data.get("code"),
      name: data.get("name"),
      displayName: data.get("displayName") || undefined,
      sequence: data.get("sequence"),
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      resultPublicationStartAt: undefined,
      isReportCardTerm: data.get("isReportCardTerm") === "on",
      allowDateOverlap: false
    }));
  }

  function submitExamType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() => createExamTypeAction({
      code: data.get("code"),
      name: data.get("name"),
      category: data.get("category"),
      defaultMaximumMarks: data.get("maximumMarks") || undefined,
      defaultPassingMarks: data.get("passingMarks") || undefined,
      defaultWeightagePercent: undefined,
      allowsSpecialStatuses: true,
      requiresSchedule: data.get("requiresSchedule") === "on",
      requiresRoom: false
    }));
  }

  function submitGradeScale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() => createGradeScaleAction({
      code: data.get("code"),
      name: data.get("name"),
      description: data.get("description") || undefined,
      scoreBasis: "PERCENTAGE",
      roundingMode: "HALF_UP",
      decimalPlaces: 2,
      rules: gradeRules.map((rule, index) => ({ ...rule, remarkTemplate: undefined, displayOrder: index }))
    }));
  }

  function submitCalculationRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() => createCalculationRuleSetAction({
      code: data.get("code"),
      name: data.get("name"),
      description: data.get("description") || undefined,
      strategy: data.get("strategy"),
      rules: {
        requireAllSubjectsPassing: data.get("requireAllSubjectsPassing") === "on",
        minimumOverallPercentage: data.get("minimumOverallPercentage") || undefined,
        allowPendingResults: data.get("allowPendingResults") === "on",
        specialStatusTreatment: {
          ABSENT: "FAIL",
          MEDICAL_LEAVE: "PENDING",
          EXEMPTED: "EXCLUDE",
          NOT_APPLICABLE: "NO_DENOMINATOR",
          WITHHELD: "PENDING",
          RESULT_PENDING: "PENDING"
        }
      }
    }));
  }

  return (
    <div className="space-y-8">
      <FeedbackMessage value={mutation.feedback} />

      <section className="space-y-4" id="schemes">
        <div><h2 className="text-lg font-semibold text-ink">Assessment schemes</h2><p className="mt-1 text-sm text-slate-500">Versioned institution rules that exams reference without mutating history.</p></div>
        {props.capabilities.canManageSchemes ? (
          <form onSubmit={submitScheme} className="premium-card grid gap-4 p-5 md:grid-cols-3">
            <Field label="Scheme code"><input name="code" required maxLength={40} className={fieldClass} placeholder="STANDARD" /></Field>
            <Field label="Scheme name"><input name="name" required maxLength={120} className={fieldClass} placeholder="Standard assessment scheme" /></Field>
            <Field label="Description"><input name="description" maxLength={1000} className={fieldClass} placeholder="Optional governance note" /></Field>
            <div className="md:col-span-3"><SubmitButton pending={mutation.pending}>Create scheme</SubmitButton></div>
          </form>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.schemes.map((scheme) => (
            <article key={scheme.id} className="premium-card p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{scheme.code}</p><h3 className="mt-1 font-semibold text-ink">{scheme.name}</h3></div><span className="text-xs font-semibold text-slate-600">{scheme.status}</span></div>
              <p className="mt-2 text-xs text-slate-500">{scheme.versions.length} version{scheme.versions.length === 1 ? "" : "s"}</p>
              {props.capabilities.canActivateSchemes && scheme.status === "DRAFT" ? <button type="button" disabled={mutation.pending} onClick={() => mutation.run(() => activateAssessmentSchemeAction({ id: scheme.id }))} className="premium-secondary-button mt-4 w-full">Activate</button> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="terms">
        <div><h2 className="text-lg font-semibold text-ink">Examination terms</h2><p className="mt-1 text-sm text-slate-500">Branch and academic-year scoped periods used for exams and report cards.</p></div>
        {props.capabilities.canManageTerms ? (
          <form onSubmit={submitTerm} className="premium-card grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Term code"><input name="code" required className={fieldClass} placeholder="TERM_1" /></Field>
            <Field label="Term name"><input name="name" required className={fieldClass} placeholder="Term 1" /></Field>
            <Field label="Report-card display name"><input name="displayName" className={fieldClass} placeholder="First Term" /></Field>
            <Field label="Sequence"><input name="sequence" type="number" min={1} max={100} defaultValue={props.terms.length + 1} required className={fieldClass} /></Field>
            <Field label="Start date"><input name="startDate" type="date" required className={fieldClass} /></Field>
            <Field label="End date"><input name="endDate" type="date" required className={fieldClass} /></Field>
            <Field label="Assessment scheme"><select name="schemeVersionId" className={fieldClass}><option value="">No scheme yet</option>{activeSchemeVersions.map((version) => <option key={version.id} value={version.id}>{version.label}</option>)}</select></Field>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700"><input name="isReportCardTerm" type="checkbox" defaultChecked />Report-card term</label>
            <div className="xl:col-span-4"><SubmitButton pending={mutation.pending}>Create term</SubmitButton></div>
          </form>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.terms.map((term) => (
            <article key={term.id} className="premium-card p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{term.code} / Sequence {term.sequence}</p><h3 className="mt-1 font-semibold text-ink">{term.displayName || term.name}</h3></div><span className="text-xs font-semibold text-slate-600">{term.status}</span></div>
              <p className="mt-3 text-xs text-slate-500">{term.startDate} to {term.endDate} / {term.examCount} exams</p>
              {props.capabilities.canTransitionTerms ? <div className="mt-4 flex flex-wrap gap-2">{term.status === "DRAFT" ? <button type="button" className="premium-secondary-button" disabled={mutation.pending} onClick={() => mutation.run(() => transitionExamTermAction({ termId: term.id, action: "ACTIVATE", expectedVersion: term.version }))}>Activate</button> : null}{term.status === "ACTIVE" ? <button type="button" className="premium-secondary-button" disabled={mutation.pending} onClick={() => mutation.run(() => transitionExamTermAction({ termId: term.id, action: "CLOSE", expectedVersion: term.version }))}>Close</button> : null}{term.status === "CLOSED" ? <button type="button" className="premium-secondary-button" disabled={mutation.pending} onClick={() => mutation.run(() => transitionExamTermAction({ termId: term.id, action: "ARCHIVE", expectedVersion: term.version }))}>Archive</button> : null}</div> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-4" id="exam-types">
        <div><h2 className="text-lg font-semibold text-ink">Exam types</h2><p className="mt-1 text-sm text-slate-500">Reusable exam categories with safe marks defaults.</p></div>
        {props.capabilities.canManageExamTypes ? (
          <form onSubmit={submitExamType} className="premium-card grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Type code"><input name="code" required className={fieldClass} placeholder="WRITTEN" /></Field>
            <Field label="Type name"><input name="name" required className={fieldClass} placeholder="Written examination" /></Field>
            <Field label="Category"><select name="category" className={fieldClass}>{["WRITTEN", "PRACTICAL", "ORAL", "PROJECT", "INTERNAL", "FORMATIVE", "SUMMATIVE", "OTHER"].map((value) => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Default maximum"><input name="maximumMarks" type="number" min="0.01" step="0.01" className={fieldClass} placeholder="100" /></Field>
            <Field label="Default passing"><input name="passingMarks" type="number" min="0" step="0.01" className={fieldClass} placeholder="33" /></Field>
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700"><input name="requiresSchedule" type="checkbox" defaultChecked />Schedule required</label>
            <div className="md:col-span-2 xl:col-span-4"><SubmitButton pending={mutation.pending}>Create exam type</SubmitButton></div>
          </form>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{props.examTypes.map((type) => <article key={type.id} className="premium-card p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-500">{type.code}</p><h3 className="mt-1 font-semibold text-ink">{type.name}</h3></div><span className="text-xs font-semibold text-slate-600">{type.status}</span></div><p className="mt-3 text-xs text-slate-500">{type.category} / {type.maximumMarks ?? "Custom"} max / {type.passingMarks ?? "Custom"} pass</p>{props.capabilities.canManageExamTypes && type.status === "DRAFT" ? <button type="button" className="premium-secondary-button mt-4 w-full" disabled={mutation.pending} onClick={() => mutation.run(() => transitionExamTypeAction({ examTypeId: type.id, action: "ACTIVATE", expectedVersion: type.version }))}>Activate</button> : null}</article>)}</div>
      </section>

      <section className="space-y-4" id="grade-scales">
        <div><h2 className="text-lg font-semibold text-ink">Grade scales</h2><p className="mt-1 text-sm text-slate-500">Versioned percentage bands. Adjust every band before creating the draft.</p></div>
        {props.capabilities.canManageGradeScales ? (
          <form onSubmit={submitGradeScale} className="premium-card space-y-4 p-5">
            <div className="grid gap-4 md:grid-cols-3"><Field label="Scale code"><input name="code" required className={fieldClass} placeholder="PERCENT_5" /></Field><Field label="Scale name"><input name="name" required className={fieldClass} placeholder="Five-band percentage scale" /></Field><Field label="Description"><input name="description" className={fieldClass} placeholder="Approved academic policy reference" /></Field></div>
            <div className="overflow-x-auto"><table className="min-w-[680px] w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs text-slate-500"><th className="p-2">Grade</th><th className="p-2">Minimum</th><th className="p-2">Maximum</th><th className="p-2">Point</th><th className="p-2">Passing</th></tr></thead><tbody>{gradeRules.map((rule, index) => <tr key={index} className="border-b border-slate-100"><td className="p-2"><input aria-label={`Grade ${index + 1} label`} value={rule.letterGrade} onChange={(event) => setGradeRules((current) => current.map((item, row) => row === index ? { ...item, letterGrade: event.target.value.toUpperCase() } : item))} className={fieldClass} /></td><td className="p-2"><input aria-label={`Grade ${index + 1} minimum`} type="number" step="0.01" value={rule.minimumInclusive} onChange={(event) => setGradeRules((current) => current.map((item, row) => row === index ? { ...item, minimumInclusive: Number(event.target.value) } : item))} className={fieldClass} /></td><td className="p-2"><input aria-label={`Grade ${index + 1} maximum`} type="number" step="0.01" value={rule.maximumInclusive} onChange={(event) => setGradeRules((current) => current.map((item, row) => row === index ? { ...item, maximumInclusive: Number(event.target.value) } : item))} className={fieldClass} /></td><td className="p-2"><input aria-label={`Grade ${index + 1} point`} type="number" step="0.01" value={rule.gradePoint} onChange={(event) => setGradeRules((current) => current.map((item, row) => row === index ? { ...item, gradePoint: Number(event.target.value) } : item))} className={fieldClass} /></td><td className="p-2"><input aria-label={`Grade ${index + 1} passing`} type="checkbox" checked={rule.isPassing} onChange={(event) => setGradeRules((current) => current.map((item, row) => row === index ? { ...item, isPassing: event.target.checked } : item))} /></td></tr>)}</tbody></table></div>
            <SubmitButton pending={mutation.pending}>Create grade scale</SubmitButton>
          </form>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.gradeScales.map((scale) => <article key={scale.id} className="premium-card p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-500">{scale.code}</p><h3 className="mt-1 font-semibold text-ink">{scale.name}</h3></div><span className="text-xs font-semibold text-slate-600">{scale.status}</span></div><p className="mt-3 text-xs text-slate-500">Latest version has {scale.versions[0]?.ruleCount ?? 0} grade bands.</p>{props.capabilities.canActivateGradeScales && scale.status === "DRAFT" ? <button type="button" className="premium-secondary-button mt-4 w-full" disabled={mutation.pending} onClick={() => mutation.run(() => activateGradeScaleAction({ id: scale.id }))}>Activate</button> : null}</article>)}</div>
      </section>

      <section className="space-y-4" id="calculation-rules">
        <div><h2 className="text-lg font-semibold text-ink">Calculation rules</h2><p className="mt-1 text-sm text-slate-500">Deterministic result strategy and special-status policy.</p></div>
        {props.capabilities.canManageCalculationRules ? (
          <form onSubmit={submitCalculationRules} className="premium-card grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4"><Field label="Rule-set code"><input name="code" required className={fieldClass} placeholder="STANDARD_SUM" /></Field><Field label="Rule-set name"><input name="name" required className={fieldClass} placeholder="Standard total calculation" /></Field><Field label="Strategy"><select name="strategy" className={fieldClass}><option value="SUM_COMPONENTS_RAW">Sum component marks</option><option value="WEIGHTED_COMPONENTS">Weighted components</option><option value="SCALE_TO_MAXIMUM">Scale to maximum</option></select></Field><Field label="Minimum overall percentage"><input name="minimumOverallPercentage" type="number" min="0" max="100" step="0.01" className={fieldClass} placeholder="33" /></Field><Field label="Description"><input name="description" className={fieldClass} placeholder="Policy reference" /></Field><label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700"><input name="requireAllSubjectsPassing" type="checkbox" defaultChecked />All subjects must pass</label><label className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700"><input name="allowPendingResults" type="checkbox" />Allow pending results</label><div className="flex items-end"><SubmitButton pending={mutation.pending}>Create rule set</SubmitButton></div></form>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{props.calculationRuleSets.map((ruleSet) => <article key={ruleSet.id} className="premium-card p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-semibold text-slate-500">{ruleSet.code}</p><h3 className="mt-1 font-semibold text-ink">{ruleSet.name}</h3></div><span className="text-xs font-semibold text-slate-600">{ruleSet.status}</span></div><p className="mt-3 text-xs text-slate-500">{ruleSet.versions[0]?.strategy ?? "Draft"}</p>{props.capabilities.canActivateCalculationRules && ruleSet.status === "DRAFT" ? <button type="button" className="premium-secondary-button mt-4 w-full" disabled={mutation.pending} onClick={() => mutation.run(() => activateCalculationRuleSetAction({ id: ruleSet.id }))}>Activate</button> : null}</article>)}</div>
      </section>
    </div>
  );
}
