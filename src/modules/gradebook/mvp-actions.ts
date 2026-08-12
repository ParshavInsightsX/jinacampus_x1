"use server";

import { revalidatePath } from "next/cache";

import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import type { GradebookActionResult } from "@/modules/gradebook/actions";
import {
  activateAssessmentScheme,
  activateCalculationRuleSet,
  activateCoScholasticScheme,
  activateExam,
  activateGradeScale,
  activateReportCardTemplateVersion,
  applyApprovedMarkAdjustment,
  approveGradebookCorrection,
  approveMarkAdjustment,
  approveReportCard,
  approveResultRun,
  assignTeacherToExamScope,
  cancelExam,
  closeGradebookCorrection,
  createAndCalculateResultRun,
  createAssessmentScheme,
  createCalculationRuleSet,
  createCoScholasticScheme,
  createExam,
  createExamTerm,
  createExamType,
  createGradeScale,
  createReportCardTemplate,
  generateReportCards,
  openApprovedGradebookCorrection,
  prepareResultPublication,
  publishExamSchedule,
  publishResults,
  rejectGradebookCorrection,
  requestGradebookCorrection,
  requestMarkAdjustment,
  returnMarksBatch,
  revokeResultPublication,
  revokeTeacherAssignment,
  saveCoScholasticEntries,
  saveMarksDraft,
  saveTeacherRemark,
  transitionExamTerm,
  transitionExamType,
  transitionMarksBatch,
  upsertExamSchedule
} from "@/modules/gradebook/services";

function actionError(error: unknown): GradebookActionResult<never> {
  return mapActionError(error, {
    fallbackMessage: "Unable to complete the GradeBook action. Please try again.",
    validationMessage: "Review the GradeBook details and correct the highlighted fields."
  });
}
function revalidateGradebook(...paths: string[]) {
  const defaults = [
    "/gradebook",
    "/gradebook/setup",
    "/gradebook/exams",
    "/gradebook/marks",
    "/gradebook/results",
    "/gradebook/report-cards",
    "/gradebook/publications",
    "/gradebook/corrections",
    "/gradebook/analytics",
    "/gradebook/history"
  ];
  for (const path of new Set([...defaults, ...paths])) revalidatePath(path);
}

async function runAction<T>(
  work: () => Promise<T>,
  message: string,
  map: (value: T) => Record<string, unknown>,
  paths: readonly string[] = []
): Promise<GradebookActionResult<Record<string, unknown>>> {
  try {
    const value = await work();
    revalidateGradebook(...paths);
    return { ok: true, data: map(value), message };
  } catch (error) {
    return actionError(error);
  }
}

export async function createAssessmentSchemeAction(input: unknown) {
  return runAction(
    async () => createAssessmentScheme(await getTenantContext(), input),
    "Assessment scheme created as a draft.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function activateAssessmentSchemeAction(input: unknown) {
  return runAction(
    async () => activateAssessmentScheme(await getTenantContext(), input),
    "Assessment scheme activated.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function createExamTermAction(input: unknown) {
  return runAction(
    async () => createExamTerm(await getTenantContext(), input),
    "Examination term created.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function transitionExamTermAction(input: unknown) {
  return runAction(
    async () => transitionExamTerm(await getTenantContext(), input),
    "Examination term updated.",
    (value) => ({ id: value.id, status: value.status, version: value.version })
  );
}

export async function createExamTypeAction(input: unknown) {
  return runAction(
    async () => createExamType(await getTenantContext(), input),
    "Exam type created as a draft.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function transitionExamTypeAction(input: unknown) {
  return runAction(
    async () => transitionExamType(await getTenantContext(), input),
    "Exam type updated.",
    (value) => ({ id: value.id, status: value.status, version: value.version })
  );
}

export async function createGradeScaleAction(input: unknown) {
  return runAction(
    async () => createGradeScale(await getTenantContext(), input),
    "Grade scale created as a draft.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function activateGradeScaleAction(input: unknown) {
  return runAction(
    async () => activateGradeScale(await getTenantContext(), input),
    "Grade scale activated.",
    (value) => ({ id: value.id, versionId: value.versionId })
  );
}

export async function createCalculationRuleSetAction(input: unknown) {
  return runAction(
    async () => createCalculationRuleSet(await getTenantContext(), input),
    "Calculation rule set created as a draft.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function activateCalculationRuleSetAction(input: unknown) {
  return runAction(
    async () => activateCalculationRuleSet(await getTenantContext(), input),
    "Calculation rule set activated.",
    (value) => ({ id: value.id, versionId: value.versionId })
  );
}

export async function createMvpExamAction(input: unknown) {
  return runAction(
    async () => createExam(await getTenantContext(), input),
    "Exam created. Review readiness before activation.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/exams"]
  );
}

export async function activateMvpExamAction(input: unknown) {
  return runAction(
    async () => activateExam(await getTenantContext(), input),
    "Exam activated and marks-entry batches prepared.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/exams", "/gradebook/marks"]
  );
}

export async function cancelMvpExamAction(input: unknown) {
  return runAction(
    async () => cancelExam(await getTenantContext(), input),
    "Exam cancelled.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/exams"]
  );
}

export async function assignTeacherToExamAction(input: unknown) {
  return runAction(
    async () => assignTeacherToExamScope(await getTenantContext(), input),
    "Teacher assigned to the selected examination scope.",
    (value) => ({ id: value.assignment.id, status: value.assignment.status, batchId: value.batch.id }),
    ["/gradebook/exams", "/gradebook/marks"]
  );
}

export async function revokeTeacherAssignmentAction(input: unknown) {
  return runAction(
    async () => revokeTeacherAssignment(await getTenantContext(), input),
    "Teacher assignment revoked.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/exams", "/gradebook/marks"]
  );
}

export async function upsertExamScheduleAction(input: unknown) {
  return runAction(
    async () => upsertExamSchedule(await getTenantContext(), input),
    "Exam schedule saved as a draft.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/exams"]
  );
}

export async function publishExamScheduleAction(input: unknown) {
  return runAction(
    async () => publishExamSchedule(await getTenantContext(), input),
    "Exam schedule published.",
    (value) => ({ examId: value.examId, publishedCount: value.publishedCount }),
    ["/gradebook/exams"]
  );
}

export async function saveMarksDraftAction(input: unknown) {
  return runAction(
    async () => saveMarksDraft(await getTenantContext(), input),
    "Marks draft saved.",
    (value) => ({ batchId: value.batchId, version: value.version, savedCount: value.savedCount, entered: value.entered, expected: value.expected }),
    ["/gradebook/marks"]
  );
}

export async function transitionMarksBatchAction(input: unknown) {
  return runAction(
    async () => transitionMarksBatch(await getTenantContext(), input),
    "Marks workflow updated.",
    (value) => ({ batchId: value.batchId, status: value.status, version: value.version }),
    ["/gradebook/marks", "/gradebook/submissions", "/gradebook/verification", "/gradebook/approvals"]
  );
}

export async function returnMarksBatchAction(input: unknown) {
  return runAction(
    async () => returnMarksBatch(await getTenantContext(), input),
    "Marks batch returned for correction.",
    (value) => ({ batchId: value.batchId, status: value.status, version: value.version }),
    ["/gradebook/marks", "/gradebook/submissions", "/gradebook/verification", "/gradebook/approvals"]
  );
}

export async function calculateResultRunAction(input: unknown) {
  return runAction(
    async () => createAndCalculateResultRun(await getTenantContext(), input),
    "Result calculation completed from the approved marks snapshot.",
    (value) => ({ id: value.id, status: value.status, summary: value.summaryJson }),
    ["/gradebook/results"]
  );
}

export async function approveResultRunAction(input: unknown) {
  return runAction(
    async () => approveResultRun(await getTenantContext(), input),
    "Result run approved.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/results", "/gradebook/report-cards"]
  );
}

export async function createReportCardTemplateAction(input: unknown) {
  return runAction(
    async () => createReportCardTemplate(await getTenantContext(), input),
    "Report-card template created as a draft.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/report-cards"]
  );
}

export async function activateReportCardTemplateAction(input: unknown) {
  return runAction(
    async () => activateReportCardTemplateVersion(await getTenantContext(), input),
    "Report-card template activated.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/report-cards"]
  );
}

export async function generateReportCardsAction(input: unknown) {
  return runAction(
    async () => generateReportCards(await getTenantContext(), input),
    "Report-card generation completed.",
    (value) => ({ requested: value.requested, generated: value.generated, failed: value.failed, failures: value.failures }),
    ["/gradebook/report-cards"]
  );
}

export async function approveReportCardAction(input: unknown) {
  return runAction(
    async () => approveReportCard(await getTenantContext(), input),
    "Report card approved.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/report-cards"]
  );
}

export async function prepareResultPublicationAction(input: unknown) {
  return runAction(
    async () => prepareResultPublication(await getTenantContext(), input),
    "Result publication prepared.",
    (value) => ({ id: value.id, status: value.status, publicationVersion: value.publicationVersion }),
    ["/gradebook/report-cards", "/gradebook/publications"]
  );
}

export async function publishResultsAction(input: unknown) {
  return runAction(
    async () => publishResults(await getTenantContext(), input),
    "Results published to eligible recipients.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/report-cards", "/gradebook/publications", "/gradebook/history", "/gradebook/analytics"]
  );
}

export async function revokeResultPublicationAction(input: unknown) {
  return runAction(
    async () => revokeResultPublication(await getTenantContext(), input),
    "Result publication revoked.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/report-cards", "/gradebook/publications", "/gradebook/history"]
  );
}

export async function requestGradebookCorrectionAction(input: unknown) {
  return runAction(
    async () => requestGradebookCorrection(await getTenantContext(), input),
    "Correction request submitted.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections"]
  );
}

export async function approveGradebookCorrectionAction(input: unknown) {
  return runAction(
    async () => approveGradebookCorrection(await getTenantContext(), input),
    "Correction request approved for a bounded window.",
    (value) => ({ id: value.id, status: value.status, approvedUntil: value.approvedUntil }),
    ["/gradebook/corrections"]
  );
}

export async function rejectGradebookCorrectionAction(input: unknown) {
  return runAction(
    async () => rejectGradebookCorrection(await getTenantContext(), input),
    "Correction request rejected.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections"]
  );
}

export async function openGradebookCorrectionAction(input: unknown) {
  return runAction(
    async () => openApprovedGradebookCorrection(await getTenantContext(), input),
    "Approved correction window opened.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections", "/gradebook/marks"]
  );
}

export async function closeGradebookCorrectionAction(input: unknown) {
  return runAction(
    async () => closeGradebookCorrection(await getTenantContext(), input),
    "Correction request closed with its replacement version.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections", "/gradebook/history"]
  );
}

export async function requestMarkAdjustmentAction(input: unknown) {
  return runAction(
    async () => requestMarkAdjustment(await getTenantContext(), input),
    "Mark adjustment requested.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections"]
  );
}

export async function approveMarkAdjustmentAction(input: unknown) {
  return runAction(
    async () => approveMarkAdjustment(await getTenantContext(), input),
    "Mark adjustment approved.",
    (value) => ({ id: value.id, status: value.status }),
    ["/gradebook/corrections"]
  );
}

export async function applyMarkAdjustmentAction(input: unknown) {
  return runAction(
    async () => applyApprovedMarkAdjustment(await getTenantContext(), input),
    "Mark adjustment applied to a new result version.",
    (value) => value
      ? ({ id: value.id, status: value.status, replacementResultRunId: value.id })
      : ({ id: null, status: "NOT_FOUND" }),
    ["/gradebook/corrections", "/gradebook/results", "/gradebook/history"]
  );
}

export async function createCoScholasticSchemeAction(input: unknown) {
  return runAction(
    async () => createCoScholasticScheme(await getTenantContext(), input),
    "Co-scholastic scheme created as a draft.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function activateCoScholasticSchemeAction(input: unknown) {
  return runAction(
    async () => activateCoScholasticScheme(await getTenantContext(), input),
    "Co-scholastic scheme activated.",
    (value) => ({ id: value.id, status: value.status })
  );
}

export async function saveCoScholasticEntriesAction(input: unknown) {
  return runAction(
    async () => saveCoScholasticEntries(await getTenantContext(), input),
    "Co-scholastic entries saved.",
    (value) => ({ savedCount: value.savedCount })
  );
}

export async function saveTeacherRemarkAction(input: unknown) {
  return runAction(
    async () => saveTeacherRemark(await getTenantContext(), input),
    "Teacher remark saved.",
    (value) => ({ id: value.id, status: value.status })
  );
}

