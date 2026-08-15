import { type Prisma } from "@prisma/client";

import {
  enqueueSchoolCastDomainEvent,
  SCHOOLCAST_SOURCE_EVENTS
} from "@/modules/schoolcast/services/domain-event.service";

type StaffAttendanceEventRecord = {
  id: string;
  tenantId: string;
  branchId: string;
  academicYearId: string | null;
  staffId: string;
  status: string;
  attendanceDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  updatedAt: Date;
};

export async function enqueueStaffAttendanceSchoolCastEvent(
  tx: Prisma.TransactionClient,
  record: StaffAttendanceEventRecord,
  action: "CHECK_IN" | "CHECK_OUT" | "CORRECTED"
) {
  if (!record.academicYearId) return { queued: false, eventId: null };

  return enqueueSchoolCastDomainEvent(tx, {
    tenantId: record.tenantId,
    branchId: record.branchId,
    academicYearId: record.academicYearId,
    sourceModule: "STAFFBOARD",
    sourceEventId: `${record.id}:${record.updatedAt.toISOString()}:${action}`,
    eventType: SCHOOLCAST_SOURCE_EVENTS.STAFF_ATTENDANCE_RECORDED,
    sourceEntityType: "StaffAttendanceRecord",
    sourceEntityId: record.id,
    payload: {
      action,
      attendanceRecordId: record.id,
      staffId: record.staffId,
      status: record.status,
      attendanceDate: record.attendanceDate.toISOString().slice(0, 10),
      checkInAt: record.checkInAt?.toISOString() ?? null,
      checkOutAt: record.checkOutAt?.toISOString() ?? null,
      recordVersion: record.updatedAt.toISOString()
    }
  });
}
