import { PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { StaffQrDisplay } from "@/modules/staffboard-lite/components/attendance/staff-qr-display";
import { StaffQrHelpCard } from "@/modules/staffboard-lite/components/attendance/staff-qr-help-card";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listStaffQrBranchOptions } from "@/modules/staffboard-lite/queries";

export default async function StaffQrAttendancePage() {
  const ctx = await requireAuth();
  const branchOptions = await listStaffQrBranchOptions(ctx);
  if (branchOptions.length === 0) {
    return <PermissionState />;
  }
  const defaultBranchId =
    ctx.activeBranchId && branchOptions.some((branch) => branch.id === ctx.activeBranchId)
      ? ctx.activeBranchId
      : branchOptions[0].id;

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR Attendance Console"
        description="Authorised Principals and Office Staff QR Operators can generate and control five-hour attendance codes."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <StaffQrDisplay branchOptions={branchOptions} defaultBranchId={defaultBranchId} />
        <StaffQrHelpCard />
      </div>
    </div>
  );
}
