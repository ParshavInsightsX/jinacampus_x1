import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";

export type StudentAttendanceSchemaProbeClient = Pick<Prisma.TransactionClient, "$queryRaw">;

const SCHEMA_PROBE_TTL_MS = 30_000;
let schemaAvailabilityCache: { available: boolean; expiresAt: number } | null = null;

export async function isStudentAttendanceSessionSchemaAvailable(
  client: StudentAttendanceSchemaProbeClient = db
) {
  const now = Date.now();
  const useCache = client === db && process.env.NODE_ENV !== "test";
  if (useCache && schemaAvailabilityCache && schemaAvailabilityCache.expiresAt > now) {
    return schemaAvailabilityCache.available;
  }

  // A Prisma model query would throw when application code is ahead of its migration.
  const [probe] = await client.$queryRaw<Array<{
    sessionTableAvailable: boolean;
    rosterTableAvailable: boolean;
    entryTableAvailable: boolean;
    mutationTableAvailable: boolean;
    dutyTableAvailable: boolean;
    continuityColumnsAvailable: boolean;
  }>>(Prisma.sql`
    SELECT
      to_regclass('public.student_attendance_sessions') IS NOT NULL AS "sessionTableAvailable",
      to_regclass('public.student_attendance_session_roster') IS NOT NULL AS "rosterTableAvailable",
      to_regclass('public.student_attendance_session_entries') IS NOT NULL AS "entryTableAvailable",
      to_regclass('public.student_attendance_mutations') IS NOT NULL AS "mutationTableAvailable",
      to_regclass('public.student_attendance_duty_assignments') IS NOT NULL AS "dutyTableAvailable",
      (
        SELECT COUNT(*) = 6
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'student_attendance_sessions'
          AND column_name IN (
            'responsibleUserId',
            'responsibilitySource',
            'originalClassTeacherUserId',
            'delegatedByUserId',
            'delegationReason',
            'responsibilityTransferredAt'
          )
      ) AS "continuityColumnsAvailable"
  `);
  const available = Boolean(
    probe?.sessionTableAvailable &&
      probe.rosterTableAvailable &&
      probe.entryTableAvailable &&
      probe.mutationTableAvailable &&
      probe.dutyTableAvailable &&
      probe.continuityColumnsAvailable
  );

  if (useCache) {
    schemaAvailabilityCache = {
      available,
      expiresAt: now + SCHEMA_PROBE_TTL_MS
    };
  }
  return available;
}

export async function requireStudentAttendanceSessionSchema(
  client: StudentAttendanceSchemaProbeClient = db
) {
  if (!(await isStudentAttendanceSessionSchemaAvailable(client))) {
    throw new AppError(
      "STUDENT_ATTENDANCE_UPGRADE_REQUIRED",
      "STUDENT_ATTENDANCE_UPGRADE_REQUIRED",
      503
    );
  }
}