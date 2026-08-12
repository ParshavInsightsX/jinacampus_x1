"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type FormEvent } from "react";

import { StatusBadge } from "@/components/ui/table-primitives";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import { createMvpExamAction } from "@/modules/gradebook/mvp-actions";

type Lookup = { id: string; label: string };
type SubjectLookup = Lookup & { code: string };

type Props = {
  canCreate: boolean;
  exams: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    termName: string;
    examTypeName: string;
    classSectionCount: number;
    subjectCount: number;
    assignmentCount: number;
    batchCount: number;
  }>;
  terms: Lookup[];
  examTypes: Array<Lookup & { maximumMarks: string | null; passingMarks: string | null }>;
  classSections: Lookup[];
  subjects: SubjectLookup[];
  schemeVersions: Lookup[];
  gradeScaleVersions: Lookup[];
  calculationRuleVersions: Lookup[];
};

type SubjectDefinition = {
  subjectId: string;
  maximumMarks: string;
  passingMarks: string;
  componentCode: string;
  componentName: string;
};

type Feedback = { tone: "success" | "error"; text: string } | null;

const fieldClass = "min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-ink outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:bg-slate-100";

function feedbackFor(result: GradebookActionResult<unknown>): Feedback {
  return result.ok ? { tone: "success", text: result.message } : { tone: "error", text: result.error };
}

export function GradebookExamManager(props: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedClassSections, setSelectedClassSections] = useState<string[]>([]);
  const [subjectDefinitions, setSubjectDefinitions] = useState<SubjectDefinition[]>([]);

  const subjectById = useMemo(() => new Map(props.subjects.map((subject) => [subject.id, subject])), [props.subjects]);

  function toggleClassSection(id: string) {
    setSelectedClassSections((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleSubject(id: string, checked: boolean) {
    setSubjectDefinitions((current) => {
      if (!checked) return current.filter((subject) => subject.subjectId !== id);
      if (current.some((subject) => subject.subjectId === id)) return current;
      return [...current, {
        subjectId: id,
        maximumMarks: "100",
        passingMarks: "33",
        componentCode: "TOTAL",
        componentName: "Total marks"
      }];
    });
  }

  function updateSubject(id: string, patch: Partial<SubjectDefinition>) {
    setSubjectDefinitions((current) => current.map((subject) => subject.subjectId === id ? { ...subject, ...patch } : subject));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setFeedback(null);
    startTransition(async () => {
      const result = await createMvpExamAction({
        termId: String(form.get("termId") ?? ""),
        examTypeId: String(form.get("examTypeId") ?? ""),
        schemeVersionId: String(form.get("schemeVersionId") ?? "") || undefined,
        gradeScaleVersionId: String(form.get("gradeScaleVersionId") ?? "") || undefined,
        calculationRuleSetVersionId: String(form.get("calculationRuleSetVersionId") ?? "") || undefined,
        code: String(form.get("code") ?? "").trim().toUpperCase(),
        name: String(form.get("name") ?? ""),
        description: String(form.get("description") ?? "") || undefined,
        instructions: String(form.get("instructions") ?? "") || undefined,
        marksEntryOpensAt: String(form.get("marksEntryOpensAt") ?? "") || undefined,
        marksEntryClosesAt: String(form.get("marksEntryClosesAt") ?? "") || undefined,
        resultPublicationPolicy: "MANUAL",
        classSectionIds: selectedClassSections,
        subjects: subjectDefinitions.map((subject, index) => ({
          subjectId: subject.subjectId,
          maximumMarks: Number(subject.maximumMarks),
          passingMarks: subject.passingMarks === "" ? undefined : Number(subject.passingMarks),
          displayOrder: index,
          components: [{
            componentCode: subject.componentCode.trim().toUpperCase(),
            componentName: subject.componentName,
            maximumMarks: Number(subject.maximumMarks),
            passingMarks: subject.passingMarks === "" ? undefined : Number(subject.passingMarks),
            displayOrder: 0,
            isOptional: false
          }]
        }))
      });
      setFeedback(feedbackFor(result));
      if (result.ok) {
        setSelectedClassSections([]);
        setSubjectDefinitions([]);
        formElement.reset();
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      {feedback ? (
        <p role={feedback.tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm font-semibold ${feedback.tone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {feedback.text}
        </p>
      ) : null}

      {props.canCreate ? (
        <form onSubmit={submit} className="premium-card space-y-5 p-5" aria-labelledby="create-gradebook-exam-title">
          <div>
            <h2 id="create-gradebook-exam-title" className="text-lg font-semibold text-ink">Create examination</h2>
            <p className="mt-1 text-sm text-slate-500">Create a draft from active configuration. Assign teachers and publish schedules before activation.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-sm font-semibold text-slate-700">Exam code<input name="code" required maxLength={40} placeholder="TERM_1_2026" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Exam name<input name="name" required maxLength={120} placeholder="Term 1 Examination" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Term<select name="termId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select term</option>{props.terms.map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Exam type<select name="examTypeId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select type</option>{props.examTypes.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Assessment scheme<select name="schemeVersionId" disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">No scheme</option>{props.schemeVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Grade scale<select name="gradeScaleVersionId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select active scale</option>{props.gradeScaleVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Calculation rules<select name="calculationRuleSetVersionId" required disabled={pending} className={`mt-2 ${fieldClass}`}><option value="">Select active rules</option>{props.calculationRuleVersions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="text-sm font-semibold text-slate-700">Marks entry opens<input name="marksEntryOpensAt" type="datetime-local" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700">Marks entry closes<input name="marksEntryClosesAt" type="datetime-local" disabled={pending} className={`mt-2 ${fieldClass}`} /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2">Description<input name="description" maxLength={1000} disabled={pending} className={`mt-2 ${fieldClass}`} placeholder="Optional internal description" /></label>
            <label className="text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">Instructions<textarea name="instructions" maxLength={3000} disabled={pending} className={`mt-2 min-h-24 ${fieldClass}`} placeholder="Instructions shown to authorised exam users" /></label>
          </div>

          <fieldset disabled={pending}>
            <legend className="text-sm font-semibold text-slate-700">Class-sections</legend>
            <p className="mt-1 text-xs text-slate-500">Every selected subject must already be mapped to every selected class-section in Academia.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {props.classSections.map((item) => <label key={item.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 text-sm"><input type="checkbox" checked={selectedClassSections.includes(item.id)} onChange={() => toggleClassSection(item.id)} />{item.label}</label>)}
            </div>
          </fieldset>

          <fieldset disabled={pending}>
            <legend className="text-sm font-semibold text-slate-700">Subjects and marks</legend>
            <p className="mt-1 text-xs text-slate-500">The pilot builder creates one total-marks component per subject. More components can be introduced through a new version later.</p>
            <div className="mt-3 space-y-3">
              {props.subjects.map((item) => {
                const selected = subjectDefinitions.find((subject) => subject.subjectId === item.id);
                return (
                  <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-ink"><input type="checkbox" checked={Boolean(selected)} onChange={(event) => toggleSubject(item.id, event.target.checked)} />{item.code} - {item.label}</label>
                    {selected ? <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><label className="text-xs font-semibold text-slate-600">Maximum marks<input aria-label={`${item.label} maximum marks`} type="number" min="0.01" step="0.01" value={selected.maximumMarks} onChange={(event) => updateSubject(item.id, { maximumMarks: event.target.value })} className={`mt-1 ${fieldClass}`} /></label><label className="text-xs font-semibold text-slate-600">Passing marks<input aria-label={`${item.label} passing marks`} type="number" min="0" step="0.01" value={selected.passingMarks} onChange={(event) => updateSubject(item.id, { passingMarks: event.target.value })} className={`mt-1 ${fieldClass}`} /></label><label className="text-xs font-semibold text-slate-600">Component code<input aria-label={`${item.label} component code`} value={selected.componentCode} onChange={(event) => updateSubject(item.id, { componentCode: event.target.value })} className={`mt-1 ${fieldClass}`} /></label><label className="text-xs font-semibold text-slate-600">Component name<input aria-label={`${item.label} component name`} value={selected.componentName} onChange={(event) => updateSubject(item.id, { componentName: event.target.value })} className={`mt-1 ${fieldClass}`} /></label></div> : null}
                  </article>
                );
              })}
            </div>
          </fieldset>

          <button type="submit" disabled={pending || selectedClassSections.length === 0 || subjectDefinitions.length === 0} className="premium-primary-button w-full sm:w-auto">
            {pending ? "Creating examination..." : "Create draft examination"}
          </button>
        </form>
      ) : null}

      <section className="space-y-4" aria-labelledby="gradebook-exams-title">
        <div><h2 id="gradebook-exams-title" className="text-lg font-semibold text-ink">Examinations</h2><p className="mt-1 text-sm text-slate-500">Only examinations in your active branch, academic year, and authorised assignment scope are shown.</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {props.exams.map((exam) => (
            <article key={exam.id} className="premium-card p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-slate-500">{exam.code}</p><h3 className="mt-1 font-semibold text-ink">{exam.name}</h3></div><StatusBadge value={exam.status} /></div>
              <p className="mt-3 text-sm text-slate-600">{exam.termName} / {exam.examTypeName}</p>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500"><div><dt>Classes</dt><dd className="font-semibold text-ink">{exam.classSectionCount}</dd></div><div><dt>Subjects</dt><dd className="font-semibold text-ink">{exam.subjectCount}</dd></div><div><dt>Assignments</dt><dd className="font-semibold text-ink">{exam.assignmentCount}</dd></div><div><dt>Marks batches</dt><dd className="font-semibold text-ink">{exam.batchCount}</dd></div></dl>
              <Link href={`/gradebook/exams/${exam.id}`} className="premium-secondary-button mt-4 w-full">Open examination</Link>
            </article>
          ))}
        </div>
        {props.exams.length === 0 ? <p className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">No examinations are available in this scope. Complete active configuration before creating one.</p> : null}
      </section>
    </div>
  );
}
