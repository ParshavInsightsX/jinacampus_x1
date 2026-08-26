import Link from "next/link";
import { ErrorState } from "@/components/ui/empty-state";
import { forbidden } from "@/lib/errors";
import { requireAuth } from "@/lib/auth/require-auth";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { getAttendanceEntitlementState, requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { AttendanceSessionMarkForm } from "@/modules/academia/components/attendance/attendance-session-mark-form";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { listClassSectionsForAttendance } from "@/modules/academia/queries";
import { isStudentAttendanceSessionSchemaAvailable } from "@/modules/academia/services/student-attendance-schema-readiness";
import { academiaAttendanceRoutes } from "@/modules/academia/ui-config";
import { dateOnlyStringInTimeZone } from "@/lib/dates/time-zone";

type MarkAttendancePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function MarkStudentAttendancePage({ searchParams }: MarkAttendancePageProps) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const today = dateOnlyStringInTimeZone(new Date(), ctx.timeZone);
  const requestedDate = firstValue(params?.date);
  const selectedDate = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : today;
  const requestedClassSectionId = firstValue(params?.classSectionId);
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE, operation: "READ" },
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MARKING, operation: "WRITE" }
  ], { branchId: ctx.activeBranchId });
  const permissions = await getEffectivePermissions({
    ctx,
    branchId: ctx.activeBranchId,
    academicYearId: ctx.activeAcademicYearId
  });
  const entitlementState = await getAttendanceEntitlementState(ctx, { branchId: ctx.activeBranchId });

  if (!permissions.has("academia.attendance.view") || !permissions.has("academia.attendance.mark")) {
    throw forbidden("FORBIDDEN_ATTENDANCE_MARK_ACCESS");
  }

  const schemaAvailable = await isStudentAttendanceSessionSchemaAvailable();
  const classSections = schemaAvailable
    ? await listClassSectionsForAttendance(ctx, new Date(`${selectedDate}T00:00:00.000Z`))
    : [];
  const defaultClassSectionId = requestedClassSectionId &&
    classSections.some((item) => item.id === requestedClassSectionId)
      ? requestedClassSectionId
      : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Student Attendance"
          description="Open your class, mark exceptions first, then mark the remaining students Present and finish."
        />
        <Link
          href={academiaAttendanceRoutes.overview}
          className="premium-secondary-button w-full sm:w-auto premium-focus"
        >
          Attendance Overview
        </Link>
      </div>

      {schemaAvailable ? (
        <AttendanceSessionMarkForm
          classSections={classSections}
          defaultDate={selectedDate}
          defaultClassSectionId={defaultClassSectionId}
          canCorrect={
            permissions.has("academia.attendance.correct") &&
            entitlementState.features[ATTENDANCE_ENTITLEMENT_FEATURES.CORRECTION].write
          }
        />
      ) : (
        <ErrorState
          title="Student Attendance is temporarily unavailable"
          description="The required attendance setup is still being completed. Please contact the JinaCampus Administrator."
        />
      )}
    </div>
  );
}
