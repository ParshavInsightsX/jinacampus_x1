import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/errors";
import {
  adminResetUserPasswordAction,
  assignUserBranchAction,
  assignUserRoleAction,
  changeOwnPasswordAction,
  createUserAction,
  removeUserBranchAction,
  removeUserRoleAction,
  requestPasswordRecoveryAction,
  updateAttendanceSettingsAction
} from "@/modules/campus-core/actions";
import type { TenantContext } from "@/lib/tenant/context";

const mocks = vi.hoisted(() => {
  const adminResetUserPasswordService = vi.fn();
  const assignUserBranchService = vi.fn();
  const assignUserRoleService = vi.fn();
  const changeOwnPasswordService = vi.fn();
  const createUserService = vi.fn();
  const getTenantContext = vi.fn();
  const headers = vi.fn();
  const removeUserBranchService = vi.fn();
  const removeUserRoleService = vi.fn();
  const requestPasswordRecoveryService = vi.fn();
  const revalidatePath = vi.fn();
  const redirect = vi.fn();
  const updateAttendanceSettingsService = vi.fn();

  return {
    adminResetUserPasswordService,
    assignUserBranchService,
    assignUserRoleService,
    changeOwnPasswordService,
    createUserService,
    getTenantContext,
    headers,
    removeUserBranchService,
    removeUserRoleService,
    requestPasswordRecoveryService,
    revalidatePath,
    redirect,
    updateAttendanceSettingsService
  };
});

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/tenant/context", () => ({ getTenantContext: mocks.getTenantContext }));
vi.mock("@/modules/campus-core/services", () => ({
  activateAcademicYearService: vi.fn(),
  adminResetUserPasswordService: mocks.adminResetUserPasswordService,
  assignUserBranchService: mocks.assignUserBranchService,
  assignUserRoleService: mocks.assignUserRoleService,
  changeOwnPasswordService: mocks.changeOwnPasswordService,
  createAcademicYearService: vi.fn(),
  createBranchService: vi.fn(),
  createInstitutionService: vi.fn(),
  createRoleService: vi.fn(),
  createUserService: mocks.createUserService,
  removeUserBranchService: mocks.removeUserBranchService,
  removeUserRoleService: mocks.removeUserRoleService,
  requestPasswordRecoveryService: mocks.requestPasswordRecoveryService,
  updateAttendanceSettingsService: mocks.updateAttendanceSettingsService,
  updateBranchService: vi.fn(),
  updateInstitutionService: vi.fn(),
  updateTenantSettingsService: vi.fn(),
  updateUserService: vi.fn()
}));

const ctx: TenantContext = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  userEmail: "admin@example.test",
  userType: "STAFF",
  activeBranchId: "00000000-0000-0000-0000-000000000003",
  accessibleBranchIds: ["00000000-0000-0000-0000-000000000003"],
  activeAcademicYearId: "00000000-0000-0000-0000-000000000004"
};

function resetMocks() {
  mocks.adminResetUserPasswordService.mockReset();
  mocks.assignUserBranchService.mockReset();
  mocks.assignUserRoleService.mockReset();
  mocks.changeOwnPasswordService.mockReset();
  mocks.createUserService.mockReset();
  mocks.getTenantContext.mockReset();
  mocks.getTenantContext.mockResolvedValue(ctx);
  mocks.headers.mockReset();
  mocks.headers.mockResolvedValue({ get: vi.fn(() => null) });
  mocks.removeUserBranchService.mockReset();
  mocks.removeUserRoleService.mockReset();
  mocks.requestPasswordRecoveryService.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.redirect.mockReset();
  mocks.updateAttendanceSettingsService.mockReset();
}

function userFormData() {
  const formData = new FormData();
  formData.set("firstName", "Teacher");
  formData.set("lastName", "Demo");
  formData.set("email", "teacher@example.test");
  formData.set("userType", "STAFF");
  formData.set("initialPassword", "password-123");
  formData.set("confirmInitialPassword", "password-123");
  return formData;
}

describe("CampusCore account server actions", () => {
  beforeEach(() => {
    resetMocks();
  });

  it("create user action passes initial password to the service but returns only a safe state", async () => {
    const result = await createUserAction({ ok: false }, userFormData());

    expect(result).toEqual({ ok: true, message: "User account created." });
    expect(mocks.createUserService).toHaveBeenCalledWith(ctx, expect.objectContaining({
      email: "teacher@example.test",
      initialPassword: "password-123",
      confirmInitialPassword: "password-123"
    }));
    expect(JSON.stringify(result)).not.toContain("password-123");
  });

  it("create user action maps password validation to field-level errors", async () => {
    const formData = userFormData();
    formData.set("confirmInitialPassword", "different-password");

    const result = await createUserAction({ ok: false }, formData);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Please check the highlighted fields and try again.");
    expect(result.fieldErrors?.confirmInitialPassword?.[0]).toBe("New password and confirmation do not match.");
    expect(mocks.createUserService).not.toHaveBeenCalled();
  });

  it("admin reset password action maps permission errors safely", async () => {
    mocks.adminResetUserPasswordService.mockRejectedValueOnce(new Error("FORBIDDEN_PERMISSION:campuscore.user.reset_password"));
    const formData = new FormData();
    formData.set("userId", "00000000-0000-0000-0000-000000000005");
    formData.set("newPassword", "password-123");
    formData.set("confirmNewPassword", "password-123");

    const result = await adminResetUserPasswordAction({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: "You do not have permission to perform this action.",
      fieldErrors: undefined
    });
    expect(JSON.stringify(result)).not.toContain("campuscore.user.reset_password");
  });

  it("change own password action returns safe messages for wrong current password", async () => {
    mocks.changeOwnPasswordService.mockRejectedValueOnce(new AppError("CURRENT_PASSWORD_INCORRECT"));
    const formData = new FormData();
    formData.set("currentPassword", "wrong-password");
    formData.set("newPassword", "password-123");
    formData.set("confirmNewPassword", "password-123");

    const result = await changeOwnPasswordAction({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: "Current password is incorrect.",
      fieldErrors: undefined
    });
    expect(JSON.stringify(result)).not.toContain("wrong-password");
  });

  it("role assignment actions map duplicate role errors safely", async () => {
    mocks.assignUserRoleService.mockRejectedValueOnce(new AppError("USER_ROLE_ALREADY_ASSIGNED"));
    const formData = new FormData();
    formData.set("userId", "00000000-0000-0000-0000-000000000005");
    formData.set("roleId", "00000000-0000-0000-0000-000000000006");

    const result = await assignUserRoleAction({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: "This role is already assigned to the user.",
      fieldErrors: undefined
    });
    expect(JSON.stringify(result)).not.toContain("USER_ROLE_ALREADY_ASSIGNED");
  });

  it("branch assignment actions map duplicate branch access errors safely", async () => {
    mocks.assignUserBranchService.mockRejectedValueOnce(new AppError("USER_BRANCH_ALREADY_ASSIGNED"));
    const formData = new FormData();
    formData.set("userId", "00000000-0000-0000-0000-000000000005");
    formData.set("branchId", "00000000-0000-0000-0000-000000000007");

    const result = await assignUserBranchAction({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: "This branch is already assigned to the user.",
      fieldErrors: undefined
    });
    expect(JSON.stringify(result)).not.toContain("USER_BRANCH_ALREADY_ASSIGNED");
  });

  it("remove branch action maps final branch access errors safely", async () => {
    mocks.removeUserBranchService.mockRejectedValueOnce(new AppError("USER_BRANCH_ACCESS_REQUIRED"));
    const formData = new FormData();
    formData.set("userId", "00000000-0000-0000-0000-000000000005");
    formData.set("branchId", "00000000-0000-0000-0000-000000000007");

    const result = await removeUserBranchAction({ ok: false }, formData);

    expect(result).toEqual({
      ok: false,
      error: "A user must keep at least one active branch access.",
      fieldErrors: undefined
    });
    expect(JSON.stringify(result)).not.toContain("USER_BRANCH_ACCESS_REQUIRED");
  });

  it("remove role and branch actions call services with server-derived context", async () => {
    const roleFormData = new FormData();
    roleFormData.set("userId", "00000000-0000-0000-0000-000000000005");
    roleFormData.set("roleId", "00000000-0000-0000-0000-000000000006");
    const branchFormData = new FormData();
    branchFormData.set("userId", "00000000-0000-0000-0000-000000000005");
    branchFormData.set("branchId", "00000000-0000-0000-0000-000000000007");

    await removeUserRoleAction({ ok: false }, roleFormData);
    await removeUserBranchAction({ ok: false }, branchFormData);

    expect(mocks.removeUserRoleService).toHaveBeenCalledWith(ctx, expect.objectContaining({
      userId: "00000000-0000-0000-0000-000000000005",
      roleId: "00000000-0000-0000-0000-000000000006"
    }));
    expect(mocks.removeUserBranchService).toHaveBeenCalledWith(ctx, {
      userId: "00000000-0000-0000-0000-000000000005",
      branchId: "00000000-0000-0000-0000-000000000007"
    });
  });

  it("forgot password action returns the same safe response for existing and unknown accounts", async () => {
    const formData = new FormData();
    formData.set("tenantSlug", "school-a");
    formData.set("email", "teacher@example.test");
    mocks.requestPasswordRecoveryService.mockResolvedValueOnce({ requested: true });

    const existing = await requestPasswordRecoveryAction({ ok: false }, formData);

    formData.set("email", "unknown@example.test");
    mocks.requestPasswordRecoveryService.mockResolvedValueOnce({ requested: true });
    const unknown = await requestPasswordRecoveryAction({ ok: false }, formData);

    expect(existing).toEqual(unknown);
    expect(existing.ok).toBe(true);
    expect(existing.message).toContain("If this account is eligible for password recovery");
    expect(JSON.stringify(existing)).not.toMatch(/passwordHash|reset token|user does not exist|email not found/i);
    expect(mocks.requestPasswordRecoveryService).toHaveBeenCalledWith(
      { tenantSlug: "school-a", email: "teacher@example.test" },
      { ipAddress: undefined, userAgent: undefined }
    );
  });

  it("forgot password action maps invalid email to a field-level error", async () => {
    const formData = new FormData();
    formData.set("tenantSlug", "school-a");
    formData.set("email", "not-an-email");

    const result = await requestPasswordRecoveryAction({ ok: false }, formData);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Please check the highlighted fields and try again.");
    expect(result.fieldErrors?.email?.[0]).toBe("Enter a valid email address.");
    expect(mocks.requestPasswordRecoveryService).not.toHaveBeenCalled();
  });

  it("forgot password action fails closed with the public message on unexpected service errors", async () => {
    const formData = new FormData();
    formData.set("tenantSlug", "school-a");
    formData.set("email", "admin@example.test");
    mocks.requestPasswordRecoveryService.mockRejectedValueOnce(new Error("DATABASE_URL leaked error"));

    const result = await requestPasswordRecoveryAction({ ok: false }, formData);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("If this account is eligible for password recovery");
    expect(JSON.stringify(result)).not.toContain("DATABASE_URL");
  });

  it("attendance settings action returns validation errors without calling tenant or database services", async () => {
    const formData = new FormData();
    formData.set("branchId", "00000000-0000-0000-0000-000000000003");
    formData.set("staffScanSessionValidityMinutes", "1");

    const result = await updateAttendanceSettingsAction({ ok: false }, formData);

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Review the attendance settings and try again.");
    expect(result.fieldErrors?.staffScanSessionValidityMinutes).toEqual(expect.any(Array));
    expect(mocks.getTenantContext).not.toHaveBeenCalled();
    expect(mocks.updateAttendanceSettingsService).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("attendance settings action preserves the successful save and redirect flow", async () => {
    const formData = new FormData();
    formData.set("branchId", "00000000-0000-0000-0000-000000000003");

    await updateAttendanceSettingsAction({ ok: false }, formData);

    expect(mocks.updateAttendanceSettingsService).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        branchId: "00000000-0000-0000-0000-000000000003",
        staffScanSessionValidityMinutes: 60,
        staffQrTokenValiditySeconds: 18000
      })
    );
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/campus-core/settings");
    expect(mocks.redirect).toHaveBeenCalledWith("/campus-core/settings?saved=attendance");
  });
});
