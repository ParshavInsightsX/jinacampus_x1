import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";

export async function isGradebookEnabled(ctx: Pick<TenantContext, "tenantId">) {
  const settings = await db.tenantSettings.findUnique({
    where: { tenantId: ctx.tenantId },
    select: { gradebookEnabled: true }
  });

  return settings?.gradebookEnabled === true;
}

export async function requireGradebookEnabled(ctx: Pick<TenantContext, "tenantId">) {
  if (!(await isGradebookEnabled(ctx))) {
    throw new AppError("GRADEBOOK_NOT_ENABLED", "GRADEBOOK_NOT_ENABLED", 404);
  }
}
