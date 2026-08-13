import { describe, expect, it } from "vitest";
import {
  adminResetPasswordSchema,
  assignUserBranchSchema,
  assignUserRoleSchema,
  changeOwnPasswordSchema,
  createAcademicYearSchema,
  createRoleSchema,
  createUserSchema,
  forgotPasswordSchema,
  removeUserBranchSchema,
  removeUserRoleSchema,
  roleAssignmentSchema,
  updateAttendanceSettingsSchema,
  updateBranchSchema,
  updateInstitutionSchema,
  updateUserSchema,
  updateTenantSchema
} from "@/modules/campus-core/schemas";
import {
  createStaffLoginAccessSchema,
  createStaffProfileSchema
} from "@/modules/staffboard-lite/schemas";

describe("CampusCore schemas", () => {
  it("rejects academic year with end date before start date", () => {
    const result = createAcademicYearSchema.safeParse({
      institutionId: "00000000-0000-0000-0000-000000000001",
      name: "2026-27",
      startDate: "2026-04-01",
      endDate: "2026-03-31"
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid HH:mm attendance time", () => {
    const result = updateAttendanceSettingsSchema.safeParse({
      branchId: "00000000-0000-0000-0000-000000000001",
      studentAutoLockTime: "26:00"
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown role permission codes", () => {
    const result = createRoleSchema.safeParse({
      code: "CUSTOM_ROLE",
      name: "Custom Role",
      permissionCodes: ["campuscore.user.create", "academia.section.create"]
    });
    expect(result.success).toBe(false);
  });

  it("rejects malformed role codes on user creation", () => {
    const result = createUserSchema.safeParse({
      email: "staff@example.com",
      firstName: "Staff",
      roleCodes: ["teacher"]
    });
    expect(result.success).toBe(false);
  });

  it("validates optional initial user passwords and confirmation", () => {
    expect(createUserSchema.safeParse({
      email: "staff@example.test",
      firstName: "Staff",
      initialPassword: "short",
      confirmInitialPassword: "short"
    }).success).toBe(false);

    const mismatch = createUserSchema.safeParse({
      email: "staff@example.test",
      firstName: "Staff",
      initialPassword: "password-123",
      confirmInitialPassword: "password-456"
    });
    expect(mismatch.success).toBe(false);
  });

  it("validates reset and own-password change confirmation", () => {
    const userId = "00000000-0000-0000-0000-000000000001";

    expect(adminResetPasswordSchema.safeParse({
      userId,
      newPassword: "password-123",
      confirmNewPassword: "different-password"
    }).success).toBe(false);
    expect(changeOwnPasswordSchema.safeParse({
      currentPassword: "old-password",
      newPassword: "password-123",
      confirmNewPassword: "password-123"
    }).success).toBe(true);
  });

  it("validates tenant-specific forgot-password input without accepting client identity claims", () => {
    expect(forgotPasswordSchema.parse({
      tenantSlug: "School-A",
      email: "Teacher@Example.Test"
    })).toEqual({
      tenantSlug: "school-a",
      email: "teacher@example.test"
    });
    expect(forgotPasswordSchema.safeParse({ tenantSlug: "school-a", email: "not-an-email" }).success).toBe(false);
    expect(forgotPasswordSchema.parse({
      tenantSlug: "School-A",
      principalId: "principal-001"
    })).toEqual({
      tenantSlug: "school-a",
      principalId: "PRINCIPAL-001"
    });
    expect(forgotPasswordSchema.safeParse({ tenantSlug: "school-a" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({
      tenantSlug: "school-a",
      email: "principal@example.test",
      principalId: "PRINCIPAL-001"
    }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({
      tenantSlug: "school-a",
      email: "teacher@example.test",
      tenantId: "00000000-0000-0000-0000-000000000001",
      role: "ADMIN"
    }).success).toBe(false);
  });

  it("rejects empty update payloads", () => {
    const result = updateTenantSchema.safeParse({
      tenantId: "00000000-0000-0000-0000-000000000001"
    });
    expect(result.success).toBe(false);
  });

  it("validates scoped role assignment ids", () => {
    const result = roleAssignmentSchema.safeParse({
      userId: "00000000-0000-0000-0000-000000000001",
      roleId: "00000000-0000-0000-0000-000000000002",
      scopeType: "BRANCH",
      scopeId: "not-a-uuid"
    });
    expect(result.success).toBe(false);
  });

  it("accepts branch status updates", () => {
    const result = updateBranchSchema.safeParse({
      branchId: "00000000-0000-0000-0000-000000000001",
      status: "INACTIVE"
    });
    expect(result.success).toBe(true);
  });

  it("validates institution display name and logo URL safely", () => {
    const institutionId = "00000000-0000-0000-0000-000000000001";

    expect(updateInstitutionSchema.parse({
      institutionId,
      displayName: "Demo Public School",
      logoUrl: "https://demo.jinacampus.test/logo.png",
      tenantId: "00000000-0000-0000-0000-000000000002",
      actorUserId: "00000000-0000-0000-0000-000000000003"
    })).toEqual({
      institutionId,
      displayName: "Demo Public School",
      logoUrl: "https://demo.jinacampus.test/logo.png"
    });

    expect(updateInstitutionSchema.safeParse({
      institutionId,
      logoUrl: "not-a-valid-url"
    }).success).toBe(false);
  });

  it("keeps user access-management schemas limited to selected ids", () => {
    const userId = "00000000-0000-0000-0000-000000000001";
    const roleId = "00000000-0000-0000-0000-000000000002";
    const branchId = "00000000-0000-0000-0000-000000000003";

    expect(assignUserRoleSchema.parse({
      userId,
      roleId,
      tenantId: "00000000-0000-0000-0000-000000000004",
      actorUserId: "00000000-0000-0000-0000-000000000005"
    })).toEqual({ userId, roleId, scopeType: "TENANT", scopeId: "TENANT" });
    expect(removeUserRoleSchema.parse({ userId, roleId })).toEqual({ userId, roleId, scopeType: "TENANT", scopeId: "TENANT" });
    expect(assignUserBranchSchema.parse({ userId, branchId, passwordHash: "client-hash" })).toEqual({ userId, branchId });
    expect(removeUserBranchSchema.parse({ userId, branchId })).toEqual({ userId, branchId });
  });

  it("does not accept tenant or password fields in safe user profile updates", () => {
    const userId = "00000000-0000-0000-0000-000000000001";

    expect(updateUserSchema.parse({
      userId,
      firstName: "Safe",
      tenantId: "00000000-0000-0000-0000-000000000002",
      passwordHash: "client-hash"
    })).toEqual({ userId, firstName: "Safe" });
  });

  it("validates staff login access without accepting platform roles or client tenant claims", () => {
    const branchId = "00000000-0000-0000-0000-000000000003";

    expect(createStaffProfileSchema.safeParse({
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Staff",
      staffType: "SECURITY",
      createLoginAccess: true,
      loginRoleCode: "STAFF",
      initialPassword: "temporary-123",
      confirmInitialPassword: "temporary-123"
    }).success).toBe(false);

    expect(createStaffProfileSchema.safeParse({
      branchId,
      employeeCode: "EMP-1001",
      firstName: "Staff",
      staffType: "SECURITY",
      email: "staff@example.test",
      createLoginAccess: true,
      loginRoleCode: "ADMIN",
      initialPassword: "temporary-123",
      confirmInitialPassword: "temporary-123"
    }).success).toBe(false);

    expect(createStaffLoginAccessSchema.safeParse({
      staffId: "00000000-0000-0000-0000-000000000004",
      email: "staff@example.test",
      loginRoleCode: "STAFF",
      initialPassword: "temporary-123",
      confirmInitialPassword: "temporary-123",
      tenantId: "00000000-0000-0000-0000-000000000005",
      passwordHash: "client-hash"
    }).success).toBe(false);
  });
});
