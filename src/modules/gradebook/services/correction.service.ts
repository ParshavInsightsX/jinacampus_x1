import { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  adjustmentIdSchema,
  approveCorrectionSchema,
  closeCorrectionSchema,
  correctionIdSchema,
  rejectCorrectionSchema,
  requestAdjustmentSchema,
  requestCorrectionSchema,
  reviewAdjustmentSchema
} from "@/modules/gradebook/schemas/correction.schemas";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { evaluateGrade } from "@/modules/gradebook/services/result-engine";
import { requireGradebookCapability, resolveGradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import type { GradeRuleInput } from "@/modules/gradebook/types/result-engine";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";
import { decimal, percentage, roundDecimal } from "@/modules/gradebook/utils/decimal";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

async function validateCorrectionTarget(tenantId: string, examId: string, targetType: "MARK_BATCH" | "RESULT_RUN" | "REPORT_CARD", targetId: string) {
  if (targetType === "MARK_BATCH") return db.gradebookMarkEntryBatch.findFirst({ where: { id: targetId, tenantId, examId }, select: { id: true } });
  if (targetType === "RESULT_RUN") return db.gradebookResultRun.findFirst({ where: { id: targetId, tenantId, examId }, select: { id: true } });
  return db.gradebookReportCard.findFirst({ where: { id: targetId, tenantId, resultRun: { examId } }, select: { id: true } });
}

export async function requestGradebookCorrection(ctx: TenantContext, input: unknown) {
  const data = requestCorrectionSchema.parse(input);
  const permission = data.requestType === "MARK_REOPEN" ? "gradebook.marks.reopen.request" as const : "gradebook.result.correction.request" as const;
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "resultCalculation" });
  const exam = await db.gradebookExam.findFirst({ where: { id: data.examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
  if (!await validateCorrectionTarget(request.tenantId, exam.id, data.targetType, data.targetId)) throw notFound("GRADEBOOK_CORRECTION_TARGET_NOT_FOUND");
  return db.$transaction(async (tx) => {
    const correction = await tx.gradebookCorrectionRequest.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        examId: exam.id,
        requestType: data.requestType,
        targetType: data.targetType,
        targetId: data.targetId,
        reason: data.reason,
        requestedChangeJson: data.requestedChange,
        impactPreviewJson: data.impactPreview,
        status: "REQUESTED",
        requestedById: request.userId
      }
    });
    await writeAuditLog({ ctx: request, action: GRADEBOOK_AUDIT_EVENTS.CORRECTION_REQUESTED, entityType: "GradebookCorrectionRequest", entityId: correction.id, branchId: request.branchId, academicYearId: request.academicYearId, after: { requestType: correction.requestType, targetType: correction.targetType, targetId: correction.targetId, status: correction.status, reason: correction.reason }, metadata: { correlationId: request.correlationId } }, tx);
    return correction;
  });
}

export async function approveGradebookCorrection(ctx: TenantContext, input: unknown) {
  const data = approveCorrectionSchema.parse(input);
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.dashboard.view", feature: "resultCalculation" });
  return db.$transaction(async (tx) => {
    const correction = await tx.gradebookCorrectionRequest.findFirst({ where: { id: data.correctionRequestId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
    if (!correction) throw notFound("GRADEBOOK_CORRECTION_NOT_FOUND");
    requireGradebookCapability(
      request,
      correction.requestType === "MARK_REOPEN" ? "gradebook.marks.reopen.approve" : "gradebook.result.correction.approve"
    );
    if (!["REQUESTED", "UNDER_REVIEW"].includes(correction.status)) throw conflict("GRADEBOOK_CORRECTION_NOT_APPROVABLE");
    if (correction.requestedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
    const approvedUntil = new Date(Date.now() + data.approvalHours * 3_600_000);
    const updated = await tx.gradebookCorrectionRequest.update({ where: { id: correction.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: request.userId, approvedAt: new Date(), approvedById: request.userId, approvedUntil, approvedScopeJson: { targetType: correction.targetType, targetId: correction.targetId }, reviewReason: data.reviewReason } });
    await writeAuditLog({ ctx: request, action: GRADEBOOK_AUDIT_EVENTS.CORRECTION_APPROVED, entityType: "GradebookCorrectionRequest", entityId: correction.id, branchId: request.branchId, academicYearId: request.academicYearId, before: { status: correction.status }, after: { status: updated.status, approvedUntil, reviewReason: data.reviewReason }, metadata: { correlationId: request.correlationId } }, tx);
    return updated;
  });
}

export async function rejectGradebookCorrection(ctx: TenantContext, input: unknown) {
  const data = rejectCorrectionSchema.parse(input);
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.dashboard.view", feature: "resultCalculation" });
  const correction = await db.gradebookCorrectionRequest.findFirst({ where: { id: data.correctionRequestId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!correction) throw notFound("GRADEBOOK_CORRECTION_NOT_FOUND");
  requireGradebookCapability(
    request,
    correction.requestType === "MARK_REOPEN" ? "gradebook.marks.reopen.review" : "gradebook.result.correction.approve"
  );
  if (!["REQUESTED", "UNDER_REVIEW"].includes(correction.status)) throw conflict("GRADEBOOK_CORRECTION_NOT_REJECTABLE");
  return db.gradebookCorrectionRequest.update({ where: { id: correction.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: request.userId, reviewReason: data.reviewReason } });
}

export async function openApprovedGradebookCorrection(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.reopen.execute", feature: "resultCalculation" });
  const { correctionRequestId } = correctionIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const correction = await tx.gradebookCorrectionRequest.findFirst({ where: { id: correctionRequestId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
    if (!correction) throw notFound("GRADEBOOK_CORRECTION_NOT_FOUND");
    if (correction.status !== "APPROVED" || !correction.approvedUntil || correction.approvedUntil <= new Date()) throw conflict("GRADEBOOK_CORRECTION_APPROVAL_EXPIRED");
    if (correction.requestType === "MARK_REOPEN" && correction.targetType === "MARK_BATCH") {
      const batch = await tx.gradebookMarkEntryBatch.findFirst({ where: { id: correction.targetId, tenantId: request.tenantId, examId: correction.examId } });
      if (!batch) throw notFound("GRADEBOOK_MARK_BATCH_NOT_FOUND");
      if (!["APPROVED", "LOCKED"].includes(batch.status)) throw conflict("GRADEBOOK_MARK_BATCH_NOT_REOPENABLE");
      await tx.gradebookMarkEntryBatch.update({ where: { id: batch.id }, data: { status: "RETURNED", version: { increment: 1 }, returnedAt: new Date(), returnedById: request.userId, returnReason: correction.reason, approvedAt: null, approvedById: null, lockedAt: null, lockedById: null } });
    }
    const updated = await tx.gradebookCorrectionRequest.update({ where: { id: correction.id }, data: { status: "OPENED", openedAt: new Date(), openedById: request.userId } });
    await writeAuditLog({ ctx: request, action: "gradebook.correction.opened", entityType: "GradebookCorrectionRequest", entityId: correction.id, branchId: request.branchId, academicYearId: request.academicYearId, before: { status: correction.status }, after: { status: updated.status, targetType: correction.targetType, targetId: correction.targetId }, metadata: { correlationId: request.correlationId } }, tx);
    return updated;
  });
}

export async function closeGradebookCorrection(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.republish", feature: "resultCalculation" });
  const data = closeCorrectionSchema.parse(input);
  const correction = await db.gradebookCorrectionRequest.findFirst({ where: { id: data.correctionRequestId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!correction) throw notFound("GRADEBOOK_CORRECTION_NOT_FOUND");
  if (!["OPENED", "CORRECTED", "RECALCULATED", "REPUBLISHED"].includes(correction.status)) throw conflict("GRADEBOOK_CORRECTION_NOT_CLOSABLE");
  return db.gradebookCorrectionRequest.update({ where: { id: correction.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: request.userId, replacementVersionId: data.replacementVersionId, reviewReason: data.reviewReason } });
}

export async function requestMarkAdjustment(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.adjustment.request", feature: "resultCalculation" });
  const data = requestAdjustmentSchema.parse(input);
  const subjectResult = await db.gradebookStudentSubjectResult.findFirst({
    where: { id: data.studentSubjectResultId, tenantId: request.tenantId, resultRun: { branchId: request.branchId, academicYearId: request.academicYearId, status: "APPROVED" } },
    include: { resultRun: true }
  });
  if (!subjectResult) throw notFound("GRADEBOOK_SUBJECT_RESULT_NOT_FOUND");
  if (subjectResult.rawMarks === null || subjectResult.maximumMarks === null) throw conflict("GRADEBOOK_SPECIAL_STATUS_NOT_ADJUSTABLE");
  const proposed = data.proposedValue !== undefined ? decimal(data.proposedValue) : subjectResult.rawMarks.add(data.proposedDelta ?? 0);
  const maximumAllowed = decimal(data.maximumAllowed ?? subjectResult.maximumMarks);
  if (proposed.lt(0) || proposed.gt(maximumAllowed) || proposed.gt(subjectResult.maximumMarks)) throw new AppError("GRADEBOOK_ADJUSTMENT_OUT_OF_RANGE", "GRADEBOOK_ADJUSTMENT_OUT_OF_RANGE", 400);
  const policyVersionHash = hashCanonicalJson({ engineVersion: subjectResult.resultRun.engineVersion, configurationHash: subjectResult.resultRun.configurationHash, maximumAllowed: maximumAllowed.toString() });
  return db.gradebookMarkAdjustment.create({
    data: {
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      adjustmentType: data.adjustmentType,
      targetType: "STUDENT_SUBJECT_RESULT",
      targetId: subjectResult.id,
      originalValueJson: { rawMarks: subjectResult.rawMarks.toString(), adjustmentTotal: subjectResult.adjustmentTotal.toString() },
      proposedDelta: data.proposedDelta,
      proposedValue: proposed,
      maximumAllowed,
      policyVersionHash,
      reason: data.reason,
      impactPreviewJson: { resultRunId: subjectResult.resultRunId, studentId: subjectResult.studentId, previousMarks: subjectResult.rawMarks.toString(), proposedMarks: proposed.toString() },
      status: "REQUESTED",
      requestedById: request.userId
    }
  });
}

export async function approveMarkAdjustment(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.adjustment.approve", feature: "resultCalculation" });
  const data = reviewAdjustmentSchema.parse(input);
  const adjustment = await db.gradebookMarkAdjustment.findFirst({ where: { id: data.adjustmentId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!adjustment) throw notFound("GRADEBOOK_ADJUSTMENT_NOT_FOUND");
  if (!["REQUESTED", "UNDER_REVIEW"].includes(adjustment.status)) throw conflict("GRADEBOOK_ADJUSTMENT_NOT_APPROVABLE");
  if (adjustment.requestedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
  return db.gradebookMarkAdjustment.update({ where: { id: adjustment.id }, data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: request.userId, approvedAt: new Date(), approvedById: request.userId } });
}

export async function applyApprovedMarkAdjustment(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.adjustment.apply", feature: "resultCalculation" });
  const { adjustmentId } = adjustmentIdSchema.parse(input);
  const adjustment = await db.gradebookMarkAdjustment.findFirst({ where: { id: adjustmentId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!adjustment) throw notFound("GRADEBOOK_ADJUSTMENT_NOT_FOUND");
  if (adjustment.status === "APPLIED" && adjustment.replacementResultRunId) return db.gradebookResultRun.findFirst({ where: { id: adjustment.replacementResultRunId, tenantId: request.tenantId } });
  if (adjustment.status !== "APPROVED") throw conflict("GRADEBOOK_ADJUSTMENT_NOT_APPROVED");
  if (adjustment.approvedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
  const target = await db.gradebookStudentSubjectResult.findFirst({
    where: { id: adjustment.targetId, tenantId: request.tenantId },
    include: { resultRun: { include: { subjectResults: true, overallResults: true, exam: { include: { gradeScaleVersion: { include: { rules: true } } } } } } }
  });
  if (!target || target.resultRun.status !== "APPROVED" || !target.resultRun.exam.gradeScaleVersion) throw notFound("GRADEBOOK_SUBJECT_RESULT_NOT_FOUND");
  const replacementKey = hashCanonicalJson({ sourceResultRunId: target.resultRunId, adjustmentId: adjustment.id, policyVersionHash: adjustment.policyVersionHash });
  const existing = await db.gradebookResultRun.findUnique({ where: { idempotencyKey: replacementKey } });
  if (existing) return existing;
  const gradeScaleVersion = target.resultRun.exam.gradeScaleVersion;
  const gradeRules: GradeRuleInput[] = gradeScaleVersion.rules.map((rule) => ({ minimumInclusive: rule.minimumInclusive.toString(), maximumInclusive: rule.maximumInclusive.toString(), letterGrade: rule.letterGrade, gradePoint: rule.gradePoint?.toString() ?? null, isPassing: rule.isPassing }));
  const newRawMarks = adjustment.proposedValue ?? target.rawMarks;
  if (!newRawMarks || !target.maximumMarks) throw conflict("GRADEBOOK_ADJUSTMENT_VALUE_MISSING");
  const newPercentage = percentage(newRawMarks, target.maximumMarks, gradeScaleVersion.decimalPlaces, gradeScaleVersion.roundingMode);
  const newGrade = newPercentage ? evaluateGrade(gradeRules, newPercentage) : null;
  return db.$transaction(async (tx) => {
    const run = await tx.gradebookResultRun.create({ data: { tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, examId: target.resultRun.examId, examClassSectionId: target.resultRun.examClassSectionId, inputSnapshotHash: hashCanonicalJson({ source: target.resultRun.inputSnapshotHash, adjustmentId: adjustment.id }), configurationHash: target.resultRun.configurationHash, engineVersion: target.resultRun.engineVersion, idempotencyKey: replacementKey, status: "COMPLETED", supersedesResultRunId: target.resultRun.id, startedById: request.userId, startedAt: new Date(), completedAt: new Date(), configurationSnapshotJson: target.resultRun.configurationSnapshotJson as Prisma.InputJsonValue } });
    for (const source of target.resultRun.subjectResults) {
      const adjusted = source.id === target.id;
      await tx.gradebookStudentSubjectResult.create({ data: { tenantId: request.tenantId, resultRunId: run.id, enrollmentId: source.enrollmentId, studentId: source.studentId, examSubjectId: source.examSubjectId, rawMarks: adjusted ? newRawMarks : source.rawMarks, maximumMarks: source.maximumMarks, weightedScore: adjusted && source.rawMarks && source.weightedScore ? source.weightedScore.mul(newRawMarks).div(source.rawMarks) : source.weightedScore, percentage: adjusted ? newPercentage : source.percentage, letterGrade: adjusted ? newGrade?.letterGrade ?? null : source.letterGrade, gradePoint: adjusted ? newGrade?.gradePoint : source.gradePoint, resultStatus: adjusted ? (newGrade?.isPassing === false ? "FAIL" : "PASS") : source.resultStatus, specialStatus: source.specialStatus, adjustmentTotal: adjusted && source.rawMarks ? source.adjustmentTotal.add(newRawMarks.sub(source.rawMarks)) : source.adjustmentTotal, calculationDetailJson: adjusted ? { sourceResultId: source.id, adjustmentId: adjustment.id, policyVersionHash: adjustment.policyVersionHash } : source.calculationDetailJson as Prisma.InputJsonValue } });
    }
    for (const source of target.resultRun.overallResults) {
      if (source.enrollmentId !== target.enrollmentId) {
        await tx.gradebookStudentOverallResult.create({ data: { tenantId: request.tenantId, resultRunId: run.id, enrollmentId: source.enrollmentId, studentId: source.studentId, totalMarks: source.totalMarks, maximumMarks: source.maximumMarks, overallPercentage: source.overallPercentage, overallLetterGrade: source.overallLetterGrade, overallGradePoint: source.overallGradePoint, passedSubjectCount: source.passedSubjectCount, failedSubjectCount: source.failedSubjectCount, pendingSubjectCount: source.pendingSubjectCount, resultStatus: source.resultStatus, promotionEligible: source.promotionEligible, calculationDetailJson: source.calculationDetailJson as Prisma.InputJsonValue } });
        continue;
      }
      const studentSubjects = target.resultRun.subjectResults.filter((row) => row.enrollmentId === source.enrollmentId);
      const originalTotal = studentSubjects.reduce((sum, row) => sum.add(row.rawMarks ?? 0), decimal(0));
      const newTotal = originalTotal.sub(target.rawMarks ?? 0).add(newRawMarks);
      const overallPercentage = source.maximumMarks ? percentage(newTotal, source.maximumMarks, gradeScaleVersion.decimalPlaces, gradeScaleVersion.roundingMode) : null;
      const overallGrade = overallPercentage ? evaluateGrade(gradeRules, overallPercentage) : null;
      const originalTargetFailed = target.resultStatus === "FAIL";
      const adjustedTargetFailed = newGrade?.isPassing === false;
      const failedSubjectCount = Math.max(0, source.failedSubjectCount - (originalTargetFailed ? 1 : 0) + (adjustedTargetFailed ? 1 : 0));
      const resultStatus = source.pendingSubjectCount > 0 ? source.resultStatus : failedSubjectCount > 0 || overallGrade?.isPassing === false ? "FAIL" : "PASS";
      await tx.gradebookStudentOverallResult.create({ data: { tenantId: request.tenantId, resultRunId: run.id, enrollmentId: source.enrollmentId, studentId: source.studentId, totalMarks: roundDecimal(newTotal, gradeScaleVersion.decimalPlaces, gradeScaleVersion.roundingMode), maximumMarks: source.maximumMarks, overallPercentage, overallLetterGrade: overallGrade?.letterGrade ?? null, overallGradePoint: overallGrade?.gradePoint, passedSubjectCount: studentSubjects.length - failedSubjectCount - source.pendingSubjectCount, failedSubjectCount, pendingSubjectCount: source.pendingSubjectCount, resultStatus, promotionEligible: resultStatus === "PASS", calculationDetailJson: { sourceOverallResultId: source.id, adjustmentId: adjustment.id } } });
    }
    await tx.gradebookMarkAdjustment.update({ where: { id: adjustment.id }, data: { status: "APPLIED", appliedAt: new Date(), appliedById: request.userId, appliedValue: newRawMarks, replacementResultRunId: run.id } });
    await writeAuditLog({ ctx: request, action: "gradebook.adjustment.applied", entityType: "GradebookMarkAdjustment", entityId: adjustment.id, branchId: request.branchId, academicYearId: request.academicYearId, after: { sourceResultRunId: target.resultRun.id, replacementResultRunId: run.id, policyVersionHash: adjustment.policyVersionHash }, metadata: { correlationId: request.correlationId } }, tx);
    await enqueueGradebookDomainEvent(tx, request, { eventType: "gradebook.result.adjusted.v1", aggregateType: "GradebookResultRun", aggregateId: run.id, payload: { resultRunId: run.id, supersedesResultRunId: target.resultRun.id, adjustmentId: adjustment.id }, idempotencyKey: `adjustment:${adjustment.id}:applied` });
    return run;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
