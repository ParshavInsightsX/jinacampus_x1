import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { forbidden } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { StaffQrSelfNavigation } from "@/modules/staffboard-lite/components/attendance/staff-qr-self-navigation";
import { StaffQrScanForm } from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-form";
import { StaffQrScanHelpCard } from "@/modules/staffboard-lite/components/attendance/staff-qr-scan-help-card";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";

export default async function StaffQrScanPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.self_scan")) {
    throw forbidden("FORBIDDEN_STAFF_QR_SCAN_ACCESS");
  }
  const canViewAttendance = permissions.has("staffboard.attendance.self_view");

  return (
    <div className="space-y-6">
      <div className="lg:hidden" data-mobile-qr-scan-page="true">
        <MobilePageHeader
          eyebrow="Staff attendance"
          title="Scan QR"
          description="Open the camera, scan the live school QR, or use manual fallback if the browser blocks camera access."
        />
        <div className="mt-4 space-y-4">
          <StaffQrSelfNavigation active="scan" canScan canViewAttendance={canViewAttendance} />
          <StaffQrScanForm variant="mobile" />
        </div>
      </div>

      <div className="hidden space-y-6 lg:block" data-desktop-qr-scan-page="true">
        <PageHeader
          title="Staff Attendance Scan"
          description="Scan the QR code displayed at the school office or gate to mark your check-in or check-out."
        />

        <StaffQrSelfNavigation active="scan" canScan canViewAttendance={canViewAttendance} />

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <StaffQrScanForm />
          <StaffQrScanHelpCard />
        </div>
      </div>
    </div>
  );
}
