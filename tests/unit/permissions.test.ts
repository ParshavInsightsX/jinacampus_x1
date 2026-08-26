import { describe, expect, it } from "vitest";
import { canAssignRole, DEFAULT_ROLE_PERMISSION_MAP } from "@/lib/rbac/roles";
import {
  ACADEMIA_PERMISSIONS,
  CAMPUS_CORE_PERMISSIONS,
  isPermissionCode,
  PERMISSION_DEFINITIONS,
  STAFFBOARD_LITE_PERMISSIONS
} from "@/lib/rbac/permissions";

describe("permission registry", () => {
  it("contains core RBAC permissions", () => {
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.user.create");
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.user.manage");
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.user.deactivate");
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.tenant.manage");
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.settings.manage");
    expect(CAMPUS_CORE_PERMISSIONS).toContain("campuscore.audit.view");
  });

  it("contains first-development permission seed constants", () => {
    expect(ACADEMIA_PERMISSIONS).toContain("academia.attendance.mark");
    expect(STAFFBOARD_LITE_PERMISSIONS).toEqual([
      "staffboard.staff.view",
      "staffboard.staff.create",
      "staffboard.staff.update",
      "staffboard.staff.deactivate",
      "staffboard.attendance.qr.generate",

      "staffboard.attendance.self_view",
      "staffboard.attendance.view",
      "staffboard.attendance.correct",
      "staffboard.attendance.report",
      "staffboard.attendance.scan",
      "staffboard.attendance.credential.manage",
      "staffboard.attendance.credential.self_view",
      "staffboard.attendance.manual",
      "staffboard.attendance.adjustment.request",
      "staffboard.attendance.adjustment.approve",
      "staffboard.attendance.period.lock",
      "staffboard.leave.self_apply",
      "staffboard.leave.self_view",
      "staffboard.leave.view",
      "staffboard.leave.approve",
      "staffboard.leave.settings.manage",
      "staffboard.leave.balance.manage"
    ]);
    expect(PERMISSION_DEFINITIONS.map((permission) => permission.module)).toContain("ACADEMIA");
    expect(PERMISSION_DEFINITIONS.map((permission) => permission.module)).toContain("STAFFBOARD");
  });

  it("does not include unapproved payroll or appraisal permissions", () => {
    expect(STAFFBOARD_LITE_PERMISSIONS.join(" ")).not.toMatch(/payroll|appraisal/i);
  });

  it("guards unknown permission codes", () => {
    expect(isPermissionCode("campuscore.user.create")).toBe(true);
    expect(isPermissionCode("academia.section.manage")).toBe(true);
    expect(isPermissionCode("academia.section.create")).toBe(false);
  });

  it("keeps default role permissions in the registry", () => {
    for (const permissions of Object.values(DEFAULT_ROLE_PERMISSION_MAP)) {
      for (const permission of permissions) {
        expect(isPermissionCode(permission)).toBe(true);
      }
    }
  });

  it("keeps school role assignment within principal governance boundaries", () => {
    expect(canAssignRole(["PRINCIPAL"], "TEACHER")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "OFFICE_STAFF")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "STAFF")).toBe(true);
    expect(canAssignRole(["PRINCIPAL"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["PRINCIPAL"], "ADMIN")).toBe(false);
    expect(canAssignRole(["PRINCIPAL"], "TENANT_OWNER")).toBe(false);
    expect(canAssignRole(["TENANT_OWNER"], "ADMIN")).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "PRINCIPAL")).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "TEACHER")).toBe(false);
    expect(canAssignRole(["ADMINISTRATOR"], "ADMINISTRATOR")).toBe(false);
  });
});
