import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { PermissionCode } from "@/lib/rbac/permissions";
import { getPostLoginRedirectPath } from "@/modules/campus-core/auth-redirect";
import { getAvailableSchoolWorkspaces } from "@/modules/campus-core/workspaces";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("attendance fast login and workspace selection", () => {
  it("keeps single-role redirects short and asks multi-role users to choose", () => {
    expect(getPostLoginRedirectPath(["PRINCIPAL"])).toBe("/dashboard");
    expect(getPostLoginRedirectPath(["TEACHER"])).toBe("/academia/attendance/mark");
    expect(getPostLoginRedirectPath(["STAFF"])).toBe("/staffboard/attendance/card");
    expect(getPostLoginRedirectPath(["TEACHER", "STAFF"])).toBe("/account/workspaces");
    expect(getPostLoginRedirectPath(["PRINCIPAL", "TEACHER"])).toBe("/account/workspaces");
    expect(getPostLoginRedirectPath(["ADMINISTRATOR"])).toBe("/dashboard");
  });

  it("returns only workspaces authorized by merged server permissions", () => {
    const teacherPermissions = new Set<PermissionCode>([
      "campuscore.tenant.view",
      "academia.student.view",
      "academia.attendance.mark",
      "staffboard.attendance.credential.self_view",
      "staffboard.attendance.self_view"
    ]);
    const teacherWorkspaces = getAvailableSchoolWorkspaces(["TEACHER"], teacherPermissions);

    expect(teacherWorkspaces.map((workspace) => workspace.id)).toEqual([
      "teaching",
      "self-attendance"
    ]);
    expect(teacherWorkspaces.map((workspace) => workspace.href)).toEqual([
      "/academia/attendance/mark",
      "/staffboard/attendance/card"
    ]);

    const staffWorkspaces = getAvailableSchoolWorkspaces(["STAFF"], new Set<PermissionCode>([
      "campuscore.tenant.view",
      "staffboard.attendance.self_view"
    ]));
    expect(staffWorkspaces).toEqual([
      expect.objectContaining({ id: "self-attendance", href: "/staffboard/attendance/me" })
    ]);
  });

  it("does not grant a workspace from a client-selected role alone", () => {
    expect(getAvailableSchoolWorkspaces(
      ["PRINCIPAL", "OFFICE_STAFF", "TEACHER", "STAFF"],
      new Set<PermissionCode>()
    )).toEqual([]);
  });

  it("uses the existing passkey APIs and preserves forced-password-change redirects", () => {
    const loginForm = source("src/components/auth/login-form.tsx");
    const attendancePage = source("src/app/(auth)/attendance-login/page.tsx");

    expect(loginForm).toContain("/api/auth/passkey/authentication/options");
    expect(loginForm).toContain("/api/auth/passkey/authentication/verify");
    expect(loginForm).toContain('redirectTo.startsWith("/account/change-password")');
    expect(loginForm).toContain("Quick attendance sign in");
    expect(attendancePage).toContain('intent="attendance"');
    expect(attendancePage).toContain('successRedirect="/staffboard/attendance/scan"');
    expect(`${loginForm}\n${attendancePage}`).not.toMatch(/tenantId|branchId|actorUserId|passwordHash|tokenHash/);
  });

  it("makes manual workspace selection available from desktop and mobile account menus", () => {
    expect(source("src/components/app-shell/navbar-user-menu.tsx")).toContain("/account/workspaces");
    expect(source("src/components/app-shell/mobile-navigation-drawer.tsx")).toContain("/account/workspaces");
    expect(source("src/app/(account)/account/workspaces/page.tsx")).toContain(
      "getAvailableSchoolWorkspaces(ctx.roleCodes ?? [], permissions)"
    );
  });
});
