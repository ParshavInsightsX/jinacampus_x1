import { z } from "zod";

export const attendanceSummaryRequestSchema = z.object({
  enrollmentId: z.string().uuid(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  termId: z.string().uuid().optional(),
  resultRunId: z.string().uuid().optional()
}).strict().refine((value) => value.periodEnd >= value.periodStart, {
  message: "The attendance period end must be on or after its start.",
  path: ["periodEnd"]
});

export const attendanceSnapshotIdSchema = z.object({
  attendanceSnapshotId: z.string().uuid()
}).strict();
