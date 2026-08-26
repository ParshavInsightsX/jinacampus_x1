"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import {
  activateAcademicYearSchema,
  adminResetPasswordSchema,
  assignUserBranchSchema,
  assignUserRoleSchema,
  changeOwnPasswordSchema,
  createAcademicYearSchema,
  createBranchSchema,
  createInstitutionSchema,
  createRoleSchema,
  createUserSchema,
  deactivateUserSchema,
  forgotPasswordSchema,
  removeUserBranchSchema,
  removeUserRoleSchema,
  updateAttendanceSettingsSchema,
  updateBranchSchema,
  updateInstitutionSchema,
  updateTenantSettingsSchema,
  updateUserSchema
} from "@/modules/campus-core/schemas";
import {
  activateAcademicYearService,
  adminResetUserPasswordService,
  assignUserBranchService,
  assignUserRoleService,
  changeOwnPasswordService,
  createAcademicYearService,
  createBranchService,
  createInstitutionService,
  createRoleService,
  createUserService,
  deactivateUserService,
  requestPasswordRecoveryService,
  removeUserBranchService,
  removeUserRoleService,
  updateAttendanceSettingsService,
  updateBranchService,
  updateInstitutionService,
  updateTenantSettingsService,
  updateUserService
} from "@/modules/campus-core/services";
import { PASSWORD_RECOVERY_PUBLIC_MESSAGE } from "@/modules/campus-core/password-recovery-policy";

function s(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
function nullableS(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return undefined;
  return value.trim() ? value.trim() : null;
}
function req(formData: FormData, key: string) {
  const value = s(formData, key);
  if (!value) throw new Error(`Missing field: ${key}`);
  return value;
}
function passwordValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
function requiredPasswordValue(formData: FormData, key: string) {
  const value = passwordValue(formData, key);
  if (!value) throw new Error(`Missing field: ${key}`);
  return value;
}
function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

export type CampusCoreFormActionState = {
  ok: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function formError(
  error: unknown,
  fallbackMessage: string,
  validationMessage = "Please check the highlighted fields and try again."
): CampusCoreFormActionState {
  const result = mapActionError(error, {
    fallbackMessage,
    validationMessage
  });

  return {
    ok: false,
    error: result.error,
    fieldErrors: result.fieldErrors
  };
}

function revalidateUserAccessRoutes(userId: string) {
  revalidatePath("/campus-core/users");
  revalidatePath(`/campus-core/users/${userId}`);
  revalidatePath(`/campus-core/users/${userId}/edit`);
  revalidatePath("/dashboard");
}

export async function createInstitutionAction(formData: FormData) {
  const input = createInstitutionSchema.parse({
    name: req(formData, "name"),
    displayName: nullableS(formData, "displayName"),
    code: req(formData, "code"),
    board: s(formData, "board"),
    medium: s(formData, "medium"),
    logoUrl: nullableS(formData, "logoUrl"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    country: s(formData, "country") ?? "India"
  });
  const ctx = await getTenantContext();
  await createInstitutionService(ctx, input);
  revalidatePath("/campus-core/institutions");
}

export async function updateInstitutionAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateInstitutionSchema.parse({
      institutionId: req(formData, "institutionId"),
      name: req(formData, "name"),
      displayName: nullableS(formData, "displayName"),
      code: req(formData, "code"),
      board: s(formData, "board"),
      medium: s(formData, "medium"),
      logoUrl: nullableS(formData, "logoUrl"),
      addressLine1: s(formData, "addressLine1"),
      addressLine2: s(formData, "addressLine2"),
      city: s(formData, "city"),
      state: s(formData, "state"),
      postalCode: s(formData, "postalCode"),
      country: s(formData, "country") ?? "India",
      status: s(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateInstitutionService(ctx, input);
    revalidatePath("/campus-core/institutions");
    revalidatePath(`/campus-core/institutions/${input.institutionId}`);
    revalidatePath(`/campus-core/institutions/${input.institutionId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Institution profile updated." };
  } catch (error) {
    return formError(error, "Unable to update institution. Please try again.");
  }
}

export async function createBranchAction(formData: FormData) {
  const input = createBranchSchema.parse({
    institutionId: req(formData, "institutionId"),
    name: req(formData, "name"),
    code: req(formData, "code"),
    city: s(formData, "city"),
    state: s(formData, "state"),
    phone: s(formData, "phone"),
    email: s(formData, "email"),
    timezone: s(formData, "timezone") ?? "Asia/Kolkata"
  });
  const ctx = await getTenantContext();
  await createBranchService(ctx, input);
  revalidatePath("/campus-core/branches");
}

export async function updateBranchAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateBranchSchema.parse({
      branchId: req(formData, "branchId"),
      institutionId: req(formData, "institutionId"),
      name: req(formData, "name"),
      code: req(formData, "code"),
      addressLine1: s(formData, "addressLine1"),
      addressLine2: s(formData, "addressLine2"),
      city: s(formData, "city"),
      state: s(formData, "state"),
      postalCode: s(formData, "postalCode"),
      phone: s(formData, "phone"),
      email: s(formData, "email"),
      timezone: s(formData, "timezone") ?? "Asia/Kolkata",
      status: s(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateBranchService(ctx, input);
    revalidatePath("/campus-core/branches");
    revalidatePath(`/campus-core/branches/${input.branchId}`);
    revalidatePath(`/campus-core/branches/${input.branchId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "Branch profile updated." };
  } catch (error) {
    return formError(error, "Unable to update branch. Please try again.");
  }
}

export async function createAcademicYearAction(formData: FormData) {
  const input = createAcademicYearSchema.parse({
    institutionId: req(formData, "institutionId"),
    name: req(formData, "name"),
    startDate: req(formData, "startDate"),
    endDate: req(formData, "endDate")
  });
  const ctx = await getTenantContext();
  await createAcademicYearService(ctx, input);
  revalidatePath("/campus-core/academic-years");
}

export async function activateAcademicYearAction(formData: FormData) {
  const input = activateAcademicYearSchema.parse({ academicYearId: req(formData, "academicYearId") });
  const ctx = await getTenantContext();
  await activateAcademicYearService(ctx, input);
  revalidatePath("/campus-core/academic-years");
  revalidatePath("/dashboard");
}

export async function createUserAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = createUserSchema.parse({
      email: req(formData, "email"),
      phone: s(formData, "phone"),
      firstName: req(formData, "firstName"),
      middleName: s(formData, "middleName"),
      lastName: s(formData, "lastName"),
      userType: s(formData, "userType") ?? "STAFF",
      branchIds: formData.getAll("branchIds").filter((v): v is string => typeof v === "string"),
      roleCodes: formData.getAll("roleCodes").filter((v): v is string => typeof v === "string"),
      initialPassword: passwordValue(formData, "initialPassword"),
      confirmInitialPassword: passwordValue(formData, "confirmInitialPassword")
    });
    const ctx = await getTenantContext();
    await createUserService(ctx, input);
    revalidatePath("/campus-core/users");
    revalidatePath("/dashboard");
    return { ok: true, message: "User account created." };
  } catch (error) {
    return formError(error, "Unable to create user. Please try again.");
  }
}

export async function updateUserAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateUserSchema.parse({
      userId: req(formData, "userId"),
      email: req(formData, "email"),
      phone: s(formData, "phone"),
      firstName: req(formData, "firstName"),
      middleName: s(formData, "middleName"),
      lastName: s(formData, "lastName"),
      userType: s(formData, "userType") ?? "STAFF",
      status: s(formData, "status")
    });
    const ctx = await getTenantContext();
    await updateUserService(ctx, input);
    revalidatePath("/campus-core/users");
    revalidatePath(`/campus-core/users/${input.userId}`);
    revalidatePath(`/campus-core/users/${input.userId}/edit`);
    revalidatePath("/dashboard");
    return { ok: true, message: "User profile updated." };
  } catch (error) {
    return formError(error, "Unable to update user. Please try again.");
  }
}

export async function deactivateUserAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = deactivateUserSchema.parse({
      userId: req(formData, "userId"),
      confirmDeactivation: checked(formData, "confirmDeactivation")
    });
    const ctx = await getTenantContext();
    await deactivateUserService(ctx, input);
    revalidateUserAccessRoutes(input.userId);
    return { ok: true, message: "User account deactivated. Active sessions were revoked." };
  } catch (error) {
    return formError(error, "Unable to deactivate user. Please try again.");
  }
}

export async function assignUserRoleAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = assignUserRoleSchema.parse({
      userId: req(formData, "userId"),
      roleId: req(formData, "roleId"),
      scopeType: s(formData, "scopeType") ?? "TENANT",
      scopeId: s(formData, "scopeId") ?? "TENANT"
    });
    const ctx = await getTenantContext();
    await assignUserRoleService(ctx, input);
    revalidateUserAccessRoutes(input.userId);
    return { ok: true, message: "Role assigned." };
  } catch (error) {
    return formError(error, "Unable to assign role. Please try again.");
  }
}

export async function removeUserRoleAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = removeUserRoleSchema.parse({
      userId: req(formData, "userId"),
      roleId: req(formData, "roleId"),
      scopeType: s(formData, "scopeType") ?? "TENANT",
      scopeId: s(formData, "scopeId") ?? "TENANT"
    });
    const ctx = await getTenantContext();
    await removeUserRoleService(ctx, input);
    revalidateUserAccessRoutes(input.userId);
    return { ok: true, message: "Role removed." };
  } catch (error) {
    return formError(error, "Unable to remove role. Please try again.");
  }
}

export async function assignUserBranchAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = assignUserBranchSchema.parse({
      userId: req(formData, "userId"),
      branchId: req(formData, "branchId")
    });
    const ctx = await getTenantContext();
    await assignUserBranchService(ctx, input);
    revalidateUserAccessRoutes(input.userId);
    return { ok: true, message: "Branch access assigned." };
  } catch (error) {
    return formError(error, "Unable to assign branch access. Please try again.");
  }
}

export async function removeUserBranchAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = removeUserBranchSchema.parse({
      userId: req(formData, "userId"),
      branchId: req(formData, "branchId")
    });
    const ctx = await getTenantContext();
    await removeUserBranchService(ctx, input);
    revalidateUserAccessRoutes(input.userId);
    return { ok: true, message: "Branch access removed." };
  } catch (error) {
    return formError(error, "Unable to remove branch access. Please try again.");
  }
}

export async function adminResetUserPasswordAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = adminResetPasswordSchema.parse({
      userId: req(formData, "userId"),
      newPassword: requiredPasswordValue(formData, "newPassword"),
      confirmNewPassword: requiredPasswordValue(formData, "confirmNewPassword")
    });
    const ctx = await getTenantContext();
    await adminResetUserPasswordService(ctx, input);
    revalidatePath("/campus-core/users");
    revalidatePath(`/campus-core/users/${input.userId}`);
    revalidatePath(`/campus-core/users/${input.userId}/reset-password`);
    return { ok: true, message: "Password was reset successfully." };
  } catch (error) {
    return formError(error, "Unable to reset password. Please try again.");
  }
}

export async function changeOwnPasswordAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = changeOwnPasswordSchema.parse({
      currentPassword: requiredPasswordValue(formData, "currentPassword"),
      newPassword: requiredPasswordValue(formData, "newPassword"),
      confirmNewPassword: requiredPasswordValue(formData, "confirmNewPassword")
    });
    await changeOwnPasswordService(
      await getTenantContext({ allowPasswordChangeRequired: true }),
      input
    );
    return { ok: true, message: "Password was updated successfully." };
  } catch (error) {
    return formError(error, "Unable to update password. Please try again.");
  }
}

export async function requestPasswordRecoveryAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = forgotPasswordSchema.parse({
      tenantSlug: formData.get("tenantSlug"),
      email: formData.get("email"),
      ...(formData.has("principalId") ? { principalId: formData.get("principalId") } : {})
    });
    const headerStore = await headers();
    await requestPasswordRecoveryService(input, {
      ipAddress: headerStore.get("x-forwarded-for") ?? undefined,
      userAgent: headerStore.get("user-agent") ?? undefined
    });
    return { ok: true, message: PASSWORD_RECOVERY_PUBLIC_MESSAGE };
  } catch (error) {
    if (error instanceof z.ZodError) return formError(error, "Unable to process this request. Please try again.");
    return { ok: true, message: PASSWORD_RECOVERY_PUBLIC_MESSAGE };
  }
}

export async function createRoleAction(formData: FormData) {
  const input = createRoleSchema.parse({
    code: req(formData, "code"),
    name: req(formData, "name"),
    description: s(formData, "description"),
    scope: s(formData, "scope") ?? "TENANT",
    permissionCodes: formData.getAll("permissionCodes").filter((v): v is string => typeof v === "string")
  });
  const ctx = await getTenantContext();
  await createRoleService(ctx, input);
  revalidatePath("/campus-core/roles");
}

export async function updateTenantSettingsAction(formData: FormData) {
  const input = updateTenantSettingsSchema.parse({
    brandName: req(formData, "brandName"),
    brandByline: s(formData, "brandByline"),
    timezone: s(formData, "timezone") ?? "Asia/Kolkata",
    locale: s(formData, "locale") ?? "en-IN",
    dateFormat: s(formData, "dateFormat") ?? "dd/MM/yyyy",
    currency: s(formData, "currency") ?? "INR",
    allowMultipleActiveAcademicYears: checked(formData, "allowMultipleActiveAcademicYears")
  });
  const ctx = await getTenantContext();
  await updateTenantSettingsService(ctx, input);
  revalidatePath("/campus-core/settings");
  redirect("/campus-core/settings?saved=tenant");
}

export async function updateAttendanceSettingsAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateAttendanceSettingsSchema.parse({
      branchId: req(formData, "branchId"),
      studentAutoLockEnabled: checked(formData, "studentAutoLockEnabled"),
      studentAutoLockTime: s(formData, "studentAutoLockTime") ?? "15:00",
      sendStudentAbsentAlert: checked(formData, "sendStudentAbsentAlert"),
      sendStudentLateAlert: checked(formData, "sendStudentLateAlert"),
      studentAttendanceWhatsAppEnabled: checked(formData, "studentAttendanceWhatsAppEnabled"),
      studentAttendanceNotificationMode: s(formData, "studentAttendanceNotificationMode") ?? "EXCEPTION_ONLY",
      minimumAttendancePercentage: Number(s(formData, "minimumAttendancePercentage") ?? 75),
      staffQrAttendanceEnabled: checked(formData, "staffQrAttendanceEnabled"),
      staffAttendanceCaptureMode: s(formData, "staffAttendanceCaptureMode") ?? "SUPERVISED_QR",
      staffSelfScanEnabled: false,
      staffManualAttendanceEnabled: checked(formData, "staffManualAttendanceEnabled"),
      staffCorrectionApprovalRequired: true,
      staffScanSessionValidityMinutes: Number(s(formData, "staffScanSessionValidityMinutes") ?? 60),
      staffCredentialValidityDays: Number(s(formData, "staffCredentialValidityDays") ?? 365),
      staffCheckInStartTime: s(formData, "staffCheckInStartTime") ?? "07:30",
      staffLateAfterTime: s(formData, "staffLateAfterTime") ?? "08:00",
      staffHalfDayBeforeMinutes: Number(s(formData, "staffHalfDayBeforeMinutes") ?? 240),
      staffMinimumWorkingMinutes: Number(s(formData, "staffMinimumWorkingMinutes") ?? 360),
      staffQrTokenValiditySeconds: Number(s(formData, "staffQrTokenValiditySeconds") ?? 18000),
      staffWeeklySummaryWhatsAppEnabled: checked(formData, "staffWeeklySummaryWhatsAppEnabled"),
      staffWeeklySummarySendDay: Number(s(formData, "staffWeeklySummarySendDay") ?? 1),
      staffWeeklySummarySendTime: s(formData, "staffWeeklySummarySendTime") ?? "09:00",
      staffMonthlySummaryWhatsAppEnabled: checked(formData, "staffMonthlySummaryWhatsAppEnabled"),
      staffMonthlySummarySendDay: Number(s(formData, "staffMonthlySummarySendDay") ?? 1),
      staffMonthlySummarySendTime: s(formData, "staffMonthlySummarySendTime") ?? "09:00"
    });
    const ctx = await getTenantContext();
    await updateAttendanceSettingsService(ctx, input);
  } catch (error) {
    return formError(
      error,
      "Unable to update attendance settings. Please try again.",
      "Review the attendance settings and try again."
    );
  }

  revalidatePath("/campus-core/settings");
  redirect("/campus-core/settings?saved=attendance");
}
