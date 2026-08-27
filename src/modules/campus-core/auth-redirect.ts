import { hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";

function schoolWorkspaceCount(roleCodes: readonly string[]) {
  return [
    hasPrincipalRole(roleCodes),
    roleCodes.includes("OFFICE_STAFF"),
    hasTeacherRole(roleCodes),
    roleCodes.includes("STAFF")
  ].filter(Boolean).length;
}

export function getPostLoginRedirectPath(roleCodes: readonly string[] = []) {
  if (schoolWorkspaceCount(roleCodes) > 1) return "/account/workspaces";
  if (hasPrincipalRole(roleCodes)) return "/dashboard";
  if (roleCodes.includes("OFFICE_STAFF")) return "/dashboard";
  if (hasTeacherRole(roleCodes)) {
    return "/academia/attendance/mark";
  }
  if (roleCodes.includes("STAFF")) return "/staffboard/attendance/card";
  return "/dashboard";
}
