import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

type EnsureTenantSettingsInput = {
  tenantId: string;
  brandName?: string | null;
  createdById?: string | null;
};

export async function ensureTenantSettingsRow(
  tx: Prisma.TransactionClient,
  input: EnsureTenantSettingsInput
) {
  const existing = await tx.tenantSettings.findUnique({
    where: { tenantId: input.tenantId },
    select: { id: true }
  });
  if (existing) return existing.id;

  const id = randomUUID();
  const now = new Date();

  // A baseline insert avoids materializing defaults for optional modules whose
  // additive migrations may not have reached a disabled deployment yet.
  await tx.$executeRaw`
    INSERT INTO "tenant_settings" ("id", "tenantId", "brandName", "createdById", "updatedAt")
    VALUES (
      ${id}::uuid,
      ${input.tenantId}::uuid,
      ${input.brandName ?? "JinaCampus"},
      ${input.createdById ?? null}::uuid,
      ${now}
    )
    ON CONFLICT ("tenantId") DO NOTHING
  `;

  return id;
}
