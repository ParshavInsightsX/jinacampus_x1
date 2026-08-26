"use client";

import { useActionState, useState, type ReactNode } from "react";
import { FormField, FormMessage, getFieldError } from "@/components/ui/form-primitives";
import { StatusBadge, formatEnumLabel } from "@/components/ui/table-primitives";
import type { CampusCoreFormActionState } from "@/modules/campus-core/actions";
import {
  createInstitutionAuthorizationAction,
  createInstitutionIdentifierAction,
  createInstitutionManagingEntityAction,
  deleteInstitutionRegulatoryDocumentAction,
  submitInstitutionRegulatoryRecordAction,
  updateInstitutionLegalIdentityAction,
  uploadInstitutionRegulatoryDocumentAction
} from "@/modules/campus-core/regulatory/actions";
import type { InstitutionRegulatoryWorkspace } from "@/modules/campus-core/regulatory/queries";

const initialState: CampusCoreFormActionState = { ok: false };
const inputClassName = "min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-slate-50";
const textareaClassName = `${inputClassName} min-h-24 resize-y`;

const identifierTypes = ["UDISE", "LEGACY_DISE", "STATE_SCHOOL_CODE", "BOARD_SCHOOL_CODE", "INSTITUTION_CODE", "OTHER"];
const authorizationTypes = ["RECOGNITION", "AFFILIATION", "ACCREDITATION", "REGISTRATION", "NO_OBJECTION_CERTIFICATE", "PRIOR_PERMISSION", "MINORITY_STATUS", "OTHER"];
const managingEntityTypes = ["GOVERNMENT", "LOCAL_AUTHORITY", "REGISTERED_SOCIETY", "PUBLIC_TRUST", "PRIVATE_TRUST", "SECTION_8_COMPANY", "OTHER"];
const stages = ["PRE_PRIMARY", "PRIMARY", "UPPER_PRIMARY", "SECONDARY", "SENIOR_SECONDARY", "VOCATIONAL", "OPEN_BASIC_EDUCATION", "OTHER"];

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="premium-card overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button type="submit" disabled={pending} className="premium-primary-button w-full disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
      {pending ? "Saving..." : children}
    </button>
  );
}

function BranchSelect({ branches, id, name = "branchId" }: { branches: InstitutionRegulatoryWorkspace["branches"]; id: string; name?: string }) {
  return (
    <select id={id} name={name} className={inputClassName} defaultValue="">
      <option value="">Institution-wide</option>
      {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name} ({branch.code})</option>)}
    </select>
  );
}

function AuthoritySelect({ authorities, id }: { authorities: InstitutionRegulatoryWorkspace["authorities"]; id: string }) {
  return (
    <select id={id} name="authorityId" required className={inputClassName} defaultValue="">
      <option value="" disabled>Select authority</option>
      {authorities.map((authority) => (
        <option key={authority.id} value={authority.id}>
          {authority.shortName ?? authority.name}{authority.stateCode ? ` - ${authority.stateCode}` : ""}
        </option>
      ))}
    </select>
  );
}

function RecordSubmitForm({ institutionId, recordType, recordId }: { institutionId: string; recordType: "IDENTIFIER" | "AUTHORIZATION"; recordId: string }) {
  const [state, action, pending] = useActionState(submitInstitutionRegulatoryRecordAction, initialState);
  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="recordType" value={recordType} />
      <input type="hidden" name="recordId" value={recordId} />
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="mt-2 min-h-11 rounded-lg border border-brand-200 bg-brand-50 px-3 text-sm font-semibold text-brand-700 hover:bg-brand-100 disabled:opacity-60">
        {pending ? "Submitting..." : "Submit for verification"}
      </button>
    </form>
  );
}

function DocumentDeleteForm({ institutionId, documentId }: { institutionId: string; documentId: string }) {
  const [state, action, pending] = useActionState(deleteInstitutionRegulatoryDocumentAction, initialState);
  return (
    <form action={action}>
      <input type="hidden" name="institutionId" value={institutionId} />
      <input type="hidden" name="documentId" value={documentId} />
      {state.error ? <p className="mb-2 text-xs font-medium text-red-600">{state.error}</p> : null}
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60">
        {pending ? "Deleting..." : "Delete"}
      </button>
    </form>
  );
}

function dateLabel(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

export function InstitutionRegulatoryProfileManager({ workspace }: { workspace: InstitutionRegulatoryWorkspace }) {
  const [legalState, legalAction, legalPending] = useActionState(updateInstitutionLegalIdentityAction, initialState);
  const [entityState, entityAction, entityPending] = useActionState(createInstitutionManagingEntityAction, initialState);
  const [identifierState, identifierAction, identifierPending] = useActionState(createInstitutionIdentifierAction, initialState);
  const [authorizationState, authorizationAction, authorizationPending] = useActionState(createInstitutionAuthorizationAction, initialState);
  const [documentState, documentAction, documentPending] = useActionState(uploadInstitutionRegulatoryDocumentAction, initialState);
  const [documentRecordType, setDocumentRecordType] = useState<"GENERAL" | "IDENTIFIER" | "AUTHORIZATION">("GENERAL");
  const { institution, capabilities } = workspace;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="premium-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Institution</p>
          <p className="mt-2 font-semibold text-slate-950">{institution.displayName ?? institution.name}</p>
          <p className="mt-1 text-sm text-slate-500">{institution.code}</p>
        </div>
        <div className="premium-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Profile readiness</p>
          <div className="mt-2"><StatusBadge value={workspace.profile?.completenessStatus ?? "NOT_STARTED"} /></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">Incomplete details do not block normal school operations.</p>
        </div>
        <div className="premium-card p-4">
          <p className="text-xs font-semibold uppercase text-slate-500">Verification boundary</p>
          <p className="mt-2 text-sm font-semibold text-slate-950">Independent review required</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">School users may declare and submit records, but cannot mark them verified or public.</p>
        </div>
      </div>

      <Section title="Legal identity" description="Use the institution's official legal name. The friendly display name remains unchanged elsewhere in JinaCampus.">
        {capabilities.canManage ? (
          <form action={legalAction} className="space-y-4">
            <input type="hidden" name="institutionId" value={institution.id} />
            <FormMessage state={legalState} />
            <div className="grid gap-4 md:grid-cols-2">
              <FormField id="reg-legal-name" label="Official legal name" required error={getFieldError(legalState.fieldErrors, "legalName")}>
                <input id="reg-legal-name" name="legalName" defaultValue={institution.legalName ?? institution.name} required className={inputClassName} />
              </FormField>
              <FormField id="reg-established-year" label="Year established" error={getFieldError(legalState.fieldErrors, "establishedYear")}>
                <input id="reg-established-year" name="establishedYear" type="number" min="1800" max="2200" defaultValue={institution.establishedYear ?? ""} className={inputClassName} />
              </FormField>
              <FormField id="reg-former-names" label="Former legal names" helpText="Enter one earlier legal name per line." className="md:col-span-2" error={getFieldError(legalState.fieldErrors, "formerLegalNames")}>
                <textarea id="reg-former-names" name="formerLegalNames" defaultValue={institution.formerLegalNames.join("\n")} className={textareaClassName} />
              </FormField>
              <FormField id="reg-school-type" label="School type">
                <input id="reg-school-type" name="schoolType" defaultValue={institution.schoolType ?? ""} placeholder="Example: Co-educational day school" className={inputClassName} />
              </FormField>
              <FormField id="reg-state-code" label="State code" helpText="Official state or UT code, where used.">
                <input id="reg-state-code" name="stateCode" defaultValue={workspace.profile?.stateCode ?? ""} placeholder="MP" className={inputClassName} />
              </FormField>
              <FormField id="reg-district" label="District">
                <input id="reg-district" name="district" defaultValue={institution.district ?? ""} className={inputClassName} />
              </FormField>
              <FormField id="reg-block" label="Block / local authority area">
                <input id="reg-block" name="block" defaultValue={institution.block ?? ""} className={inputClassName} />
              </FormField>
              <FormField id="reg-board-code" label="Primary board code" helpText="This does not replace board affiliation records.">
                <input id="reg-board-code" name="boardCode" defaultValue={workspace.profile?.boardCode ?? ""} placeholder="CBSE" className={inputClassName} />
              </FormField>
              <FormField id="reg-country-code" label="Country code" required>
                <input id="reg-country-code" name="countryCode" defaultValue={workspace.profile?.countryCode ?? "IN"} required className={inputClassName} />
              </FormField>
              <FormField id="reg-official-email" label="Official email">
                <input id="reg-official-email" name="officialEmail" type="email" defaultValue={institution.officialEmail ?? ""} className={inputClassName} />
              </FormField>
              <FormField id="reg-official-phone" label="Official phone">
                <input id="reg-official-phone" name="officialPhone" type="tel" defaultValue={institution.officialPhone ?? ""} className={inputClassName} />
              </FormField>
              <FormField id="reg-website" label="Official website" className="md:col-span-2">
                <input id="reg-website" name="website" type="url" defaultValue={institution.website ?? ""} className={inputClassName} />
              </FormField>
            </div>
            <div className="flex justify-end"><SubmitButton pending={legalPending}>Save legal identity</SubmitButton></div>
          </form>
        ) : <p className="text-sm text-slate-600">You have view-only access to this profile.</p>}
      </Section>

      <Section title="Managing entity" description="Record the trust, society, company, government body, or other legal entity responsible for the institution.">
        <div className="divide-y divide-slate-100">
          {workspace.managingEntities.length ? workspace.managingEntities.map((assignment) => (
            <div key={assignment.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{assignment.managingEntity.legalName}</p>
                  <p className="mt-1 text-sm text-slate-600">{formatEnumLabel(assignment.managingEntity.type)} · {assignment.branch?.name ?? "Institution-wide"}</p>
                  <p className="mt-1 text-xs text-slate-500">Registration: {assignment.managingEntity.registrationNumber ?? "Not set"}</p>
                </div>
                {assignment.isPrimary ? <StatusBadge value="ACTIVE" label="Current" /> : <StatusBadge value="SUPERSEDED" label="Historical" />}
              </div>
            </div>
          )) : <p className="text-sm text-slate-600">No managing entity has been recorded.</p>}
        </div>
        {capabilities.canManage ? (
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add or replace managing entity</summary>
            <form action={entityAction} className="mt-4 space-y-4">
              <input type="hidden" name="institutionId" value={institution.id} />
              <FormMessage state={entityState} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField id="entity-name" label="Legal name" required><input id="entity-name" name="managingLegalName" required className={inputClassName} /></FormField>
                <FormField id="entity-type" label="Entity type" required><select id="entity-type" name="managingEntityType" required className={inputClassName}>{managingEntityTypes.map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select></FormField>
                <FormField id="entity-branch" label="Scope"><BranchSelect branches={workspace.branches} id="entity-branch" /></FormField>
                <FormField id="entity-registration" label="Registration number"><input id="entity-registration" name="registrationNumber" className={inputClassName} /></FormField>
                <FormField id="entity-authority" label="Registration authority"><input id="entity-authority" name="registrationAuthority" className={inputClassName} /></FormField>
                <FormField id="entity-state" label="Registration state code"><input id="entity-state" name="registrationStateCode" className={inputClassName} /></FormField>
                <FormField id="entity-date" label="Registration date"><input id="entity-date" name="registrationDate" type="date" className={inputClassName} /></FormField>
                <FormField id="entity-representative" label="Authorised representative"><input id="entity-representative" name="authorisedRepresentative" className={inputClassName} /></FormField>
                <FormField id="entity-address" label="Registered office address" className="md:col-span-2"><textarea id="entity-address" name="registeredOfficeAddress" className={textareaClassName} /></FormField>
              </div>
              <div className="flex justify-end"><SubmitButton pending={entityPending}>Save managing entity</SubmitButton></div>
            </form>
          </details>
        ) : null}
      </Section>

      <Section title="Official identifiers" description="Store UDISE and other official codes separately. Never enter N/A or Pending as an identifier value; choose the correct assignment status instead.">
        <div className="divide-y divide-slate-100">
          {workspace.identifiers.length ? workspace.identifiers.map((identifier) => (
            <div key={identifier.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{formatEnumLabel(identifier.type)} · {identifier.authority.shortName ?? identifier.authority.name}</p>
                  <p className="mt-1 text-sm text-slate-700">{identifier.value ?? formatEnumLabel(identifier.availability)}</p>
                  <p className="mt-1 text-xs text-slate-500">{identifier.branch?.name ?? "Institution-wide"} · Valid until {dateLabel(identifier.validUntil)}</p>
                </div>
                <div className="flex flex-wrap gap-2"><StatusBadge value={identifier.status} /><StatusBadge value={identifier.verificationStatus} /></div>
              </div>
              {capabilities.canSubmit && identifier.status === "DRAFT" ? <RecordSubmitForm institutionId={institution.id} recordType="IDENTIFIER" recordId={identifier.id} /> : null}
            </div>
          )) : <p className="text-sm text-slate-600">No official identifier has been recorded.</p>}
        </div>
        {capabilities.canManage ? (
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add official identifier</summary>
            <form action={identifierAction} className="mt-4 space-y-4">
              <input type="hidden" name="institutionId" value={institution.id} />
              <FormMessage state={identifierState} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField id="identifier-authority" label="Authority" required><AuthoritySelect authorities={workspace.authorities} id="identifier-authority" /></FormField>
                <FormField id="identifier-type" label="Identifier type" required><select id="identifier-type" name="identifierType" required className={inputClassName}>{identifierTypes.map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select></FormField>
                <FormField id="identifier-availability" label="Assignment status" required><select id="identifier-availability" name="availability" required className={inputClassName}><option value="ASSIGNED">Assigned</option><option value="PENDING_ASSIGNMENT">Pending assignment</option><option value="NOT_APPLICABLE">Not applicable</option><option value="UNKNOWN">Unknown</option></select></FormField>
                <FormField id="identifier-value" label="Assigned value" helpText="UDISE Code must contain exactly 11 digits."><input id="identifier-value" name="identifierValue" className={inputClassName} /></FormField>
                <FormField id="identifier-branch" label="Scope"><BranchSelect branches={workspace.branches} id="identifier-branch" /></FormField>
                <FormField id="identifier-classification" label="Data classification"><select id="identifier-classification" name="dataClassification" defaultValue="INTERNAL" className={inputClassName}><option value="INTERNAL">Internal</option><option value="RESTRICTED">Restricted</option><option value="PUBLIC_ELIGIBLE">Public eligible after approval</option><option value="PUBLIC">Public</option></select></FormField>
                <FormField id="identifier-valid-from" label="Valid from"><input id="identifier-valid-from" name="identifierValidFrom" type="date" className={inputClassName} /></FormField>
                <FormField id="identifier-valid-until" label="Valid until"><input id="identifier-valid-until" name="identifierValidUntil" type="date" className={inputClassName} /></FormField>
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm font-medium text-slate-700"><input name="isPrimary" type="checkbox" className="h-5 w-5 rounded border-slate-300" /> Primary identifier for this scope</label>
              <div className="flex justify-end"><SubmitButton pending={identifierPending}>Save identifier draft</SubmitButton></div>
            </form>
          </details>
        ) : null}
      </Section>

      <Section title="Recognition, affiliation & accreditation" description="Recognition and board affiliation are separate records. Add each authority approval with its own validity and grade coverage.">
        <div className="divide-y divide-slate-100">
          {workspace.authorizations.length ? workspace.authorizations.map((authorization) => (
            <div key={authorization.id} className="py-4 first:pt-0 last:pb-0">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-slate-950">{formatEnumLabel(authorization.type)} · {authorization.authority.shortName ?? authorization.authority.name}</p>
                  <p className="mt-1 text-sm text-slate-700">Reference: {authorization.authorizationNumber ?? authorization.applicationReference ?? "Not set"}</p>
                  <p className="mt-1 text-xs text-slate-500">{authorization.branch?.name ?? "Institution-wide"} · Valid until {dateLabel(authorization.validUntil)}</p>
                  {authorization.coverage.length ? <p className="mt-2 text-xs text-slate-600">Coverage: {authorization.coverage.map((item) => `${formatEnumLabel(item.stage)}${item.gradeFrom !== null ? ` (${item.gradeFrom}-${item.gradeTo ?? item.gradeFrom})` : ""}`).join(", ")}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2"><StatusBadge value={authorization.status} /><StatusBadge value={authorization.verificationStatus} /></div>
              </div>
              {capabilities.canSubmit && authorization.status === "DRAFT" ? <RecordSubmitForm institutionId={institution.id} recordType="AUTHORIZATION" recordId={authorization.id} /> : null}
            </div>
          )) : <p className="text-sm text-slate-600">No recognition, affiliation, or accreditation record has been added.</p>}
        </div>
        {capabilities.canManage ? (
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Add recognition or affiliation</summary>
            <form action={authorizationAction} className="mt-4 space-y-4">
              <input type="hidden" name="institutionId" value={institution.id} />
              <FormMessage state={authorizationState} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField id="authorization-authority" label="Authority" required><AuthoritySelect authorities={workspace.authorities} id="authorization-authority" /></FormField>
                <FormField id="authorization-type" label="Record type" required><select id="authorization-type" name="authorizationType" required className={inputClassName}>{authorizationTypes.map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select></FormField>
                <FormField id="authorization-number" label="Order / affiliation number"><input id="authorization-number" name="authorizationNumber" className={inputClassName} /></FormField>
                <FormField id="authorization-reference" label="Application reference"><input id="authorization-reference" name="applicationReference" className={inputClassName} /></FormField>
                <FormField id="authorization-branch" label="Scope"><BranchSelect branches={workspace.branches} id="authorization-branch" /></FormField>
                <FormField id="authorization-category" label="Category code"><input id="authorization-category" name="categoryCode" className={inputClassName} /></FormField>
                <FormField id="authorization-stage" label="Education stage"><select id="authorization-stage" name="stage" defaultValue="" className={inputClassName}><option value="">Not specified</option>{stages.map((item) => <option key={item} value={item}>{formatEnumLabel(item)}</option>)}</select></FormField>
                <FormField id="authorization-classification" label="Data classification"><select id="authorization-classification" name="dataClassification" defaultValue="INTERNAL" className={inputClassName}><option value="INTERNAL">Internal</option><option value="RESTRICTED">Restricted</option><option value="PUBLIC_ELIGIBLE">Public eligible after approval</option><option value="PUBLIC">Public</option></select></FormField>
                <FormField id="authorization-grade-from" label="Grade from"><input id="authorization-grade-from" name="gradeFrom" type="number" min="-2" max="12" className={inputClassName} /></FormField>
                <FormField id="authorization-grade-to" label="Grade to"><input id="authorization-grade-to" name="gradeTo" type="number" min="-2" max="12" className={inputClassName} /></FormField>
                <FormField id="authorization-valid-from" label="Valid from"><input id="authorization-valid-from" name="authorizationValidFrom" type="date" className={inputClassName} /></FormField>
                <FormField id="authorization-valid-until" label="Valid until"><input id="authorization-valid-until" name="authorizationValidUntil" type="date" className={inputClassName} /></FormField>
              </div>
              <div className="flex justify-end"><SubmitButton pending={authorizationPending}>Save record draft</SubmitButton></div>
            </form>
          </details>
        ) : null}
      </Section>

      <Section title="Private evidence documents" description="Original evidence stays in private storage. JinaCampus creates short-lived authorised access links and never treats an original as a public document.">
        <div className="divide-y divide-slate-100">
          {workspace.documents.length ? workspace.documents.map((document) => (
            <div key={document.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-slate-950">{document.title}</p>
                <p className="mt-1 text-sm text-slate-600">{formatEnumLabel(document.documentTypeCode)} · {(document.sizeBytes / 1024).toFixed(0)} KB</p>
                <p className="mt-1 text-xs text-slate-500">{document.branch?.name ?? "Institution-wide"} · Uploaded {dateLabel(document.createdAt)}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                {capabilities.canDownloadDocuments ? <a href={`/api/campus-core/institutions/${institution.id}/regulatory-documents/${document.id}`} className="premium-secondary-button">Open</a> : null}
                {capabilities.canManage ? <DocumentDeleteForm institutionId={institution.id} documentId={document.id} /> : null}
              </div>
            </div>
          )) : <p className="text-sm text-slate-600">No supporting evidence has been uploaded.</p>}
        </div>
        {capabilities.canManage ? (
          <details className="mt-5 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Upload private evidence</summary>
            <form action={documentAction} className="mt-4 space-y-4">
              <input type="hidden" name="institutionId" value={institution.id} />
              <FormMessage state={documentState} />
              <div className="grid gap-4 md:grid-cols-2">
                <FormField id="document-title" label="Document title" required><input id="document-title" name="title" required className={inputClassName} /></FormField>
                <FormField id="document-type-code" label="Document type" required helpText="Examples: recognition order, affiliation letter, society registration."><select id="document-type-code" name="documentTypeCode" required className={inputClassName}><option value="RECOGNITION_ORDER">Recognition order</option><option value="AFFILIATION_LETTER">Affiliation letter</option><option value="REGISTRATION_CERTIFICATE">Registration certificate</option><option value="UDISE_EVIDENCE">UDISE evidence</option><option value="NO_OBJECTION_CERTIFICATE">No objection certificate</option><option value="OTHER">Other</option></select></FormField>
                <FormField id="document-record-type" label="Supports"><select id="document-record-type" name="recordType" value={documentRecordType} onChange={(event) => setDocumentRecordType(event.target.value as typeof documentRecordType)} className={inputClassName}><option value="GENERAL">General institution record</option><option value="IDENTIFIER">Official identifier</option><option value="AUTHORIZATION">Recognition / affiliation</option></select></FormField>
                <FormField id="document-record-id" label="Linked record" helpText={documentRecordType === "GENERAL" ? "No linked record is required." : "Choose the record this file supports."}>
                  <select id="document-record-id" name="recordId" required={documentRecordType !== "GENERAL"} disabled={documentRecordType === "GENERAL"} className={inputClassName} defaultValue="">
                    <option value="">{documentRecordType === "GENERAL" ? "Not linked" : "Select record"}</option>
                    {documentRecordType === "IDENTIFIER" ? workspace.identifiers.map((record) => <option key={record.id} value={record.id}>{formatEnumLabel(record.type)} · {record.authority.shortName ?? record.authority.name}</option>) : null}
                    {documentRecordType === "AUTHORIZATION" ? workspace.authorizations.map((record) => <option key={record.id} value={record.id}>{formatEnumLabel(record.type)} · {record.authority.shortName ?? record.authority.name}</option>) : null}
                  </select>
                </FormField>
                <FormField id="document-branch" label="Branch scope"><BranchSelect branches={workspace.branches} id="document-branch" /></FormField>
                <FormField id="document-number" label="Document number"><input id="document-number" name="documentNumber" className={inputClassName} /></FormField>
                <FormField id="document-issued" label="Issue date"><input id="document-issued" name="issuedAt" type="date" className={inputClassName} /></FormField>
                <FormField id="document-expiry" label="Expiry date"><input id="document-expiry" name="expiresAt" type="date" className={inputClassName} /></FormField>
                <FormField id="document-file" label="Evidence file" required helpText="PDF, JPEG, PNG, or WebP. The configured private-file limit applies." className="md:col-span-2"><input id="document-file" name="document" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" className={inputClassName} /></FormField>
              </div>
              <div className="flex justify-end"><SubmitButton pending={documentPending}>Upload private evidence</SubmitButton></div>
            </form>
          </details>
        ) : null}
      </Section>
    </div>
  );
}
