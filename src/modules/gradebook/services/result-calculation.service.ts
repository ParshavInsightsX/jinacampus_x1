import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import { createResultRunSchema, resultRunIdSchema } from "@/modules/gradebook/schemas/result.schemas";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { calculateSubjectResult, evaluateGrade, GRADEBOOK_RESULT_ENGINE_VERSION } from "@/modules/gradebook/services/result-engine";
import { resolveGradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import type { GradeRuleInput, ResultEnginePolicy } from "@/modules/gradebook/types/result-engine";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";
import { decimal, percentage, roundDecimal } from "@/modules/gradebook/utils/decimal";

const calculationRulesSchema = z.object({
  requireAllSubjectsPassing: z.boolean().default(true),
  minimumOverallPercentage: z.number().min(0).max(100).optional(),
  allowPendingResults: z.boolean().default(false),
  specialStatusTreatment: z.record(z.enum(["EXCLUDE", "PENDING", "FAIL", "NO_DENOMINATOR"])).default({})
}).strict();

function conflict(code: string) {
  return new AppError(code, code, 409);
}

export async function getResultReadiness(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.view_preview", feature: "resultCalculation" });
  const data = createResultRunSchema.parse(input);
  const exam = await db.gradebookExam.findFirst({
    where: { id: data.examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
    include: {
      gradeScaleVersion: { include: { rules: true } },
      calculationRuleSetVersion: true,
      subjects: { include: { components: true } },
      classSections: { where: { id: data.examClassSectionId } },
      teacherAssignments: {
        where: { examClassSectionId: data.examClassSectionId, status: "ACTIVE", isPrimary: true },
        include: { markEntryBatches: true }
      }
    }
  });
  if (!exam || exam.classSections.length !== 1) throw notFound("GRADEBOOK_EXAM_SCOPE_NOT_FOUND");
  const blockers: Array<{ code: string; message: string }> = [];
  if (!exam.gradeScaleVersion) blockers.push({ code: "GRADE_SCALE_REQUIRED", message: "The exam has no frozen grade scale." });
  if (!exam.calculationRuleSetVersion) blockers.push({ code: "CALCULATION_RULES_REQUIRED", message: "The exam has no frozen calculation rules." });
  const expectedScopes = exam.subjects.length;
  const assignedSubjects = new Set(exam.teacherAssignments.map((assignment) => assignment.examSubjectId));
  if (assignedSubjects.size < expectedScopes) blockers.push({ code: "ASSIGNMENTS_INCOMPLETE", message: "Teacher assignments are incomplete." });
  if (exam.teacherAssignments.some((assignment) => assignment.markEntryBatches.length !== 1
    || !["APPROVED", "LOCKED"].includes(assignment.markEntryBatches[0]?.status ?? ""))) {
    blockers.push({ code: "MARK_BATCHES_NOT_APPROVED", message: "All required marks batches must be approved or locked." });
  }
  return { exam, ready: blockers.length === 0, blockers };
}

export async function createAndCalculateResultRun(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.calculate", feature: "resultCalculation" });
  const data = createResultRunSchema.parse(input);
  const readiness = await getResultReadiness(ctx, data);
  if (!readiness.ready) throw new AppError("GRADEBOOK_RESULT_INPUTS_NOT_APPROVED", "GRADEBOOK_RESULT_INPUTS_NOT_APPROVED", 409);
  const exam = readiness.exam;
  if (!exam.gradeScaleVersion || !exam.calculationRuleSetVersion) throw new AppError("GRADEBOOK_RESULT_CONFIGURATION_MISSING", "GRADEBOOK_RESULT_CONFIGURATION_MISSING", 409);
  const gradeScaleVersion = exam.gradeScaleVersion;
  const calculationRuleSetVersion = exam.calculationRuleSetVersion;

  const batches = exam.teacherAssignments.flatMap((assignment) => assignment.markEntryBatches);
  const inputSnapshotHash = hashCanonicalJson(batches.map((batch) => ({ id: batch.id, version: batch.version, snapshotHash: batch.snapshotHash })).sort((a, b) => a.id.localeCompare(b.id)));
  const configurationSnapshot = {
    examId: exam.id,
    examVersion: exam.version,
    gradeScaleVersionId: gradeScaleVersion.id,
    gradeScaleHash: gradeScaleVersion.configurationHash,
    calculationRuleSetVersionId: calculationRuleSetVersion.id,
    calculationHash: calculationRuleSetVersion.configurationHash,
    subjects: exam.subjects.map((subject) => ({
      id: subject.id,
      maximumMarks: subject.maximumMarks?.toString() ?? null,
      passingMarks: subject.passingMarks?.toString() ?? null,
      components: subject.components.map((component) => ({
        id: component.id,
        maximumMarks: component.maximumMarks.toString(),
        passingMarks: component.passingMarks?.toString() ?? null,
        weightagePercent: component.weightagePercent?.toString() ?? null
      }))
    }))
  };
  const configurationHash = hashCanonicalJson(configurationSnapshot);
  const idempotencyKey = hashCanonicalJson({ tenantId: request.tenantId, examId: exam.id, examClassSectionId: data.examClassSectionId, inputSnapshotHash, configurationHash, engineVersion: GRADEBOOK_RESULT_ENGINE_VERSION });

  const existing = await db.gradebookResultRun.findUnique({ where: { idempotencyKey } });
  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const run = await tx.gradebookResultRun.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        examId: exam.id,
        examClassSectionId: data.examClassSectionId,
        inputSnapshotHash,
        configurationHash,
        engineVersion: GRADEBOOK_RESULT_ENGINE_VERSION,
        idempotencyKey,
        status: "RUNNING",
        startedById: request.userId,
        startedAt: new Date(),
        configurationSnapshotJson: configurationSnapshot
      }
    });
    const batchIds = batches.map((batch) => batch.id);
    const marks = await tx.gradebookStudentMark.findMany({ where: { tenantId: request.tenantId, markEntryBatchId: { in: batchIds } } });
    const roster = await tx.enrollment.findMany({
      where: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        classSectionId: exam.classSections[0]?.classSectionId,
        status: "ACTIVE",
        student: { tenantId: request.tenantId, branchId: request.branchId, status: "ACTIVE" }
      },
      select: { id: true, studentId: true }
    });
    const markByKey = new Map<string, typeof marks[number]>();
    for (const mark of marks) {
      const key = `${mark.enrollmentId}:${mark.examSubjectComponentId}`;
      if (markByKey.has(key)) throw conflict("GRADEBOOK_DUPLICATE_APPROVED_MARK_INPUT");
      markByKey.set(key, mark);
    }
    const rules = calculationRulesSchema.parse(calculationRuleSetVersion.rulesJson);
    const policy: ResultEnginePolicy = {
      strategy: calculationRuleSetVersion.strategy,
      roundingMode: gradeScaleVersion.roundingMode,
      decimalPlaces: gradeScaleVersion.decimalPlaces,
      requireAllSubjectsPassing: rules.requireAllSubjectsPassing,
      minimumOverallPercentage: rules.minimumOverallPercentage,
      allowPendingResults: rules.allowPendingResults,
      specialStatusTreatment: rules.specialStatusTreatment
    };
    const gradeRules: GradeRuleInput[] = gradeScaleVersion.rules.map((rule) => ({
      minimumInclusive: rule.minimumInclusive.toString(),
      maximumInclusive: rule.maximumInclusive.toString(),
      letterGrade: rule.letterGrade,
      gradePoint: rule.gradePoint?.toString() ?? null,
      isPassing: rule.isPassing
    }));

    let passCount = 0;
    let failCount = 0;
    let pendingCount = 0;
    for (const enrollment of roster) {
      const subjectOutcomes = [];
      for (const subject of exam.subjects) {
        const result = calculateSubjectResult({
          examSubjectId: subject.id,
          maximumMarks: subject.maximumMarks?.toString() ?? subject.components.reduce((sum, component) => sum.add(component.maximumMarks), decimal(0)).toString(),
          passingMarks: subject.passingMarks?.toString() ?? null,
          components: subject.components.map((component) => {
            const mark = markByKey.get(`${enrollment.id}:${component.id}`);
            return {
              componentId: component.id,
              maximumMarks: component.maximumMarks.toString(),
              passingMarks: component.passingMarks?.toString() ?? null,
              weightagePercent: component.weightagePercent?.toString() ?? null,
              marksObtained: mark?.marksObtained?.toString() ?? null,
              specialStatus: mark?.specialStatus ?? null
            };
          })
        }, gradeRules, policy);
        await tx.gradebookStudentSubjectResult.create({
          data: {
            tenantId: request.tenantId,
            resultRunId: run.id,
            enrollmentId: enrollment.id,
            studentId: enrollment.studentId,
            examSubjectId: subject.id,
            rawMarks: result.rawMarks,
            maximumMarks: result.maximumMarks,
            weightedScore: result.weightedScore,
            percentage: result.percentage,
            letterGrade: result.letterGrade,
            gradePoint: result.gradePoint,
            resultStatus: result.resultStatus,
            specialStatus: result.specialStatus,
            calculationDetailJson: result.detail as Prisma.InputJsonValue
          }
        });
        subjectOutcomes.push(result);
      }
      const numericSubjects = subjectOutcomes.filter((result) => result.rawMarks !== null && result.maximumMarks !== null);
      const totalMarks = numericSubjects.reduce((sum, result) => sum.add(result.rawMarks ?? 0), decimal(0));
      const maximumMarks = numericSubjects.reduce((sum, result) => sum.add(result.maximumMarks ?? 0), decimal(0));
      const overallPercentage = percentage(totalMarks, maximumMarks, policy.decimalPlaces, policy.roundingMode);
      const passedSubjects = subjectOutcomes.filter((result) => result.resultStatus === "PASS").length;
      const failedSubjects = subjectOutcomes.filter((result) => result.resultStatus === "FAIL").length;
      const pendingSubjects = subjectOutcomes.filter((result) => ["PENDING", "WITHHELD"].includes(result.resultStatus)).length;
      const overallGrade = overallPercentage ? evaluateGrade(gradeRules, overallPercentage) : null;
      const minimumFailed = policy.minimumOverallPercentage !== undefined && overallPercentage !== null && overallPercentage.lt(policy.minimumOverallPercentage);
      const status = pendingSubjects > 0
        ? (subjectOutcomes.some((result) => result.resultStatus === "WITHHELD") ? "WITHHELD" : "PENDING")
        : ((policy.requireAllSubjectsPassing && failedSubjects > 0) || minimumFailed || overallGrade?.isPassing === false ? "FAIL" : "PASS");
      if (status === "PASS") passCount += 1;
      else if (status === "FAIL") failCount += 1;
      else pendingCount += 1;
      await tx.gradebookStudentOverallResult.create({
        data: {
          tenantId: request.tenantId,
          resultRunId: run.id,
          enrollmentId: enrollment.id,
          studentId: enrollment.studentId,
          totalMarks: roundDecimal(totalMarks, policy.decimalPlaces, policy.roundingMode),
          maximumMarks: roundDecimal(maximumMarks, policy.decimalPlaces, policy.roundingMode),
          overallPercentage,
          overallLetterGrade: overallGrade?.letterGrade ?? null,
          overallGradePoint: overallGrade?.gradePoint,
          passedSubjectCount: passedSubjects,
          failedSubjectCount: failedSubjects,
          pendingSubjectCount: pendingSubjects,
          resultStatus: status,
          promotionEligible: status === "PASS",
          calculationDetailJson: {
            engineVersion: GRADEBOOK_RESULT_ENGINE_VERSION,
            policy,
            subjectCount: subjectOutcomes.length
          } as Prisma.InputJsonValue
        }
      });
    }
    const summary = { studentCount: roster.length, passCount, failCount, pendingCount };
    const completed = await tx.gradebookResultRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date(), summaryJson: summary } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.RESULT_RUN_COMPLETED,
      entityType: "GradebookResultRun",
      entityId: run.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { status: completed.status, inputSnapshotHash, configurationHash, engineVersion: GRADEBOOK_RESULT_ENGINE_VERSION, ...summary },
      metadata: { correlationId: request.correlationId }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: "gradebook.result.calculated.v1",
      aggregateType: "GradebookResultRun",
      aggregateId: run.id,
      payload: { resultRunId: run.id, examId: exam.id, ...summary },
      idempotencyKey: `result-run:${run.id}:calculated`
    });
    return completed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 });
}

export async function approveResultRun(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.approve", feature: "resultCalculation" });
  const { resultRunId } = resultRunIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const run = await tx.gradebookResultRun.findFirst({
      where: { id: resultRunId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId }
    });
    if (!run) throw notFound("GRADEBOOK_RESULT_RUN_NOT_FOUND");
    if (!["COMPLETED", "UNDER_REVIEW"].includes(run.status)) throw conflict("GRADEBOOK_RESULT_RUN_NOT_APPROVABLE");
    if (run.startedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
    const updated = await tx.gradebookResultRun.update({ where: { id: run.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.RESULT_RUN_APPROVED,
      entityType: "GradebookResultRun",
      entityId: run.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: run.status },
      after: { status: updated.status, approvedAt: updated.approvedAt },
      metadata: { correlationId: request.correlationId, inputSnapshotHash: run.inputSnapshotHash, configurationHash: run.configurationHash }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: "gradebook.result.approved.v1",
      aggregateType: "GradebookResultRun",
      aggregateId: run.id,
      payload: { resultRunId: run.id, examId: run.examId },
      idempotencyKey: `result-run:${run.id}:approved`
    });
    return updated;
  });
}
