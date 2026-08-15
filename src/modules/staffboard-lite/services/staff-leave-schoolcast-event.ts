import { type Prisma } from "@prisma/client";

import {
  enqueueSchoolCastDomainEvent,
  SCHOOLCAST_SOURCE_EVENTS
} from "@/modules/schoolcast/services/domain-event.service";

type StaffLeaveEventInput = {
  tenantId: string;
  branchId: string;
  applicationId: string;
  actionId: string;
  action: string;
  staffId: string;
  status: string;
  startDate: Date;
  endDate: Date;
};

export async function enqueueStaffLeaveSchoolCastEvent(
  tx: Prisma.TransactionClient,
  input: StaffLeaveEventInput
) {
  const branch = await tx.branch.findFirst({
    where: { id: input.branchId, tenantId: input.tenantId, status: "ACTIVE" },
    select: { institutionId: true }
  });
  if (!branch) return { queued: false, eventId: null };

  const academicYear = await tx.academicYear.findFirst({
    where: {
      tenantId: input.tenantId,
      institutionId: branch.institutionId,
      status: "ACTIVE",
      startDate: { lte: input.startDate },
      endDate: { gte: input.startDate }
    },
    orderBy: { startDate: "desc" },
    select: { id: true }
  });
  if (!academicYear) return { queued: false, eventId: null };

  return enqueueSchoolCastDomainEvent(tx, {
    tenantId: input.tenantId,
    branchId: input.branchId,
    academicYearId: academicYear.id,
    sourceModule: "STAFFBOARD",
    sourceEventId: input.actionId,
    eventType: SCHOOLCAST_SOURCE_EVENTS.STAFF_LEAVE_CHANGED,
    sourceEntityType: "StaffLeaveApplication",
    sourceEntityId: input.applicationId,
    payload: {
      action: input.action,
      actionId: input.actionId,
      staffId: input.staffId,
      status: input.status,
      startDate: input.startDate.toISOString().slice(0, 10),
      endDate: input.endDate.toISOString().slice(0, 10)
    }
  });
}
