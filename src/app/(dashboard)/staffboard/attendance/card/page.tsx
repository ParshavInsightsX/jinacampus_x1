import { AlertTriangle, IdCard } from "lucide-react";
import { MobilePageHeader } from "@/components/app-shell/mobile-page-header";
import { ErrorState, PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { isIdentityCardSchemaAvailable } from "@/lib/schema-readiness/identity-cards";
import { StaffIdentityCard } from "@/modules/staffboard-lite/components/attendance/staff-identity-card";
import { StaffQrSelfNavigation } from "@/modules/staffboard-lite/components/attendance/staff-qr-self-navigation";
import { PageHeader } from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { getMyStaffAttendanceCredentialCard } from "@/modules/staffboard-lite/services/staff-attendance-credentials.service";

const stateCopy = {
  NOT_ISSUED: {
    title: "Attendance card not issued",
    description: "Ask your Principal to issue your staff attendance card."
  },
  EXPIRED: {
    title: "Attendance card expired",
    description: "This card can no longer be used. Ask your Principal to issue a replacement."
  },
  REISSUE_REQUIRED: {
    title: "Card reissue required",
    description: "Your existing card remains protected, but secure digital viewing requires a newly issued card."
  }
} as const;

export default async function MyStaffAttendanceCardPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.attendance.credential.self_view")) return <PermissionState />;

  const schemaAvailable = await isIdentityCardSchemaAvailable();
  const result = schemaAvailable ? await getMyStaffAttendanceCredentialCard(ctx) : null;
  const canViewAttendance = permissions.has("staffboard.attendance.self_view");

  return (
    <div className="attendance-page-wash space-y-5 rounded-lg p-1 sm:p-2">
      <div className="lg:hidden">
        <MobilePageHeader
          eyebrow="Staff Profile"
          title="My Staff Card"
          description="Show this card to an authorised attendance operator."
        />
      </div>
      <div className="hidden lg:block">
        <PageHeader
          title="My Staff Attendance Card"
          description="Display your active card for supervised attendance scanning. Printing and downloading are not available."
        />
      </div>

      <StaffQrSelfNavigation
        active="card"
        canViewCard
        canViewAttendance={canViewAttendance}
      />

      {!result ? (
        <ErrorState
          title="My Staff Card is temporarily unavailable"
          description="The required identity-card setup is still being completed. Please contact the JinaCampus Administrator."
        />
      ) : result.state === "AVAILABLE" ? (
        <section className="attendance-glass-panel mx-auto max-w-5xl p-4 sm:p-6">
          <div className="mb-5 flex items-start gap-3 rounded-lg border border-cyan-200 bg-cyan-50/90 p-4 text-sm text-cyan-950">
            <IdCard className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">Present this digital card at the attendance desk</p>
              <p className="mt-1 leading-6">
                An authorised Principal or attendance operator must scan it. You cannot scan your own attendance.
              </p>
            </div>
          </div>
          <StaffIdentityCard card={result.card} mode="self" />
        </section>
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
