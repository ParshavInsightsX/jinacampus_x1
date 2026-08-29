import { cache } from "react";
import { db } from "@/lib/db";
import { isPermissionCode, type PermissionCode } from "@/lib/rbac/permissions";
import type { TenantContext } from "@/lib/tenant/context";

type PermissionScopeInput = {
  ctx: TenantContext;
  branchId?: string | null;
  academicYearId?: string | null;
};

type RequirePermissionInput = PermissionScopeInput & {
  permission: PermissionCode;
};

const loadEffectivePermissions = cache(async (
  tenantId: string,
  userId: string,
  branchId: string | null,
  academicYearId: string | null
): Promise<Set<PermissionCode>> => {
  const now = new Date();
  const scopeFilters: Array<{ scopeType: "TENANT" | "BRANCH" | "ACADEMIC_YEAR"; scopeId: string }> = [
    { scopeType: "TENANT", scopeId: "TENANT" }
  ];
  if (branchId) scopeFilters.push({ scopeType: "BRANCH", scopeId: branchId });
  if (academicYearId) scopeFilters.push({ scopeType: "ACADEMIC_YEAR", scopeId: academicYearId });

  const assignments = await db.userRoleAssignment.findMany({
    where: {
      tenantId,
      userId,
      isActive: true,
      AND: [
        { OR: scopeFilters },
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }
      ]
    },
    include: {
      role: {
        include: {
          rolePermissions: { where: { tenantId }, include: { permission: true } }
        }
      }
    }
  });

  const permissions = new Set<PermissionCode>();
  for (const assignment of assignments) {
    if (!assignment.role.isActive || assignment.role.tenantId !== tenantId) continue;
    for (const rolePermission of assignment.role.rolePermissions) {
      const code = rolePermission.permission.code;
      if (rolePermission.permission.isActive && isPermissionCode(code)) permissions.add(code);
    }
  }

  return permissions;
});

export async function getEffectivePermissions(input: PermissionScopeInput): Promise<Set<PermissionCode>> {
  const { ctx } = input;
  if (ctx.passwordChangeRequired) throw new Error("PASSWORD_CHANGE_REQUIRED");

  const branchId = input.branchId ?? null;
  if (branchId && !ctx.accessibleBranchIds.includes(branchId)) {
    throw new Error("FORBIDDEN_BRANCH_ACCESS");
  }

  return loadEffectivePermissions(
    ctx.tenantId,
    ctx.userId,
    branchId,
    input.academicYearId ?? ctx.activeAcademicYearId
  );
}

export async function requirePermission(input: RequirePermissionInput) {
  const { permission } = input;
  const permissions = await getEffectivePermissions(input);
  if (!permissions.has(permission)) throw new Error(`FORBIDDEN_PERMISSION:${permission}`);
  return true;
}
