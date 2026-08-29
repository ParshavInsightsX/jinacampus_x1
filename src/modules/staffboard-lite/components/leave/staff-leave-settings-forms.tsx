"use client";

import { useActionState } from "react";
import {
  adjustStaffLeaveBalanceAction,
  setStaffLeaveApproverAction,
  updateStaffLeaveSettingAction,
  upsertStaffLeaveTypeAction,
  type StaffLeaveActionState
} from "@/modules/staffboard-lite/actions/staff-leave.actions";

const initialState: StaffLeaveActionState = { ok: false };

type LeavePolicy = {
  allowHalfDay: boolean;
  allowBackdatedApplications: boolean;
  minimumNoticeDays: number;
  maximumConsecutiveDays: number;
  nonWorkingWeekdays: number[];
  approvalMode: "PRINCIPAL_ONLY" | "DESIGNATED_APPROVERS" | "PRINCIPAL_OR_DESIGNATED";
  whatsappNotificationsEnabled: boolean;
};

type LeaveType = {
  id: string;
  code: string;
  name: string;
  isPaid: boolean;
  balanceTracked: boolean;
  annualLimit: number;
  carryForwardLimit: number;
  allowHalfDay: boolean;
  supportingDocumentRequired: boolean;
  documentRequiredAfterDays: number | null;
  isActive: boolean;
};

type Person = { id: string; name: string; detail: string };
type Approver = Person & { isActive: boolean };

function Result({ state }: { state: StaffLeaveActionState }) {
  if (!state.message) return null;
  return <p role={state.ok ? "status" : "alert"} className={`rounded-lg border p-3 text-sm ${state.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{state.message}</p>;
}
function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-sm text-slate-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

function LeaveTypeForm({ branchId, leaveType, action, pending }: { branchId: string; leaveType?: LeaveType; action: (payload: FormData) => void; pending: boolean }) {
  return (
    <form action={action} className="space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <input type="hidden" name="branchId" value={branchId} />
      {leaveType ? <input type="hidden" name="leaveTypeId" value={leaveType.id} /> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm font-semibold text-slate-700">Code<input name="code" defaultValue={leaveType?.code ?? ""} placeholder="CASUAL" required maxLength={24} className="mt-2 min-h-11 w-full uppercase" /></label>
        <label className="text-sm font-semibold text-slate-700">Name<input name="name" defaultValue={leaveType?.name ?? ""} placeholder="Casual Leave" required maxLength={80} className="mt-2 min-h-11 w-full" /></label>
        <label className="text-sm font-semibold text-slate-700">Annual limit<input name="annualLimit" type="number" min="0" max="366" step="0.5" defaultValue={leaveType?.annualLimit ?? 0} required className="mt-2 min-h-11 w-full" /></label>
        <label className="text-sm font-semibold text-slate-700">Carry-forward limit<input name="carryForwardLimit" type="number" min="0" max="366" step="0.5" defaultValue={leaveType?.carryForwardLimit ?? 0} required className="mt-2 min-h-11 w-full" /></label>
        <label className="text-sm font-semibold text-slate-700">Document required after days<input name="documentRequiredAfterDays" type="number" min="1" max="365" defaultValue={leaveType?.documentRequiredAfterDays ?? ""} className="mt-2 min-h-11 w-full" /></label>
        <div className="grid grid-cols-2 gap-x-3">
          <Toggle name="isPaid" label="Paid leave" defaultChecked={leaveType?.isPaid ?? true} />
          <Toggle name="balanceTracked" label="Track balance" defaultChecked={leaveType?.balanceTracked ?? true} />
          <Toggle name="allowHalfDay" label="Allow half day" defaultChecked={leaveType?.allowHalfDay ?? true} />
          <Toggle name="supportingDocumentRequired" label="Always require document" defaultChecked={leaveType?.supportingDocumentRequired ?? false} />
          <Toggle name="isActive" label="Active" defaultChecked={leaveType?.isActive ?? true} />
        </div>
      </div>
      <button disabled={pending} className="premium-primary-button min-h-11">{pending ? "Saving..." : leaveType ? "Update leave type" : "Add leave type"}</button>
    </form>
  );
}

export function StaffLeaveSettingsForms({
  branchId,
  defaultYear,
  policy,
  leaveTypes,
  approvers,
  approverCandidates,
  staffCandidates
}: {
  branchId: string;
  defaultYear: number;
  policy: LeavePolicy;
  leaveTypes: LeaveType[];
  approvers: Approver[];
  approverCandidates: Person[];
  staffCandidates: Person[];
}) {
  const [policyState, policyAction, policyPending] = useActionState(updateStaffLeaveSettingAction, initialState);
  const [typeState, typeAction, typePending] = useActionState(upsertStaffLeaveTypeAction, initialState);
  const [approverState, approverAction, approverPending] = useActionState(setStaffLeaveApproverAction, initialState);
  const [balanceState, balanceAction, balancePending] = useActionState(adjustStaffLeaveBalanceAction, initialState);

  return (
    <div className="space-y-6">
      <form action={policyAction} className="premium-card space-y-4 p-4 sm:p-5">
        <input type="hidden" name="branchId" value={branchId} />
        <div><h2 className="text-lg font-semibold text-slate-950">Branch leave policy</h2><p className="mt-1 text-sm text-slate-500">These controls define validation and approval routing. They do not replace the institution&apos;s approved HR policy.</p></div>
        <Result state={policyState} />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Minimum notice days<input name="minimumNoticeDays" type="number" min="0" max="365" defaultValue={policy.minimumNoticeDays} required className="mt-2 min-h-11 w-full" /></label>
          <label className="text-sm font-semibold text-slate-700">Maximum consecutive days<input name="maximumConsecutiveDays" type="number" min="1" max="365" defaultValue={policy.maximumConsecutiveDays} required className="mt-2 min-h-11 w-full" /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Approval authority<select name="approvalMode" defaultValue={policy.approvalMode} className="mt-2 min-h-11 w-full"><option value="PRINCIPAL_ONLY">Principal only</option><option value="DESIGNATED_APPROVERS">Designated approvers only</option><option value="PRINCIPAL_OR_DESIGNATED">Principal or designated approver</option></select></label>
          <fieldset className="md:col-span-2"><legend className="text-sm font-semibold text-slate-700">Non-working weekdays</legend><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-7">{["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((label, day) => <label key={label} className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm"><input type="checkbox" name="nonWorkingWeekdays" value={day} defaultChecked={policy.nonWorkingWeekdays.includes(day)} />{label}</label>)}</div></fieldset>
          <div className="md:col-span-2 grid gap-2 sm:grid-cols-3"><Toggle name="allowHalfDay" label="Allow half-day leave" defaultChecked={policy.allowHalfDay} /><Toggle name="allowBackdatedApplications" label="Allow backdated applications" defaultChecked={policy.allowBackdatedApplications} /><Toggle name="whatsappNotificationsEnabled" label="Enable consented WhatsApp updates" defaultChecked={policy.whatsappNotificationsEnabled} /></div>
        </div>
        <button disabled={policyPending} className="premium-primary-button min-h-11">{policyPending ? "Saving..." : "Save leave policy"}</button>
      </form>

      <section className="premium-card space-y-4 p-4 sm:p-5">
        <div><h2 className="text-lg font-semibold text-slate-950">Leave types</h2><p className="mt-1 text-sm text-slate-500">Configure entitlement and evidence rules from the school&apos;s approved policy. No statutory limits are assumed.</p></div>
        <Result state={typeState} />
        <LeaveTypeForm branchId={branchId} action={typeAction} pending={typePending} />
        {leaveTypes.map((leaveType) => <LeaveTypeForm key={leaveType.id} branchId={branchId} leaveType={leaveType} action={typeAction} pending={typePending} />)}
      </section>

      <section className="premium-card space-y-4 p-4 sm:p-5">
        <div><h2 className="text-lg font-semibold text-slate-950">Designated approvers</h2><p className="mt-1 text-sm text-slate-500">Only active Principal or Office Staff users with branch access can be designated.</p></div>
        <Result state={approverState} />
        <form action={approverAction} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="isActive" value="true" />
          <label className="text-sm font-semibold text-slate-700">User<select name="userId" required defaultValue="" className="mt-2 min-h-11 w-full"><option value="" disabled>Select Principal or Office Staff</option>{approverCandidates.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.detail}</option>)}</select></label>
          <button disabled={approverPending} className="premium-primary-button min-h-11">Add approver</button>
        </form>
        <div className="space-y-2">{approvers.length ? approvers.map((approver) => <div key={approver.id} className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-slate-900">{approver.name}</p><p className="text-xs text-slate-500">{approver.detail} · {approver.isActive ? "Active" : "Inactive"}</p></div><form action={approverAction}><input type="hidden" name="branchId" value={branchId} /><input type="hidden" name="userId" value={approver.id} /><input type="hidden" name="isActive" value={approver.isActive ? "false" : "true"} /><button disabled={approverPending} className="premium-secondary-button min-h-11">{approver.isActive ? "Disable" : "Enable"}</button></form></div>) : <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No designated approvers. Principal approval remains available unless policy is changed.</p>}</div>
      </section>

      <form action={balanceAction} className="premium-card space-y-4 p-4 sm:p-5">
        <input type="hidden" name="branchId" value={branchId} />
        <div><h2 className="text-lg font-semibold text-slate-950">Leave balance adjustment</h2><p className="mt-1 text-sm text-slate-500">Record a positive or negative adjustment with an auditable reason.</p></div>
        <Result state={balanceState} />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm font-semibold text-slate-700">Staff member<select name="staffId" required defaultValue="" className="mt-2 min-h-11 w-full"><option value="" disabled>Select staff member</option>{staffCandidates.map((person) => <option key={person.id} value={person.id}>{person.name} - {person.detail}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Tracked leave type<select name="leaveTypeId" required defaultValue="" className="mt-2 min-h-11 w-full"><option value="" disabled>Select leave type</option>{leaveTypes.filter((type) => type.balanceTracked).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
          <label className="text-sm font-semibold text-slate-700">Year<input name="year" type="number" min="2000" max="2200" defaultValue={defaultYear} required className="mt-2 min-h-11 w-full" /></label>
          <label className="text-sm font-semibold text-slate-700">Adjustment days<input name="adjustmentDays" type="number" min="-366" max="366" step="0.5" required className="mt-2 min-h-11 w-full" /></label>
          <label className="text-sm font-semibold text-slate-700 md:col-span-2">Reason<textarea name="reason" rows={3} minLength={10} maxLength={1000} required className="mt-2 w-full" /></label>
        </div>
        <button disabled={balancePending} className="premium-primary-button min-h-11">{balancePending ? "Saving..." : "Record adjustment"}</button>
      </form>
    </div>
  );
}
