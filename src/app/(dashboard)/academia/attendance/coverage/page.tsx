import Link from "next/link";
import { ErrorState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { dateOnlyStringInTimeZone } from "@/lib/dates/time-zone";
import { AttendanceCoverageManager } from "@/modules/academia/components/attendance/attendance-coverage-manager";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { isStudentAttendanceSessionSchemaAvailable } from "@/modules/academia/services/student-attendance-schema-readiness";
import { listStudentAttendanceCoverage } from "@/modules/academia/services/student-attendance-duty.service";
import { academiaAttendanceRoutes } from "@/modules/academia/ui-config";

type CoveragePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function safeDate(value: string | string[] | undefined, fallback: string) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

export default async function StudentAttendanceCoveragePage({ searchParams }: CoveragePageProps) {
  const ctx = await requireAuth();
  const params = await searchParams;
  const today = dateOnlyStringInTimeZone(new Date(), ctx.timeZone);
  const selectedDate = safeDate(params?.date, today);
  const schemaAvailable = await isStudentAttendanceSessionSchemaAvailable();
  const view = schemaAvailable
    ? await listStudentAttendanceCoverage(ctx, { attendanceDate: selectedDate, sessionType: "FULL_DAY" })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="Attendance Coverage"
          description="Keep every class covered when the usual class teacher is unavailable. Duties are temporary, acknowledged, and audited."
        />
        <Link href={academiaAttendanceRoutes.overview} className="premium-secondary-button min-h-11 w-full sm:w-auto premium-focus">
          Attendance Overview
        </Link>
      </div>

      <form method="get" className="premium-card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="flex-1 text-sm font-semibold text-slate-700">
          Attendance date
          <input type="date" name="date" defaultValue={selectedDate} className="mt-2 min-h-11 w-full" />
        </label>
        <button type="submit" className="premium-secondary-button min-h-11 w-full sm:w-auto premium-focus">View Coverage</button>
      </form>

      {view ? (
        <AttendanceCoverageManager view={view} />
      ) : (
        <ErrorState
          title="Attendance coverage is temporarily unavailable"
          description="The required attendance continuity setup has not been applied to this environment."
        />
      )}
    </div>
  );
}
