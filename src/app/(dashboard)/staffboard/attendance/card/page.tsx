import { AlertTriangle } from "lucide-react";
import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { ErrorState, PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { isIdentityCardSchemaAvailable } from "@/lib/schema-readiness/identity-cards";
import { StaffAttendanceQrPresentation } from "@/modules/staffboard-lite/components/attendance/staff-attendance-qr-presentation";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { getMyStaffAttendanceCredentialCard } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";
import { getMyStaffAttendanceQrLiveState } from "@/modules/staffboard-lite/services/staff-attendance-self.service";

const stateCopy = {
  NOT_ISSUED: {
    title: "Attendance QR not issued",
    description: "Ask your Principal to issue your Staff Attendance QR."
  },
  EXPIRED: {
    title: "Attendance QR expired",
    description: "This QR can no longer be used. Ask your Principal to issue a replacement."
  },
  REISSUE_REQUIRED: {
    title: "Attendance QR reissue required",
    description: "Your existing printed card remains protected, but digital display requires a newly issued Attendance QR."
  }
} as const;

export default async function MyStaffAttendanceCardPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.credential.self_view")) return <PermissionState />;

  const schemaAvailable = await isIdentityCardSchemaAvailable();
  const result = schemaAvailable ? await getMyStaffAttendanceCredentialCard(ctx) : null;
  const canViewAttendance = permissions.has("staffboard.attendance.self_view");
  let initialLiveState = null;
  if (result?.state === "AVAILABLE" && canViewAttendance) {
    try {
      initialLiveState = await getMyStaffAttendanceQrLiveState(ctx, result.card.credentialId);
    } catch {
      initialLiveState = { credentialState: "UNAVAILABLE" as const, attendance: null };
    }
  }

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader
          eyebrow="Staff Attendance"
          title="My Attendance"
          description="Show this QR to the authorised attendance scanner."
        />
      </div>
      <div className="hidden lg:block">
        <PageHeader
          title="My Attendance"
          description="Present your secure Attendance QR and receive confirmation when attendance is recorded."
        />
      </div>

      {!result ? (
        <ErrorState
          title="My Attendance QR is temporarily unavailable"
          description="The required identity-card setup is still being completed. Please contact the JinaCampus Administrator."
        />
      ) : result.state === "AVAILABLE" ? (
        <StaffAttendanceQrPresentation
          card={result.card}
          canMonitorAttendance={canViewAttendance}
          initialLiveState={initialLiveState}
          timeZone={safeTimeZone(ctx.timeZone)}
        />
      ) : (
        <section className="attendance-glass-panel mx-auto max-w-xl p-6 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-amber-600" aria-hidden="true" />
          <h2 className="mt-3 font-semibold text-slate-950">{stateCopy[result.state].title}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{stateCopy[result.state].description}</p>
        </section>
      )}
    </div>
  );
}
