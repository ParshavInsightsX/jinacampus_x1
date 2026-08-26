"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getPlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";
import {
  createSchoolSchema,
  deactivateSchoolSchema,
  deleteSchoolSchema,
  reactivateSchoolSchema,
  updateInstitutionEntitlementsSchema,
  updateInstitutionLogoSchema,
  updateSchoolIdSchema,
  updateSchoolSchema,
  updateTenantSubscriptionSchema
} from "@/modules/campus-core/administrator-schemas";
import {
  createSchool,
  changePlatformAdministratorPassword,
  deactivateSchool,
  deleteSchoolPermanently,
  reactivateSchool,
  updateSchool,
  updateSchoolId
} from "@/modules/campus-core/administrator-services";
import { updateInstitutionLogoForAdministrator } from "@/modules/campus-core/administrator-branding.service";
import {
  updateInstitutionEntitlementsForAdministrator,
  updateTenantSubscriptionForAdministrator
} from "@/modules/campus-core/entitlements/administrator.service";
import {
  INSTITUTION_ENTITLEMENT_DEFINITIONS,
  entitlementFormFieldName
} from "@/modules/campus-core/entitlements/catalog";
import type { CampusCoreFormActionState } from "@/modules/campus-core/actions";
import { changeOwnPasswordSchema } from "@/modules/campus-core/schemas";
import {
  principalRecoveryApproveSchema,
  principalRecoveryRejectSchema
} from "@/modules/campus-core/principal-password-recovery.schemas";
import {
  approvePrincipalPasswordRecovery,
  rejectPrincipalPasswordRecovery
} from "@/modules/campus-core/principal-password-recovery.service";

export type PrincipalRecoveryActionState = CampusCoreFormActionState & {
  oneTimeCredential?: {
    type: "RESET_LINK" | "TEMPORARY_PASSWORD";
    value: string;
    deliveryTarget: string | null;
    expiresAt: string | null;
  };
};

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

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function optionalChecked(formData: FormData, key: string) {
  if (!formData.has(key)) return undefined;
  return formData.getAll(key).includes("on");
}

function passwordValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formError(error: unknown, fallbackMessage: string): CampusCoreFormActionState {
  const result = mapActionError(error, {
    fallbackMessage,
    validationMessage: "Please check the highlighted fields and try again."
  });

  return {
    ok: false,
    error: result.error,
    fieldErrors: result.fieldErrors
  };
}

function revalidateAdministratorSchoolRoutes(tenantId?: string) {
  revalidatePath("/administrator");
  revalidatePath("/administrator/schools");
  revalidatePath("/administrator/schools/create");
  if (tenantId) {
    revalidatePath(`/administrator/schools/${tenantId}`);
    revalidatePath(`/administrator/schools/${tenantId}/edit`);
  }
}

export async function createSchoolAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = createSchoolSchema.parse({
      name: req(formData, "name"),
      schoolId: req(formData, "schoolId"),
      institutionDisplayName: nullableS(formData, "institutionDisplayName"),
      supportEmail: s(formData, "supportEmail"),
      status: s(formData, "status") ?? "ACTIVE",
      principalFirstName: s(formData, "principalFirstName"),
      principalLastName: s(formData, "principalLastName"),
      principalEmail: s(formData, "principalEmail"),
      principalInitialPassword: s(formData, "principalInitialPassword"),
      confirmPrincipalInitialPassword: s(formData, "confirmPrincipalInitialPassword")
    });
    const school = await createSchool(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(school.id);
    return { ok: true, message: "School created. Default institution, branch, roles, and attendance settings were prepared." };
  } catch (error) {
    return formError(error, "Unable to create school. Please try again.");
  }
}

export async function updateSchoolAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateSchoolSchema.parse({
      tenantId: req(formData, "tenantId"),
      name: s(formData, "name"),
      legalName: nullableS(formData, "legalName"),
      supportEmail: nullableS(formData, "supportEmail"),
      status: s(formData, "status"),
      institutionDisplayName: nullableS(formData, "institutionDisplayName"),
      gradebookEnabled: optionalChecked(formData, "gradebookEnabled"),
      gradebookConfigurationEnabled: optionalChecked(formData, "gradebookConfigurationEnabled"),
      gradebookMarksEntryEnabled: optionalChecked(formData, "gradebookMarksEntryEnabled"),
      gradebookImportEnabled: optionalChecked(formData, "gradebookImportEnabled"),
      gradebookResultCalculationEnabled: optionalChecked(formData, "gradebookResultCalculationEnabled"),
      gradebookCoScholasticEnabled: optionalChecked(formData, "gradebookCoScholasticEnabled"),
      gradebookReportCardsEnabled: optionalChecked(formData, "gradebookReportCardsEnabled"),
      gradebookPublicationEnabled: optionalChecked(formData, "gradebookPublicationEnabled"),
      gradebookAnalyticsEnabled: optionalChecked(formData, "gradebookAnalyticsEnabled"),
      gradebookPortalResultsEnabled: optionalChecked(formData, "gradebookPortalResultsEnabled"),
    });
    await updateSchool(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return { ok: true, message: "School profile updated." };
  } catch (error) {
    return formError(error, "Unable to update school. Please try again.");
  }
}

export async function updateTenantSubscriptionAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateTenantSubscriptionSchema.parse({
      tenantId: req(formData, "tenantId"),
      planCode: req(formData, "planCode"),
      status: req(formData, "subscriptionStatus"),
      trialEndsAt: nullableS(formData, "trialEndsAt"),
      currentPeriodEndsAt: nullableS(formData, "currentPeriodEndsAt"),
      graceEndsAt: nullableS(formData, "graceEndsAt")
    });
    await updateTenantSubscriptionForAdministrator(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return {
      ok: true,
      message: "Subscription status saved. No billing-provider request was made."
    };
  } catch (error) {
    return formError(error, "Unable to update this school subscription.");
  }
}

export async function updateInstitutionEntitlementsAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const entitlements = INSTITUTION_ENTITLEMENT_DEFINITIONS.map((definition) => ({
      moduleKey: definition.moduleKey,
      featureKey: definition.featureKey,
      access: req(formData, entitlementFormFieldName(definition.moduleKey, definition.featureKey))
    }));
    const input = updateInstitutionEntitlementsSchema.parse({
      tenantId: req(formData, "tenantId"),
      institutionId: req(formData, "institutionId"),
      entitlements
    });
    await updateInstitutionEntitlementsForAdministrator(
      await getPlatformAdministratorContext(),
      input
    );
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return {
      ok: true,
      message: "Institution module access saved. Historical records were preserved."
    };
  } catch (error) {
    return formError(error, "Unable to update institution module access.");
  }
}

export async function updateInstitutionLogoAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateInstitutionLogoSchema.parse({
      tenantId: req(formData, "tenantId"),
      institutionId: req(formData, "institutionId")
    });
    const file = formData.get("institutionLogo");
    if (!(file instanceof File)) {
      throw new Error("INSTITUTION_LOGO_FILE_REQUIRED");
    }

    const result = await updateInstitutionLogoForAdministrator(
      await getPlatformAdministratorContext(),
      { ...input, file }
    );
    revalidateAdministratorSchoolRoutes(input.tenantId);
    revalidatePath("/");
    revalidatePath(`/t/${result.tenantSlug}/login`);
    revalidatePath("/attendance-login");
    revalidatePath("/dashboard");
    revalidatePath("/campus-core/institutions");
    return { ok: true, message: "Institution logo updated successfully." };
  } catch (error) {
    return formError(error, "Unable to update the institution logo. Please try again.");
  }
}

export async function updateSchoolIdAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = updateSchoolIdSchema.parse({
      tenantId: req(formData, "tenantId"),
      currentSchoolId: req(formData, "currentSchoolId"),
      newSchoolId: req(formData, "newSchoolId"),
      confirmSchoolIdChange: checked(formData, "confirmSchoolIdChange")
    });
    await updateSchoolId(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return { ok: true, message: "School ID updated. Users must use the new School ID for future login." };
  } catch (error) {
    return formError(error, "Unable to update School ID. Please try again.");
  }
}

export async function deactivateSchoolAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = deactivateSchoolSchema.parse({
      tenantId: req(formData, "tenantId"),
      confirmDeactivation: checked(formData, "confirmDeactivation")
    });
    await deactivateSchool(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return { ok: true, message: "School deactivated. Active sessions for that school were revoked." };
  } catch (error) {
    return formError(error, "Unable to deactivate school. Please try again.");
  }
}

export async function reactivateSchoolAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = reactivateSchoolSchema.parse({
      tenantId: req(formData, "tenantId"),
      confirmReactivation: checked(formData, "confirmReactivation")
    });
    await reactivateSchool(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return { ok: true, message: "School reactivated." };
  } catch (error) {
    return formError(error, "Unable to reactivate school. Please try again.");
  }
}

export async function deleteSchoolAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = deleteSchoolSchema.parse({
      tenantId: req(formData, "tenantId"),
      confirmDelete: passwordValue(formData, "confirmDelete")
    });
    await deleteSchoolPermanently(await getPlatformAdministratorContext(), input);
    revalidateAdministratorSchoolRoutes(input.tenantId);
    return { ok: true, message: "School and all of its tenant-owned data were deleted permanently." };
  } catch (error) {
    return formError(error, "Unable to delete school. No data was removed; please retry or review server availability.");
  }
}

export async function changePlatformAdministratorPasswordAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const input = changeOwnPasswordSchema.parse({
      currentPassword: passwordValue(formData, "currentPassword"),
      newPassword: passwordValue(formData, "newPassword"),
      confirmNewPassword: passwordValue(formData, "confirmNewPassword")
    });
    await changePlatformAdministratorPassword(
      await getPlatformAdministratorContext({ allowPasswordChangeRequired: true }),
      input
    );
    revalidatePath("/administrator");
    revalidatePath("/administrator/profile");
    return { ok: true, message: "Administrator password was updated successfully." };
  } catch (error) {
    return formError(error, "Unable to update the administrator password. Please try again.");
  }
}

export async function approvePrincipalRecoveryAction(
  _state: PrincipalRecoveryActionState,
  formData: FormData
): Promise<PrincipalRecoveryActionState> {
  try {
    const input = principalRecoveryApproveSchema.parse({
      requestId: formData.get("requestId"),
      resetMethod: formData.get("resetMethod"),
      identityVerified: checked(formData, "identityVerified"),
      reviewRemarks: formData.get("reviewRemarks")
    });
    const result = await approvePrincipalPasswordRecovery(
      await getPlatformAdministratorContext(),
      input
    );
    return {
      ok: true,
      message: result.credentialType === "RESET_LINK"
        ? "Reset link approved. Deliver it only through a verified private channel."
        : "Temporary password assigned. Deliver it privately; the Principal must change it after signing in.",
      oneTimeCredential: {
        type: result.credentialType,
        value: result.oneTimeCredential,
        deliveryTarget: result.notificationTargetMasked,
        expiresAt: result.expiresAt?.toISOString() ?? null
      }
    };
  } catch (error) {
    return formError(error, "Unable to approve this Principal recovery request.");
  }
}

export async function rejectPrincipalRecoveryAction(
  _state: PrincipalRecoveryActionState,
  formData: FormData
): Promise<PrincipalRecoveryActionState> {
  try {
    const input = principalRecoveryRejectSchema.parse({
      requestId: formData.get("requestId"),
      reviewRemarks: formData.get("reviewRemarks")
    });
    await rejectPrincipalPasswordRecovery(
      await getPlatformAdministratorContext(),
      input
    );
    revalidatePath("/administrator/principal-recovery");
    return { ok: true, message: "Principal recovery request rejected." };
  } catch (error) {
    return formError(error, "Unable to reject this Principal recovery request.");
  }
}
