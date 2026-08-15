import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";

type DbClient = PrismaClient | Prisma.TransactionClient;

type AuditInput = {
  ctx: TenantContext;
  action: string;
  entityType: string;
  entityId?: string | null;
  actorUserId?: string | null;
  branchId?: string | null;
  academicYearId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: unknown;
};

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function writeAuditLog(input: AuditInput, client: DbClient = db) {
  return client.auditLog.create({
    data: {
      tenantId: input.ctx.tenantId,
      branchId: input.branchId ?? null,
      academicYearId: input.academicYearId ?? null,
      actorUserId: input.actorUserId === undefined ? input.ctx.userId : input.actorUserId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      beforeJson: toJson(input.before),
      afterJson: toJson(input.after),
      metadataJson: toJson(input.metadata),
      ipAddress: input.ctx.ipAddress,
      userAgent: input.ctx.userAgent
    }
  });
}
