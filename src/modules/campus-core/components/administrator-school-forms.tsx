"use client";

import Link from "next/link";
import { useActionState } from "react";
import { InstitutionLogo } from "@/components/brand/institution-logo";
import { PasswordInput } from "@/components/forms/password-input";
import {
  FieldErrorMessage,
  FormField,
  FormMessage,
  getFieldError
} from "@/components/ui/form-primitives";
import {
  createSchoolAction,
  deactivateSchoolAction,
  deleteSchoolAction,
  reactivateSchoolAction,
  updateInstitutionLogoAction,
  updateSchoolAction,
  updateSchoolIdAction
} from "@/modules/campus-core/administrator-actions";
import type { CampusCoreFormActionState } from "@/modules/campus-core/actions";

type SchoolStatus = "ACTIVE" | "SUSPENDED" | "ARCHIVED";

type SchoolFormRecord = {
  id: string;
  name: string;
  slug: string;
  status: SchoolStatus;
  legalName: string | null;
  supportEmail: string | null;
  tenantSettings: {
    gradebookEnabled: boolean;
    gradebookConfigurationEnabled: boolean;
    gradebookMarksEntryEnabled: boolean;
    gradebookImportEnabled: boolean;
    gradebookResultCalculationEnabled: boolean;
    gradebookCoScholasticEnabled: boolean;
    gradebookReportCardsEnabled: boolean;
    gradebookPublicationEnabled: boolean;
    gradebookAnalyticsEnabled: boolean;
    gradebookPortalResultsEnabled: boolean;
    schoolCastEnabled: boolean;
    schoolCastInAppEnabled: boolean;
    schoolCastNoticesEnabled: boolean;
    schoolCastHomeworkEnabled: boolean;
    schoolCastApprovalsEnabled: boolean;
    schoolCastEmailEnabled: boolean;
    schoolCastWhatsAppEnabled: boolean;
    schoolCastAutomationEnabled: boolean;
    schoolCastAnalyticsEnabled: boolean;
    schoolCastDeliveryMode: "DRY_RUN" | "TEST" | "LIVE";
    schoolCastTeacherDirectPublish: boolean;
  } | null;
  institutions: Array<{
    id: string;
    name: string;
    displayName: string | null;
    logoUrl: string | null;
  }>;
};

const initialState: CampusCoreFormActionState = { ok: false };
const inputClassName = "min-h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm premium-focus";
const statusOptions: SchoolStatus[] = ["ACTIVE", "SUSPENDED", "ARCHIVED"];
const gradebookFeatureOptions = [
  ["gradebookConfigurationEnabled", "Configuration", "Schemes, terms, exam types, grade scales and calculation policy."],
  ["gradebookMarksEntryEnabled", "Marks entry", "Assignments, draft marks, submission and approval queues."],
  ["gradebookImportEnabled", "Spreadsheet import", "Private, validated CSV/XLSX marks import workflow."],
  ["gradebookResultCalculationEnabled", "Result calculation", "Versioned deterministic result runs and approval."],
  ["gradebookCoScholasticEnabled", "Co-scholastic", "Institution-defined areas, ratings and teacher evaluation."],
  ["gradebookReportCardsEnabled", "Report cards", "Immutable report-card snapshots and private documents."],
  ["gradebookPublicationEnabled", "Publication", "Controlled result/report-card recipient publication."],
  ["gradebookAnalyticsEnabled", "Analytics", "Approved-result operational summaries and history."],
  ["gradebookPortalResultsEnabled", "Portal results", "Published student/guardian result access when portals are approved."]
] as const satisfies ReadonlyArray<readonly [keyof NonNullable<SchoolFormRecord["tenantSettings"]>, string, string]>;

const schoolCastFeatureOptions = [
  ["schoolCastInAppEnabled", "In-application notifications", "Authenticated inbox, read state, and acknowledgements."],
  ["schoolCastNoticesEnabled", "Notices and broadcasts", "Governed notices, circulars, emergency messages, and broadcasts."],
  ["schoolCastHomeworkEnabled", "Homework and classwork", "Teacher-assignment-scoped daily work communication."],
  ["schoolCastApprovalsEnabled", "Approval workflow", "Version-pinned review before publication."],
  ["schoolCastEmailEnabled", "Email", "Provider-gated email delivery with consent and preference checks."],
  ["schoolCastWhatsAppEnabled", "WhatsApp", "Official provider delivery with consent and approved templates."],
  ["schoolCastAutomationEnabled", "Source automations", "Event-driven attendance, calendar, leave, GradeBook, and FeeDesk communications."],
  ["schoolCastAnalyticsEnabled", "Analytics", "Scoped delivery, read, acknowledgement, and failure summaries."],
  ["schoolCastTeacherDirectPublish", "Teacher direct publish", "Permit assigned teachers to publish homework without approval when policy allows."]
] as const satisfies ReadonlyArray<readonly [keyof NonNullable<SchoolFormRecord["tenantSettings"]>, string, string]>;

function fieldError(state: CampusCoreFormActionState, name: string) {
  return getFieldError(state.fieldErrors, name);
}

function FormActions({
  pending,
  label,
  pendingLabel,
  backHref
}: {
  pending: boolean;
  label: string;
  pendingLabel: string;
  backHref: string;
}) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      <Link href={backHref} className="premium-secondary-button w-full premium-focus sm:w-auto">
        Cancel
      </Link>
      <button disabled={pending} className="premium-primary-button w-full premium-focus sm:w-auto">
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

export function CreateSchoolForm() {
  const [state, formAction, pending] = useActionState(createSchoolAction, initialState);

  return (
    <form action={formAction} className="premium-card space-y-6 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Create School</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Creates a school tenant with default institution, branch, roles, permissions, and attendance settings.
        </p>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="school-name" label="School Name" required error={fieldError(state, "name")}>
          <input id="school-name" name="name" required className={inputClassName} />
        </FormField>
        <FormField
          id="school-id"
          label="School ID"
          required
          helpText="Lowercase letters, numbers, and single hyphens only. This is the code users enter at login."
          error={fieldError(state, "schoolId")}
        >
          <input id="school-id" name="schoolId" required inputMode="text" autoCapitalize="none" className={inputClassName} />
        </FormField>
        <FormField id="institution-display-name" label="Institution Display Name" error={fieldError(state, "institutionDisplayName")}>
          <input id="institution-display-name" name="institutionDisplayName" className={inputClassName} />
        </FormField>
        <FormField id="school-support-email" label="Support Email" error={fieldError(state, "supportEmail")}>
          <input id="school-support-email" name="supportEmail" type="email" className={inputClassName} />
        </FormField>
        <FormField id="school-status" label="Status" error={fieldError(state, "status")}>
          <select id="school-status" name="status" defaultValue="ACTIVE" className={inputClassName}>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>
        </FormField>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
        <h3 className="text-sm font-semibold text-slate-950">Optional Principal Account</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Leave these fields blank if the principal will be created later from CampusCore user management.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <FormField id="principal-first-name" label="Principal First Name" error={fieldError(state, "principalFirstName")}>
            <input id="principal-first-name" name="principalFirstName" autoComplete="given-name" className={inputClassName} />
          </FormField>
          <FormField id="principal-last-name" label="Principal Last Name" error={fieldError(state, "principalLastName")}>
            <input id="principal-last-name" name="principalLastName" autoComplete="family-name" className={inputClassName} />
          </FormField>
          <FormField id="principal-email" label="Principal Email" error={fieldError(state, "principalEmail")}>
            <input id="principal-email" name="principalEmail" type="email" autoComplete="username" className={inputClassName} />
          </FormField>
          <FormField
            id="principal-initial-password"
            label="Principal Initial Password"
            helpText="Minimum 8 characters. The account will be marked to change password later."
            error={fieldError(state, "principalInitialPassword")}
          >
            <PasswordInput id="principal-initial-password" name="principalInitialPassword" autoComplete="new-password" className={inputClassName} />
          </FormField>
          <FormField id="confirm-principal-initial-password" label="Confirm Principal Password" error={fieldError(state, "confirmPrincipalInitialPassword")}>
            <PasswordInput id="confirm-principal-initial-password" name="confirmPrincipalInitialPassword" autoComplete="new-password" className={inputClassName} />
          </FormField>
        </div>
      </section>
      <FieldErrorMessage id="create-school-form-error" message={fieldError(state, "form")} />
      <FormActions pending={pending} label="Create School" pendingLabel="Creating..." backHref="/administrator/schools" />
    </form>
  );
}

export function SchoolEditForm({
  school,
  schoolCastReleaseScope
}: {
  school: SchoolFormRecord;
  schoolCastReleaseScope: "DISABLED" | "IN_APP_CORE" | "FULL";
}) {
  const [state, formAction, pending] = useActionState(updateSchoolAction, initialState);
  const institution = school.institutions[0] ?? null;
  const inAppCoreOptions = new Set<string>([
    "schoolCastInAppEnabled",
    "schoolCastNoticesEnabled",
    "schoolCastApprovalsEnabled",
    "schoolCastAnalyticsEnabled"
  ]);
  const visibleSchoolCastOptions = schoolCastReleaseScope === "FULL"
    ? schoolCastFeatureOptions
    : schoolCastFeatureOptions.filter(([name]) => inAppCoreOptions.has(name));

  return (
    <form action={formAction} className="premium-card space-y-6 p-5">
      <input type="hidden" name="tenantId" value={school.id} />
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Edit School Profile</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Update school identity and branding. School ID changes are handled separately and audited.
        </p>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormField id="edit-school-name" label="School Name" required error={fieldError(state, "name")}>
          <input id="edit-school-name" name="name" defaultValue={school.name} required className={inputClassName} />
        </FormField>
        <FormField id="edit-school-legal-name" label="Legal Name" error={fieldError(state, "legalName")}>
          <input id="edit-school-legal-name" name="legalName" defaultValue={school.legalName ?? ""} className={inputClassName} />
        </FormField>
        <FormField id="edit-school-support-email" label="Support Email" error={fieldError(state, "supportEmail")}>
          <input id="edit-school-support-email" name="supportEmail" type="email" defaultValue={school.supportEmail ?? ""} className={inputClassName} />
        </FormField>
        <FormField id="edit-school-status" label="Status" error={fieldError(state, "status")}>
          <select id="edit-school-status" name="status" defaultValue={school.status} className={inputClassName}>
            {statusOptions.map((status) => (
              <option key={status} value={status}>{status.charAt(0) + status.slice(1).toLowerCase()}</option>
            ))}
          </select>
        </FormField>
        <FormField id="edit-institution-display-name" label="Institution Display Name" error={fieldError(state, "institutionDisplayName")}>
          <input id="edit-institution-display-name" name="institutionDisplayName" defaultValue={institution?.displayName ?? ""} className={inputClassName} />
        </FormField>
      </div>
      <section className="rounded-lg border border-campus-border bg-surface-muted p-4" aria-labelledby="school-module-access-title">
        <h3 id="school-module-access-title" className="text-sm font-semibold text-ink">Pilot module access</h3>
        <input type="hidden" name="gradebookEnabled" value="off" />
        <label className="mt-3 flex min-h-11 items-start gap-3 text-sm text-slate-700">
          <input
            type="checkbox"
            name="gradebookEnabled"
            defaultChecked={school.tenantSettings?.gradebookEnabled ?? false}
            className="mt-1 size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
          />
          <span>
            <span className="block font-semibold text-ink">Enable GradeBook</span>
            <span className="mt-1 block leading-5 text-slate-500">
              Exposes the GradeBook workspace only to school users who also hold its server-side permissions.
            </span>
          </span>
        </label>
        <div className="mt-4 grid gap-2 border-t border-campus-border pt-4 md:grid-cols-2">
          {gradebookFeatureOptions.map(([name, label, help]) => (
            <label key={name} className="flex min-h-11 items-start gap-3 rounded-lg border border-campus-border bg-white p-3 text-sm text-slate-700">
              <input type="hidden" name={name} value="off" />
              <input
                type="checkbox"
                name={name}
                defaultChecked={school.tenantSettings?.[name] ?? false}
                className="mt-1 size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
              />
              <span>
                <span className="block font-semibold text-ink">{label}</span>
                <span className="mt-1 block leading-5 text-slate-500">{help}</span>
              </span>
            </label>
          ))}
        </div>
        {schoolCastReleaseScope !== "DISABLED" ? (
          <div className="mt-5 border-t border-campus-border pt-5">
            <input type="hidden" name="schoolCastEnabled" value="off" />
            <label className="flex min-h-11 items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                name="schoolCastEnabled"
                defaultChecked={school.tenantSettings?.schoolCastEnabled ?? false}
                className="mt-1 size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
              />
              <span>
                <span className="block font-semibold text-ink">Enable SchoolCast pilot</span>
                <span className="mt-1 block leading-5 text-slate-500">
                  Enables only the capabilities approved for this server deployment; permissions still control every action.
                </span>
              </span>
            </label>
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {visibleSchoolCastOptions.map(([name, label, help]) => (
                <label key={name} className="flex min-h-11 items-start gap-3 rounded-lg border border-campus-border bg-white p-3 text-sm text-slate-700">
                  <input type="hidden" name={name} value="off" />
                  <input
                    type="checkbox"
                    name={name}
                    defaultChecked={Boolean(school.tenantSettings?.[name])}
                    className="mt-1 size-5 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
                  />
                  <span>
                    <span className="block font-semibold text-ink">{label}</span>
                    <span className="mt-1 block leading-5 text-slate-500">{help}</span>
                  </span>
                </label>
              ))}
            </div>
            {schoolCastReleaseScope === "FULL" ? (
              <FormField
                id="schoolcast-delivery-mode"
                label="SchoolCast delivery mode"
                helpText="Keep DRY_RUN until provider, consent, template, worker, and webhook release gates pass."
                error={fieldError(state, "schoolCastDeliveryMode")}
              >
                <select
                  id="schoolcast-delivery-mode"
                  name="schoolCastDeliveryMode"
                  defaultValue={school.tenantSettings?.schoolCastDeliveryMode ?? "DRY_RUN"}
                  className={inputClassName}
                >
                  <option value="DRY_RUN">Dry run</option>
                  <option value="TEST">Provider test</option>
                  <option value="LIVE">Live (readiness-gated)</option>
                </select>
              </FormField>
            ) : (
              <input type="hidden" name="schoolCastDeliveryMode" value="DRY_RUN" />
            )}
          </div>
        ) : null}
      </section>
      <FieldErrorMessage id="school-edit-form-error" message={fieldError(state, "form")} />
      <FormActions pending={pending} label="Save School" pendingLabel="Saving..." backHref={`/administrator/schools/${school.id}`} />
    </form>
  );
}

export function InstitutionLogoUploadForm({
  tenantId,
  institution
}: {
  tenantId: string;
  institution: SchoolFormRecord["institutions"][number];
}) {
  const [state, formAction, pending] = useActionState(updateInstitutionLogoAction, initialState);
  const displayName = institution.displayName ?? institution.name;
  const helpId = `institution-logo-help-${institution.id}`;

  return (
    <form action={formAction} className="premium-card p-5">
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="institutionId" value={institution.id} />
      <div className="flex items-start gap-4">
        <InstitutionLogo name={displayName} logoUrl={institution.logoUrl} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500">Institution branding</p>
          <h3 className="mt-1 truncate text-lg font-bold text-slate-950" title={displayName}>{displayName}</h3>
          <p className="mt-1 text-sm text-slate-500">
            {institution.logoUrl ? "A logo is currently configured." : "Initials are shown until a logo is uploaded."}
          </p>
        </div>
      </div>
      <div className="mt-4">
        <FormMessage state={state} />
      </div>
      <label htmlFor={`institution-logo-${institution.id}`} className="mt-4 block text-sm font-semibold text-slate-800">
        {institution.logoUrl ? "Replace logo" : "Upload logo"}
      </label>
      <input
        id={`institution-logo-${institution.id}`}
        name="institutionLogo"
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        required
        disabled={pending}
        aria-describedby={helpId}
        className="mt-2 min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-semibold file:text-brand-700 premium-focus"
      />
      <p id={helpId} className="mt-2 text-xs leading-5 text-slate-500">
        JPEG, PNG, or WebP, up to 2 MB. The logo is publicly readable as a school branding asset; uploads remain restricted to the Administrator Portal.
      </p>
      <FieldErrorMessage id={`institution-logo-error-${institution.id}`} message={fieldError(state, "form")} />
      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={pending} className="premium-primary-button w-full premium-focus sm:w-auto">
          {pending ? "Uploading..." : institution.logoUrl ? "Update Logo" : "Upload Logo"}
        </button>
      </div>
    </form>
  );
}

export function SchoolIdUpdateForm({ school }: { school: Pick<SchoolFormRecord, "id" | "slug"> }) {
  const [state, formAction, pending] = useActionState(updateSchoolIdAction, initialState);

  return (
    <form action={formAction} className="premium-card border-amber-200/80 bg-amber-50/70 p-5">
      <input type="hidden" name="tenantId" value={school.id} />
      <input type="hidden" name="currentSchoolId" value={school.slug} />
      <div>
        <h2 className="text-lg font-semibold text-amber-950">Update School ID</h2>
        <p className="mt-1 text-sm leading-6 text-amber-800">
          Changing the School ID changes the login code/URL for this school.
        </p>
      </div>
      <div className="mt-4">
        <FormMessage state={state} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField id="current-school-id-display" label="Current School ID">
          <input id="current-school-id-display" value={school.slug} readOnly className={`${inputClassName} bg-white/60 text-slate-500`} />
        </FormField>
        <FormField id="new-school-id" label="New School ID" required error={fieldError(state, "newSchoolId")}>
          <input id="new-school-id" name="newSchoolId" required autoCapitalize="none" className={inputClassName} />
        </FormField>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-white/75 p-3 text-sm text-amber-950">
        <input type="checkbox" name="confirmSchoolIdChange" className="mt-1 size-4 rounded border-amber-300 text-amber-600 focus:ring-amber-200" />
        <span>I understand school users must use the new School ID on future logins.</span>
      </label>
      <FieldErrorMessage id="school-id-form-error" message={fieldError(state, "confirmSchoolIdChange") ?? fieldError(state, "form")} />
      <div className="mt-4 flex justify-end">
        <button disabled={pending} className="premium-secondary-button w-full border-amber-300 text-amber-900 premium-focus sm:w-auto">
          {pending ? "Updating..." : "Update School ID"}
        </button>
      </div>
    </form>
  );
}

export function SchoolLifecycleActions({ school }: { school: Pick<SchoolFormRecord, "id" | "name" | "status"> }) {
  const [deactivateState, deactivateAction, deactivatePending] = useActionState(deactivateSchoolAction, initialState);
  const [reactivateState, reactivateAction, reactivatePending] = useActionState(reactivateSchoolAction, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteSchoolAction, initialState);
  const isSuspended = school.status === "SUSPENDED";

  return (
    <section className="premium-card border-rose-200/80 bg-rose-50/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-rose-950">Lifecycle Controls</h2>
          <p className="mt-1 text-sm leading-6 text-rose-800">
            Deactivation pauses school access. Permanent deletion removes the school and all tenant-owned data in one audited transaction.
          </p>
        </div>
        <span className="premium-muted-chip border-rose-200 bg-white/70 text-rose-700">Audit logged</span>
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <form action={isSuspended ? reactivateAction : deactivateAction} className="rounded-2xl border border-rose-200 bg-white/75 p-4">
          <input type="hidden" name="tenantId" value={school.id} />
          <h3 className="text-sm font-semibold text-rose-950">{isSuspended ? "Reactivate School" : "Deactivate School"}</h3>
          <p className="mt-1 text-sm leading-6 text-rose-700">
            {isSuspended ? "Reactivate the school so users can sign in again." : "Suspend login for this school and revoke active sessions."}
          </p>
          <div className="mt-3">
            <FormMessage state={isSuspended ? reactivateState : deactivateState} />
          </div>
          <label className="mt-3 flex items-start gap-3 text-sm text-rose-900">
            <input
              type="checkbox"
              name={isSuspended ? "confirmReactivation" : "confirmDeactivation"}
              className="mt-1 size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-200"
            />
            <span>I confirm this lifecycle change for {school.name}.</span>
          </label>
          <button disabled={isSuspended ? reactivatePending : deactivatePending} className="premium-danger-button mt-4 w-full premium-focus sm:w-auto">
            {isSuspended
              ? reactivatePending ? "Reactivating..." : "Reactivate School"
              : deactivatePending ? "Deactivating..." : "Deactivate School"}
          </button>
        </form>
        <form action={deleteAction} className="rounded-2xl border border-rose-200 bg-white/75 p-4">
          <input type="hidden" name="tenantId" value={school.id} />
          <h3 className="text-sm font-semibold text-rose-950">Hard Delete</h3>
          <p className="mt-1 text-sm leading-6 text-rose-700">
            This action permanently removes the school, users, academic records, attendance history, configuration, and tenant audit history. It cannot be undone.
          </p>
          <div className="mt-3">
            <FormMessage state={deleteState} />
          </div>
          <FormField id="confirm-delete-school" label="Type Delete School" error={fieldError(deleteState, "confirmDelete")}>
            <input id="confirm-delete-school" name="confirmDelete" autoComplete="off" className={inputClassName} />
          </FormField>
          <button disabled={deletePending} className="premium-danger-button mt-4 w-full premium-focus sm:w-auto">
            {deletePending ? "Deleting..." : "Delete School Permanently"}
          </button>
        </form>
      </div>
    </section>
  );
}
