import type { Prisma } from "@prisma/client";
import type { GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";

export async function enqueueGradebookDomainEvent(
  tx: Prisma.TransactionClient,
  ctx: GradebookRequestContext,
  input: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Prisma.InputJsonValue;
    idempotencyKey: string;
    eventVersion?: number;
    branchId?: string | null;
    academicYearId?: string | null;
  }
) {
  return tx.gradebookDomainEventOutbox.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: {
      tenantId: ctx.tenantId,
      branchId: input.branchId === undefined ? ctx.branchId : input.branchId,
      academicYearId: input.academicYearId === undefined ? ctx.academicYearId : input.academicYearId,
      eventType: input.eventType,
      eventVersion: input.eventVersion ?? 1,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      payloadJson: input.payload,
      idempotencyKey: input.idempotencyKey,
      correlationId: ctx.correlationId
    },
    update: {}
  });
}
