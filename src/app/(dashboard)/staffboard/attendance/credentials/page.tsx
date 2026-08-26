import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { ErrorState, PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { hasPrincipalRole } from "@/lib/rbac/roles";
import { isIdentityCardSchemaAvailable } from "@/lib/schema-readiness/identity-cards";
import { StaffAttendanceCredentialManager } from "@/modules/staffboard-lite/components/attendance/staff-attendance-credential-manager";
import { StaffAttendanceWorkspaceNav } from "@/modules/staffboard-lite/components/attendance/staff-attendance-workspace-nav";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { listStaffAttendanceCredentialRoster } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";

export default async function StaffAttendanceCredentialsPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.credential.manage") || !hasPrincipalRole(ctx.roleCodes)) return <PermissionState />;
  const schemaAvailable = await isIdentityCardSchemaAvailable();
  const rows = schemaAvailable ? await listStaffAttendanceCredentialRoster(ctx) : [];
  const institutionName = ctx.institutionDisplayName ?? ctx.institutionName ?? ctx.tenantName ?? "School";

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader eyebrow="Staff Attendance" title="Staff QR Cards" description="Create, print, reissue, or revoke staff attendance cards." />
      </div>
      <div className="hidden lg:block">
        <PageHeader title="Staff QR Cards" description="Issue and manage supervised staff attendance cards. Card preview and printing are restricted and audited." />
      </div>
      <StaffAttendanceWorkspaceNav
        active="credentials"
        canViewRegister={permissions.has("staffboard.attendance.view")}
        canScan={permissions.has("staffboard.attendance.scan")}
        canManageCredentials
        canViewCard={permissions.has("staffboard.attendance.credential.self_view")}
        canReviewAdjustments={permissions.has("staffboard.attendance.adjustment.approve")}
        canViewReports={permissions.has("staffboard.attendance.report")}
        canViewMine={permissions.has("staffboard.attendance.self_view")}
      />
      {schemaAvailable ? (
        <StaffAttendanceCredentialManager rows={rows} />
      ) : (
        <ErrorState
          title="Staff QR Cards are temporarily unavailable"
          description="The required identity-card setup is still being completed. Please contact the JinaCampus Administrator."
        />
      )}
    </div>
  );
}
