import { forbidden } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/require-auth";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { AttendanceOverviewCards } from "@/modules/academia/components/attendance/attendance-overview-cards";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";

export default async function StudentAttendanceOverviewPage() {
  const ctx = await requireAuth();
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" }
  ], { branchId: ctx.activeBranchId });
  const permissions = await getEffectivePermissions({
    ctx,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  });

  if (!permissions.has("academia.attendance.view")) {
    throw forbidden("FORBIDDEN_ATTENDANCE_ACCESS");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Attendance"
        description="Mark and review daily full-day class-section attendance for the active branch and academic year."
      />

      <AttendanceOverviewCards />
    </div>
  );
}
