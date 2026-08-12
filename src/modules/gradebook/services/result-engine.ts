import { Prisma, type GradebookSubjectResultStatus } from "@prisma/client";
import type { GradeRuleInput, ResultEnginePolicy, SubjectCalculationInput } from "@/modules/gradebook/types/result-engine";
import { decimal, percentage, roundDecimal } from "@/modules/gradebook/utils/decimal";

export const GRADEBOOK_RESULT_ENGINE_VERSION = "1.0.0";

export function evaluateGrade(rules: readonly GradeRuleInput[], score: Prisma.Decimal) {
  const match = rules.find((rule) => score.gte(rule.minimumInclusive) && score.lte(rule.maximumInclusive));
  return match
    ? { letterGrade: match.letterGrade, gradePoint: match.gradePoint, isPassing: match.isPassing }
    : null;
}

export function calculateSubjectResult(
  input: SubjectCalculationInput,
  gradeRules: readonly GradeRuleInput[],
  policy: ResultEnginePolicy
) {
  const blockingStatus = input.components.find((component) => component.specialStatus === "WITHHELD")?.specialStatus;
  if (blockingStatus) {
    return {
      rawMarks: null,
      maximumMarks: input.maximumMarks,
      weightedScore: null,
      percentage: null,
      letterGrade: null,
      gradePoint: null,
      resultStatus: "WITHHELD" as GradebookSubjectResultStatus,
      specialStatus: blockingStatus,
      detail: { reason: "WITHHELD", components: input.components }
    };
  }

  const pending = input.components.find((component) => component.specialStatus === "RESULT_PENDING");
  if (pending || input.components.some((component) => component.marksObtained === null && component.specialStatus === null)) {
    return {
      rawMarks: null,
      maximumMarks: input.maximumMarks,
      weightedScore: null,
      percentage: null,
      letterGrade: null,
      gradePoint: null,
      resultStatus: "PENDING" as GradebookSubjectResultStatus,
      specialStatus: pending?.specialStatus ?? null,
      detail: { reason: "INCOMPLETE_OR_PENDING", components: input.components }
    };
  }

  const allExempt = input.components.every((component) => ["EXEMPTED", "NOT_APPLICABLE"].includes(component.specialStatus ?? ""));
  if (allExempt) {
    const notApplicable = input.components.every((component) => component.specialStatus === "NOT_APPLICABLE");
    return {
      rawMarks: null,
      maximumMarks: null,
      weightedScore: null,
      percentage: null,
      letterGrade: null,
      gradePoint: null,
      resultStatus: notApplicable ? "NOT_APPLICABLE" as GradebookSubjectResultStatus : "EXEMPTED" as GradebookSubjectResultStatus,
      specialStatus: notApplicable ? "NOT_APPLICABLE" as const : "EXEMPTED" as const,
      detail: { reason: notApplicable ? "NOT_APPLICABLE" : "EXEMPTED", components: input.components }
    };
  }

  let rawMarks = decimal(0);
  let effectiveMaximum = decimal(0);
  let weightedScore = decimal(0);
  let forcedFail = false;
  for (const component of input.components) {
    if (component.specialStatus) {
      const treatment = policy.specialStatusTreatment[component.specialStatus]
        ?? (component.specialStatus === "ABSENT" ? "FAIL" : "EXCLUDE");
      if (treatment === "PENDING") {
        return {
          rawMarks: null,
          maximumMarks: input.maximumMarks,
          weightedScore: null,
          percentage: null,
          letterGrade: null,
          gradePoint: null,
          resultStatus: "PENDING" as GradebookSubjectResultStatus,
          specialStatus: component.specialStatus,
          detail: { reason: "SPECIAL_STATUS_PENDING", components: input.components }
        };
      }
      if (treatment === "FAIL") {
        forcedFail = true;
        effectiveMaximum = effectiveMaximum.add(component.maximumMarks);
      }
      continue;
    }
    const marks = decimal(component.marksObtained ?? 0);
    const maximum = decimal(component.maximumMarks);
    rawMarks = rawMarks.add(marks);
    effectiveMaximum = effectiveMaximum.add(maximum);
    if (component.weightagePercent !== null && !maximum.isZero()) {
      weightedScore = weightedScore.add(marks.div(maximum).mul(component.weightagePercent));
    }
    if (component.passingMarks !== null && marks.lt(component.passingMarks)) forcedFail = true;
  }

  const rawPercentage = policy.strategy === "WEIGHTED_COMPONENTS"
    ? roundDecimal(weightedScore, policy.decimalPlaces, policy.roundingMode)
    : percentage(rawMarks, effectiveMaximum, policy.decimalPlaces, policy.roundingMode);
  if (rawPercentage === null) {
    return {
      rawMarks: rawMarks.toString(),
      maximumMarks: effectiveMaximum.toString(),
      weightedScore: null,
      percentage: null,
      letterGrade: null,
      gradePoint: null,
      resultStatus: "PENDING" as GradebookSubjectResultStatus,
      specialStatus: null,
      detail: { reason: "ZERO_DENOMINATOR", components: input.components }
    };
  }
  const grade = evaluateGrade(gradeRules, rawPercentage);
  const passingMarksFailed = input.passingMarks !== null && rawMarks.lt(input.passingMarks);
  const passed = !forcedFail && !passingMarksFailed && (grade?.isPassing ?? true);
  return {
    rawMarks: roundDecimal(rawMarks, policy.decimalPlaces, policy.roundingMode).toString(),
    maximumMarks: roundDecimal(effectiveMaximum, policy.decimalPlaces, policy.roundingMode).toString(),
    weightedScore: policy.strategy === "WEIGHTED_COMPONENTS" ? rawPercentage.toString() : null,
    percentage: rawPercentage.toString(),
    letterGrade: grade?.letterGrade ?? null,
    gradePoint: grade?.gradePoint ?? null,
    resultStatus: passed ? "PASS" as GradebookSubjectResultStatus : "FAIL" as GradebookSubjectResultStatus,
    specialStatus: null,
    detail: {
      strategy: policy.strategy,
      roundingMode: policy.roundingMode,
      decimalPlaces: policy.decimalPlaces,
      forcedFail,
      passingMarksFailed,
      components: input.components
    }
  };
}
