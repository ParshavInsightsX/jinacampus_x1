import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { requirePermission } from "@/lib/rbac/require-permission";
import { canAssignRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { CAMPUS_CORE_AUDIT_EVENTS } from "@/modules/campus-core/audit-events";
import { reconcileAcademicCalendarForStaffProfile } from "@/modules/campus-core/calendar/calendar-service";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  createStaffLoginAccessSchema,
  createStaffProfileSchema,
  disableStaffLoginAccessSchema,
  reactivateStaffLoginAccessSchema,
  updateStaffProfileSchema
} from "@/modules/staffboard-lite/schemas";
import { employmentStatusSchema, idSchema } from "@/modules/staffboard-lite/schemas/shared";
import { staffProfileSelect } from "@/modules/staffboard-lite/queries/staff-profile.queries";
import { conflict, ensureActiveBranch, requireBranchPermission } from "./shared";

type StaffLoginRoleCode = "STAFF" | "TEACHER" | "OFFICE_STAFF";

type StaffLoginAccountInput = {
  branchId: string;
  email: string;
  phone?: string;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  loginRoleCode: StaffLoginRoleCode;
  initialPassword: string;
};

function userDisplayName(input: { firstName?: string | null; lastName?: string | null }) {
  return [input.firstName, input.lastName].filter(Boolean).join(" ");
}

function sanitizeUserForAudit<T extends object>(user: T) {
  const { passwordCredential: _passwordCredential, ...safeUser } = user as Record<string, unknown>;
  return safeUser;
}

async function requireStaffLoginAccessPermissions(ctx: TenantContext, branchId: string, roleCode: StaffLoginRoleCode) {
  await requirePermission({ ctx, permission: "campuscore.user.create" });
  await requirePermission({ ctx, permission: "campuscore.user.update", branchId });
  await requirePermission({ ctx, permission: "campuscore.user.manage" });
  if (!canAssignRole(ctx.roleCodes ?? [], roleCode)) {
    throw new AppError("ROLE_ASSIGNMENT_NOT_ALLOWED", "ROLE_ASSIGNMENT_NOT_ALLOWED", 403);
  }
}

async function createStaffLoginAccount(
  tx: Prisma.TransactionClient,
  ctx: TenantContext,
  input: StaffLoginAccountInput
) {
  const existingEmailUser = await tx.user.findUnique({
    where: { tenantId_email: { tenantId: ctx.tenantId, email: input.email } },
    select: { id: true }
  });
  if (existingEmailUser) throw conflict("STAFF_LOGIN_EMAIL_EXISTS");

  if (input.phone) {
    const existingPhoneUser = await tx.user.findUnique({
      where: { tenantId_phone: { tenantId: ctx.tenantId, phone: input.phone } },
      select: { id: true }
    });
    if (existingPhoneUser) throw conflict("STAFF_LOGIN_PHONE_EXISTS");
  }

  const role = await tx.role.findFirst({
    where: { tenantId: ctx.tenantId, code: input.loginRoleCode, isActive: true },
    select: { id: true, code: true, name: true }
  });
  if (!role) throw notFound("ROLE_NOT_FOUND");

  const { hashPassword } = await import("@/lib/auth/password");
  const passwordHash = await hashPassword(input.initialPassword);
  const user = await tx.user.create({
    data: {
      tenantId: ctx.tenantId,
      email: input.email,
      phone: input.phone,
      firstName: input.firstName,
      middleName: input.middleName,
      lastName: input.lastName,
      displayName: userDisplayName(input),
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
      createdById: ctx.userId
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      phone: true,
      firstName: true,
      middleName: true,
      lastName: true,
      displayName: true,
      userType: true,
      status: true,
      createdById: true,
      createdAt: true,
      updatedAt: true
    }
  });

  await tx.passwordCredential.create({
    data: { userId: user.id, passwordHash, mustChange: true }
  });

  const branchAccess = await tx.userBranchAccess.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      branchId: input.branchId,
      isPrimary: true,
      grantedById: ctx.userId
    }
  });

  const roleAssignment = await tx.userRoleAssignment.create({
    data: {
      tenantId: ctx.tenantId,
      userId: user.id,
      roleId: role.id,
      scopeType: "TENANT",
      scopeId: "TENANT",
      assignedById: ctx.userId
    }
  });

  return { branchAccess, role, roleAssignment, user };
}

export async function createStaffProfile(ctx: TenantContext, input: unknown) {
  const data = createStaffProfileSchema.parse(input);
  await requireBranchPermission(ctx, "staffboard.staff.create", data.branchId);
  if (data.createLoginAccess) {
    await requireStaffLoginAccessPermissions(ctx, data.branchId, data.loginRoleCode);
  }

  return db.$transaction(async (tx) => {
    await ensureActiveBranch(tx, ctx, data.branchId);

    const existing = await tx.staffProfile.findFirst({
      where: { tenantId: ctx.tenantId, employeeCode: data.employeeCode },
      select: { id: true }
    });
    if (existing) throw conflict("STAFF_EMPLOYEE_CODE_EXISTS");

    const {
      createLoginAccess,
      loginRoleCode,
      initialPassword,
      confirmInitialPassword: _confirmInitialPassword,
      ...profileData
    } = data;

    const loginAccount = createLoginAccess && initialPassword && profileData.email
      ? await createStaffLoginAccount(tx, ctx, {
        branchId: profileData.branchId,
        email: profileData.email,
        phone: profileData.phone,
        firstName: profileData.firstName,
        middleName: profileData.middleName,
        lastName: profileData.lastName,
        loginRoleCode,
        initialPassword
      })
      : null;

    const staffProfile = await tx.staffProfile.create({
      data: {
        ...profileData,
        tenantId: ctx.tenantId,
        userId: loginAccount?.user.id
      },
      select: staffProfileSelect
    });
    await reconcileAcademicCalendarForStaffProfile(tx, ctx, staffProfile.id);
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_CREATED,
      entityType: "StaffProfile",
      entityId: staffProfile.id,
      branchId: staffProfile.branchId,
      after: staffProfile
    }, tx);
    if (loginAccount) {
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.USER_CREATED,
        entityType: "User",
        entityId: loginAccount.user.id,
        after: sanitizeUserForAudit(loginAccount.user),
        metadata: { createdFrom: "staff_profile", linkedStaffProfileId: staffProfile.id, initialPasswordSet: true }
      }, tx);
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.USER_BRANCH_ASSIGNED,
        entityType: "User",
        entityId: loginAccount.user.id,
        branchId: staffProfile.branchId,
        after: loginAccount.branchAccess,
        metadata: { branchId: staffProfile.branchId, source: "staff_profile_login_access" }
      }, tx);
      await writeAuditLog({
        ctx,
        action: CAMPUS_CORE_AUDIT_EVENTS.USER_ROLE_ASSIGNED,
        entityType: "User",
        entityId: loginAccount.user.id,
        after: loginAccount.roleAssignment,
        metadata: {
          roleId: loginAccount.role.id,
          roleCode: loginAccount.role.code,
          scopeType: "TENANT",
          scopeId: "TENANT",
          source: "staff_profile_login_access"
        }
      }, tx);
      await writeAuditLog({
        ctx,
        action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LOGIN_ACCESS_CREATED,
        entityType: "StaffProfile",
        entityId: staffProfile.id,
        branchId: staffProfile.branchId,
        metadata: { userId: loginAccount.user.id, roleCode: loginAccount.role.code }
      }, tx);
    }
    return staffProfile;
  });
}

export async function createStaffLoginAccess(ctx: TenantContext, input: unknown) {
  const data = createStaffLoginAccessSchema.parse(input);

  return db.$transaction(async (tx) => {
    const staffProfile = await tx.staffProfile.findFirst({
      where: { id: data.staffId, tenantId: ctx.tenantId },
      select: {
        id: true,
        branchId: true,
        userId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeCode: true
      }
    });
    if (!staffProfile) throw notFound("STAFF_PROFILE_NOT_FOUND");
    if (staffProfile.userId) throw conflict("STAFF_LOGIN_ACCESS_ALREADY_ENABLED");

    await requireBranchPermission(ctx, "staffboard.staff.update", staffProfile.branchId);
    await requireStaffLoginAccessPermissions(ctx, staffProfile.branchId, data.loginRoleCode);

    const loginAccount = await createStaffLoginAccount(tx, ctx, {
      branchId: staffProfile.branchId,
      email: data.email,
      phone: data.phone,
      firstName: staffProfile.firstName,
      middleName: staffProfile.middleName,
      lastName: staffProfile.lastName,
      loginRoleCode: data.loginRoleCode,
      initialPassword: data.initialPassword
    });

    const after = await tx.staffProfile.update({
      where: { id: staffProfile.id },
      data: { userId: loginAccount.user.id },
      select: staffProfileSelect
    });

    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_CREATED,
      entityType: "User",
      entityId: loginAccount.user.id,
      after: sanitizeUserForAudit(loginAccount.user),
      metadata: { createdFrom: "staff_profile_edit", linkedStaffProfileId: staffProfile.id, initialPasswordSet: true }
    }, tx);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_BRANCH_ASSIGNED,
      entityType: "User",
      entityId: loginAccount.user.id,
      branchId: staffProfile.branchId,
      after: loginAccount.branchAccess,
      metadata: { branchId: staffProfile.branchId, source: "staff_profile_login_access" }
    }, tx);
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_ROLE_ASSIGNED,
      entityType: "User",
      entityId: loginAccount.user.id,
      after: loginAccount.roleAssignment,
      metadata: {
        roleId: loginAccount.role.id,
        roleCode: loginAccount.role.code,
        scopeType: "TENANT",
        scopeId: "TENANT",
        source: "staff_profile_login_access"
      }
    }, tx);
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LOGIN_ACCESS_CREATED,
      entityType: "StaffProfile",
      entityId: after.id,
      branchId: after.branchId,
      before: staffProfile,
      after,
      metadata: { userId: loginAccount.user.id, roleCode: loginAccount.role.code }
    }, tx);
    return after;
  });
}

export async function disableStaffLoginAccess(ctx: TenantContext, input: unknown) {
  const data = disableStaffLoginAccessSchema.parse(input);

  return db.$transaction(async (tx) => {
    const before = await tx.staffProfile.findFirst({
      where: { id: data.staffId, tenantId: ctx.tenantId },
      select: {
        ...staffProfileSelect,
        user: {
          select: {
            id: true,
            tenantId: true,
            email: true,
            status: true
          }
        }
      }
    });
    if (!before) throw notFound("STAFF_PROFILE_NOT_FOUND");
    if (!before.user) throw new AppError("STAFF_LOGIN_ACCESS_NOT_ENABLED", "STAFF_LOGIN_ACCESS_NOT_ENABLED", 400);
    if (before.user.id === ctx.userId) {
      throw new AppError("USER_SELF_DEACTIVATE_BLOCKED", "USER_SELF_DEACTIVATE_BLOCKED", 400);
    }
    if (before.user.status === "DEACTIVATED") {
      throw new AppError("STAFF_LOGIN_ACCESS_ALREADY_DISABLED", "STAFF_LOGIN_ACCESS_ALREADY_DISABLED", 409);
    }

    await requireBranchPermission(ctx, "staffboard.staff.update", before.branchId);
    await requirePermission({ ctx, permission: "campuscore.user.deactivate" });

    const deactivatedUser = await tx.user.update({
      where: { id: before.user.id },
      data: {
        status: "DEACTIVATED",
        deactivatedAt: new Date(),
        updatedById: ctx.userId
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        status: true,
        deactivatedAt: true,
        updatedAt: true
      }
    });
    await tx.session.updateMany({
      where: { tenantId: ctx.tenantId, userId: before.user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    const after = await tx.staffProfile.findUniqueOrThrow({
      where: { id: before.id },
      select: staffProfileSelect
    });
    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_DEACTIVATED,
      entityType: "User",
      entityId: before.user.id,
      before: before.user,
      after: deactivatedUser,
      metadata: { sessionsRevoked: true, source: "staff_profile_login_access_disabled" }
    }, tx);
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LOGIN_ACCESS_DISABLED,
      entityType: "StaffProfile",
      entityId: after.id,
      branchId: after.branchId,
      before,
      after,
      metadata: { userId: before.user.id, linkPreserved: true }
    }, tx);
    return after;
  });
}

export async function reactivateStaffLoginAccess(ctx: TenantContext, input: unknown) {
  const data = reactivateStaffLoginAccessSchema.parse(input);

  return db.$transaction(async (tx) => {
    const before = await tx.staffProfile.findFirst({
      where: { id: data.staffId, tenantId: ctx.tenantId },
      select: {
        ...staffProfileSelect,
        user: {
          select: {
            id: true,
            tenantId: true,
            email: true,
            status: true,
            deactivatedAt: true
          }
        }
      }
    });
    if (!before) throw notFound("STAFF_PROFILE_NOT_FOUND");
    if (!before.user) throw new AppError("STAFF_LOGIN_ACCESS_NOT_ENABLED", "STAFF_LOGIN_ACCESS_NOT_ENABLED", 400);
    if (before.employmentStatus !== "ACTIVE") {
      throw new AppError("STAFF_PROFILE_INACTIVE", "STAFF_PROFILE_INACTIVE", 400);
    }
    if (before.user.status === "ACTIVE") {
      throw new AppError("STAFF_LOGIN_ACCESS_ALREADY_ENABLED", "STAFF_LOGIN_ACCESS_ALREADY_ENABLED", 409);
    }

    await requireBranchPermission(ctx, "staffboard.staff.update", before.branchId);
    await requirePermission({ ctx, permission: "campuscore.user.update", branchId: before.branchId });
    await requirePermission({ ctx, permission: "campuscore.user.manage" });

    const branchAccess = await tx.userBranchAccess.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: before.user.id,
        branchId: before.branchId,
        isActive: true
      },
      select: { id: true }
    });
    const roleAssignment = await tx.userRoleAssignment.findFirst({
      where: {
        tenantId: ctx.tenantId,
        userId: before.user.id,
        isActive: true,
        role: {
          tenantId: ctx.tenantId,
          isActive: true,
          code: { in: ["PRINCIPAL", "OFFICE_STAFF", "TEACHER", "STAFF", "TENANT_OWNER", "SUPER_ADMIN", "ADMIN", "CLASS_TEACHER"] }
        }
      },
      select: { id: true }
    });
    if (!branchAccess) throw new AppError("STAFF_LOGIN_BRANCH_ACCESS_REQUIRED", "STAFF_LOGIN_BRANCH_ACCESS_REQUIRED", 400);
    if (!roleAssignment) throw new AppError("STAFF_LOGIN_ROLE_REQUIRED", "STAFF_LOGIN_ROLE_REQUIRED", 400);

    const reactivatedUser = await tx.user.update({
      where: { id: before.user.id },
      data: {
        status: "ACTIVE",
        activatedAt: new Date(),
        deactivatedAt: null,
        updatedById: ctx.userId
      },
      select: {
        id: true,
        tenantId: true,
        email: true,
        status: true,
        activatedAt: true,
        deactivatedAt: true,
        updatedAt: true
      }
    });
    const after = await tx.staffProfile.findUniqueOrThrow({
      where: { id: before.id },
      select: staffProfileSelect
    });

    await writeAuditLog({
      ctx,
      action: CAMPUS_CORE_AUDIT_EVENTS.USER_REACTIVATED,
      entityType: "User",
      entityId: before.user.id,
      before: before.user,
      after: reactivatedUser,
      metadata: { source: "staff_profile_login_access_reactivated" }
    }, tx);
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_LOGIN_ACCESS_REACTIVATED,
      entityType: "StaffProfile",
      entityId: after.id,
      branchId: after.branchId,
      before,
      after,
      metadata: { userId: before.user.id }
    }, tx);
    return after;
  });
}

export async function updateStaffProfile(ctx: TenantContext, input: unknown) {
  const { staffId, ...data } = updateStaffProfileSchema.parse(input);

  return db.$transaction(async (tx) => {
    const before = await tx.staffProfile.findFirst({
      where: { id: staffId, tenantId: ctx.tenantId },
      include: {
        user: {
          select: {
            id: true,
            tenantId: true,
            email: true,
            phone: true,
            firstName: true,
            middleName: true,
            lastName: true,
            displayName: true,
            status: true
          }
        }
      }
    });
    if (!before) throw notFound("STAFF_PROFILE_NOT_FOUND");

    await requireBranchPermission(ctx, "staffboard.staff.update", before.branchId);
    if (data.branchId && data.branchId !== before.branchId) {
      await requireBranchPermission(ctx, "staffboard.staff.update", data.branchId);
      await ensureActiveBranch(tx, ctx, data.branchId);
    }
    if (data.employmentStatus && data.employmentStatus !== before.employmentStatus && data.employmentStatus !== "ACTIVE") {
      await requireBranchPermission(ctx, "staffboard.staff.deactivate", before.branchId);
    }

    if (data.employeeCode && data.employeeCode !== before.employeeCode) {
      const duplicate = await tx.staffProfile.findFirst({
        where: { tenantId: ctx.tenantId, employeeCode: data.employeeCode, id: { not: staffId } },
        select: { id: true }
      });
      if (duplicate) throw conflict("STAFF_EMPLOYEE_CODE_EXISTS");
    }

    const nextBranchId = data.branchId ?? before.branchId;
    const linkedUserIdentityChanged = Boolean(before.user && (
      (data.email !== undefined && data.email !== before.user.email) ||
      (data.phone !== undefined && data.phone !== before.user.phone) ||
      (data.firstName !== undefined && data.firstName !== before.user.firstName) ||
      (data.middleName !== undefined && data.middleName !== before.user.middleName) ||
      (data.lastName !== undefined && data.lastName !== before.user.lastName)
    ));
    const linkedUserBranchChanged = Boolean(before.user && nextBranchId !== before.branchId);
    const shouldDeactivateLinkedUser = Boolean(
      before.user &&
      data.employmentStatus &&
      data.employmentStatus !== "ACTIVE" &&
      before.user.status === "ACTIVE"
    );

    if (before.user && (linkedUserIdentityChanged || linkedUserBranchChanged)) {
      await requirePermission({ ctx, permission: "campuscore.user.update", branchId: nextBranchId });
    }
    if (shouldDeactivateLinkedUser) {
      if (before.user?.id === ctx.userId) {
        throw new AppError("USER_SELF_DEACTIVATE_BLOCKED", "USER_SELF_DEACTIVATE_BLOCKED", 400);
      }
      await requirePermission({ ctx, permission: "campuscore.user.deactivate", branchId: before.branchId });
    }

    if (before.user && data.email !== undefined && data.email !== before.user.email) {
      const duplicateEmail = await tx.user.findFirst({
        where: {
          tenantId: ctx.tenantId,
          email: data.email,
          id: { not: before.user.id }
        },
        select: { id: true }
      });
      if (duplicateEmail) throw conflict("STAFF_LOGIN_EMAIL_EXISTS");
    }
    if (before.user && data.phone && data.phone !== before.user.phone) {
      const duplicatePhone = await tx.user.findFirst({
        where: {
          tenantId: ctx.tenantId,
          phone: data.phone,
          id: { not: before.user.id }
        },
        select: { id: true }
      });
      if (duplicatePhone) throw conflict("STAFF_LOGIN_PHONE_EXISTS");
    }

    const after = await tx.staffProfile.update({
      where: { id: staffId },
      data,
      select: staffProfileSelect
    });

    if (before.user && linkedUserBranchChanged) {
      const existingBranchAccess = await tx.userBranchAccess.findUnique({
        where: {
          tenantId_userId_branchId: {
            tenantId: ctx.tenantId,
            userId: before.user.id,
            branchId: nextBranchId
          }
        }
      });
      await tx.userBranchAccess.updateMany({
        where: {
          tenantId: ctx.tenantId,
          userId: before.user.id,
          isPrimary: true,
          branchId: { not: nextBranchId }
        },
        data: { isPrimary: false }
      });
      const branchAccess = existingBranchAccess
        ? await tx.userBranchAccess.update({
          where: { id: existingBranchAccess.id },
          data: {
            isActive: true,
            isPrimary: true,
            grantedById: ctx.userId
          }
        })
        : await tx.userBranchAccess.create({
          data: {
            tenantId: ctx.tenantId,
            userId: before.user.id,
            branchId: nextBranchId,
            isPrimary: true,
            grantedById: ctx.userId
          }
        });
      if (!existingBranchAccess?.isActive) {
        await writeAuditLog({
          ctx,
          action: CAMPUS_CORE_AUDIT_EVENTS.USER_BRANCH_ASSIGNED,
          entityType: "User",
          entityId: before.user.id,
          branchId: nextBranchId,
          after: branchAccess,
          metadata: { source: "staff_profile_branch_sync" }
        }, tx);
      }
    }

    if (before.user && (linkedUserIdentityChanged || shouldDeactivateLinkedUser)) {
      const linkedUserAfter = await tx.user.update({
        where: { id: before.user.id },
        data: {
          email: data.email,
          phone: data.phone,
          firstName: data.firstName,
          middleName: data.middleName,
          lastName: data.lastName,
          displayName: data.firstName !== undefined || data.lastName !== undefined
            ? userDisplayName({
              firstName: data.firstName ?? before.user.firstName,
              lastName: data.lastName ?? before.user.lastName
            })
            : undefined,
          status: shouldDeactivateLinkedUser ? "DEACTIVATED" : undefined,
          deactivatedAt: shouldDeactivateLinkedUser ? new Date() : undefined,
          updatedById: ctx.userId
        },
        select: {
          id: true,
          tenantId: true,
          email: true,
          phone: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true,
          status: true,
          deactivatedAt: true,
          updatedAt: true
        }
      });
      if (shouldDeactivateLinkedUser) {
        await tx.session.updateMany({
          where: {
            tenantId: ctx.tenantId,
            userId: before.user.id,
            revokedAt: null
          },
          data: { revokedAt: new Date() }
        });
      }
      await writeAuditLog({
        ctx,
        action: shouldDeactivateLinkedUser
          ? CAMPUS_CORE_AUDIT_EVENTS.USER_DEACTIVATED
          : CAMPUS_CORE_AUDIT_EVENTS.USER_UPDATED,
        entityType: "User",
        entityId: before.user.id,
        before: before.user,
        after: linkedUserAfter,
        metadata: {
          source: "staff_profile_sync",
          sessionsRevoked: shouldDeactivateLinkedUser
        }
      }, tx);
    }

    if (
      data.branchId !== undefined ||
      data.staffType !== undefined ||
      data.joiningDate !== undefined ||
      data.employmentStatus !== undefined
    ) {
      await reconcileAcademicCalendarForStaffProfile(tx, ctx, after.id, new Date());
    }

    await writeAuditLog({
      ctx,
      action:
        data.employmentStatus && data.employmentStatus !== before.employmentStatus
          ? data.employmentStatus === "INACTIVE"
            ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_DEACTIVATED
            : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_EMPLOYMENT_STATUS_CHANGED
          : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_UPDATED,
      entityType: "StaffProfile",
      entityId: after.id,
      branchId: after.branchId,
      before,
      after,
      metadata:
        data.employmentStatus && data.employmentStatus !== before.employmentStatus
          ? { previousStatus: before.employmentStatus, newStatus: data.employmentStatus }
          : undefined
    }, tx);
    return after;
  });
}

export async function updateStaffEmploymentStatus(ctx: TenantContext, staffId: string, status: unknown) {
  const id = idSchema.parse(staffId);
  const nextStatus = employmentStatusSchema.parse(status);
  return updateStaffProfile(ctx, {
    staffId: id,
    employmentStatus: nextStatus
  });
}

export async function deactivateStaffProfile(ctx: TenantContext, staffId: string) {
  return updateStaffEmploymentStatus(ctx, staffId, "INACTIVE");
}
