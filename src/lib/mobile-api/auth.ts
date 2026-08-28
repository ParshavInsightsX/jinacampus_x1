import { AppError } from "@/lib/errors";
import { PasswordLoginThrottleRealm } from "@prisma/client";
import { db } from "@/lib/db";
import { verifyPasswordOrDummy } from "@/lib/auth/password";
import {
  beginPasswordLoginAttempt,
  completePasswordLoginAttempt,
  passwordLoginSourceAddress
} from "@/lib/auth/password-login-throttle";
import { createRawSessionToken, getSessionExpiresAt, hashSessionToken } from "@/lib/auth/session";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { hasSchoolLoginRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { mobileLoginSchema, type MobileLoginInput } from "./schemas";

export type MobileCapabilityFlags = {
  canScanStaffQr: boolean;
  canViewMyAttendance: boolean;
  canMarkStudentAttendance: boolean;
};

export type MobileUserPayload = {
  name: string;
  email: string;
  roles: Array<{ code: string; label: string }>;
  capabilities: MobileCapabilityFlags;
  institution?: {
    displayName: string | null;
    name: string | null;
    logoUrl: string | null;
  } | null;
  branch?: {
    name: string | null;
    code: string | null;
  } | null;
  academicYear?: {
    name: string | null;
  } | null;
};

export type MobileAuthContext = {
  ctx: TenantContext;
  sessionId: string;
  tokenHash: string;
  user: MobileUserPayload;
};

export function mobileContextPayload(user: MobileUserPayload) {
  return {
    user,
    institution: user.institution ?? null,
    branch: user.branch ?? null,
    academicYear: user.academicYear ?? null
  };
}

type RoleLabel = { code: string; label: string };

function ipAddressFrom(request: Request) {
  return request.headers.get("x-forwarded-for") ?? undefined;
}

function userAgentFrom(request: Request) {
  return request.headers.get("user-agent") ?? undefined;
}

function displayName(user: { displayName: string | null; firstName: string | null; middleName: string | null; lastName: string | null; email: string }) {
  return user.displayName ?? ([user.firstName, user.middleName, user.lastName].map((part) => part?.trim()).filter(Boolean).join(" ") || user.email);
}

function uniqueRoles(roles: RoleLabel[]) {
  const byCode = new Map<string, RoleLabel>();
  for (const role of roles) {
    if (!byCode.has(role.code)) byCode.set(role.code, role);
  }
  return Array.from(byCode.values());
}

export function bearerTokenFromRequest(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token, extra] = header.trim().split(/\s+/);
  if (scheme?.toLowerCase() !== "bearer" || !token || extra) return null;
  return token;
}

async function hasPermission(ctx: TenantContext, permission: PermissionCode, branchId?: string | null, academicYearId?: string | null) {
  try {
    const permissions = await getEffectivePermissions({
      ctx,
      branchId: branchId ?? undefined,
      academicYearId: academicYearId ?? undefined
    });
    return permissions.has(permission);
  } catch {
    return false;
  }
}

async function buildMobileUserPayload(ctx: TenantContext, user: {
  email: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  displayName: string | null;
}, roles: RoleLabel[]): Promise<MobileUserPayload> {
  const [canViewMyAttendance, canMarkStudentAttendance] = await Promise.all([
    ctx.activeBranchId
      ? hasPermission(ctx, "staffboard.attendance.self_view", ctx.activeBranchId, ctx.activeAcademicYearId)
      : Promise.resolve(false),
    ctx.activeBranchId && ctx.activeAcademicYearId
      ? hasPermission(ctx, "academia.attendance.mark", ctx.activeBranchId, ctx.activeAcademicYearId)
      : Promise.resolve(false)
  ]);
  return {
    name: displayName(user),
    email: user.email,
    roles: uniqueRoles(roles),
    capabilities: {
      canScanStaffQr: false,
      canViewMyAttendance,
      canMarkStudentAttendance
    },
    institution: {
      displayName: ctx.institutionDisplayName ?? null,
      name: ctx.institutionName ?? null,
      logoUrl: ctx.institutionLogoUrl ?? null
    },
    branch: {
      name: ctx.activeBranchName ?? null,
      code: ctx.activeBranchCode ?? null
    },
    academicYear: {
      name: ctx.activeAcademicYearName ?? null
    }
  };
}

async function resolveMobileAuthFromRawToken(
  rawToken: string,
  request: Request,
  options: { allowPasswordChangeRequired?: boolean } = {}
): Promise<MobileAuthContext> {
  const tokenHash = await hashSessionToken(rawToken);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      tenant: true,
      user: {
        include: {
          passwordCredential: {
            select: { mustChange: true }
          },
          branchAccesses: {
            where: { isActive: true },
            select: {
              tenantId: true,
              branchId: true,
              isPrimary: true,
              branch: {
                select: {
                  tenantId: true,
                  institutionId: true,
                  name: true,
                  code: true,
                  status: true,
                  institution: {
                    select: {
                      id: true,
                      name: true,
                      displayName: true,
                      logoUrl: true,
                      status: true
                    }
                  }
                }
              }
            }
          },
          roleAssignments: {
            where: { isActive: true },
            select: {
              tenantId: true,
              startsAt: true,
              endsAt: true,
              role: {
                select: {
                  tenantId: true,
                  code: true,
                  name: true,
                  isActive: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) {
    throw new AppError("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
  }
  if (session.tenant.status !== "ACTIVE") throw new AppError("TENANT_INACTIVE", "TENANT_INACTIVE", 403);
  if (session.user.status !== "ACTIVE") throw new AppError("USER_INACTIVE", "USER_INACTIVE", 403);
  if (session.user.passwordCredential?.mustChange && !options.allowPasswordChangeRequired) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "PASSWORD_CHANGE_REQUIRED", 403);
  }

  const activeBranchAccesses = session.user.branchAccesses.filter((branchAccess) => (
    branchAccess.tenantId === session.tenantId &&
    branchAccess.branch.tenantId === session.tenantId &&
    branchAccess.branch.status === "ACTIVE"
  ));
  const activeBranchAccess = activeBranchAccesses.find((branchAccess) => branchAccess.isPrimary) ?? activeBranchAccesses[0] ?? null;
  const activeBranchId = activeBranchAccess?.branchId ?? null;
  const fallbackInstitution = activeBranchAccess
    ? null
    : await db.institution.findFirst({
      where: { tenantId: session.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, displayName: true, logoUrl: true },
      orderBy: { name: "asc" }
    });
  const institution = activeBranchAccess?.branch.institution.status === "ACTIVE"
    ? activeBranchAccess.branch.institution
    : fallbackInstitution;
  const activeAcademicYear = institution
    ? await db.academicYear.findFirst({
      where: {
        tenantId: session.tenantId,
        institutionId: institution.id,
        status: "ACTIVE",
        isActive: true
      },
      select: { id: true, name: true },
      orderBy: { startDate: "desc" }
    })
    : null;
  const now = new Date();
  const roles = session.user.roleAssignments
    .filter((assignment) => (
      assignment.tenantId === session.tenantId &&
      assignment.role.tenantId === session.tenantId &&
      assignment.role.isActive &&
      (!assignment.startsAt || assignment.startsAt <= now) &&
      (!assignment.endsAt || assignment.endsAt > now)
    ))
    .map((assignment) => ({ code: assignment.role.code, label: assignment.role.name }));
  if (!hasSchoolLoginRole(roles.map((role) => role.code))) {
    throw new AppError("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
  }

  const ctx: TenantContext = {
    tenantId: session.tenantId,
    tenantName: session.tenant.name,
    sessionId: session.id,
    userId: session.userId,
    userEmail: session.user.email,
    userType: session.user.userType,
    activeBranchId,
    activeBranchName: activeBranchAccess?.branch.name ?? null,
    activeBranchCode: activeBranchAccess?.branch.code ?? null,
    accessibleBranchIds: activeBranchAccesses.map((branchAccess) => branchAccess.branchId),
    activeAcademicYearId: activeAcademicYear?.id ?? null,
    activeAcademicYearName: activeAcademicYear?.name ?? null,
    institutionName: institution?.name ?? null,
    institutionDisplayName: institution?.displayName ?? null,
    institutionLogoUrl: institution?.logoUrl ?? null,
    roleLabels: roles.map((role) => role.label),
    roleCodes: roles.map((role) => role.code),
    passwordChangeRequired: session.user.passwordCredential?.mustChange ?? false,
    ipAddress: ipAddressFrom(request),
    userAgent: userAgentFrom(request)
  };

  const user = await buildMobileUserPayload(ctx, session.user, roles);
  return { ctx, sessionId: session.id, tokenHash, user };
}

export async function requireMobileAuth(request: Request): Promise<MobileAuthContext> {
  const rawToken = bearerTokenFromRequest(request);
  if (!rawToken) throw new AppError("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
  return resolveMobileAuthFromRawToken(rawToken, request);
}

export async function getMobileAuthContext(request: Request) {
  try {
    return await requireMobileAuth(request);
  } catch {
    return null;
  }
}

export async function createMobileLoginSession(input: unknown, request: Request) {
  const data: MobileLoginInput = mobileLoginSchema.parse(input);
  const tenant = await db.tenant.findUnique({ where: { slug: data.schoolId } });
  const user = tenant?.status === "ACTIVE"
    ? await db.user.findUnique({
        where: { tenantId_email: { tenantId: tenant.id, email: data.email } },
        include: { passwordCredential: true }
      })
    : null;
  const roleAssignments = tenant?.status === "ACTIVE" && user?.status === "ACTIVE"
    ? await db.userRoleAssignment.findMany({
        where: {
          tenantId: tenant.id,
          userId: user.id,
          isActive: true,
          role: { isActive: true }
        },
        select: { role: { select: { code: true } } }
      })
    : [];
  const authenticated = (
    tenant?.status === "ACTIVE" &&
    user?.status === "ACTIVE" &&
    user.passwordCredential &&
    hasSchoolLoginRole(roleAssignments.map((assignment) => assignment.role.code))
  ) ? {
    tenant,
    user,
    credential: user.passwordCredential
  } : null;
  const sourceAddress = passwordLoginSourceAddress(request);
  const reservation = await beginPasswordLoginAttempt({
    realm: PasswordLoginThrottleRealm.SCHOOL,
    channel: "MOBILE",
    tenantId: tenant?.id ?? null,
    scopeKey: data.schoolId,
    accountKey: user?.id ?? data.email,
    sourceAddress
  });
  const valid = await verifyPasswordOrDummy(
    data.password,
    authenticated?.credential.passwordHash ?? null
  );
  if (!valid || !authenticated) {
    await completePasswordLoginAttempt(reservation, "FAILURE");
    throw new AppError("INVALID_MOBILE_CREDENTIALS", "INVALID_MOBILE_CREDENTIALS", 401);
  }
  await completePasswordLoginAttempt(reservation, "SUCCESS");
  if (authenticated.credential.mustChange) {
    throw new AppError("PASSWORD_CHANGE_REQUIRED", "PASSWORD_CHANGE_REQUIRED", 403);
  }

  const rawToken = createRawSessionToken();
  const tokenHash = await hashSessionToken(rawToken);
  const expiresAt = getSessionExpiresAt();

  await db.session.create({
    data: {
      tenantId: authenticated.tenant.id,
      userId: authenticated.user.id,
      tokenHash,
      expiresAt,
      userAgent: userAgentFrom(request),
      ipAddress: sourceAddress ?? undefined
    }
  });
  await db.user.update({
    where: { id: authenticated.user.id },
    data: { lastLoginAt: new Date() }
  });

  const authContext = await resolveMobileAuthFromRawToken(rawToken, request);
  await writeAuditLog({
    ctx: authContext.ctx,
    action: CAMPUS_CORE_AUDIT_EVENTS.MOBILE_AUTH_LOGIN_SUCCESS,
    entityType: "User",
    entityId: authenticated.user.id,
    metadata: { userEmail: authenticated.user.email, client: "mobile" }
  }).catch(() => null);

  return {
    token: rawToken,
    ...mobileContextPayload(authContext.user)
  };
}

export async function revokeMobileSession(request: Request) {
  const rawToken = bearerTokenFromRequest(request);
  if (!rawToken) throw new AppError("UNAUTHENTICATED", "UNAUTHENTICATED", 401);
  const auth = await resolveMobileAuthFromRawToken(rawToken, request, {
    allowPasswordChangeRequired: true
  });
  await db.session.updateMany({
    where: { tokenHash: auth.tokenHash, revokedAt: null },
    data: { revokedAt: new Date() }
  });

  await writeAuditLog({
    ctx: auth.ctx,
    action: CAMPUS_CORE_AUDIT_EVENTS.MOBILE_AUTH_LOGOUT,
    entityType: "User",
    entityId: auth.ctx.userId,
    metadata: { userEmail: auth.ctx.userEmail, client: "mobile" }
  }).catch(() => null);

  return { success: true as const };
}
