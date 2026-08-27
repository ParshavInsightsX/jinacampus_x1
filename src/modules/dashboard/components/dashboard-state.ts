import type { PermissionCode } from "@/lib/rbac/permissions";
import { getNavigationAudience, isFeatureNavigationEnabled, type NavigationAudience, type NavigationFeatureOptions } from "@/components/app-shell/navigation";
import { DASHBOARD_VIEW_PERMISSION } from "@/modules/dashboard/permissions";

export type DashboardSectionKey = "campusCore" | "academia" | "studentAttendance" | "staffBoard" | "staffAttendance";

type DashboardQuickActionDefinition = {
  label: string;
  description: string;
  href: string;
  permissions: readonly PermissionCode[];
  audiences: readonly NavigationAudience[];
};

export type AdminMobileAction = {
  label: string;
  description: string;
  href: string;
  permission: PermissionCode;
};

const sectionPermissions = {
  campusCore: [DASHBOARD_VIEW_PERMISSION],
  academia: ["academia.student.view", "academia.enrollment.manage", "academia.class.manage", "academia.guardian.manage"],
  studentAttendance: ["academia.attendance.view", "academia.attendance.report", "academia.attendance.mark"],
  staffBoard: ["staffboard.staff.view"],
  staffAttendance: ["staffboard.attendance.view", "staffboard.attendance.report", "staffboard.attendance.scan", "staffboard.attendance.credential.manage"]
} satisfies Record<DashboardSectionKey, readonly PermissionCode[]>;

export const DASHBOARD_QUICK_ACTIONS = [
  {
    label: "Manage Students",
    description: "Open student profile records.",
    href: "/academia/students",
    permissions: ["academia.student.view"],
    audiences: ["admin"]
  },
  {
    label: "Mark Student Attendance",
    description: "Open the daily class-section marking workflow.",
    href: "/academia/attendance/mark",
    permissions: ["academia.attendance.view", "academia.attendance.mark"],
    audiences: ["admin", "teacher"]
  },
  {
    label: "Student Reports",
    description: "Review daily, absent, late, and monthly attendance tables.",
    href: "/academia/attendance/reports",
    permissions: ["academia.attendance.report"],
    audiences: ["admin", "teacher"]
  },
  {
    label: "Staff QR Cards",
    description: "Create, print, reissue, or revoke staff attendance cards.",
    href: "/staffboard/attendance/credentials",
    permissions: ["staffboard.attendance.credential.manage"],
    audiences: ["admin"]
  },
  {
    label: "Staff Attendance",
    description: "Open the continuous supervised scanner for the active branch.",
    href: "/staffboard/attendance/scan",
    permissions: ["staffboard.attendance.scan"],
    audiences: ["admin", "office"]
  },
  {
    label: "Attendance Register",
    description: "Review daily staff attendance and correction requests.",
    href: "/staffboard/attendance",
    permissions: ["staffboard.attendance.view"],
    audiences: ["admin", "office"]
  },
  {
    label: "Attendance Reports",
    description: "Review daily and monthly attendance, late arrivals, and corrections.",
    href: "/staffboard/attendance/reports",
    permissions: ["staffboard.attendance.report"],
    audiences: ["admin", "office"]
  },
  {
    label: "Manage Staff",
    description: "Open StaffBoard Lite staff profiles.",
    href: "/staffboard/staff",
    permissions: ["staffboard.staff.view"],
    audiences: ["admin"]
  },
  {
    label: "My Attendance",
    description: "Display your Attendance QR for an authorised scanner.",
    href: "/staffboard/attendance/card",
    permissions: ["staffboard.attendance.credential.self_view"],
    audiences: ["office", "teacher", "staff"]
  }
] as const satisfies readonly DashboardQuickActionDefinition[];

export const ADMIN_MOBILE_OPERATIONS = [
  { label: "Attendance", description: "Review today's student attendance.", href: "/academia/attendance", permission: "academia.attendance.view" },
  { label: "Users", description: "Manage school user access.", href: "/campus-core/users", permission: "campuscore.user.view" },
  { label: "Branches", description: "Review institution branches.", href: "/campus-core/branches", permission: "campuscore.branch.manage" },
  { label: "Academic Years", description: "Manage active academic-year setup.", href: "/campus-core/academic-years", permission: "campuscore.academic_year.manage" },
  { label: "Settings", description: "Open tenant and attendance settings.", href: "/campus-core/settings", permission: "campuscore.settings.manage" }
] as const satisfies readonly AdminMobileAction[];

export const ADMIN_MOBILE_TOOLS = [
  { label: "Roles & Permissions", description: "Review role and permission assignments.", href: "/campus-core/roles", permission: "campuscore.role.view" },
  { label: "Audit Logs", description: "Review security and governance events.", href: "/campus-core/audit-logs", permission: "campuscore.audit.view" },
  { label: "Tenant Settings", description: "Manage school-level configuration.", href: "/campus-core/settings", permission: "campuscore.settings.manage" }
] as const satisfies readonly AdminMobileAction[];

export type DashboardQuickAction = (typeof DASHBOARD_QUICK_ACTIONS)[number];

export function canViewDashboard(permissions: ReadonlySet<PermissionCode>) {
  return permissions.has(DASHBOARD_VIEW_PERMISSION);
}

export function canViewDashboardSection(
  permissions: ReadonlySet<PermissionCode>,
  section: DashboardSectionKey
) {
  return sectionPermissions[section].some((permission) => permissions.has(permission));
}

export function getVisibleDashboardQuickActions(
  permissions: ReadonlySet<PermissionCode>,
  roleCodes: readonly string[] = [],
  features: NavigationFeatureOptions = {}
) {
  const audience = getNavigationAudience(permissions, roleCodes);
  const visibleActions = DASHBOARD_QUICK_ACTIONS.filter((action) =>
    isFeatureNavigationEnabled(action.href, features) &&
    action.audiences.some((actionAudience) => actionAudience === audience) &&
    action.permissions.every((permission) => permissions.has(permission))
  );
  const uniqueActions = new Map<string, DashboardQuickAction>();

  for (const action of visibleActions) {
    if (!uniqueActions.has(action.href)) uniqueActions.set(action.href, action);
  }

  return Array.from(uniqueActions.values());
}

export function getVisibleAdminMobileActions(
  permissions: ReadonlySet<PermissionCode>,
  actions: readonly AdminMobileAction[],
  features: NavigationFeatureOptions = {}
) {
  return actions.filter(
    (action) => permissions.has(action.permission) && isFeatureNavigationEnabled(action.href, features)
  );
}

export function formatDashboardDate(date: string | Date, timeZone = "Asia/Kolkata") {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone
  }).format(new Date(date));
}
