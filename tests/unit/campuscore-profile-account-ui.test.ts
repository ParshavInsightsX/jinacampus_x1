import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const institutionRoutes = [
  "src/app/(dashboard)/campus-core/institutions/[institutionId]/page.tsx",
  "src/app/(dashboard)/campus-core/institutions/[institutionId]/edit/page.tsx"
] as const;

const branchRoutes = [
  "src/app/(dashboard)/campus-core/branches/[branchId]/page.tsx",
  "src/app/(dashboard)/campus-core/branches/[branchId]/edit/page.tsx"
] as const;

const userRoutes = [
  "src/app/(dashboard)/campus-core/users/[userId]/page.tsx",
  "src/app/(dashboard)/campus-core/users/[userId]/edit/page.tsx",
  "src/app/(dashboard)/campus-core/users/[userId]/reset-password/page.tsx",
  "src/app/(account)/account/change-password/page.tsx"
] as const;

describe("CampusCore profile and account UI repair", () => {
  it("adds profile, edit, and password management routes", () => {
    for (const route of [...institutionRoutes, ...branchRoutes, ...userRoutes]) {
      expect(existsSync(resolve(process.cwd(), route))).toBe(true);
    }
  });

  it("loads institution and branch profile records through tenant-safe queries", () => {
    expect(source(institutionRoutes[0])).toContain("getInstitutionById(ctx, institutionId)");
    expect(source(institutionRoutes[1])).toContain("getInstitutionById(ctx, institutionId)");
    expect(source(branchRoutes[0])).toContain("getBranchById(ctx, branchId)");
    expect(source(branchRoutes[1])).toContain("getBranchById(ctx, branchId)");
  });

  it("keeps password management separate from institution profile forms", () => {
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");
    const institutionFormStart = formSource.indexOf("export function InstitutionEditForm");
    const branchFormStart = formSource.indexOf("export function BranchEditForm");
    const institutionFormSource = formSource.slice(institutionFormStart, branchFormStart);

    expect(institutionFormSource).toContain("Passwords are managed from user accounts");
    expect(institutionFormSource).not.toContain("newPassword");
    expect(institutionFormSource).not.toContain("passwordHash");
  });

  it("adds display-name and logo URL branding controls to institution profile UI", () => {
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");
    const detailSource = source("src/app/(dashboard)/campus-core/institutions/[institutionId]/page.tsx");
    const listSource = source("src/app/(dashboard)/campus-core/institutions/page.tsx");

    expect(formSource).toContain("Display Name");
    expect(formSource).toContain("Logo URL");
    expect(formSource).toContain("name=\"displayName\"");
    expect(formSource).toContain("name=\"logoUrl\"");
    expect(detailSource).toContain("institution.displayName ?? institution.name");
    expect(detailSource).toContain("Using initials fallback");
    expect(listSource).toContain("institution.displayName ?? institution.name");
  });

  it("wires account actions without exposing password hashes in UI files", () => {
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");
    const actionsSource = source("src/modules/campus-core/actions.ts");

    expect(formSource).toContain("createUserAction");
    expect(formSource).toContain("adminResetUserPasswordAction");
    expect(formSource).toContain("changeOwnPasswordAction");
    expect(formSource).toContain("assignUserRoleAction");
    expect(formSource).toContain("assignUserBranchAction");
    expect(formSource).toContain("autoComplete=\"new-password\"");
    expect(formSource).toContain("autoComplete=\"username\"");
    expect(formSource).not.toContain("passwordHash");
    expect(actionsSource).not.toContain("passwordHash:");
  });

  it("adds browser-friendly autocomplete hints on login and password forms", () => {
    const loginSource = source("src/components/auth/login-form.tsx");
    const changePasswordSource = source("src/app/(account)/account/change-password/page.tsx");
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");

    expect(loginSource).toContain("autoComplete=\"username\"");
    expect(loginSource).toContain("autoComplete=\"current-password\"");
    expect(changePasswordSource).toContain("userEmail={ctx.userEmail}");
    expect(formSource).toContain("name=\"username\"");
  });

  it("adds user role and branch access management on the user detail page", () => {
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");
    const detailSource = source("src/app/(dashboard)/campus-core/users/[userId]/page.tsx");

    expect(formSource).toContain("export function UserRoleAssignmentsCard");
    expect(formSource).toContain("export function UserBranchAccessCard");
    expect(formSource).toContain("Assign Role");
    expect(formSource).toContain("Assign Branch");
    expect(detailSource).toContain("listAssignableRoles(ctx)");
    expect(detailSource).toContain("listUserAssignableBranches(ctx)");
    expect(detailSource).toContain("UserRoleAssignmentsCard");
    expect(detailSource).toContain("UserBranchAccessCard");
    expect(detailSource).toContain("Account Actions");
    expect(detailSource).toContain("Edit User Profile");
  });

  it("renders safe permission states for unauthorized user-management pages", () => {
    expect(source("src/app/(dashboard)/campus-core/users/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/users/[userId]/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/users/[userId]/edit/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/users/[userId]/reset-password/page.tsx")).toContain("PermissionState");
  });

  it("renders safe permission states for unauthorized institution and branch profile pages", () => {
    expect(source("src/app/(dashboard)/campus-core/institutions/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/institutions/[institutionId]/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/institutions/[institutionId]/edit/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/branches/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/branches/[branchId]/page.tsx")).toContain("PermissionState");
    expect(source("src/app/(dashboard)/campus-core/branches/[branchId]/edit/page.tsx")).toContain("PermissionState");
  });

  it("adds list-page profile/edit links and navbar account actions", () => {
    expect(source("src/app/(dashboard)/campus-core/institutions/page.tsx")).toContain("/campus-core/institutions/${institution.id}/edit");
    expect(source("src/app/(dashboard)/campus-core/branches/page.tsx")).toContain("/campus-core/branches/${b.id}/edit");
    expect(source("src/app/(dashboard)/campus-core/users/page.tsx")).toContain("/campus-core/users/${u.id}/reset-password");
    expect(source("src/components/app-shell/navbar-user-menu.tsx")).toContain("/account/change-password");
    expect(source("src/components/app-shell/navbar-user-menu.tsx")).toContain("/api/auth/logout");
  });

  it("keeps profile and account forms mobile-safe", () => {
    const formSource = source("src/modules/campus-core/components/campus-core-profile-forms.tsx");

    expect(formSource).toContain("min-h-11 w-full");
    expect(formSource).toContain("grid gap-4 md:grid-cols");
    expect(formSource).toContain("sm:w-auto");
  });
});
