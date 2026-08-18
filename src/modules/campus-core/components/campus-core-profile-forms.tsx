"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useActionState } from "react";
import { PasswordInput } from "@/components/forms/password-input";
import {
  FieldErrorMessage,
  FormField,
  FormMessage,
  getFieldError
} from "@/components/ui/form-primitives";
import {
  adminResetUserPasswordAction,
  assignUserBranchAction,
  assignUserRoleAction,
  changeOwnPasswordAction,
  createUserAction,
  deactivateUserAction,
  removeUserBranchAction,
  removeUserRoleAction,
  updateBranchAction,
  updateInstitutionAction,
  updateUserAction,
  type CampusCoreFormActionState
} from "@/modules/campus-core/actions";

type InstitutionStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type BranchStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";
type UserStatus = "INVITED" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";
type UserType = "OWNER" | "STAFF" | "PARENT" | "STUDENT" | "SYSTEM";

type InstitutionRecord = {
  id: string;
  name: string;
  displayName: string | null;
  code: string;
  status: InstitutionStatus;
  board: string | null;
  medium: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
};

type BranchRecord = {
  id: string;
  institutionId: string;
  name: string;
  code: string;
  status: BranchStatus;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
};

type UserRecord = {
  id: string;
  email: string;
  phone: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  userType: UserType;
  status: UserStatus;
};

type Option = {
  id: string;
  name: string;
  code?: string;
};

type RoleOption = {
  id: string;
  code: string;
  name: string;
};

type AssignedRole = {
  id: string;
  roleId: string;
  scopeType: "TENANT" | "INSTITUTION" | "BRANCH" | "ACADEMIC_YEAR";
  scopeId: string;
  role: RoleOption;
};

type AssignedBranch = {
  id: string;
  branchId: string;
  isPrimary: boolean;
  branch: Option;
};

const initialState: CampusCoreFormActionState = { ok: false };
const inputClassName = "min-h-11 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm";
const statusOptions = ["ACTIVE", "INACTIVE", "ARCHIVED"] as const;
const userTypeOptions = ["STAFF", "OWNER", "PARENT", "STUDENT", "SYSTEM"] as const;

function fieldError(state: CampusCoreFormActionState, name: string) {
  return getFieldError(state.fieldErrors, name);
}

function enumLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function FormShell({
  title,
  description,
  backHref,
  state,
  pending,
  children,
  submitLabel = "Save Changes",
  pendingLabel = "Saving..."
}: {
  title: string;
  description: string;
  backHref: string;
  state: CampusCoreFormActionState;
  pending: boolean;
  children: ReactNode;
  submitLabel?: string;
  pendingLabel?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
          <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Fields marked Required must be completed before saving.</p>
        </div>
        <Link href={backHref} className="premium-secondary-button w-full sm:w-auto">
          Cancel
        </Link>
      </div>
      <FormMessage state={state} />
      <div className="premium-card p-5">
        {children}
        <FieldErrorMessage id="campus-core-form-error" message={fieldError(state, "form")} />
        <div className="mt-5 flex justify-end">
          <button disabled={pending} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
            {pending ? pendingLabel : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function InstitutionEditForm({ institution }: { institution: InstitutionRecord }) {
  const [state, formAction, pending] = useActionState(updateInstitutionAction, initialState);

  return (
    <form action={formAction}>
      <FormShell title="Edit Institution Profile" description="Update school institution details. Passwords are managed from user accounts, not institution profiles." backHref={`/campus-core/institutions/${institution.id}`} state={state} pending={pending}>
        <input type="hidden" name="institutionId" value={institution.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="institution-name" label="Institution Name" required error={fieldError(state, "name")}>
            <input id="institution-name" name="name" defaultValue={institution.name} required className={inputClassName} />
          </FormField>
          <FormField id="institution-display-name" label="Display Name" helpText="Friendly school name shown in the app shell. Leave blank to use the institution name." error={fieldError(state, "displayName")}>
            <input id="institution-display-name" name="displayName" defaultValue={institution.displayName ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-code" label="Code" required helpText="Short school code used in setup lists." error={fieldError(state, "code")}>
            <input id="institution-code" name="code" defaultValue={institution.code} required className={inputClassName} />
          </FormField>
          <FormField id="institution-logo-url" label="Logo URL" helpText="Use a secure image URL for now. File upload will use storage when that infrastructure is added." error={fieldError(state, "logoUrl")}>
            <input id="institution-logo-url" name="logoUrl" type="url" defaultValue={institution.logoUrl ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-board" label="Board" error={fieldError(state, "board")}>
            <input id="institution-board" name="board" defaultValue={institution.board ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-medium" label="Medium" error={fieldError(state, "medium")}>
            <input id="institution-medium" name="medium" defaultValue={institution.medium ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-status" label="Status" error={fieldError(state, "status")}>
            <select id="institution-status" name="status" defaultValue={institution.status} className={inputClassName}>
              {statusOptions.map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
            </select>
          </FormField>
          <FormField id="institution-country" label="Country" error={fieldError(state, "country")}>
            <input id="institution-country" name="country" defaultValue={institution.country} className={inputClassName} />
          </FormField>
          <FormField id="institution-address-line-1" label="Address Line 1" className="md:col-span-2" error={fieldError(state, "addressLine1")}>
            <input id="institution-address-line-1" name="addressLine1" defaultValue={institution.addressLine1 ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-address-line-2" label="Address Line 2" className="md:col-span-2" error={fieldError(state, "addressLine2")}>
            <input id="institution-address-line-2" name="addressLine2" defaultValue={institution.addressLine2 ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-city" label="City" error={fieldError(state, "city")}>
            <input id="institution-city" name="city" defaultValue={institution.city ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-state" label="State" error={fieldError(state, "state")}>
            <input id="institution-state" name="state" defaultValue={institution.state ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="institution-postal-code" label="Postal Code" error={fieldError(state, "postalCode")}>
            <input id="institution-postal-code" name="postalCode" defaultValue={institution.postalCode ?? ""} className={inputClassName} />
          </FormField>
        </div>
      </FormShell>
    </form>
  );
}

export function BranchEditForm({ branch, institutions }: { branch: BranchRecord; institutions: Option[] }) {
  const [state, formAction, pending] = useActionState(updateBranchAction, initialState);

  return (
    <form action={formAction}>
      <FormShell title="Edit Branch Profile" description="Update branch contact and address details for an accessible branch." backHref={`/campus-core/branches/${branch.id}`} state={state} pending={pending}>
        <input type="hidden" name="branchId" value={branch.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="branch-institution" label="Institution" required error={fieldError(state, "institutionId")}>
            <select id="branch-institution" name="institutionId" defaultValue={branch.institutionId} required className={inputClassName}>
              {institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.name}</option>)}
            </select>
          </FormField>
          <FormField id="branch-name" label="Branch Name" required error={fieldError(state, "name")}>
            <input id="branch-name" name="name" defaultValue={branch.name} required className={inputClassName} />
          </FormField>
          <FormField id="branch-code" label="Code" required helpText="Short branch code used in reports and setup lists." error={fieldError(state, "code")}>
            <input id="branch-code" name="code" defaultValue={branch.code} required className={inputClassName} />
          </FormField>
          <FormField id="branch-status" label="Status" error={fieldError(state, "status")}>
            <select id="branch-status" name="status" defaultValue={branch.status} className={inputClassName}>
              {statusOptions.map((status) => <option key={status} value={status}>{enumLabel(status)}</option>)}
            </select>
          </FormField>
          <FormField id="branch-phone" label="Phone" error={fieldError(state, "phone")}>
            <input id="branch-phone" name="phone" type="tel" defaultValue={branch.phone ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-email" label="Email" error={fieldError(state, "email")}>
            <input id="branch-email" name="email" type="email" defaultValue={branch.email ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-timezone" label="Timezone" error={fieldError(state, "timezone")}>
            <input id="branch-timezone" name="timezone" defaultValue={branch.timezone} className={inputClassName} />
          </FormField>
          <FormField id="branch-address-line-1" label="Address Line 1" className="md:col-span-2" error={fieldError(state, "addressLine1")}>
            <input id="branch-address-line-1" name="addressLine1" defaultValue={branch.addressLine1 ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-address-line-2" label="Address Line 2" className="md:col-span-2" error={fieldError(state, "addressLine2")}>
            <input id="branch-address-line-2" name="addressLine2" defaultValue={branch.addressLine2 ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-city" label="City" error={fieldError(state, "city")}>
            <input id="branch-city" name="city" defaultValue={branch.city ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-state" label="State" error={fieldError(state, "state")}>
            <input id="branch-state" name="state" defaultValue={branch.state ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="branch-postal-code" label="Postal Code" error={fieldError(state, "postalCode")}>
            <input id="branch-postal-code" name="postalCode" defaultValue={branch.postalCode ?? ""} className={inputClassName} />
          </FormField>
        </div>
      </FormShell>
    </form>
  );
}

export function UserCreateForm({
  branches,
  roles
}: {
  branches: Option[];
  roles: RoleOption[];
}) {
  const [state, formAction, pending] = useActionState(createUserAction, initialState);

  return (
    <form action={formAction} className="premium-card space-y-4 p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Create User Account</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Create a school user and set an initial password. Passwords are never displayed after saving.</p>
      </div>
      <FormMessage state={state} />
      <div className="grid gap-4 md:grid-cols-3">
        <FormField id="user-first-name" label="First Name" required error={fieldError(state, "firstName")}>
          <input id="user-first-name" name="firstName" autoComplete="given-name" required className={inputClassName} />
        </FormField>
        <FormField id="user-last-name" label="Last Name" error={fieldError(state, "lastName")}>
          <input id="user-last-name" name="lastName" autoComplete="family-name" className={inputClassName} />
        </FormField>
        <FormField id="user-email" label="Email" required error={fieldError(state, "email")}>
          <input id="user-email" name="email" type="email" autoComplete="username" required className={inputClassName} />
        </FormField>
        <FormField id="user-phone" label="Phone" error={fieldError(state, "phone")}>
          <input id="user-phone" name="phone" type="tel" autoComplete="tel" className={inputClassName} />
        </FormField>
        <FormField id="user-type" label="User Type" required error={fieldError(state, "userType")}>
          <select id="user-type" name="userType" defaultValue="STAFF" className={inputClassName}>
            {userTypeOptions.map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}
          </select>
        </FormField>
        <FormField id="user-branches" label="Branch Access" helpText="Select one or more accessible branches." error={fieldError(state, "branchIds")}>
          <select id="user-branches" name="branchIds" multiple className={`${inputClassName} min-h-28`}>
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </FormField>
        <FormField id="user-roles" label="Roles" helpText="Select role codes that match this user's responsibilities." error={fieldError(state, "roleCodes")}>
          <select id="user-roles" name="roleCodes" multiple className={`${inputClassName} min-h-28`}>
            {roles.map((role) => <option key={role.id} value={role.code}>{role.name}</option>)}
          </select>
        </FormField>
        <FormField id="user-initial-password" label="Initial Password" required helpText="Minimum 8 characters. The user can change it later." error={fieldError(state, "initialPassword")}>
          <PasswordInput id="user-initial-password" name="initialPassword" autoComplete="new-password" required className={inputClassName} />
        </FormField>
        <FormField id="user-confirm-initial-password" label="Confirm Password" required error={fieldError(state, "confirmInitialPassword")}>
          <PasswordInput id="user-confirm-initial-password" name="confirmInitialPassword" autoComplete="new-password" required className={inputClassName} />
        </FormField>
      </div>
      <FieldErrorMessage id="user-create-form-error" message={fieldError(state, "form")} />
      <div className="flex justify-end">
        <button disabled={pending} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto">
          {pending ? "Creating..." : "Create User"}
        </button>
      </div>
    </form>
  );
}

export function UserEditForm({ user }: { user: UserRecord }) {
  const [state, formAction, pending] = useActionState(updateUserAction, initialState);

  return (
    <form action={formAction}>
      <FormShell title="Edit User Profile" description="Update basic account details. Password changes are handled separately." backHref={`/campus-core/users/${user.id}`} state={state} pending={pending}>
        <input type="hidden" name="userId" value={user.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="edit-user-first-name" label="First Name" required error={fieldError(state, "firstName")}>
            <input id="edit-user-first-name" name="firstName" defaultValue={user.firstName} required className={inputClassName} />
          </FormField>
          <FormField id="edit-user-middle-name" label="Middle Name" error={fieldError(state, "middleName")}>
            <input id="edit-user-middle-name" name="middleName" defaultValue={user.middleName ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="edit-user-last-name" label="Last Name" error={fieldError(state, "lastName")}>
            <input id="edit-user-last-name" name="lastName" defaultValue={user.lastName ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="edit-user-email" label="Email" required error={fieldError(state, "email")}>
            <input id="edit-user-email" name="email" type="email" defaultValue={user.email} required className={inputClassName} />
          </FormField>
          <FormField id="edit-user-phone" label="Phone" error={fieldError(state, "phone")}>
            <input id="edit-user-phone" name="phone" type="tel" defaultValue={user.phone ?? ""} className={inputClassName} />
          </FormField>
          <FormField id="edit-user-type" label="User Type" required error={fieldError(state, "userType")}>
            <select id="edit-user-type" name="userType" defaultValue={user.userType} className={inputClassName}>
              {userTypeOptions.map((type) => <option key={type} value={type}>{enumLabel(type)}</option>)}
            </select>
          </FormField>
        </div>
      </FormShell>
    </form>
  );
}

export function UserLifecycleActionCard({
  user,
  canDeactivate,
  isCurrentUser
}: {
  user: Pick<UserRecord, "id" | "email" | "status">;
  canDeactivate: boolean;
  isCurrentUser: boolean;
}) {
  const [state, formAction, pending] = useActionState(deactivateUserAction, initialState);
  const alreadyDeactivated = user.status === "DEACTIVATED";
  const disabled = pending || alreadyDeactivated || isCurrentUser;

  return (
    <section className="premium-card border-rose-200/80 bg-rose-50/70 p-5 motion-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <h2 className="text-lg font-semibold text-rose-950">Deactivate User Account</h2>
          <p className="mt-1 text-sm leading-6 text-rose-800">
            Deactivation blocks login, revokes active sessions, and keeps historical records, assignments, and audit logs intact.
          </p>
        </div>
        <span className="premium-muted-chip border-rose-200 bg-white/70 text-rose-700">
          No hard delete
        </span>
      </div>
      {canDeactivate ? <FormMessage state={state} /> : null}
      {canDeactivate ? (
        <form action={formAction} className="mt-5 space-y-4">
          <input type="hidden" name="userId" value={user.id} />
          <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-white/80 p-3 text-sm text-rose-900">
            <input
              type="checkbox"
              name="confirmDeactivation"
              className="mt-1 size-4 rounded border-rose-300 text-rose-600 focus:ring-rose-200"
              disabled={disabled}
            />
            <span>I understand this will deactivate {user.email} and revoke active sessions.</span>
          </label>
          <button type="submit" disabled={disabled} className="premium-danger-button w-full sm:w-auto premium-focus">
            {alreadyDeactivated ? "Already Deactivated" : pending ? "Deactivating..." : "Deactivate User"}
          </button>
          {isCurrentUser ? (
            <p className="text-sm text-rose-700">You cannot deactivate your own account from this screen.</p>
          ) : null}
        </form>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-rose-200 bg-white/70 p-4 text-sm text-rose-700">
          You do not have permission to deactivate user accounts.
        </p>
      )}
    </section>
  );
}

export function UserRoleAssignmentsCard({
  userId,
  assignedRoles,
  availableRoles,
  canManageRoles
}: {
  userId: string;
  assignedRoles: AssignedRole[];
  availableRoles: RoleOption[];
  canManageRoles: boolean;
}) {
  const [assignState, assignFormAction, assignPending] = useActionState(assignUserRoleAction, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeUserRoleAction, initialState);
  const assignedTenantRoleIds = new Set(
    assignedRoles
      .filter((assignment) => assignment.scopeType === "TENANT" && assignment.scopeId === "TENANT")
      .map((assignment) => assignment.roleId)
  );
  const assignableRoles = availableRoles.filter((role) => !assignedTenantRoleIds.has(role.id));

  return (
    <section className="premium-card p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Role Assignments</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Control what this user can do in the current tenant.</p>
        </div>
      </div>
      {canManageRoles ? <FormMessage state={assignState} /> : null}
      {canManageRoles ? <FormMessage state={removeState} /> : null}
      <div className="mt-4 space-y-3">
        {assignedRoles.length ? assignedRoles.map((assignment) => (
          <div key={assignment.id} className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{assignment.role.name}</p>
              <p className="text-xs text-slate-500">{assignment.role.code} · {enumLabel(assignment.scopeType)}</p>
            </div>
            {canManageRoles ? (
              <form action={removeFormAction}>
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="roleId" value={assignment.roleId} />
                <input type="hidden" name="scopeType" value={assignment.scopeType} />
                <input type="hidden" name="scopeId" value={assignment.scopeId} />
                <button disabled={removePending} className="premium-secondary-button w-full sm:w-auto premium-focus">
                  {removePending ? "Removing..." : "Remove"}
                </button>
              </form>
            ) : null}
          </div>
        )) : (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">No roles are assigned to this user yet.</p>
        )}
      </div>
      {canManageRoles ? (
        <form action={assignFormAction} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="scopeType" value="TENANT" />
          <input type="hidden" name="scopeId" value="TENANT" />
          <FormField id="assign-user-role" label="Assign Role" error={fieldError(assignState, "roleId")}>
            <select id="assign-user-role" name="roleId" className={inputClassName} disabled={!assignableRoles.length}>
              {assignableRoles.length ? assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>{role.name} ({role.code})</option>
              )) : <option value="">All tenant roles are already assigned</option>}
            </select>
          </FormField>
          <button disabled={assignPending || !assignableRoles.length} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 md:w-auto">
            {assignPending ? "Assigning..." : "Assign Role"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function UserBranchAccessCard({
  userId,
  assignedBranches,
  availableBranches,
  canManageBranches
}: {
  userId: string;
  assignedBranches: AssignedBranch[];
  availableBranches: Option[];
  canManageBranches: boolean;
}) {
  const [assignState, assignFormAction, assignPending] = useActionState(assignUserBranchAction, initialState);
  const [removeState, removeFormAction, removePending] = useActionState(removeUserBranchAction, initialState);
  const assignedBranchIds = new Set(assignedBranches.map((access) => access.branchId));
  const assignableBranches = availableBranches.filter((branch) => !assignedBranchIds.has(branch.id));

  return (
    <section className="premium-card p-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Branch Access</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">Choose which branches this user can access for branch-scoped work.</p>
      </div>
      {canManageBranches ? <FormMessage state={assignState} /> : null}
      {canManageBranches ? <FormMessage state={removeState} /> : null}
      <div className="mt-4 space-y-3">
        {assignedBranches.length ? assignedBranches.map((access) => (
          <div key={access.id} className="flex flex-col gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-950">{access.branch.name}</p>
              <p className="text-xs text-slate-500">{access.branch.code ?? "Branch"}{access.isPrimary ? " · Primary" : ""}</p>
            </div>
            {canManageBranches ? (
              <form action={removeFormAction}>
                <input type="hidden" name="userId" value={userId} />
                <input type="hidden" name="branchId" value={access.branchId} />
                <button disabled={removePending} className="premium-secondary-button w-full sm:w-auto premium-focus">
                  {removePending ? "Removing..." : "Remove"}
                </button>
              </form>
            ) : null}
          </div>
        )) : (
          <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">No branch access is assigned to this user yet.</p>
        )}
      </div>
      {canManageBranches ? (
        <form action={assignFormAction} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
          <input type="hidden" name="userId" value={userId} />
          <FormField id="assign-user-branch" label="Assign Branch" error={fieldError(assignState, "branchId")}>
            <select id="assign-user-branch" name="branchId" className={inputClassName} disabled={!assignableBranches.length}>
              {assignableBranches.length ? assignableBranches.map((branch) => (
                <option key={branch.id} value={branch.id}>{branch.name}{branch.code ? ` (${branch.code})` : ""}</option>
              )) : <option value="">All accessible branches are already assigned</option>}
            </select>
          </FormField>
          <button disabled={assignPending || !assignableBranches.length} className="min-h-11 w-full rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 md:w-auto">
            {assignPending ? "Assigning..." : "Assign Branch"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function AdminResetPasswordForm({ user }: { user: Pick<UserRecord, "id" | "email"> }) {
  const [state, formAction, pending] = useActionState(adminResetUserPasswordAction, initialState);

  return (
    <form action={formAction}>
      <FormShell title="Reset User Password" description={`Set a new password for ${user.email}. The password will not be displayed after saving.`} backHref={`/campus-core/users/${user.id}`} state={state} pending={pending} submitLabel="Reset Password" pendingLabel="Resetting...">
        <input type="email" name="username" value={user.email} autoComplete="username" readOnly tabIndex={-1} className="sr-only" />
        <input type="hidden" name="userId" value={user.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="reset-new-password" label="New Password" required helpText="Minimum 8 characters." error={fieldError(state, "newPassword")}>
            <PasswordInput id="reset-new-password" name="newPassword" autoComplete="new-password" required className={inputClassName} />
          </FormField>
          <FormField id="reset-confirm-new-password" label="Confirm New Password" required error={fieldError(state, "confirmNewPassword")}>
            <PasswordInput id="reset-confirm-new-password" name="confirmNewPassword" autoComplete="new-password" required className={inputClassName} />
          </FormField>
        </div>
      </FormShell>
    </form>
  );
}

export function ChangeOwnPasswordForm({
  userEmail,
  backHref = "/dashboard"
}: {
  userEmail: string;
  backHref?: string;
}) {
  const [state, formAction, pending] = useActionState(changeOwnPasswordAction, initialState);

  return (
    <form action={formAction}>
      <FormShell title="Change Password" description="Update your own account password. Your current password is required." backHref={backHref} state={state} pending={pending} submitLabel="Update Password" pendingLabel="Updating...">
        <input type="email" name="username" value={userEmail} autoComplete="username" readOnly tabIndex={-1} className="sr-only" />
        <div className="grid gap-4 md:grid-cols-2">
          <FormField id="current-password" label="Current Password" required error={fieldError(state, "currentPassword")}>
            <PasswordInput id="current-password" name="currentPassword" autoComplete="current-password" required className={inputClassName} />
          </FormField>
          <FormField id="own-new-password" label="New Password" required helpText="Minimum 8 characters." error={fieldError(state, "newPassword")}>
            <PasswordInput id="own-new-password" name="newPassword" autoComplete="new-password" required className={inputClassName} />
          </FormField>
          <FormField id="own-confirm-new-password" label="Confirm New Password" required error={fieldError(state, "confirmNewPassword")}>
            <PasswordInput id="own-confirm-new-password" name="confirmNewPassword" autoComplete="new-password" required className={inputClassName} />
          </FormField>
        </div>
      </FormShell>
    </form>
  );
}
