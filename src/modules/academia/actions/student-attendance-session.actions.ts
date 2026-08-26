"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  completeStudentAttendanceSessionSchema,
  correctStudentAttendanceSessionEntrySchema,
  markRemainingStudentsPresentSchema,
  mutateStudentAttendanceEntrySchema,
  prepareStudentAttendanceSessionSchema,
  undoStudentAttendanceBulkSchema
} from "@/modules/academia/schemas";
import {
  completeStudentAttendanceSession,
  correctStudentAttendanceSessionEntry,
  markRemainingStudentsPresent,
  mutateStudentAttendanceEntry,
  prepareStudentAttendanceSession,
  undoStudentAttendanceBulk
} from "@/modules/academia/services/student-attendance-session.service";

function actionError(error: unknown) {
  return mapActionError(error, {
    fallbackMessage: "Unable to save student attendance. Please try again.",
    validationMessage: "Please check the attendance details and try again."
  });
}

export async function prepareStudentAttendanceSessionAction(input: unknown) {
  try {
    const data = prepareStudentAttendanceSessionSchema.parse(input);
    const ctx = await getTenantContext();
    return { ok: true, data: await prepareStudentAttendanceSession(ctx, data) } as const;
  } catch (error) {
    return actionError(error);
  }
}

export async function mutateStudentAttendanceEntryAction(input: unknown) {
  try {
    const data = mutateStudentAttendanceEntrySchema.parse(input);
    const ctx = await getTenantContext();
    return { ok: true, data: await mutateStudentAttendanceEntry(ctx, data) } as const;
  } catch (error) {
    return actionError(error);
  }
}

export async function markRemainingStudentsPresentAction(input: unknown) {
  try {
    const data = markRemainingStudentsPresentSchema.parse(input);
    const ctx = await getTenantContext();
    return { ok: true, data: await markRemainingStudentsPresent(ctx, data) } as const;
  } catch (error) {
    return actionError(error);
  }
}

export async function undoStudentAttendanceBulkAction(input: unknown) {
  try {
    const data = undoStudentAttendanceBulkSchema.parse(input);
    const ctx = await getTenantContext();
    return { ok: true, data: await undoStudentAttendanceBulk(ctx, data) } as const;
  } catch (error) {
    return actionError(error);
  }
}

export async function completeStudentAttendanceSessionAction(input: unknown) {
  try {
    const data = completeStudentAttendanceSessionSchema.parse(input);
    const ctx = await getTenantContext();
    const result = await completeStudentAttendanceSession(ctx, data);
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    return { ok: true, data: result } as const;
  } catch (error) {
    return actionError(error);
  }
}

export async function correctStudentAttendanceSessionEntryAction(input: unknown) {
  try {
    const data = correctStudentAttendanceSessionEntrySchema.parse(input);
    const ctx = await getTenantContext();
    const result = await correctStudentAttendanceSessionEntry(ctx, data);
    revalidatePath("/academia/attendance");
    revalidatePath("/academia/attendance/mark");
    revalidatePath("/academia/attendance/reports");
    revalidatePath("/dashboard");
    return { ok: true, data: result } as const;
  } catch (error) {
    return actionError(error);
  }
}
