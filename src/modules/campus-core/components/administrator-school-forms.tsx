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
  updateInstitutionEntitlementsAction,
  updateInstitutionLogoAction,
  updateSchoolAction,
  updateSchoolIdAction,
  updateTenantSubscriptionAction
} from "@/modules/campus-core/administrator-actions";
import type { CampusCoreFormActionState } from "@/modules/campus-core/actions";
import {
  ATTENDANCE_ENTITLEMENT_DEFINITIONS,
  GRADEBOOK_ENTITLEMENT_DEFINITIONS,
  entitlementFormFieldName,
  type EntitlementAccess,
  type EntitlementDefinition
} from "@/modules/campus-core/entitlements/catalog";

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
  } | null;
  subscription: {
    id: string;
    planCode: string;
    status: "TRIAL" | "ACTIVE" | "GRACE_PERIOD" | "SUSPENDED" | "CANCELLED" | "EXPIRED";
    startsAt: Date;
    trialEndsAt: Date | null;
    currentPeriodStartsAt: Date | null;
    currentPeriodEndsAt: Date | null;
    graceEndsAt: Date | null;
  } | null;
  institutions: Array<{
    id: string;
    name: string;
    displayName: string | null;
    logoUrl: string | null;
    entitlements: Array<{
      moduleKey: string;
      featureKey: string;
      access: "DISABLED" | "READ_ONLY" | "FULL";
      source: "PLAN" | "ADD_ON" | "TRIAL" | "MANUAL" | "SYSTEM";
      startsAt: Date | null;
      endsAt: Date | null;
    }>;
  }>;
};

const initialState: CampusCoreFormActionState = { ok: false };
const inputClassName = "min-h-11 w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-sm premium-focus";
const statusOptions: SchoolStatus[] = ["ACTIVE", "SUSPENDED", "ARCHIVED"];

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

export function SchoolEditForm({ school }: { school: SchoolFormRecord }) {
  const [state, formAction, pending] = useActionState(updateSchoolAction, initialState);
  const institution = school.institutions[0] ?? null;

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

      <FieldErrorMessage id="school-edit-form-error" message={fieldError(state, "form")} />
      <FormActions pending={pending} label="Save School" pendingLabel="Saving..." backHref={`/administrator/schools/${school.id}`} />
    </form>
  );
}

function dateInputValue(value: Date | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function EntitlementAccessField({
  definition,
  access
}: {
  definition: EntitlementDefinition;
  access: EntitlementAccess;
}) {
  return (
    <label className="grid min-h-11 gap-2 border-t border-campus-border py-3 md:grid-cols-[minmax(0,1fr)_10rem] md:items-center">
      <span>
        <span className="block text-sm font-semibold text-ink">{definition.label}</span>
        <span className="mt-1 block text-xs leading-5 text-slate-500">{definition.description}</span>
      </span>
      <select
        name={entitlementFormFieldName(definition.moduleKey, definition.featureKey)}
        defaultValue={access}
        className={inputClassName}
        aria-label={definition.label + " access"}
      >
        <option value="DISABLED">Disabled</option>
        <option value="READ_ONLY">View only</option>
        <option value="FULL">Full access</option>
      </select>
    </label>
  );
}

export function TenantSubscriptionForm({
  school
}: {
  school: Pick<SchoolFormRecord, "id" | "subscription">;
}) {
  const [state, formAction, pending] = useActionState(updateTenantSubscriptionAction, initialState);
  const subscription = school.subscription;

  return (
    <form action={formAction} className="premium-card space-y-5 p-5" aria-labelledby="subscription-readiness-title">
      <input type="hidden" name="tenantId" value={school.id} />
      <div>
        <h2 id="subscription-readiness-title" className="text-lg font-semibold text-slate-950">Subscription readiness</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          This records access lifecycle only. No billing provider is connected and saving does not charge the school.
        </p>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <FormField id="subscription-plan-code" label="Plan code" required error={fieldError(state, "planCode")}>
          <input
            id="subscription-plan-code"
            name="planCode"
            required
            defaultValue={subscription?.planCode ?? "TRIAL"}
            autoCapitalize="characters"
            className={inputClassName}
          />
        </FormField>
        <FormField id="subscription-status" label="Subscription status" required error={fieldError(state, "status")}>
          <select
            id="subscription-status"
            name="subscriptionStatus"
            required
            defaultValue={subscription?.status ?? "TRIAL"}
            className={inputClassName}
          >
            <option value="TRIAL">Trial</option>
            <option value="ACTIVE">Active</option>
            <option value="GRACE_PERIOD">Grace period</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </FormField>
        <FormField id="subscription-trial-end" label="Trial ends" error={fieldError(state, "trialEndsAt")}>
          <input
            id="subscription-trial-end"
            name="trialEndsAt"
            type="date"
            defaultValue={dateInputValue(subscription?.trialEndsAt)}
            className={inputClassName}
          />
        </FormField>
        <FormField id="subscription-period-end" label="Current period ends" error={fieldError(state, "currentPeriodEndsAt")}>
          <input
            id="subscription-period-end"
            name="currentPeriodEndsAt"
            type="date"
            defaultValue={dateInputValue(subscription?.currentPeriodEndsAt)}
            className={inputClassName}
          />
        </FormField>
        <FormField id="subscription-grace-end" label="Grace period ends" error={fieldError(state, "graceEndsAt")}>
          <input
            id="subscription-grace-end"
            name="graceEndsAt"
            type="date"
            defaultValue={dateInputValue(subscription?.graceEndsAt)}
            className={inputClassName}
          />
        </FormField>
      </div>
      <p className="text-xs leading-5 text-slate-500">
        Suspended, cancelled, or expired subscriptions fail closed for subscribed modules while historical data stays stored.
      </p>
      <FieldErrorMessage id="subscription-form-error" message={fieldError(state, "form")} />
      <div className="flex justify-end">
        <button disabled={pending} className="premium-primary-button w-full premium-focus sm:w-auto">
          {pending ? "Saving..." : "Save subscription"}
        </button>
      </div>
    </form>
  );
}

function entitlementAccessFor(
  institution: SchoolFormRecord["institutions"][number],
  definition: EntitlementDefinition
): EntitlementAccess {
  return institution.entitlements.find(
    (entitlement) =>
      entitlement.moduleKey === definition.moduleKey &&
      entitlement.featureKey === definition.featureKey
  )?.access ?? "DISABLED";
}

export function InstitutionEntitlementForm({
  tenantId,
  institution
}: {
  tenantId: string;
  institution: SchoolFormRecord["institutions"][number];
}) {
  const [state, formAction, pending] = useActionState(updateInstitutionEntitlementsAction, initialState);
  const displayName = institution.displayName ?? institution.name;

  return (
    <form action={formAction} className="premium-card space-y-5 p-5" aria-labelledby={"institution-entitlements-" + institution.id}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="institutionId" value={institution.id} />
      <div>
        <h2 id={"institution-entitlements-" + institution.id} className="text-lg font-semibold text-slate-950">
          Module access: {displayName}
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Subscription access and role permissions are separate. A user needs both an enabled capability and the required school role permission.
        </p>
      </div>
      <FormMessage state={state} />
      <section aria-labelledby={"attendance-entitlements-" + institution.id}>
        <h3 id={"attendance-entitlements-" + institution.id} className="text-sm font-semibold text-ink">Attendance</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          View only preserves reporting access but blocks new records, corrections, settings changes, and QR operations.
        </p>
        <div className="mt-2">
          {ATTENDANCE_ENTITLEMENT_DEFINITIONS.map((definition) => (
            <EntitlementAccessField
              key={definition.featureKey}
              definition={definition}
              access={entitlementAccessFor(institution, definition)}
            />
          ))}
        </div>
      </section>
      <section aria-labelledby={"gradebook-entitlements-" + institution.id}>
        <h3 id={"gradebook-entitlements-" + institution.id} className="text-sm font-semibold text-ink">GradeBook</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          GradeBook remains disabled unless its module and required capabilities are enabled here.
        </p>
        <div className="mt-2">
          {GRADEBOOK_ENTITLEMENT_DEFINITIONS.map((definition) => (
            <EntitlementAccessField
              key={definition.featureKey}
              definition={definition}
              access={entitlementAccessFor(institution, definition)}
            />
          ))}
        </div>
      </section>
      <FieldErrorMessage id={"entitlement-form-error-" + institution.id} message={fieldError(state, "form")} />
      <div className="flex justify-end">
        <button disabled={pending} className="premium-primary-button w-full premium-focus sm:w-auto">
          {pending ? "Saving..." : "Save module access"}
        </button>
      </div>
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
