import { randomUUID } from "node:crypto";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { AppError } from "@/lib/errors";
import { requireGradebookEnabled, requireGradebookSubfeature, type GradebookSubfeature } from "@/modules/gradebook/feature";

export type GradebookRequestContext = TenantContext & {
  institutionId: string;
  branchId: string;
  academicYearId: string;
  correlationId: string;
  permissions: ReadonlySet<PermissionCode>;
};

function entitlementOperation(permission?: PermissionCode): "READ" | "WRITE" {
  if (!permission || permission.includes(".view") || permission.endsWith(".download_template")) {
    return "READ";
  }
  return "WRITE";
}

export async function resolveGradebookRequestContext(
  ctx: TenantContext,
  options: {
    permission?: PermissionCode;
    feature?: GradebookSubfeature;
    entitlementOperation?: "READ" | "WRITE";
  } = {}
): Promise<GradebookRequestContext> {
  const operation = options.entitlementOperation ?? entitlementOperation(options.permission);
  if (options.feature) {
    await requireGradebookSubfeature(ctx, options.feature, operation);
  } else {
    await requireGradebookEnabled(ctx, operation);
  }

  const branchId = ctx.activeBranchId;
  const academicYearId = ctx.activeAcademicYearId;
  const institutionId = ctx.institutionId;
  if (!branchId || !ctx.accessibleBranchIds.includes(branchId)) {
    throw new AppError("GRADEBOOK_BRANCH_CONTEXT_REQUIRED", "GRADEBOOK_BRANCH_CONTEXT_REQUIRED", 403);
  }
  if (!academicYearId) {
    throw new AppError("GRADEBOOK_ACADEMIC_YEAR_CONTEXT_REQUIRED", "GRADEBOOK_ACADEMIC_YEAR_CONTEXT_REQUIRED", 409);
  }
  if (!institutionId) {
    throw new AppError("GRADEBOOK_INSTITUTION_CONTEXT_REQUIRED", "GRADEBOOK_INSTITUTION_CONTEXT_REQUIRED", 409);
  }

  const permissions = await getEffectivePermissions({ ctx, branchId, academicYearId });
  if (options.permission && !permissions.has(options.permission)) {
    throw new AppError("GRADEBOOK_SCOPE_FORBIDDEN", "GRADEBOOK_SCOPE_FORBIDDEN", 403);
  }

  return {
    ...ctx,
    institutionId,
    branchId,
    academicYearId,
    correlationId: ctx.correlationId ?? randomUUID(),
    permissions
  };
}

export function requireGradebookCapability(ctx: GradebookRequestContext, permission: PermissionCode) {
  if (!ctx.permissions.has(permission)) {
    throw new AppError("GRADEBOOK_SCOPE_FORBIDDEN", "GRADEBOOK_SCOPE_FORBIDDEN", 403);
  }
}
