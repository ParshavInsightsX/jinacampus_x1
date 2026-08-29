import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getZonedDateTimeParts } from "@/lib/dates/time-zone";
import { AppError } from "@/lib/errors";
import { StaffLeaveSettingsForms } from "@/modules/staffboard-lite/components/leave/staff-leave-settings-forms";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { getStaffLeaveSettingsWorkspace } from "@/modules/staffboard-lite/queries";

function userName(user: { displayName: string | null; firstName: string; lastName: string | null }) {
  return user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function staffName(staff: { firstName: string; middleName: string | null; lastName: string | null }) {
  return [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ");
}

export default async function StaffLeaveSettingsPage() {
  const ctx = await requireAuth();
  let workspace;
  try {
    workspace = await getStaffLeaveSettingsWorkspace(ctx);
  } catch (error) {
    if (!(error instanceof AppError) || (error.status !== 403 && error.status !== 404)) throw error;
    return <PermissionState />;
  }
  if (!workspace) return <PermissionState title="Select a branch" description="Choose an authorised branch before configuring its leave policy." />;
  const policy = workspace.setting ?? {
    allowHalfDay: true,
    allowBackdatedApplications: false,
    minimumNoticeDays: 0,
    maximumConsecutiveDays: 30,
    nonWorkingWeekdays: [0],
    approvalMode: "PRINCIPAL_OR_DESIGNATED" as const,
    whatsappNotificationsEnabled: false
  };
  const defaultYear = getZonedDateTimeParts(new Date(), ctx.timeZone).year;

  return (
    <div className="space-y-6">
      <PageHeader title="Leave Settings" description={`Policy, types, approvers, and balance controls for ${workspace.branch.name}.`} />
      <StaffLeaveSettingsForms
        branchId={workspace.branch.id}
        defaultYear={defaultYear}
        policy={{
          allowHalfDay: policy.allowHalfDay,
          allowBackdatedApplications: policy.allowBackdatedApplications,
          minimumNoticeDays: policy.minimumNoticeDays,
          maximumConsecutiveDays: policy.maximumConsecutiveDays,
          nonWorkingWeekdays: policy.nonWorkingWeekdays,
          approvalMode: policy.approvalMode,
          whatsappNotificationsEnabled: policy.whatsappNotificationsEnabled
        }}
        leaveTypes={workspace.leaveTypes.map((type) => ({
          id: type.id,
          code: type.code,
          name: type.name,
          isPaid: type.isPaid,
          balanceTracked: type.balanceTracked,
          annualLimit: type.annualLimit.toNumber(),
          carryForwardLimit: type.carryForwardLimit.toNumber(),
          allowHalfDay: type.allowHalfDay,
          supportingDocumentRequired: type.supportingDocumentRequired,
          documentRequiredAfterDays: type.documentRequiredAfterDays,
          isActive: type.isActive
        }))}
        approvers={workspace.approvers.map((approver) => ({ id: approver.user.id, name: userName(approver.user), detail: approver.user.email, isActive: approver.isActive }))}
        approverCandidates={workspace.candidates.map((user) => ({ id: user.id, name: userName(user), detail: user.email }))}
        staffCandidates={workspace.staff.map((staff) => ({ id: staff.id, name: staffName(staff), detail: staff.employeeCode }))}
      />
    </div>
  );
}
