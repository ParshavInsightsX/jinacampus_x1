"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  cancelAcademicCalendarEntrySchema,
  createAcademicCalendarEntrySchema,
  updateAcademicCalendarEntrySchema
} from "./calendar-schemas";
import {
  cancelAcademicCalendarEntry,
  createAcademicCalendarEntry,
  updateAcademicCalendarEntry
} from "./calendar-service";

export type AcademicCalendarActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

function actionError(error: unknown, fallbackMessage: string): AcademicCalendarActionState {
  const mapped = mapActionError(error, { fallbackMessage });
  return { ok: false, message: mapped.error, fieldErrors: mapped.fieldErrors };
}

function entryInput(formData: FormData) {
  return {
    institutionId: formData.get("institutionId"),
    branchId: formData.get("branchId"),
    academicYearId: formData.get("academicYearId"),
    entryType: formData.get("entryType"),
    name: formData.get("name"),
    description: formData.get("description"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    audiences: formData.getAll("audiences")
  };
}

function revalidateCalendar() {
  revalidatePath("/campus-core/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/academia/attendance");
  revalidatePath("/academia/attendance/mark");
  revalidatePath("/academia/attendance/reports");
  revalidatePath("/staffboard/attendance");
  revalidatePath("/staffboard/attendance/me");
  revalidatePath("/staffboard/attendance/reports");
  revalidatePath("/staffboard/leave");
}

export async function createAcademicCalendarEntryAction(
  _state: AcademicCalendarActionState,
  formData: FormData
): Promise<AcademicCalendarActionState> {
  try {
    const input = createAcademicCalendarEntrySchema.parse(entryInput(formData));
    const ctx = await getTenantContext();
    await createAcademicCalendarEntry(ctx, input);
    revalidateCalendar();
    return { ok: true, message: "Calendar entry created and attendance synchronised." };
  } catch (error) {
    return actionError(error, "Unable to create this calendar entry.");
  }
}

export async function updateAcademicCalendarEntryAction(
  _state: AcademicCalendarActionState,
  formData: FormData
): Promise<AcademicCalendarActionState> {
  try {
    const input = updateAcademicCalendarEntrySchema.parse({
      calendarEntryId: formData.get("calendarEntryId"),
      ...entryInput(formData)
    });
    const ctx = await getTenantContext();
    await updateAcademicCalendarEntry(ctx, input);
    revalidateCalendar();
    return { ok: true, message: "Calendar entry updated and attendance re-synchronised." };
  } catch (error) {
    return actionError(error, "Unable to update this calendar entry.");
  }
}

export async function cancelAcademicCalendarEntryAction(
  _state: AcademicCalendarActionState,
  formData: FormData
): Promise<AcademicCalendarActionState> {
  try {
    const input = cancelAcademicCalendarEntrySchema.parse({
      calendarEntryId: formData.get("calendarEntryId"),
      cancellationReason: formData.get("cancellationReason")
    });
    const ctx = await getTenantContext();
    await cancelAcademicCalendarEntry(ctx, input);
    revalidateCalendar();
    return { ok: true, message: "Calendar entry cancelled and generated holiday rows released." };
  } catch (error) {
    return actionError(error, "Unable to cancel this calendar entry.");
  }
}
