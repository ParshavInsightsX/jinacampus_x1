import type { PermissionCode } from "@/lib/rbac/permissions";
import { hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";

export type SchoolWorkspace = {
  id: "administration" | "office" | "teaching" | "self-attendance";
  title: string;
  description: string;
  href: string;
};

function hasAnyPermission(
  permissions: ReadonlySet<PermissionCode>,
  required: readonly PermissionCode[]
) {
  return required.some((permission) => permissions.has(permission));
}

export function getAvailableSchoolWorkspaces(
  roleCodes: readonly string[],
  permissions: ReadonlySet<PermissionCode>
) {
  const workspaces: SchoolWorkspace[] = [];

  if (
    hasPrincipalRole(roleCodes) &&
    hasAnyPermission(permissions, ["campuscore.user.view", "campuscore.settings.manage"])
  ) {
    workspaces.push({
      id: "administration",
      title: "School Administration",
      description: "Manage school setup, people, academics, attendance, and governance.",
      href: "/dashboard"
    });
  }

  if (
    roleCodes.includes("OFFICE_STAFF") &&
    hasAnyPermission(permissions, [
      "staffboard.staff.view",
      "staffboard.attendance.view",
      "staffboard.attendance.report"
    ])
  ) {
    workspaces.push({
      id: "office",
      title: "Office Operations",
      description: "Open permission-based staff and attendance operations.",
      href: "/staffboard/attendance"
    });
  }

  if (
    hasTeacherRole(roleCodes) &&
    hasAnyPermission(permissions, ["academia.attendance.mark", "academia.student.view"])
  ) {
    workspaces.push({
      id: "teaching",
      title: "Teaching",
      description: "Open assigned class, student, and attendance workflows.",
      href: "/academia/attendance/mark"
    });
  }

  if (
    hasAnyPermission(permissions, [
      "staffboard.attendance.credential.self_view",
      "staffboard.attendance.self_view"
    ])
  ) {
    workspaces.push({
      id: "self-attendance",
      title: "My Attendance",
      description: "Review your own attendance record and display your supervised attendance card.",
      href: "/staffboard/attendance/me"
    });
  }

  return workspaces;
}
