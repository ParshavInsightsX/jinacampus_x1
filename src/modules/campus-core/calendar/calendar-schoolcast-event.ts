import { type AcademicCalendarEntry, type Prisma } from "@prisma/client";

import {
  enqueueSchoolCastDomainEvent,
  SCHOOLCAST_SOURCE_EVENTS
} from "@/modules/schoolcast/services/domain-event.service";

export async function enqueueCalendarSchoolCastEvents(
  tx: Prisma.TransactionClient,
  entry: AcademicCalendarEntry,
  targetBranchIds: readonly string[],
  action: "CREATED" | "UPDATED" | "CANCELLED"
) {
  const results = [];
  for (const branchId of Array.from(new Set(targetBranchIds))) {
    results.push(await enqueueSchoolCastDomainEvent(tx, {
      tenantId: entry.tenantId,
      branchId,
      academicYearId: entry.academicYearId,
      sourceModule: "CAMPUSCORE",
      sourceEventId: `${entry.id}:${entry.updatedAt.toISOString()}:${branchId}:${action}`,
      eventType: SCHOOLCAST_SOURCE_EVENTS.CALENDAR_CHANGED,
      sourceEntityType: "AcademicCalendarEntry",
      sourceEntityId: entry.id,
      payload: {
        action,
        calendarEntryId: entry.id,
        entryType: entry.entryType,
        status: entry.status,
        startDate: entry.startDate.toISOString().slice(0, 10),
        endDate: entry.endDate.toISOString().slice(0, 10),
        recordVersion: entry.updatedAt.toISOString()
      }
    }));
  }
  return results;
}
