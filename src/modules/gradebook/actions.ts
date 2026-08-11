"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  assignClassSectionSubjectSchema,
  cancelGradebookAssessmentSchema,
  createGradebookAssessmentSchema,
  gradebookAssessmentIdSchema,
  reopenGradebookAssessmentSchema,
  saveGradebookMarksSchema,
  updateClassSectionSubjectSchema
} from "@/modules/gradebook/schemas";
import {
  assignClassSectionSubject,
  cancelGradebookAssessment,
  createGradebookAssessment,
  publishGradebookAssessment,
  reopenGradebookAssessment,
  saveGradebookMarks,
  updateClassSectionSubject
} from "@/modules/gradebook/services";

export type GradebookActionResult<T = undefined> =
  | { ok: true; data: T; message: string }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

function gradebookActionError(error: unknown): GradebookActionResult<never> {
  return mapActionError(error, {
    fallbackMessage: "Unable to complete the GradeBook action. Please try again.",
    validationMessage: "Review the GradeBook details and correct the highlighted fields."
  });
}

function revalidateGradebookPaths(assessmentId?: string) {
  revalidatePath("/gradebook");
  revalidatePath("/gradebook/reports");
  revalidatePath("/dashboard");
  if (assessmentId) revalidatePath(`/gradebook/assessments/${assessmentId}`);
}

export async function assignClassSectionSubjectAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = assignClassSectionSubjectSchema.parse(input);
    const result = await assignClassSectionSubject(await getTenantContext(), parsed);
    revalidateGradebookPaths();
    return { ok: true, data: { id: result.id }, message: "Subject assigned to the class-section." };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function updateClassSectionSubjectAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = updateClassSectionSubjectSchema.parse(input);
    const result = await updateClassSectionSubject(await getTenantContext(), parsed);
    revalidateGradebookPaths();
    return { ok: true, data: { id: result.id }, message: "Class subject assignment updated." };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function createGradebookAssessmentAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = createGradebookAssessmentSchema.parse(input);
    const result = await createGradebookAssessment(await getTenantContext(), parsed);
    revalidateGradebookPaths(result.id);
    return { ok: true, data: { id: result.id }, message: "Assessment created and ready for marks entry." };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function saveGradebookMarksAction(input: unknown): Promise<GradebookActionResult<{ savedCount: number }>> {
  try {
    const parsed = saveGradebookMarksSchema.parse(input);
    const result = await saveGradebookMarks(await getTenantContext(), parsed);
    revalidateGradebookPaths(parsed.assessmentId);
    return {
      ok: true,
      data: { savedCount: result.savedCount },
      message: `Saved results for ${result.savedCount} student${result.savedCount === 1 ? "" : "s"}.`
    };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function publishGradebookAssessmentAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = gradebookAssessmentIdSchema.parse(input);
    const result = await publishGradebookAssessment(await getTenantContext(), parsed);
    revalidateGradebookPaths(result.id);
    return { ok: true, data: { id: result.id }, message: "Assessment results published." };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function reopenGradebookAssessmentAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = reopenGradebookAssessmentSchema.parse(input);
    const result = await reopenGradebookAssessment(await getTenantContext(), parsed);
    revalidateGradebookPaths(result.id);
    return { ok: true, data: { id: result.id }, message: "Assessment reopened for correction." };
  } catch (error) {
    return gradebookActionError(error);
  }
}

export async function cancelGradebookAssessmentAction(input: unknown): Promise<GradebookActionResult<{ id: string }>> {
  try {
    const parsed = cancelGradebookAssessmentSchema.parse(input);
    const result = await cancelGradebookAssessment(await getTenantContext(), parsed);
    revalidateGradebookPaths(result.id);
    return { ok: true, data: { id: result.id }, message: "Assessment cancelled. Existing result history is retained." };
  } catch (error) {
    return gradebookActionError(error);
  }
}
