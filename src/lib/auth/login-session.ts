import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit/audit-log";
import { createRawSessionToken, getSessionExpiresAt, hashSessionToken } from "@/lib/auth/session";

type LoginSessionInput = {
  tenant: { id: string; name: string };
  user: { id: string; email: string; userType: string };
  passwordChangeRequired: boolean;
  authMethod: "PASSWORD" | "PASSKEY";
  identifierType: "EMAIL" | "EMPLOYEE_CODE";
  auditAction: string;
  ipAddress?: string;
  userAgent?: string;
};

export type LoginSessionResult = {
  rawToken: string;
  expiresAt: Date;
  redirectTo: string;
};

export async function createLoginSession(
  tx: Prisma.TransactionClient,
  input: LoginSessionInput
): Promise<LoginSessionResult> {
  const rawToken = createRawSessionToken();
  const tokenHash = await hashSessionToken(rawToken);
  const expiresAt = getSessionExpiresAt();

  await tx.session.create({
    data: {
      tenantId: input.tenant.id,
      userId: input.user.id,
      tokenHash,
      expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress
    }
  });
  await tx.user.update({
    where: { id: input.user.id },
    data: { lastLoginAt: new Date() }
  });
  await writeAuditLog({
    ctx: {
      tenantId: input.tenant.id,
      tenantName: input.tenant.name,
      userId: input.user.id,
      userEmail: input.user.email,
      userType: input.user.userType,
      activeBranchId: null,
      accessibleBranchIds: [],
      activeAcademicYearId: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent
    },
    action: input.auditAction,
    entityType: "User",
    entityId: input.user.id,
    metadata: {
      authMethod: input.authMethod,
      identifierType: input.identifierType
    }
  }, tx);

  return {
    rawToken,
    expiresAt,
    redirectTo: input.passwordChangeRequired
      ? "/account/change-password?required=1"
      : "/"
  };
}
