"use client";

import { useActionState } from "react";
import { PasswordInput } from "@/components/forms/password-input";
import { DataCollectionNotice } from "@/components/legal/data-collection-notice";
import { FormField, FormMessage, getFieldError } from "@/components/ui/form-primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  createStaffProfileAction,
  type StaffProfileFormActionState
} from "@/modules/staffboard-lite/actions/staff-profile.actions";
import { formatEnumLabel } from "@/components/ui/table-primitives";

type BranchOption = {
  id: string;
  name: string;
};

const initialState: StaffProfileFormActionState = { ok: false };
const staffTypeOptions = [
  "TEACHER",
  "ADMIN",
  "ACCOUNTANT",
  "LIBRARIAN",
  "DRIVER",
  "HELPER",
  "SECURITY",
  "PEON",
  "CLEANING_STAFF",
  "MANAGEMENT",
  "OTHER"
] as const;
const loginRoleOptions = [
  { value: "STAFF", label: "Staff" },
  { value: "TEACHER", label: "Teacher" },
  { value: "OFFICE_STAFF", label: "Office Operator" }
] as const;

function fieldError(state: StaffProfileFormActionState, name: string) {
  return getFieldError(state.fieldErrors, name);
}

export function StaffProfileCreateForm({
  branchOptions,
  defaultBranchId
}: {
  branchOptions: BranchOption[];
  defaultBranchId?: string;
}) {
  const [state, formAction] = useActionState(createStaffProfileAction, initialState);

  return (
    <form action={formAction} className="premium-card grid gap-3 p-4 md:grid-cols-4">
      <div className="md:col-span-4">
        <FormMessage state={state} />
      </div>
      <div className="md:col-span-4">
        <DataCollectionNotice audience="staff" />
      </div>
      <FormField id="create-staff-branch" label="Branch" required helpText="Only accessible branches are available." error={fieldError(state, "branchId")}>
        <select id="create-staff-branch" name="branchId" required defaultValue={defaultBranchId} disabled={!branchOptions.length} className="min-h-11 w-full">
          {!branchOptions.length ? <option value="">No branch access</option> : null}
          {branchOptions.map((branch) => (
            <option key={branch.id} value={branch.id}>{branch.name}</option>
          ))}
        </select>
      </FormField>
      <FormField id="create-staff-employee-code" label="Employee Code" required helpText="Unique staff code used by the school." error={fieldError(state, "employeeCode")}>
        <input id="create-staff-employee-code" name="employeeCode" placeholder="EMP-001" required aria-invalid={Boolean(fieldError(state, "employeeCode"))} className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-first-name" label="First Name" required error={fieldError(state, "firstName")}>
        <input id="create-staff-first-name" name="firstName" placeholder="First name" required aria-invalid={Boolean(fieldError(state, "firstName"))} className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-last-name" label="Last Name" error={fieldError(state, "lastName")}>
        <input id="create-staff-last-name" name="lastName" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-middle-name" label="Middle Name" error={fieldError(state, "middleName")}>
        <input id="create-staff-middle-name" name="middleName" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-type" label="Staff Type" required helpText="Choose the closest teaching or non-teaching category." error={fieldError(state, "staffType")}>
        <select id="create-staff-type" name="staffType" required defaultValue="TEACHER" className="min-h-11 w-full">
          {staffTypeOptions.map((staffType) => (
            <option key={staffType} value={staffType}>{formatEnumLabel(staffType)}</option>
          ))}
        </select>
      </FormField>
      <FormField id="create-staff-designation" label="Designation" error={fieldError(state, "designation")}>
        <input id="create-staff-designation" name="designation" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-department" label="Department" helpText="Examples: Academics, Admin, Transport." error={fieldError(state, "department")}>
        <input id="create-staff-department" name="department" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-phone" label="Mobile" helpText="Use a valid Indian mobile number when provided." error={fieldError(state, "phone")}>
        <input id="create-staff-phone" name="phone" type="tel" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-email" label="Email" error={fieldError(state, "email")}>
        <input id="create-staff-email" name="email" type="email" placeholder="Optional" className="min-h-11 w-full" />
      </FormField>
      <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-4 md:col-span-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <label htmlFor="create-staff-login-access" className="flex items-center gap-3 text-sm font-semibold text-slate-900">
              <input
                id="create-staff-login-access"
                name="createLoginAccess"
                type="checkbox"
                className="size-4 rounded border-slate-300 text-brand-700 focus:ring-brand-200"
              />
              Create login access
            </label>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Login uses School ID plus employee code or email. A passkey can be added after the temporary password is changed.
            </p>
          </div>
          <span className="premium-muted-chip">Optional app access</span>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <FormField id="create-staff-login-role" label="Login Role" helpText="Restricted to non-platform school roles." error={fieldError(state, "loginRoleCode")}>
            <select id="create-staff-login-role" name="loginRoleCode" defaultValue="STAFF" className="min-h-11 w-full">
              {loginRoleOptions.map((role) => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </FormField>
          <FormField id="create-staff-initial-password" label="Temporary Password" error={fieldError(state, "initialPassword")}>
            <PasswordInput id="create-staff-initial-password" name="initialPassword" autoComplete="new-password" className="min-h-11 w-full" />
          </FormField>
          <FormField id="create-staff-confirm-initial-password" label="Confirm Temporary Password" error={fieldError(state, "confirmInitialPassword")}>
            <PasswordInput id="create-staff-confirm-initial-password" name="confirmInitialPassword" autoComplete="new-password" className="min-h-11 w-full" />
          </FormField>
        </div>
      </div>
      <FormField id="create-staff-joining-date" label="Joining Date" error={fieldError(state, "joiningDate")}>
        <input id="create-staff-joining-date" name="joiningDate" type="date" className="min-h-11 w-full" />
      </FormField>
      <FormField id="create-staff-employment-status" label="Employment Status" error={fieldError(state, "employmentStatus")}>
        <select id="create-staff-employment-status" name="employmentStatus" defaultValue="ACTIVE" className="min-h-11 w-full">
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="RESIGNED">Resigned</option>
          <option value="TERMINATED">Terminated</option>
        </select>
      </FormField>
      <div className="flex items-end">
        <SubmitButton disabled={!branchOptions.length} pendingLabel="Creating...">Add Staff</SubmitButton>
      </div>
    </form>
  );
}
