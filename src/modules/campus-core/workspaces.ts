import type { PermissionCode } from "@/lib/rbac/permissions";
import { hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";

export type SchoolWorkspace = {
  id: "administration" | "office" | "teaching" | "self-attendance";
  title: string;
  description: string;
  href: string;
};

export type SchoolWorkspaceFeatures = {
  attendance?: {
    studentAttendance?: boolean;
    staffAttendance?: boolean;
    marking?: boolean;
    qrRead?: boolean;
    qrWrite?: boolean;
    reports?: boolean;
  };
};

function hasAnyPermission(
  permissions: ReadonlySet<PermissionCode>,
  required: readonly PermissionCode[]
) {
  return required.some((permission) => permissions.has(permission));
}

export function getAvailableSchoolWorkspaces(
  roleCodes: readonly string[],
  permissions: ReadonlySet<PermissionCode>,
  features: SchoolWorkspaceFeatures = {}
) {
  const workspaces: SchoolWorkspace[] = [];
  const attendance = features.attendance;
  const attendanceFeatureEnabled = (feature: keyof NonNullable<SchoolWorkspaceFeatures["attendance"]>) =>
    attendance ? attendance[feature] === true : true;

  if (
    hasPrincipalRole(roleCodes) &&
    hasAnyPermission(permissions, [
      "campuscore.tenant.view",
      "campuscore.user.view",
      "campuscore.settings.manage"
    ])
  ) {
    const href = permissions.has("campuscore.tenant.view")
      ? "/dashboard"
      : permissions.has("campuscore.user.view")
        ? "/campus-core/users"
        : "/campus-core/settings";
    workspaces.push({
      id: "administration",
      title: "School Administration",
      description: "Manage school setup, people, academics, attendance, and governance.",
      href
    });
  }

  if (roleCodes.includes("OFFICE_STAFF")) {
    const href = attendanceFeatureEnabled("staffAttendance") && permissions.has("staffboard.attendance.view")
      ? "/staffboard/attendance"
      : attendanceFeatureEnabled("staffAttendance") &&
          attendanceFeatureEnabled("qrWrite") &&
          permissions.has("staffboard.attendance.scan")
        ? "/staffboard/attendance/scan"
        : attendanceFeatureEnabled("staffAttendance") &&
            attendanceFeatureEnabled("reports") &&
            permissions.has("staffboard.attendance.report")
          ? "/staffboard/attendance/reports"
          : permissions.has("staffboard.staff.view")
            ? "/staffboard/staff"
            : null;

    if (href) workspaces.push({
      id: "office",
      title: "Office Operations",
      description: "Open permission-based staff and attendance operations.",
      href
    });
  }

  if (hasTeacherRole(roleCodes)) {
    const href = attendanceFeatureEnabled("studentAttendance") &&
      attendanceFeatureEnabled("marking") &&
      permissions.has("academia.attendance.mark")
      ? "/academia/attendance/mark"
      : attendanceFeatureEnabled("studentAttendance") && permissions.has("academia.attendance.view")
        ? "/academia/attendance"
        : permissions.has("academia.student.view")
          ? "/academia/students"
          : null;

    if (href) workspaces.push({
      id: "teaching",
      title: "Teaching",
      description: "Open assigned class, student, and attendance workflows.",
      href
    });
  }

  if (
    attendanceFeatureEnabled("staffAttendance") &&
    attendanceFeatureEnabled("qrRead") &&
    permissions.has("staffboard.attendance.credential.self_view")
  ) {
    workspaces.push({
      id: "self-attendance",
      title: "My Attendance",
      description: "Display your Attendance QR for the authorised school scanner.",
      href: "/staffboard/attendance/card"
    });
  } else if (
    attendanceFeatureEnabled("staffAttendance") &&
    permissions.has("staffboard.attendance.self_view")
  ) {
    workspaces.push({
      id: "self-attendance",
      title: "Attendance History",
      description: "Review your own attendance record and correction requests.",
      href: "/staffboard/attendance/me"
    });
  }

  return workspaces;
}
