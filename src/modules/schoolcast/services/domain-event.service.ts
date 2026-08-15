import { Prisma } from "@prisma/client";

import { getSchoolCastDeploymentPolicy } from "@/modules/schoolcast/deployment-policy";
import { schoolCastContentHash } from "@/modules/schoolcast/policy";

export const SCHOOLCAST_SOURCE_EVENTS = {
  STUDENT_ATTENDANCE_RECORDED: "academia.student_attendance.recorded.v1",
  STAFF_ATTENDANCE_RECORDED: "staffboard.staff_attendance.recorded.v1",
  STAFF_LEAVE_CHANGED: "staffboard.staff_leave.changed.v1",
  CALENDAR_CHANGED: "campuscore.calendar.changed.v1",
  GRADEBOOK_RESULT_PUBLISHED: "gradebook.result.published.v1"
} as const;

export type SchoolCastSourceEventType =
  (typeof SCHOOLCAST_SOURCE_EVENTS)[keyof typeof SCHOOLCAST_SOURCE_EVENTS];

function json(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function enqueueSchoolCastDomainEvent(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    branchId?: string | null;
    academicYearId?: string | null;
    sourceModule: "ACADEMIA" | "STAFFBOARD" | "CAMPUSCORE" | "GRADEBOOK";
    sourceEventId: string;
    eventType: SchoolCastSourceEventType;
    sourceEntityType: string;
    sourceEntityId: string;
    payload: Record<string, unknown>;
    availableAt?: Date;
  }
) {
  if (!getSchoolCastDeploymentPolicy().sourceAutomation) {
    return { queued: false as const, eventId: null };
  }

  const settings = await tx.tenantSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: { schoolCastEnabled: true, schoolCastAutomationEnabled: true }
  });
  if (!settings?.schoolCastEnabled || !settings.schoolCastAutomationEnabled) {
    return { queued: false as const, eventId: null };
  }

  const payloadJson = json(input.payload);
  const payloadHash = schoolCastContentHash(input.payload);
  const event = await tx.schoolCastDomainEvent.upsert({
    where: {
      tenantId_sourceModule_sourceEventId: {
        tenantId: input.tenantId,
        sourceModule: input.sourceModule,
        sourceEventId: input.sourceEventId
      }
    },
    create: {
      tenantId: input.tenantId,
      branchId: input.branchId ?? null,
      academicYearId: input.academicYearId ?? null,
      sourceModule: input.sourceModule,
      sourceEventId: input.sourceEventId,
      eventType: input.eventType,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      payloadJson,
      payloadHash,
      availableAt: input.availableAt ?? new Date()
    },
    update: {},
    select: { id: true }
  });

  return { queued: true as const, eventId: event.id };
}
