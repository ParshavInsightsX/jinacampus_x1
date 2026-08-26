"use server";

import { revalidatePath } from "next/cache";
import { mapActionError } from "@/lib/errors";
import { getTenantContext } from "@/lib/tenant/context";
import type { CampusCoreFormActionState } from "@/modules/campus-core/actions";
import {
  deleteInstitutionRegulatoryDocument,
  uploadInstitutionRegulatoryDocument
} from "@/modules/campus-core/regulatory/document.service";
import {
  createInstitutionAuthorization,
  createInstitutionIdentifier,
  createInstitutionManagingEntity,
  submitInstitutionRegulatoryRecord,
  updateInstitutionLegalIdentity
} from "@/modules/campus-core/regulatory/service";

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" && entry.trim() ? entry.trim() : undefined;
}

function required(formData: FormData, key: string) {
  const entry = value(formData, key);
  if (!entry) throw new Error(`Missing field: ${key}`);
  return entry;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function fileValue(formData: FormData, key: string) {
  const entry = formData.get(key);
  return entry instanceof File ? entry : new File([], "");
}

function actionError(error: unknown, fallbackMessage: string): CampusCoreFormActionState {
  const safe = mapActionError(error, {
    fallbackMessage,
    validationMessage: "Review the highlighted legal or regulatory information and try again."
  });
  return { ok: false, error: safe.error, fieldErrors: safe.fieldErrors };
}

function refresh(institutionId: string) {
  revalidatePath(`/campus-core/institutions/${institutionId}`);
  revalidatePath(`/campus-core/institutions/${institutionId}/legal-identity`);
  revalidatePath("/campus-core/institutions");
}

export async function updateInstitutionLegalIdentityAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await updateInstitutionLegalIdentity(await getTenantContext(), {
      institutionId,
      legalName: required(formData, "legalName"),
      formerLegalNames: (value(formData, "formerLegalNames") ?? "")
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean),
      establishedYear: value(formData, "establishedYear"),
      schoolType: value(formData, "schoolType"),
      district: value(formData, "district"),
      block: value(formData, "block"),
      officialEmail: value(formData, "officialEmail"),
      officialPhone: value(formData, "officialPhone"),
      website: value(formData, "website"),
      countryCode: value(formData, "countryCode") ?? "IN",
      stateCode: value(formData, "stateCode"),
      boardCode: value(formData, "boardCode")
    });
    refresh(institutionId);
    return { ok: true, message: "Legal identity details saved." };
  } catch (error) {
    return actionError(error, "Unable to save the institution legal identity.");
  }
}

export async function createInstitutionManagingEntityAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await createInstitutionManagingEntity(await getTenantContext(), {
      institutionId,
      branchId: value(formData, "branchId"),
      legalName: required(formData, "managingLegalName"),
      type: required(formData, "managingEntityType"),
      registrationNumber: value(formData, "registrationNumber"),
      registrationAuthority: value(formData, "registrationAuthority"),
      registrationStateCode: value(formData, "registrationStateCode"),
      registrationDate: value(formData, "registrationDate"),
      registeredOfficeAddress: value(formData, "registeredOfficeAddress"),
      authorisedRepresentative: value(formData, "authorisedRepresentative"),
      validFrom: value(formData, "managingValidFrom"),
      validUntil: value(formData, "managingValidUntil")
    });
    refresh(institutionId);
    return { ok: true, message: "Managing entity recorded and assigned." };
  } catch (error) {
    return actionError(error, "Unable to add the managing entity.");
  }
}

export async function createInstitutionIdentifierAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await createInstitutionIdentifier(await getTenantContext(), {
      institutionId,
      branchId: value(formData, "branchId"),
      authorityId: required(formData, "authorityId"),
      type: required(formData, "identifierType"),
      availability: required(formData, "availability"),
      value: value(formData, "identifierValue"),
      dataClassification: value(formData, "dataClassification") ?? "INTERNAL",
      isPrimary: checked(formData, "isPrimary"),
      issuedAt: value(formData, "identifierIssuedAt"),
      validFrom: value(formData, "identifierValidFrom"),
      validUntil: value(formData, "identifierValidUntil"),
      supersedesId: value(formData, "identifierSupersedesId"),
      supersessionReason: value(formData, "identifierSupersessionReason")
    });
    refresh(institutionId);
    return { ok: true, message: "Official identifier saved as a draft." };
  } catch (error) {
    return actionError(error, "Unable to save the official identifier.");
  }
}

export async function createInstitutionAuthorizationAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await createInstitutionAuthorization(await getTenantContext(), {
      institutionId,
      branchId: value(formData, "branchId"),
      authorityId: required(formData, "authorityId"),
      type: required(formData, "authorizationType"),
      authorizationNumber: value(formData, "authorizationNumber"),
      applicationReference: value(formData, "applicationReference"),
      categoryCode: value(formData, "categoryCode"),
      dataClassification: value(formData, "dataClassification") ?? "INTERNAL",
      issuedAt: value(formData, "authorizationIssuedAt"),
      validFrom: value(formData, "authorizationValidFrom"),
      validUntil: value(formData, "authorizationValidUntil"),
      stage: value(formData, "stage"),
      gradeFrom: value(formData, "gradeFrom"),
      gradeTo: value(formData, "gradeTo"),
      programmeCode: value(formData, "programmeCode"),
      streamCode: value(formData, "streamCode"),
      mediumCode: value(formData, "mediumCode"),
      supersedesId: value(formData, "authorizationSupersedesId"),
      supersessionReason: value(formData, "authorizationSupersessionReason")
    });
    refresh(institutionId);
    return { ok: true, message: "Recognition or affiliation record saved as a draft." };
  } catch (error) {
    return actionError(error, "Unable to save the recognition or affiliation record.");
  }
}

export async function submitInstitutionRegulatoryRecordAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await submitInstitutionRegulatoryRecord(await getTenantContext(), {
      institutionId,
      recordType: required(formData, "recordType"),
      recordId: required(formData, "recordId")
    });
    refresh(institutionId);
    return { ok: true, message: "Record submitted for independent verification." };
  } catch (error) {
    return actionError(error, "Unable to submit this record.");
  }
}

export async function uploadInstitutionRegulatoryDocumentAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await uploadInstitutionRegulatoryDocument(await getTenantContext(), {
      institutionId,
      branchId: value(formData, "branchId"),
      recordType: required(formData, "recordType") as "GENERAL" | "IDENTIFIER" | "AUTHORIZATION",
      recordId: value(formData, "recordId"),
      documentTypeCode: required(formData, "documentTypeCode"),
      title: required(formData, "title"),
      documentNumber: value(formData, "documentNumber"),
      issuedAt: value(formData, "issuedAt"),
      expiresAt: value(formData, "expiresAt")
    }, fileValue(formData, "document"));
    refresh(institutionId);
    return { ok: true, message: "Evidence document stored privately." };
  } catch (error) {
    return actionError(error, "Unable to upload this evidence document.");
  }
}

export async function deleteInstitutionRegulatoryDocumentAction(
  _state: CampusCoreFormActionState,
  formData: FormData
): Promise<CampusCoreFormActionState> {
  try {
    const institutionId = required(formData, "institutionId");
    await deleteInstitutionRegulatoryDocument(
      await getTenantContext(),
      institutionId,
      required(formData, "documentId")
    );
    refresh(institutionId);
    return { ok: true, message: "Evidence document deleted." };
  } catch (error) {
    return actionError(error, "Unable to delete this evidence document.");
  }
}
