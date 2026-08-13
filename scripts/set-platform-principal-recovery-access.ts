import { z } from "zod";

import { db } from "../src/lib/db";

const inputSchema = z.object({
  enabled: z.literal("true"),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  access: z.enum(["grant", "revoke"]),
  confirmation: z.literal("CONFIRM_PRINCIPAL_RECOVERY_ACCESS_CHANGE")
});

async function main() {
  const input = inputSchema.parse({
    enabled: process.env.PLATFORM_ADMIN_PRINCIPAL_RECOVERY_AUTHORIZATION_ENABLED,
    email: process.env.PLATFORM_ADMIN_EMAIL,
    access: process.env.PLATFORM_ADMIN_PRINCIPAL_RECOVERY_ACCESS,
    confirmation: process.env.PLATFORM_ADMIN_PRINCIPAL_RECOVERY_CONFIRM
  });
  const administrator = await db.platformAdministrator.findUnique({
    where: { email: input.email },
    select: {
      id: true,
      email: true,
      status: true,
      canManagePrincipalRecovery: true
    }
  });
  if (!administrator || administrator.status !== "ACTIVE") {
    throw new Error("ACTIVE_PLATFORM_ADMINISTRATOR_NOT_FOUND");
  }

  const enabled = input.access === "grant";
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.platformAdministrator.update({
      where: { id: administrator.id },
      data: { canManagePrincipalRecovery: enabled },
      select: { id: true, email: true, canManagePrincipalRecovery: true }
    });
    const revokedSessions = await tx.platformAdministratorSession.updateMany({
      where: { administratorId: administrator.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    await tx.platformAuditLog.create({
      data: {
        actorAdministratorId: null,
        action: "platform.administrator.principal_recovery_access_updated",
        entityType: "PlatformAdministrator",
        entityId: administrator.id,
        beforeJson: { canManagePrincipalRecovery: administrator.canManagePrincipalRecovery },
        afterJson: { canManagePrincipalRecovery: enabled },
        metadataJson: {
          authorizationSource: "protected_operator_script",
          sessionsRevoked: revokedSessions.count
        }
      }
    });
    return updated;
  });

  process.stdout.write(JSON.stringify({
    ok: true,
    administratorId: result.id,
    email: result.email,
    canManagePrincipalRecovery: result.canManagePrincipalRecovery
  }));
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown authorization error";
    process.stderr.write(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
