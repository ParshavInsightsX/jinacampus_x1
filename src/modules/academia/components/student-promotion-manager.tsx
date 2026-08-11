"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ErrorState, PrerequisiteState } from "@/components/ui/empty-state";
import { FormField, FormMessage } from "@/components/ui/form-primitives";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import {
  createStudentPromotionBatchAction,
  reverseStudentPromotionBatchAction
} from "@/modules/academia/actions/student-promotion.actions";
import type { StudentPromotionOutcomeInput } from "@/modules/academia/schemas";

export type PromotionAcademicYearOption = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: string;
  isActive: boolean;
};

export type PromotionClassSectionOption = {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  displayName: string;
  className: string;
  sectionName: string;
  capacity: number | null;
};

export type PromotionRosterRow = {
  id: string;
  studentId: string;
  rollNumber: string | null;
  admissionNumber: string;
  studentName: string;
  processedOutcome: string | null;
};

export type PromotionBatchSummary = {
  id: string;
  status: string;
  effectiveDate: string;
  selectedCount: number;
  excludedCount: number;
  outcomeSummary: Record<string, number>;
  createdAt: string;
  reversedAt: string | null;
  sourceAcademicYearName: string;
  targetAcademicYearName: string;
  sourceClassSectionName: string;
  targetClassSectionName: string;
  createdByName: string;
  reversedByName: string | null;
};

type DecisionState = {
  outcome: StudentPromotionOutcomeInput;
  targetClassSectionId: string;
  remarks: string;
};

type Props = {
  branchName: string;
  academicYears: PromotionAcademicYearOption[];
  sourceAcademicYearId: string | null;
  targetAcademicYearId: string | null;
  sourceClassSectionId: string | null;
  allClassSections: PromotionClassSectionOption[];
  sourceClassSection: PromotionClassSectionOption | null;
  roster: PromotionRosterRow[];
  recentBatches: PromotionBatchSummary[];
};

const outcomeOptions: Array<{ value: StudentPromotionOutcomeInput; label: string }> = [
  { value: "PROMOTED", label: "Promoted" },
  { value: "NOT_PROMOTED", label: "Not Promoted" },
  { value: "REPEAT_SAME_CLASS", label: "Repeat Same Class" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "SCHOOL_LEFT", label: "School Left" },
  { value: "RESULT_PENDING", label: "Result Pending" },
  { value: "PROMOTION_WITHHELD", label: "Promotion Withheld" }
];

function defaultPromotedTarget(source: PromotionClassSectionOption | null, targets: PromotionClassSectionOption[]) {
  if (!source) return targets[0]?.id ?? "";
  return targets.find((target) => target.classId !== source.classId && target.sectionId === source.sectionId)?.id ??
    targets.find((target) => target.classId !== source.classId)?.id ?? "";
}

function repeatTarget(source: PromotionClassSectionOption | null, targets: PromotionClassSectionOption[]) {
  if (!source) return "";
  return targets.find((target) => target.classId === source.classId && target.sectionId === source.sectionId)?.id ??
    targets.find((target) => target.classId === source.classId)?.id ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`)
  );
}

function buildInitialDecisions(roster: PromotionRosterRow[], repeatTargetClassSectionId: string) {
  return Object.fromEntries(roster.map((row) => [row.id, {
    outcome: "PROMOTED" as const,
    targetClassSectionId: repeatTargetClassSectionId,
    remarks: ""
  }])) satisfies Record<string, DecisionState>;
}

export function StudentPromotionManager({
  branchName,
  academicYears,
  sourceAcademicYearId,
  targetAcademicYearId,
  sourceClassSectionId,
  allClassSections,
  sourceClassSection,
  roster,
  recentBatches
}: Props) {
  const router = useRouter();
  const loadedTargetClassSections = useMemo(
    () => allClassSections.filter((classSection) => classSection.academicYearId === targetAcademicYearId),
    [allClassSections, targetAcademicYearId]
  );
  const initialRepeatTarget = repeatTarget(sourceClassSection, loadedTargetClassSections);
  const [configuration, setConfiguration] = useState({
    sourceAcademicYearId: sourceAcademicYearId ?? "",
    sourceClassSectionId: sourceClassSectionId ?? "",
    targetAcademicYearId: targetAcademicYearId ?? ""
  });
  const [defaultTargetClassSectionId, setDefaultTargetClassSectionId] = useState(
    defaultPromotedTarget(sourceClassSection, loadedTargetClassSections)
  );
  const [effectiveDate, setEffectiveDate] = useState(
    academicYears.find((year) => year.id === targetAcademicYearId)?.startDate.slice(0, 10) ?? ""
  );
  const [remarks, setRemarks] = useState("");
  const [resultsConfirmed, setResultsConfirmed] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [decisions, setDecisions] = useState<Record<string, DecisionState>>(
    () => buildInitialDecisions(roster, initialRepeatTarget)
  );
  const [bulkOutcome, setBulkOutcome] = useState<StudentPromotionOutcomeInput>("PROMOTED");
  const [stage, setStage] = useState<"edit" | "preview">("edit");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionState, setActionState] = useState<{ ok: boolean; message?: string; error?: string }>({ ok: false });
  const [reversalBatchId, setReversalBatchId] = useState<string | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalConfirmation, setReversalConfirmation] = useState("");

  const eligibleRows = useMemo(() => roster.filter((row) => !row.processedOutcome), [roster]);
  const availableSourceClassSections = useMemo(
    () => allClassSections.filter((classSection) => classSection.academicYearId === configuration.sourceAcademicYearId),
    [allClassSections, configuration.sourceAcademicYearId]
  );
  const promotedTargetOptions = useMemo(
    () => loadedTargetClassSections.filter((target) => target.classId !== sourceClassSection?.classId),
    [loadedTargetClassSections, sourceClassSection?.classId]
  );
  const selectedRows = useMemo(
    () => eligibleRows.filter((row) => selected[row.id]),
    [eligibleRows, selected]
  );
  const outcomeSummary = useMemo(() => selectedRows.reduce<Record<string, number>>((summary, row) => {
    const outcome = decisions[row.id]?.outcome ?? "PROMOTED";
    summary[outcome] = (summary[outcome] ?? 0) + 1;
    return summary;
  }, {}), [decisions, selectedRows]);
  const defaultTarget = loadedTargetClassSections.find((classSection) => classSection.id === defaultTargetClassSectionId);
  const scopeDirty = configuration.sourceAcademicYearId !== (sourceAcademicYearId ?? "") ||
    configuration.sourceClassSectionId !== (sourceClassSectionId ?? "") ||
    configuration.targetAcademicYearId !== (targetAcademicYearId ?? "");

  function loadRoster() {
    const params = new URLSearchParams();
    if (configuration.sourceAcademicYearId) params.set("sourceAcademicYearId", configuration.sourceAcademicYearId);
    if (configuration.sourceClassSectionId) params.set("sourceClassSectionId", configuration.sourceClassSectionId);
    if (configuration.targetAcademicYearId) params.set("targetAcademicYearId", configuration.targetAcademicYearId);
    router.push(`/academia/promotions?${params.toString()}`);
  }

  function updateDecision(enrollmentId: string, update: Partial<DecisionState>) {
    setDecisions((current) => ({
      ...current,
      [enrollmentId]: { ...current[enrollmentId], ...update }
    }));
  }

  function applyBulkOutcome() {
    setDecisions((current) => {
      const next = { ...current };
      for (const row of selectedRows) {
        next[row.id] = {
          ...next[row.id],
          outcome: bulkOutcome,
          targetClassSectionId: bulkOutcome === "REPEAT_SAME_CLASS"
            ? (next[row.id]?.targetClassSectionId || initialRepeatTarget)
            : next[row.id]?.targetClassSectionId ?? ""
        };
      }
      return next;
    });
  }

  function reviewPromotion() {
    setActionState({ ok: false });
    if (!defaultTargetClassSectionId || !effectiveDate || selectedRows.length === 0) {
      setActionState({ ok: false, error: "Choose a target class-section, effective date, and at least one student." });
      return;
    }
    if (!resultsConfirmed) {
      setActionState({ ok: false, error: "Confirm that examination results are finalised and published." });
      return;
    }
    const repeatWithoutTarget = selectedRows.some((row) => (
      decisions[row.id]?.outcome === "REPEAT_SAME_CLASS" && !decisions[row.id]?.targetClassSectionId
    ));
    if (repeatWithoutTarget) {
      setActionState({ ok: false, error: "Choose a target class-section for each student repeating the same class." });
      return;
    }
    setStage("preview");
  }

  async function confirmPromotion() {
    if (!sourceAcademicYearId || !sourceClassSectionId || !targetAcademicYearId) return;
    setIsSubmitting(true);
    setActionState({ ok: false });
    const result = await createStudentPromotionBatchAction({
      sourceAcademicYearId,
      sourceClassSectionId,
      targetAcademicYearId,
      defaultTargetClassSectionId,
      effectiveDate,
      remarks,
      resultsPublicationConfirmed: resultsConfirmed,
      entries: selectedRows.map((row) => ({
        sourceEnrollmentId: row.id,
        studentId: row.studentId,
        outcome: decisions[row.id]?.outcome ?? "PROMOTED",
        targetClassSectionId: decisions[row.id]?.outcome === "REPEAT_SAME_CLASS"
          ? decisions[row.id]?.targetClassSectionId
          : undefined,
        remarks: decisions[row.id]?.remarks || undefined
      }))
    });
    setIsSubmitting(false);
    if (result.ok) {
      setActionState({ ok: true, message: result.message });
      setStage("edit");
      setSelected({});
      router.refresh();
    } else {
      setActionState({ ok: false, error: result.error });
    }
  }

  async function reverseBatch(batchId: string) {
    setIsSubmitting(true);
    setActionState({ ok: false });
    const result = await reverseStudentPromotionBatchAction({
      batchId,
      confirmation: reversalConfirmation,
      reason: reversalReason
    });
    setIsSubmitting(false);
    if (result.ok) {
      setActionState({ ok: true, message: result.message });
      setReversalBatchId(null);
      setReversalReason("");
      setReversalConfirmation("");
      router.refresh();
    } else {
      setActionState({ ok: false, error: result.error });
    }
  }

  return (
    <div className="space-y-6">
      <section className="premium-card p-4 sm:p-5" aria-labelledby="promotion-scope-title">
        <div>
          <h2 id="promotion-scope-title" className="text-lg font-semibold text-ink">Promotion scope</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            Active branch: {branchName}. Select the source roster and target academic year, then load students.
          </p>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4 xl:items-end">
          <FormField id="promotion-source-year" label="Current academic year" required>
            <select
              id="promotion-source-year"
              value={configuration.sourceAcademicYearId}
              onChange={(event) => setConfiguration((current) => ({
                ...current,
                sourceAcademicYearId: event.target.value,
                sourceClassSectionId: ""
              }))}
              className="min-h-11 w-full"
            >
              <option value="">Select year</option>
              {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
            </select>
          </FormField>
          <FormField id="promotion-source-class" label="Current class and section" required>
            <select
              id="promotion-source-class"
              value={configuration.sourceClassSectionId}
              onChange={(event) => setConfiguration((current) => ({ ...current, sourceClassSectionId: event.target.value }))}
              className="min-h-11 w-full"
            >
              <option value="">Select class-section</option>
              {availableSourceClassSections.map((classSection) => (
                <option key={classSection.id} value={classSection.id}>{classSection.displayName}</option>
              ))}
            </select>
          </FormField>
          <FormField id="promotion-target-year" label="Target academic year" required>
            <select
              id="promotion-target-year"
              value={configuration.targetAcademicYearId}
              onChange={(event) => {
                const nextYearId = event.target.value;
                const nextTargets = allClassSections.filter((classSection) => classSection.academicYearId === nextYearId);
                setConfiguration((current) => ({ ...current, targetAcademicYearId: nextYearId }));
                setDefaultTargetClassSectionId(defaultPromotedTarget(sourceClassSection, nextTargets));
                setEffectiveDate(academicYears.find((year) => year.id === nextYearId)?.startDate.slice(0, 10) ?? "");
              }}
              className="min-h-11 w-full"
            >
              <option value="">Select year</option>
              {academicYears.map((year) => (
                <option key={year.id} value={year.id} disabled={year.id === configuration.sourceAcademicYearId}>{year.name}</option>
              ))}
            </select>
          </FormField>
          <button
            type="button"
            onClick={loadRoster}
            disabled={!configuration.sourceAcademicYearId || !configuration.sourceClassSectionId || !configuration.targetAcademicYearId}
            className="premium-primary-button w-full premium-focus"
          >
            Load Students
          </button>
        </div>
      </section>

      {actionState.message || actionState.error ? <FormMessage state={actionState} /> : null}

      {scopeDirty ? (
        <PrerequisiteState
          title="Load the updated roster"
          description="The academic-year or class-section selection changed. Load students before reviewing promotion decisions."
        />
      ) : !sourceClassSection ? (
        <PrerequisiteState
          title="Select a class roster"
          description="Choose the current academic year, class-section, and target academic year to begin promotion review."
        />
      ) : promotedTargetOptions.length === 0 ? (
        <PrerequisiteState
          title="The next class-section is not configured"
          description="Create a different target-year class-section before promoting this class roster."
          actionLabel="Open Academic Setup"
          actionHref="/academia/setup#class-sections"
        />
      ) : roster.length === 0 ? (
        <PrerequisiteState
          title="No active students in this class-section"
          description="Only active source-year enrollments can be reviewed for promotion."
        />
      ) : stage === "preview" ? (
        <section className="premium-card p-4 sm:p-5" aria-labelledby="promotion-preview-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-brand-700">Final confirmation</p>
              <h2 id="promotion-preview-title" className="mt-1 text-xl font-semibold text-ink">Review promotion batch</h2>
              <p className="mt-1 text-sm text-slate-500">No records change until you confirm this summary.</p>
            </div>
            <StatusBadge value="RESULTS_CONFIRMED" label="Results confirmed" />
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Source</dt><dd className="mt-1 font-semibold text-ink">{sourceClassSection.displayName}</dd></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Target</dt><dd className="mt-1 font-semibold text-ink">{defaultTarget?.displayName ?? "Not selected"}</dd></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Effective date</dt><dd className="mt-1 font-semibold text-ink">{formatDate(effectiveDate)}</dd></div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><dt className="text-xs text-slate-500">Selected / excluded</dt><dd className="mt-1 font-semibold text-ink">{selectedRows.length} / {roster.length - selectedRows.length}</dd></div>
          </dl>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-ink">Decision summary</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(outcomeSummary).map(([outcome, count]) => (
                <span key={outcome} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  {formatEnumLabel(outcome)}: {count}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-5 max-h-80 space-y-2 overflow-y-auto pr-1" aria-label="Selected student decisions">
            {selectedRows.map((row) => (
              <div key={row.id} className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="font-semibold text-ink">{row.studentName}</p><p className="text-xs text-slate-500">{row.admissionNumber}{row.rollNumber ? ` · Roll ${row.rollNumber}` : ""}</p></div>
                <StatusBadge value={decisions[row.id]?.outcome} />
              </div>
            ))}
          </div>
          {remarks ? <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700"><span className="font-semibold">Remarks:</span> {remarks}</p> : null}
          <div className="mt-5 grid gap-2 sm:flex sm:justify-end">
            <button type="button" onClick={() => setStage("edit")} disabled={isSubmitting} className="premium-secondary-button premium-focus">Back to edit</button>
            <button type="button" onClick={confirmPromotion} disabled={isSubmitting} className="premium-primary-button premium-focus">
              {isSubmitting ? "Promoting students..." : "Confirm Promotion"}
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="premium-card p-4 sm:p-5" aria-labelledby="promotion-settings-title">
            <h2 id="promotion-settings-title" className="text-lg font-semibold text-ink">Target and confirmation</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <FormField id="promotion-target-class" label="Next class and section" required helpText="Used for students marked Promoted.">
                <select id="promotion-target-class" value={defaultTargetClassSectionId} onChange={(event) => setDefaultTargetClassSectionId(event.target.value)} className="min-h-11 w-full">
                  <option value="">Select target class-section</option>
                  {promotedTargetOptions.map((target) => (
                    <option key={target.id} value={target.id}>{target.displayName}{target.capacity ? ` · Capacity ${target.capacity}` : ""}</option>
                  ))}
                </select>
              </FormField>
              <FormField id="promotion-effective-date" label="Effective date" required>
                <input id="promotion-effective-date" type="date" value={effectiveDate} onChange={(event) => setEffectiveDate(event.target.value)} className="min-h-11 w-full" />
              </FormField>
              <FormField id="promotion-remarks" label="Batch remarks" helpText="Optional context for the audit record." className="md:col-span-2">
                <textarea id="promotion-remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={3} maxLength={1000} className="w-full" />
              </FormField>
            </div>
            <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <input type="checkbox" checked={resultsConfirmed} onChange={(event) => setResultsConfirmed(event.target.checked)} className="mt-1 h-4 w-4" />
              <span><strong>Results finalised and published.</strong> I confirm that the examination decisions have been reviewed before this promotion batch.</span>
            </label>
          </section>

          <section className="space-y-4" aria-labelledby="promotion-roster-title">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 id="promotion-roster-title" className="text-lg font-semibold text-ink">Select students and outcomes</h2>
                <p className="mt-1 text-sm text-slate-500">{selectedRows.length} of {eligibleRows.length} eligible students selected. Previously processed decisions are locked.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button type="button" onClick={() => setSelected(Object.fromEntries(eligibleRows.map((row) => [row.id, true])))} className="premium-secondary-button premium-focus">Select all eligible</button>
                <button type="button" onClick={() => setSelected({})} className="premium-secondary-button premium-focus">Clear selection</button>
              </div>
            </div>
            <div className="premium-card grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(180px,0.5fr)_auto] sm:items-end">
              <FormField id="promotion-bulk-outcome" label="Bulk outcome">
                <select id="promotion-bulk-outcome" value={bulkOutcome} onChange={(event) => setBulkOutcome(event.target.value as StudentPromotionOutcomeInput)} className="min-h-11 w-full">
                  {outcomeOptions.map((outcome) => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}
                </select>
              </FormField>
              <p className="text-sm text-slate-500">Apply one outcome to the currently selected students, then adjust exceptions individually.</p>
              <button type="button" onClick={applyBulkOutcome} disabled={selectedRows.length === 0} className="premium-secondary-button premium-focus">Apply outcome</button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {roster.map((row) => {
                const isLocked = Boolean(row.processedOutcome);
                const decision = decisions[row.id] ?? { outcome: "PROMOTED", targetClassSectionId: initialRepeatTarget, remarks: "" };
                return (
                  <article key={row.id} className={`rounded-lg border p-4 shadow-sm ${isLocked ? "border-slate-200 bg-slate-50" : selected[row.id] ? "border-brand-300 bg-brand-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.studentName}`}
                        checked={Boolean(selected[row.id])}
                        disabled={isLocked}
                        onChange={(event) => setSelected((current) => ({ ...current, [row.id]: event.target.checked }))}
                        className="mt-1 h-5 w-5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div><h3 className="font-semibold text-ink">{row.studentName}</h3><p className="text-xs text-slate-500">Scholar {row.admissionNumber}{row.rollNumber ? ` · Roll ${row.rollNumber}` : ""}</p></div>
                          {isLocked ? <StatusBadge value={row.processedOutcome} label={`Recorded: ${formatEnumLabel(row.processedOutcome)}`} /> : null}
                        </div>
                        {!isLocked ? (
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <FormField id={`promotion-outcome-${row.id}`} label="Promotion status">
                              <select id={`promotion-outcome-${row.id}`} value={decision.outcome} disabled={!selected[row.id]} onChange={(event) => updateDecision(row.id, { outcome: event.target.value as StudentPromotionOutcomeInput })} className="min-h-11 w-full">
                                {outcomeOptions.map((outcome) => <option key={outcome.value} value={outcome.value}>{outcome.label}</option>)}
                              </select>
                            </FormField>
                            {decision.outcome === "REPEAT_SAME_CLASS" ? (
                              <FormField id={`promotion-repeat-target-${row.id}`} label="Repeat class-section" required>
                                <select id={`promotion-repeat-target-${row.id}`} value={decision.targetClassSectionId} disabled={!selected[row.id]} onChange={(event) => updateDecision(row.id, { targetClassSectionId: event.target.value })} className="min-h-11 w-full">
                                  <option value="">Select class-section</option>
                                  {loadedTargetClassSections.filter((target) => target.classId === sourceClassSection.classId).map((target) => <option key={target.id} value={target.id}>{target.displayName}</option>)}
                                </select>
                              </FormField>
                            ) : null}
                            <FormField id={`promotion-row-remarks-${row.id}`} label="Student remarks" className="sm:col-span-2">
                              <input id={`promotion-row-remarks-${row.id}`} value={decision.remarks} disabled={!selected[row.id]} onChange={(event) => updateDecision(row.id, { remarks: event.target.value })} maxLength={500} className="min-h-11 w-full" />
                            </FormField>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-20 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-elevated backdrop-blur lg:bottom-24">
              <button type="button" onClick={reviewPromotion} disabled={selectedRows.length === 0 || isSubmitting} className="premium-primary-button w-full premium-focus">
                Review {selectedRows.length || ""} Promotion Decision{selectedRows.length === 1 ? "" : "s"}
              </button>
            </div>
          </section>
        </>
      )}

      <section className="space-y-3" aria-labelledby="promotion-history-title">
        <div><h2 id="promotion-history-title" className="text-lg font-semibold text-ink">Recent promotion batches</h2><p className="mt-1 text-sm text-slate-500">Reversal is allowed only before target-year attendance or later lifecycle changes.</p></div>
        {recentBatches.length === 0 ? (
          <p className="premium-card p-4 text-sm text-slate-500">No promotion batches have been recorded for this branch.</p>
        ) : recentBatches.map((batch) => (
          <article key={batch.id} className="premium-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-ink">{batch.sourceClassSectionName} to {batch.targetClassSectionName}</h3><StatusBadge value={batch.status} /></div><p className="mt-1 text-sm text-slate-500">{batch.sourceAcademicYearName} to {batch.targetAcademicYearName} · Effective {formatDate(batch.effectiveDate)} · {batch.selectedCount} selected · {batch.excludedCount} excluded</p><p className="mt-1 text-xs text-slate-500">Recorded by {batch.createdByName} on {formatDate(batch.createdAt)}</p></div>
              {batch.status === "COMPLETED" ? <button type="button" onClick={() => setReversalBatchId((current) => current === batch.id ? null : batch.id)} className="premium-secondary-button premium-focus">Reverse batch</button> : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">{Object.entries(batch.outcomeSummary).map(([outcome, count]) => <span key={outcome} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">{formatEnumLabel(outcome)}: {count}</span>)}</div>
            {reversalBatchId === batch.id ? (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-900">Reverse this entire promotion batch</p>
                <p className="mt-1 text-xs leading-5 text-red-800">Target enrollments will be cancelled, not deleted. Type REVERSE PROMOTION and provide a reason.</p>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <FormField id={`reversal-confirmation-${batch.id}`} label="Confirmation">
                    <input id={`reversal-confirmation-${batch.id}`} value={reversalConfirmation} onChange={(event) => setReversalConfirmation(event.target.value)} className="min-h-11 w-full" />
                  </FormField>
                  <FormField id={`reversal-reason-${batch.id}`} label="Reason" required>
                    <input id={`reversal-reason-${batch.id}`} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} minLength={10} maxLength={1000} className="min-h-11 w-full" />
                  </FormField>
                </div>
                <button type="button" onClick={() => reverseBatch(batch.id)} disabled={isSubmitting || reversalConfirmation !== "REVERSE PROMOTION" || reversalReason.trim().length < 10} className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 premium-focus">{isSubmitting ? "Reversing..." : "Confirm reversal"}</button>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
