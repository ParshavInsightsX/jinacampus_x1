import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { hashSessionToken } from "@/lib/auth/session";
import { safeTimeZone } from "@/lib/dates/time-zone";
import { isUsableTenantBranchAccess } from "@/lib/tenant/branch-access";

export type TenantContext = {
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  sessionId?: string;
  userId: string;
  userEmail: string;
  userName?: string;
  userType: string;
  activeBranchId: string | null;
  activeBranchName?: string | null;
  activeBranchCode?: string | null;
  timeZone?: string;
  accessibleBranchIds: string[];
  activeAcademicYearId: string | null;
  activeAcademicYearName?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
  institutionDisplayName?: string | null;
  institutionLogoUrl?: string | null;
  roleLabels?: string[];
  roleCodes?: string[];
  passwordChangeRequired?: boolean;
  ipAddress?: string;
  userAgent?: string;
  correlationId?: string;
};

type TenantContextOptions = {
  allowPasswordChangeRequired?: boolean;
};

export function isPasswordChangeRequiredError(error: unknown) {
  return error instanceof Error && error.message === "PASSWORD_CHANGE_REQUIRED";
}

export async function getTenantContext(
  options: TenantContextOptions = {}
): Promise<TenantContext> {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const rawToken = cookieStore.get(env.SESSION_COOKIE_NAME)?.value;
  if (!rawToken) throw new Error("UNAUTHENTICATED");

  const tokenHash = await hashSessionToken(rawToken);
  const session = await db.session.findUnique({
    where: { tokenHash },
    include: {
      tenant: {
        include: {
          tenantSettings: {
            select: { timezone: true }
          }
        }
      },
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
                  timezone: true,
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

  if (!session || session.revokedAt || session.expiresAt < new Date()) throw new Error("UNAUTHENTICATED");
  if (session.tenant.status !== "ACTIVE") throw new Error("TENANT_INACTIVE");
  if (session.user.status !== "ACTIVE") throw new Error("USER_INACTIVE");

  const activeBranchAccesses = session.user.branchAccesses.filter((access) => (
    isUsableTenantBranchAccess(access, session.tenantId)
  ));
  const accessibleBranchIds = activeBranchAccesses.map((b) => b.branchId);
  const requestedBranchId = cookieStore.get("jc_branch")?.value ?? null;
  const activeBranchAccess =
    requestedBranchId && accessibleBranchIds.includes(requestedBranchId)
      ? activeBranchAccesses.find((b) => b.branchId === requestedBranchId)
      : activeBranchAccesses.find((b) => b.isPrimary) ?? activeBranchAccesses[0] ?? null;
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
  const roleLabels = Array.from(new Set(session.user.roleAssignments
    .filter((assignment) => (
      assignment.tenantId === session.tenantId &&
      assignment.role.tenantId === session.tenantId &&
      assignment.role.isActive &&
      (!assignment.startsAt || assignment.startsAt <= now) &&
      (!assignment.endsAt || assignment.endsAt > now)
    ))
    .map((assignment) => assignment.role.name)));
  const roleCodes = Array.from(new Set(session.user.roleAssignments
    .filter((assignment) => (
      assignment.tenantId === session.tenantId &&
      assignment.role.tenantId === session.tenantId &&
      assignment.role.isActive &&
      (!assignment.startsAt || assignment.startsAt <= now) &&
      (!assignment.endsAt || assignment.endsAt > now)
    ))
    .map((assignment) => assignment.role.code)));

  const ctx: TenantContext = {
    tenantId: session.tenantId,
    tenantName: session.tenant.name,
    tenantSlug: session.tenant.slug,
    sessionId: session.id,
    userId: session.userId,
    userEmail: session.user.email,
    userName: session.user.displayName ?? [session.user.firstName, session.user.lastName].filter(Boolean).join(" "),
    userType: session.user.userType,
    activeBranchId,
    activeBranchName: activeBranchAccess?.branch.name ?? null,
    activeBranchCode: activeBranchAccess?.branch.code ?? null,
    timeZone: safeTimeZone(activeBranchAccess?.branch.timezone ?? session.tenant.tenantSettings?.timezone),
    accessibleBranchIds,
    activeAcademicYearId: activeAcademicYear?.id ?? null,
    activeAcademicYearName: activeAcademicYear?.name ?? null,
    institutionId: institution?.id ?? null,
    institutionName: institution?.name ?? null,
    institutionDisplayName: institution?.displayName ?? null,
    institutionLogoUrl: institution?.logoUrl ?? null,
    roleLabels,
    roleCodes,
    passwordChangeRequired: session.user.passwordCredential?.mustChange ?? false,
    ipAddress: headerStore.get("x-forwarded-for") ?? undefined,
    userAgent: headerStore.get("user-agent") ?? undefined,
    correlationId: (() => {
      const requestId = headerStore.get("x-request-id")?.trim();
      return requestId && requestId.length <= 128 ? requestId : randomUUID();
    })()
  };
  if (ctx.passwordChangeRequired && !options.allowPasswordChangeRequired) {
    throw new Error("PASSWORD_CHANGE_REQUIRED");
  }
  return ctx;
}
