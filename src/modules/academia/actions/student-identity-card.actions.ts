"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { requireIdentityCardSchema } from "@/lib/schema-readiness/identity-cards";
import { getTenantContext } from "@/lib/tenant/context";
import {
  deactivateStudentIdentityCardSchema,
  issueStudentIdentityCardSchema,
  studentIdentityCardIdSchema
} from "@/modules/academia/schemas/student-identity-card.schema";
import {
  deactivateStudentIdentityCard,
  getStudentIdentityCard,
  issueStudentIdentityCard,
  recordStudentIdentityCardPrint
} from "@/modules/academia/services/student-identity-card.service";

function actionError(error: unknown, fallbackMessage: string, validationMessage: string) {
  return mapActionError(error, { fallbackMessage, validationMessage });
}

function revalidateStudentCard(studentId?: string) {
  revalidatePath("/academia/students");
  if (studentId) {
    revalidatePath("/academia/students/" + studentId);
    revalidatePath("/academia/students/" + studentId + "/id-card");
  }
}

export async function issueStudentIdentityCardAction(input: unknown) {
  try {
    const parsed = issueStudentIdentityCardSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await issueStudentIdentityCard(ctx, parsed);
    revalidateStudentCard(parsed.studentId);
    return { ok: true, data, message: "Student ID card issued." } as const;
  } catch (error) {
    return actionError(
      error,
      "Unable to issue the Student ID card.",
      "Check the enrollment, card dates, and replacement reason."
    );
  }
}

export async function previewStudentIdentityCardAction(input: unknown) {
  try {
    const parsed = studentIdentityCardIdSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await getStudentIdentityCard(ctx, parsed.cardId);
    return { ok: true, data, message: "Student ID card loaded." } as const;
  } catch (error) {
    return actionError(error, "Unable to open this Student ID card.", "Select an active Student ID card.");
  }
}

export async function recordStudentIdentityCardPrintAction(input: unknown) {
  try {
    const parsed = studentIdentityCardIdSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await recordStudentIdentityCardPrint(ctx, parsed.cardId);
    return { ok: true, data, message: "Student ID card print recorded." } as const;
  } catch (error) {
    return actionError(error, "Unable to prepare this Student ID card for printing.", "Select an active Student ID card.");
  }
}

export async function deactivateStudentIdentityCardAction(input: unknown) {
  try {
    const parsed = deactivateStudentIdentityCardSchema.parse(input);
    const ctx = await getTenantContext();
    await requireIdentityCardSchema();
    const data = await deactivateStudentIdentityCard(ctx, parsed);
    revalidateStudentCard(data.studentId);
    return { ok: true, data, message: "Student ID card deactivated." } as const;
  } catch (error) {
    return actionError(error, "Unable to deactivate this Student ID card.", "Enter a clear deactivation reason.");
  }
}
