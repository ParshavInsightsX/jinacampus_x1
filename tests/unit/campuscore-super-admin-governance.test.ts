import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CAMPUS_CORE_PERMISSIONS } from "@/modules/campus-core/permissions";
import { getPostLoginRedirectPath } from "@/modules/campus-core/auth-redirect";
import {
  DEFAULT_ROLE_PERMISSION_MAP,
  canAssignRole,
  hasPlatformAdminRole
} from "@/lib/rbac/roles";

describe("CampusCore five-role user governance", () => {
  it("registers explicit platform governance permissions", () => {
    expect(CAMPUS_CORE_PERMISSIONS).toEqual(expect.arrayContaining([
      "platform.dashboard.view",
      "platform.tenant.manage",
      "platform.institution.manage",
      "platform.school.view",
      "platform.school.create",
      "platform.school.update",
      "platform.school.deactivate",
      "platform.school.delete",
      "platform.school.update_school_id",
      "platform.user.manage",
      "platform.audit.view",
      "campuscore.user.reset_password"
    ]));
  });

  it("keeps the legacy Administrator tenant role permissionless after platform separation", () => {
    expect(hasPlatformAdminRole(["SUPER_ADMIN"])).toBe(false);
    expect(hasPlatformAdminRole(["ADMINISTRATOR"])).toBe(true);
    expect(hasPlatformAdminRole(["ADMIN"])).toBe(false);
    expect(DEFAULT_ROLE_PERMISSION_MAP.SUPER_ADMIN).toEqual(expect.arrayContaining([
      "campuscore.user.create",
      "campuscore.user.reset_password"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.SUPER_ADMIN).not.toContain("platform.school.create");
    expect(DEFAULT_ROLE_PERMISSION_MAP.ADMINISTRATOR).toEqual([]);
    expect(DEFAULT_ROLE_PERMISSION_MAP.ADMIN).toEqual(expect.arrayContaining([
      "campuscore.user.create",
      "campuscore.branch.manage",
      "campuscore.user.reset_password"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.ADMIN).not.toContain("platform.user.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).toEqual(expect.arrayContaining([
      "campuscore.user.create",
      "campuscore.user.update",
      "campuscore.user.reset_password",
      "campuscore.role.view",
      "campuscore.branch.manage"
    ]));
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).not.toContain("platform.user.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).not.toContain("platform.tenant.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).not.toContain("platform.school.create");
    expect(DEFAULT_ROLE_PERMISSION_MAP.PRINCIPAL).not.toContain("platform.school.update_school_id");
  });

  it("keeps principal, teacher, and staff role-assignment boundaries safe", () => {
    expect(canAssignRole(["ADMINISTRATOR"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "ADMINISTRATOR")).toBe(false);
    expect(canAssignRole(["ADMIN"], "ADMIN")).toBe(false);
    expect(canAssignRole(["SUPER_ADMIN"], "ADMINISTRATOR")).toBe(false);
    expect(canAssignRole(["TENANT_OWNER"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["PRINCIPAL"], "TEACHER")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "STAFF")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "ADMIN")).toBe(false);
    expect(canAssignRole(["PRINCIPAL"], "TENANT_OWNER")).toBe(false);
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).not.toContain("campuscore.user.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain("campuscore.user.manage");
    expect(DEFAULT_ROLE_PERMISSION_MAP.TEACHER).not.toContain("campuscore.user.reset_password");
    expect(DEFAULT_ROLE_PERMISSION_MAP.STAFF).not.toContain("campuscore.user.reset_password");
  });

  it("returns role-aware post-login destinations without creating role or institution logins", () => {
    expect(getPostLoginRedirectPath(["ADMINISTRATOR"])).not.toBe("/administrator");
    expect(getPostLoginRedirectPath(["ADMIN"])).toBe("/dashboard");
    expect(getPostLoginRedirectPath(["PRINCIPAL"])).toBe("/dashboard");
    expect(getPostLoginRedirectPath(["CLASS_TEACHER"])).toBe("/academia/attendance/mark");
    expect(getPostLoginRedirectPath(["TEACHER"])).toBe("/academia/attendance/mark");
    expect(getPostLoginRedirectPath(["STAFF"])).toBe("/staffboard/attendance/card");
  });

  it("keeps user-list role labels aligned to active role assignments only", () => {
    const queries = readFileSync(resolve(process.cwd(), "src/modules/campus-core/queries.ts"), "utf8");

    expect(queries).toContain("roleAssignments: {");
    expect(queries).toContain("isActive: true");
    expect(queries).toContain("startsAt: { lte: now }");
    expect(queries).toContain("endsAt: { gt: now }");
  });
});
