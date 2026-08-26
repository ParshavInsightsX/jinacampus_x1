import {
  ACADEMIA_PERMISSIONS,
  GRADEBOOK_PERMISSIONS,
  IN_APP_NOTIFICATION_SELF_PERMISSIONS,
  NOTIFICATION_PERMISSIONS,
  type PermissionCode
} from "@/lib/rbac/permissions";

export const OPERATIONAL_ROLE_CODES = [
  "ADMINISTRATOR",
  "PRINCIPAL",
  "OFFICE_STAFF",
  "TEACHER",
  "STAFF"
] as const;

export type OperationalRoleCode = (typeof OPERATIONAL_ROLE_CODES)[number];

export const SCHOOL_OPERATIONAL_ROLE_CODES = [
  "PRINCIPAL",
  "OFFICE_STAFF",
  "TEACHER",
  "STAFF"
] as const;

export type SchoolOperationalRoleCode = (typeof SCHOOL_OPERATIONAL_ROLE_CODES)[number];

export const LEGACY_PRINCIPAL_ROLE_CODES = ["TENANT_OWNER", "SUPER_ADMIN", "ADMIN"] as const;
export const LEGACY_TEACHER_ROLE_CODES = ["CLASS_TEACHER"] as const;
export const DEFERRED_ACCOUNT_ROLE_CODES = ["PARENT", "STUDENT"] as const;

export const KNOWN_ROLE_CODES = [
  ...OPERATIONAL_ROLE_CODES,
  ...LEGACY_PRINCIPAL_ROLE_CODES,
  ...LEGACY_TEACHER_ROLE_CODES,
  ...DEFERRED_ACCOUNT_ROLE_CODES
] as const;

export type KnownRoleCode = (typeof KNOWN_ROLE_CODES)[number];

const tenantContextPermission = ["campuscore.tenant.view"] as const;
const userGovernancePermissions = [
  "campuscore.user.view",
  "campuscore.user.manage",
  "campuscore.user.create",
  "campuscore.user.update",
  "campuscore.user.deactivate",
  "campuscore.user.reset_password"
] as const;
export const PLATFORM_ADMIN_ROLE_CODES = ["ADMINISTRATOR"] as const;
export const PRINCIPAL_ASSIGNABLE_ROLE_CODES = [
  "OFFICE_STAFF",
  "TEACHER",
  "STAFF"
] as const;

export function roleRequiresStaffProfile(roleCode: string) {
  return PRINCIPAL_ASSIGNABLE_ROLE_CODES.some((code) => code === roleCode);
}

export function isPlatformAdminRoleCode(roleCode: string) {
  return PLATFORM_ADMIN_ROLE_CODES.some((code) => code === roleCode);
}

export function hasPlatformAdminRole(roleCodes: readonly string[] = []) {
  return roleCodes.some(isPlatformAdminRoleCode);
}

export function hasPrincipalRole(roleCodes: readonly string[] = []) {
  return roleCodes.some((roleCode) => (
    roleCode === "PRINCIPAL" ||
    LEGACY_PRINCIPAL_ROLE_CODES.some((legacyCode) => legacyCode === roleCode)
  ));
}

export function hasTeacherRole(roleCodes: readonly string[] = []) {
  return roleCodes.some((roleCode) => (
    roleCode === "TEACHER" ||
    LEGACY_TEACHER_ROLE_CODES.some((legacyCode) => legacyCode === roleCode)
  ));
}

export function hasSchoolLoginRole(roleCodes: readonly string[] = []) {
  if (hasPlatformAdminRole(roleCodes)) return false;
  return roleCodes.some((roleCode) => (
    SCHOOL_OPERATIONAL_ROLE_CODES.some((code) => code === roleCode) ||
    LEGACY_PRINCIPAL_ROLE_CODES.some((code) => code === roleCode) ||
    LEGACY_TEACHER_ROLE_CODES.some((code) => code === roleCode)
  ));
}

export function isOperationalRoleCode(roleCode: string): roleCode is OperationalRoleCode {
  return OPERATIONAL_ROLE_CODES.some((code) => code === roleCode);
}

export function canAssignRole(actorRoleCodes: readonly string[] = [], targetRoleCode: string) {
  if (!hasPrincipalRole(actorRoleCodes)) return false;
  return PRINCIPAL_ASSIGNABLE_ROLE_CODES.some((code) => code === targetRoleCode);
}

const principalPermissions = [
  "campuscore.tenant.view",
  "campuscore.institution.manage",
  "campuscore.institution.regulatory.read",
  "campuscore.institution.regulatory.read_sensitive",
  "campuscore.institution.regulatory.manage",
  "campuscore.institution.regulatory.submit",
  "campuscore.institution.regulatory.document.download",
  "campuscore.branch.manage",
  "campuscore.academic_year.manage",
  "campuscore.calendar.manage",
  ...userGovernancePermissions,
  "campuscore.role.view",
  "campuscore.settings.manage",
  "campuscore.audit.view",
  ...NOTIFICATION_PERMISSIONS,
  ...ACADEMIA_PERMISSIONS,
  ...GRADEBOOK_PERMISSIONS,
  "staffboard.staff.view",
  "staffboard.staff.create",
  "staffboard.staff.update",
  "staffboard.staff.deactivate",
  "staffboard.attendance.qr.generate",
  "staffboard.attendance.view",
  "staffboard.attendance.correct",
  "staffboard.attendance.report",
  "staffboard.attendance.scan",
  "staffboard.attendance.credential.manage",
  "staffboard.attendance.manual",
  "staffboard.attendance.adjustment.request",
  "staffboard.attendance.adjustment.approve",
  "staffboard.attendance.period.lock",
  "staffboard.leave.view",
  "staffboard.leave.approve",
  "staffboard.leave.settings.manage",
  "staffboard.leave.balance.manage"
] as const satisfies readonly PermissionCode[];

const teacherPermissions = [
  ...tenantContextPermission,
  ...IN_APP_NOTIFICATION_SELF_PERMISSIONS,
  "academia.student.view",
  "academia.attendance.view",
  "academia.attendance.mark",
  "academia.attendance.report",
  "gradebook.view",
  "gradebook.marks.enter",
  "gradebook.report",
  "gradebook.dashboard.view",
  "gradebook.exam.view",
  "gradebook.exam.schedule.view",
  "gradebook.assignment.view",
  "gradebook.marks.view",
  "gradebook.marks.save_draft",
  "gradebook.marks.submit",
  "gradebook.marks.progress.view",
  "gradebook.marks.special_status.enter",
  "gradebook.import.download_template",
  "gradebook.import.create",
  "gradebook.import.validate",
  "gradebook.import.apply",
  "gradebook.import.cancel",
  "gradebook.marks.export",
  "gradebook.result.view",
  "gradebook.result.view_preview",
  "gradebook.result.view_published",
  "gradebook.remark.subject.enter",
  "gradebook.remark.class_teacher.enter",
  "gradebook.coscholastic.view",
  "gradebook.coscholastic.enter",
  "gradebook.coscholastic.submit",
  "gradebook.attendance_summary.view",
  "gradebook.reportcard.view",
  "gradebook.history.view",
  "gradebook.history.view_student",
  "gradebook.analytics.view_class_section",
  "gradebook.analytics.view_subject",
  "gradebook.analytics.view_student",
  "staffboard.attendance.credential.self_view",
  "staffboard.attendance.self_view",
  "staffboard.attendance.adjustment.request",
  "staffboard.leave.self_apply",
  "staffboard.leave.self_view",
] as const satisfies readonly PermissionCode[];

export const ROLE_PERMISSION_MAP: Record<KnownRoleCode, readonly PermissionCode[]> = {
  // Legacy tenant-role alias only. Platform administrators authenticate through
  // platform_administrators and never receive tenant permissions.
  ADMINISTRATOR: [],
  PRINCIPAL: principalPermissions,
  OFFICE_STAFF: [
    ...tenantContextPermission,
    ...IN_APP_NOTIFICATION_SELF_PERMISSIONS,
    "academia.attendance.view",
    "academia.attendance.mark",
    "academia.attendance.coverage.manage",
    "staffboard.staff.view",
    "staffboard.attendance.qr.generate",
    "staffboard.attendance.credential.self_view",
    "staffboard.attendance.self_view",
    "staffboard.attendance.view",
    "staffboard.attendance.correct",
    "staffboard.attendance.report",
    "staffboard.attendance.scan",
    "staffboard.attendance.manual",
    "staffboard.attendance.adjustment.request",
    "staffboard.leave.self_apply",
    "staffboard.leave.self_view",
    "staffboard.leave.view",
    "staffboard.leave.approve",
  ],
  TEACHER: teacherPermissions,
  STAFF: [
    ...tenantContextPermission,
    ...IN_APP_NOTIFICATION_SELF_PERMISSIONS,
    "staffboard.attendance.credential.self_view",
    "staffboard.attendance.self_view",
    "staffboard.attendance.adjustment.request",
    "staffboard.leave.self_apply",
    "staffboard.leave.self_view",
  ],
  TENANT_OWNER: principalPermissions,
  SUPER_ADMIN: principalPermissions,
  ADMIN: principalPermissions,
  CLASS_TEACHER: teacherPermissions,
  PARENT: tenantContextPermission,
  STUDENT: tenantContextPermission
};

// Compatibility export for older tests and migration utilities. New code should
// use ROLE_PERMISSION_MAP and the canonical operational role arrays above.
export const DEFAULT_ROLE_PERMISSION_MAP = ROLE_PERMISSION_MAP;
