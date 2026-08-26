import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { isIdentityCardSchemaAvailable } from "@/lib/schema-readiness/identity-cards";
import type { TenantContext } from "@/lib/tenant/context";
import { listStaffProfilesSchema } from "@/modules/staffboard-lite/schemas";
import { idSchema } from "@/modules/staffboard-lite/schemas/shared";
import { hasNoBranchAccess, pagination, resolveStaffBranchIds } from "./shared";

export const staffProfileSelect = {
  id: true,
  branchId: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  staffType: true,
  designation: true,
  department: true,
  phone: true,
  email: true,
  joiningDate: true,
  employmentStatus: true,
  createdAt: true,
  updatedAt: true,
  branch: { select: { name: true } },
  user: {
    select: {
      id: true,
      email: true,
      status: true,
      passwordCredential: { select: { mustChange: true } },
      roleAssignments: {
        where: { isActive: true },
        select: { role: { select: { code: true, name: true } } },
        orderBy: { createdAt: "asc" }
      }
    }
  }
} satisfies Prisma.StaffProfileSelect;

const staffProfileListSelect = {
  id: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  staffType: true,
  designation: true,
  department: true,
  employmentStatus: true,
  updatedAt: true,
  branch: { select: { name: true } },
  user: {
    select: {
      email: true,
      status: true
    }
  }
} satisfies Prisma.StaffProfileSelect;

export async function listStaffProfiles(ctx: TenantContext, input: unknown = {}) {
  const params = listStaffProfilesSchema.parse(input);
  if (hasNoBranchAccess(ctx, params.branchId)) return [];

  const branchIds = resolveStaffBranchIds(ctx, params.branchId);
  for (const branchId of branchIds) {
    await requirePermission({ ctx, permission: "staffboard.staff.view", branchId });
  }

  const where: Prisma.StaffProfileWhereInput = {
    tenantId: ctx.tenantId,
    branchId: branchIds.length === 1 ? branchIds[0] : { in: branchIds },
    staffType: params.staffType,
    employmentStatus: params.employmentStatus
  };
  if (params.search) {
    where.OR = [
      { employeeCode: { contains: params.search, mode: "insensitive" } },
      { firstName: { contains: params.search, mode: "insensitive" } },
      { middleName: { contains: params.search, mode: "insensitive" } },
      { lastName: { contains: params.search, mode: "insensitive" } },
      { designation: { contains: params.search, mode: "insensitive" } },
      { department: { contains: params.search, mode: "insensitive" } },
      { phone: { contains: params.search, mode: "insensitive" } },
      { email: { contains: params.search, mode: "insensitive" } }
    ];
  }

  return db.staffProfile.findMany({
    where,
    select: staffProfileListSelect,
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { employeeCode: "asc" }],
    ...pagination(params)
  });
}

export async function getStaffProfileById(ctx: TenantContext, staffId: string) {
  const id = idSchema.parse(staffId);
  const staffProfile = await db.staffProfile.findFirst({
    where: {
      id,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: staffProfileSelect
  });
  if (!staffProfile) return null;

  await requirePermission({ ctx, permission: "staffboard.staff.view", branchId: staffProfile.branchId });
  const identityCardSchemaAvailable = await isIdentityCardSchemaAvailable();
  const profilePhoto = identityCardSchemaAvailable
    ? await db.staffProfilePhoto.findFirst({
      where: {
        tenantId: ctx.tenantId,
        branchId: staffProfile.branchId,
        staffId: staffProfile.id
      },
      select: { id: true }
    })
    : null;
  return {
    ...staffProfile,
    identityCardSchemaAvailable,
    profilePhoto
  };
}

export async function getStaffProfileByUserId(ctx: TenantContext, userId: string) {
  const id = idSchema.parse(userId);
  const staffProfile = await db.staffProfile.findFirst({
    where: {
      userId: id,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds }
    },
    select: staffProfileSelect
  });
  if (!staffProfile) return null;

  await requirePermission({ ctx, permission: "staffboard.staff.view", branchId: staffProfile.branchId });
  return staffProfile;
}

export async function getActiveStaffProfileByUserId(ctx: TenantContext, userId: string) {
  const id = idSchema.parse(userId);
  const staffProfile = await db.staffProfile.findFirst({
    where: {
      userId: id,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE"
    },
    select: staffProfileSelect
  });
  if (!staffProfile) return null;

  await requirePermission({ ctx, permission: "staffboard.staff.view", branchId: staffProfile.branchId });
  return staffProfile;
}
