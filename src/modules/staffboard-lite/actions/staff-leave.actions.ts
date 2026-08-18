"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  adjustStaffLeaveBalanceSchema,
  cancelStaffLeaveSchema,
  createStaffLeaveApplicationSchema,
  setStaffLeaveApproverSchema,
  staffLeaveReviewSchema,
  staffLeaveSettingSchema,
  updateStaffLeaveApplicationSchema,
  upsertStaffLeaveTypeSchema,
  withdrawStaffLeaveSchema
} from "@/modules/staffboard-lite/schemas";
import {
  adjustStaffLeaveBalance,
  cancelApprovedStaffLeave,
  reviewStaffLeaveApplication,
  setStaffLeaveApprover,
  submitStaffLeaveApplication,
  updateStaffLeaveApplication,
  updateStaffLeaveSetting,
  upsertStaffLeaveType,
  withdrawStaffLeaveApplication
} from "@/modules/staffboard-lite/services/staff-leave.service";

export type StaffLeaveActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[]>;
};

const initialError = (error: unknown, fallbackMessage: string): StaffLeaveActionState => {
  const mapped = mapActionError(error, { fallbackMessage });
  return { ok: false, message: mapped.error, fieldErrors: mapped.fieldErrors };
};

function checked(formData: FormData, field: string) {
  return formData.get(field) === "on";
}

function revalidateLeave(applicationId?: string) {
  revalidatePath("/staffboard");
  revalidatePath("/staffboard/leave");
  revalidatePath("/staffboard/attendance");
  revalidatePath("/staffboard/attendance/reports");
  if (applicationId) revalidatePath(`/staffboard/leave/${applicationId}`);
}

export async function saveStaffLeaveApplicationAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const applicationId = formData.get("applicationId");
    const baseInput = {
      leaveTypeId: formData.get("leaveTypeId"),
      startDate: formData.get("startDate"),
      endDate: formData.get("endDate"),
      duration: formData.get("duration"),
      reason: formData.get("reason")
    };
    const ctx = await getTenantContext();
    if (typeof applicationId === "string" && applicationId) {
      const input = updateStaffLeaveApplicationSchema.parse({
        applicationId,
        ...baseInput,
        staffClarification: formData.get("staffClarification")
      });
      await updateStaffLeaveApplication(ctx, input);
      revalidateLeave(applicationId);
      return { ok: true, message: "Leave application updated and returned for review." };
    }
    const input = createStaffLeaveApplicationSchema.parse(baseInput);
    await submitStaffLeaveApplication(ctx, input);
    revalidateLeave();
    return { ok: true, message: "Leave application submitted." };
  } catch (error) {
    return initialError(error, "Unable to save the leave application.");
  }
}

export async function reviewStaffLeaveApplicationAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = staffLeaveReviewSchema.parse({
      applicationId: formData.get("applicationId"),
      decision: formData.get("decision"),
      remarks: formData.get("remarks")
    });
    const ctx = await getTenantContext();
    await reviewStaffLeaveApplication(ctx, input);
    revalidateLeave(input.applicationId);
    return { ok: true, message: input.decision === "APPROVE" ? "Leave approved and attendance synchronised." : "Leave application updated." };
  } catch (error) {
    return initialError(error, "Unable to review this leave application.");
  }
}

export async function withdrawStaffLeaveApplicationAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = withdrawStaffLeaveSchema.parse({
      applicationId: formData.get("applicationId"),
      remarks: formData.get("remarks")
    });
    const ctx = await getTenantContext();
    await withdrawStaffLeaveApplication(ctx, input);
    revalidateLeave(input.applicationId);
    return { ok: true, message: "Leave application withdrawn." };
  } catch (error) {
    return initialError(error, "Unable to withdraw this leave application.");
  }
}

export async function cancelStaffLeaveApplicationAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = cancelStaffLeaveSchema.parse({
      applicationId: formData.get("applicationId"),
      remarks: formData.get("remarks")
    });
    const ctx = await getTenantContext();
    await cancelApprovedStaffLeave(ctx, input);
    revalidateLeave(input.applicationId);
    return { ok: true, message: "Approved leave cancelled and future attendance placeholders released." };
  } catch (error) {
    return initialError(error, "Unable to cancel this approved leave.");
  }
}

export async function updateStaffLeaveSettingAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = staffLeaveSettingSchema.parse({
      branchId: formData.get("branchId"),
      allowHalfDay: checked(formData, "allowHalfDay"),
      allowBackdatedApplications: checked(formData, "allowBackdatedApplications"),
      minimumNoticeDays: formData.get("minimumNoticeDays"),
      maximumConsecutiveDays: formData.get("maximumConsecutiveDays"),
      nonWorkingWeekdays: formData.getAll("nonWorkingWeekdays"),
      approvalMode: formData.get("approvalMode"),
      whatsappNotificationsEnabled: checked(formData, "whatsappNotificationsEnabled")
    });
    const ctx = await getTenantContext();
    await updateStaffLeaveSetting(ctx, input);
    revalidatePath("/staffboard/leave/settings");
    return { ok: true, message: "Leave policy saved." };
  } catch (error) {
    return initialError(error, "Unable to save the leave policy.");
  }
}

export async function upsertStaffLeaveTypeAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const leaveTypeId = formData.get("leaveTypeId");
    const input = upsertStaffLeaveTypeSchema.parse({
      leaveTypeId: typeof leaveTypeId === "string" && leaveTypeId ? leaveTypeId : undefined,
      branchId: formData.get("branchId"),
      code: formData.get("code"),
      name: formData.get("name"),
      isPaid: checked(formData, "isPaid"),
      balanceTracked: checked(formData, "balanceTracked"),
      annualLimit: formData.get("annualLimit"),
      carryForwardLimit: formData.get("carryForwardLimit"),
      allowHalfDay: checked(formData, "allowHalfDay"),
      supportingDocumentRequired: checked(formData, "supportingDocumentRequired"),
      documentRequiredAfterDays: formData.get("documentRequiredAfterDays"),
      isActive: checked(formData, "isActive")
    });
    const ctx = await getTenantContext();
    await upsertStaffLeaveType(ctx, input);
    revalidatePath("/staffboard/leave");
    revalidatePath("/staffboard/leave/settings");
    return { ok: true, message: "Leave type saved." };
  } catch (error) {
    return initialError(error, "Unable to save this leave type.");
  }
}

export async function setStaffLeaveApproverAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = setStaffLeaveApproverSchema.parse({
      branchId: formData.get("branchId"),
      userId: formData.get("userId"),
      isActive: formData.get("isActive") === "true"
    });
    const ctx = await getTenantContext();
    await setStaffLeaveApprover(ctx, input);
    revalidatePath("/staffboard/leave/settings");
    return { ok: true, message: input.isActive ? "Leave approver enabled." : "Leave approver disabled." };
  } catch (error) {
    return initialError(error, "Unable to update this leave approver.");
  }
}

export async function adjustStaffLeaveBalanceAction(
  _state: StaffLeaveActionState,
  formData: FormData
): Promise<StaffLeaveActionState> {
  try {
    const input = adjustStaffLeaveBalanceSchema.parse({
      branchId: formData.get("branchId"),
      staffId: formData.get("staffId"),
      leaveTypeId: formData.get("leaveTypeId"),
      year: formData.get("year"),
      adjustmentDays: formData.get("adjustmentDays"),
      reason: formData.get("reason")
    });
    const ctx = await getTenantContext();
    await adjustStaffLeaveBalance(ctx, input);
    revalidatePath("/staffboard/leave");
    revalidatePath("/staffboard/leave/settings");
    return { ok: true, message: "Leave balance adjustment recorded." };
  } catch (error) {
    return initialError(error, "Unable to adjust this leave balance.");
  }
}
