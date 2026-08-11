"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  createStudentPromotionBatchSchema,
  reverseStudentPromotionBatchSchema
} from "@/modules/academia/schemas";
import {
  createStudentPromotionBatch,
  reverseStudentPromotionBatch
} from "@/modules/academia/services/student-promotion.service";

export type StudentPromotionActionResult<T> =
  | { ok: true; data: T; message: string }
  | { ok: false; code: string; error: string; fieldErrors?: Record<string, string[]> };

function promotionActionError(error: unknown): StudentPromotionActionResult<never> {
  return mapActionError(error, {
    fallbackMessage: "Unable to complete the promotion action. Please try again.",
    validationMessage: "Review the promotion details and correct the highlighted fields."
  });
}

function revalidatePromotionPaths() {
  revalidatePath("/academia");
  revalidatePath("/academia/promotions");
  revalidatePath("/academia/students");
  revalidatePath("/academia/enrollments");
  revalidatePath("/academia/attendance");
  revalidatePath("/academia/attendance/mark");
  revalidatePath("/academia/attendance/reports");
  revalidatePath("/dashboard");
}

export async function createStudentPromotionBatchAction(input: unknown) {
  try {
    const parsedInput = createStudentPromotionBatchSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await createStudentPromotionBatch(ctx, parsedInput);
    revalidatePromotionPaths();
    return {
      ok: true,
      data,
      message: `Promotion decisions saved for ${data.selectedCount} student${data.selectedCount === 1 ? "" : "s"}.`
    } as const;
  } catch (error) {
    return promotionActionError(error);
  }
}

export async function reverseStudentPromotionBatchAction(input: unknown) {
  try {
    const parsedInput = reverseStudentPromotionBatchSchema.parse(input);
    const ctx = await getTenantContext();
    const data = await reverseStudentPromotionBatch(ctx, parsedInput);
    revalidatePromotionPaths();
    return {
      ok: true,
      data,
      message: "Promotion batch reversed. New-year enrollments were cancelled and prior lifecycle states restored."
    } as const;
  } catch (error) {
    return promotionActionError(error);
  }
}
