import type { PermissionCode } from "@/lib/rbac/permissions";
import { hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";
import {
  getAvailableSchoolWorkspaces,
  type SchoolWorkspaceFeatures
} from "@/modules/campus-core/workspaces";

function schoolWorkspaceCount(roleCodes: readonly string[]) {
  return [
    hasPrincipalRole(roleCodes),
    roleCodes.includes("OFFICE_STAFF"),
    hasTeacherRole(roleCodes),
    roleCodes.includes("STAFF")
  ].filter(Boolean).length;
}

type PostLoginRedirectOptions = {
  permissions: ReadonlySet<PermissionCode>;
  features: SchoolWorkspaceFeatures;
  intent?: "standard" | "attendance";
};

function getAttendanceIntentPath(options: PostLoginRedirectOptions) {
  const attendance = options.features.attendance;
  if (!attendance?.staffAttendance && !attendance?.studentAttendance) return null;

  if (
    attendance.staffAttendance === true &&
    attendance.qrWrite === true &&
    options.permissions.has("staffboard.attendance.scan")
  ) {
    return "/staffboard/attendance/scan";
  }
  if (
    attendance.staffAttendance === true &&
    attendance.qrRead === true &&
    options.permissions.has("staffboard.attendance.credential.self_view")
  ) {
    return "/staffboard/attendance/card";
  }
  if (
    attendance.studentAttendance === true &&
    attendance.marking === true &&
    options.permissions.has("academia.attendance.mark")
  ) {
    return "/academia/attendance/mark";
  }
  if (
    attendance.staffAttendance === true &&
    options.permissions.has("staffboard.attendance.self_view")
  ) {
    return "/staffboard/attendance/me";
  }
  return null;
}

export function getPostLoginRedirectPath(
  roleCodes: readonly string[] = [],
  options?: PostLoginRedirectOptions
) {
  if (options) {
    const workspaces = getAvailableSchoolWorkspaces(
      roleCodes,
      options.permissions,
      options.features
    );
    const attendancePath = options.intent === "attendance"
      ? getAttendanceIntentPath(options)
      : null;
    if (attendancePath) return attendancePath;

    if (schoolWorkspaceCount(roleCodes) > 1 && workspaces.length > 1) {
      return "/account/workspaces";
    }
    if (
      (hasPrincipalRole(roleCodes) || roleCodes.includes("OFFICE_STAFF")) &&
      options.permissions.has("campuscore.tenant.view")
    ) {
      return "/dashboard";
    }

    const preferredWorkspaceId = hasTeacherRole(roleCodes)
      ? "teaching"
      : roleCodes.includes("STAFF")
        ? "self-attendance"
        : null;
    const preferredWorkspace = preferredWorkspaceId
      ? workspaces.find((workspace) => workspace.id === preferredWorkspaceId)
      : null;
    if (preferredWorkspace) return preferredWorkspace.href;
    if (workspaces.length === 1) return workspaces[0].href;
    if (workspaces.length > 1) return "/account/workspaces";
    return options.permissions.has("campuscore.tenant.view")
      ? "/dashboard"
      : "/account/workspaces";
  }

  if (schoolWorkspaceCount(roleCodes) > 1) return "/account/workspaces";
  if (hasPrincipalRole(roleCodes)) return "/dashboard";
  if (roleCodes.includes("OFFICE_STAFF")) return "/dashboard";
  if (hasTeacherRole(roleCodes)) {
    return "/academia/attendance/mark";
  }
  if (roleCodes.includes("STAFF")) return "/staffboard/attendance/card";
  return "/dashboard";
}
