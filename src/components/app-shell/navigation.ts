import { ACADEMIA_PERMISSIONS } from "@/modules/academia/permissions";
import { STAFFBOARD_LITE_PERMISSIONS } from "@/modules/staffboard-lite/permissions";
import { GRADEBOOK_PERMISSIONS } from "@/modules/gradebook/permissions";
import type { PermissionCode } from "@/lib/rbac/permissions";
import { hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";

export type NavigationAudience = "admin" | "office" | "teacher" | "staff";

export type NavItem = {
  title: string;
  href: string;
};

type PermissionNavItem = NavItem & {
  permissions: readonly PermissionCode[];
};

export type NavGroup = {
  title: string;
  items: readonly NavItem[];
};

export type DesktopDockNavItem = NavItem & {
  activeHrefs: readonly string[];
  iconHref: string;
  moduleKey: "dashboard" | "campus-core" | "academia" | "gradebook" | "staffboard";
};

type PermissionNavGroup = {
  title: string;
  items: readonly PermissionNavItem[];
};

export const NAVIGATION_GROUPS = [
  {
    title: "Dashboard",
    items: [{ title: "Dashboard", href: "/dashboard", permissions: ["campuscore.tenant.view"] }]
  },
  {
    title: "CampusCore",
    items: [
      { title: "School Profile", href: "/campus-core/institutions", permissions: ["campuscore.institution.manage"] },
      { title: "Branches", href: "/campus-core/branches", permissions: ["campuscore.branch.manage"] },
      { title: "Academic Years", href: "/campus-core/academic-years", permissions: ["campuscore.academic_year.manage"] },
      { title: "Calendar", href: "/campus-core/calendar", permissions: ["campuscore.calendar.manage"] },
      { title: "Users", href: "/campus-core/users", permissions: ["campuscore.user.view"] },
      { title: "Roles", href: "/campus-core/roles", permissions: ["campuscore.role.view"] },
      { title: "Settings", href: "/campus-core/settings", permissions: ["campuscore.settings.manage"] },
      { title: "School Readiness", href: "/campus-core/readiness", permissions: ["campuscore.settings.manage"] },
      { title: "Audit Logs", href: "/campus-core/audit-logs", permissions: ["campuscore.audit.view"] }
    ]
  },
  {
    title: "Academia",
    items: [
      { title: "Overview", href: "/academia", permissions: ACADEMIA_PERMISSIONS },
      {
        title: "Academic Setup",
        href: "/academia/setup",
        permissions: ["academia.class.manage", "academia.section.manage", "academia.subject.manage"]
      },
      { title: "Students", href: "/academia/students", permissions: ["academia.student.view"] },
      { title: "Student Promotion", href: "/academia/promotions", permissions: ["academia.promotion.manage"] },
      { title: "Student Attendance", href: "/academia/attendance", permissions: ["academia.attendance.view"] },
      { title: "Student Attendance Reports", href: "/academia/attendance/reports", permissions: ["academia.attendance.report"] }
    ]
  },
  {
    title: "GradeBook",
    items: [
      { title: "GradeBook", href: "/gradebook", permissions: GRADEBOOK_PERMISSIONS },
      { title: "Published Results", href: "/gradebook/reports", permissions: ["gradebook.report"] }
    ]
  },
  {
    title: "StaffBoard Lite",
    items: [
      { title: "Overview", href: "/staffboard", permissions: STAFFBOARD_LITE_PERMISSIONS },
      { title: "Staff Profiles", href: "/staffboard/staff", permissions: ["staffboard.staff.view"] },
      { title: "Categories", href: "/staffboard/categories", permissions: ["staffboard.staff.view"] },
      { title: "Staff Attendance", href: "/staffboard/attendance", permissions: ["staffboard.attendance.view"] },
      { title: "QR Console", href: "/staffboard/attendance/qr", permissions: ["staffboard.attendance.qr.generate"] },
      { title: "Scan QR", href: "/staffboard/attendance/scan", permissions: ["staffboard.attendance.self_scan"] },
      { title: "My Attendance", href: "/staffboard/attendance/me", permissions: ["staffboard.attendance.self_view"] },
      { title: "My Leave", href: "/staffboard/leave", permissions: ["staffboard.leave.self_view"] },
      { title: "Leave Review", href: "/staffboard/leave/review", permissions: ["staffboard.leave.view"] },
      { title: "Leave Settings", href: "/staffboard/leave/settings", permissions: ["staffboard.leave.settings.manage"] },
      { title: "Staff Reports", href: "/staffboard/attendance/reports", permissions: ["staffboard.attendance.report"] }
    ]
  }
] satisfies readonly PermissionNavGroup[];

export type MobileNavShortcut = {
  title: string;
  href: string;
};

type PermissionMobileNavShortcut = MobileNavShortcut & {
  permissions: readonly PermissionCode[];
  audiences: readonly NavigationAudience[];
};

export type MobileBottomNavItem = {
  title: string;
  href: string;
  kind?: "link" | "more";
};

type PermissionMobileBottomNavItem = MobileBottomNavItem & {
  permissions: readonly PermissionCode[];
  audiences: readonly NavigationAudience[];
};

const ADMIN_NAV_SIGNALS = [
  "campuscore.user.view",
  "campuscore.role.view",
  "campuscore.settings.manage",
  "academia.enrollment.manage",
  "staffboard.staff.view",
  "staffboard.attendance.qr.generate",
  "staffboard.attendance.report"
] as const satisfies readonly PermissionCode[];

const TEACHER_NAV_SIGNALS = [
  "academia.attendance.mark",
  "academia.attendance.report"
] as const satisfies readonly PermissionCode[];

export const MOBILE_NAVIGATION_SHORTCUTS = [
  {
    title: "Home",
    href: "/dashboard",
    permissions: ["campuscore.tenant.view"],
    audiences: ["admin", "office", "teacher", "staff"]
  },
  {
    title: "Students",
    href: "/academia/students",
    permissions: ["academia.student.view"],
    audiences: ["admin"]
  },
  {
    title: "Staff",
    href: "/staffboard/staff",
    permissions: ["staffboard.staff.view"],
    audiences: ["admin"]
  },
  {
    title: "Attendance",
    href: "/academia/attendance/mark",
    permissions: ["academia.attendance.view", "academia.attendance.mark"],
    audiences: ["teacher"]
  },
  {
    title: "Scan QR",
    href: "/staffboard/attendance/scan",
    permissions: ["staffboard.attendance.self_scan"],
    audiences: ["office", "teacher", "staff"]
  },
  {
    title: "My Leave",
    href: "/staffboard/leave",
    permissions: ["staffboard.leave.self_view"],
    audiences: ["office", "teacher", "staff"]
  },
  {
    title: "Reports",
    href: "/academia/attendance/reports",
    permissions: ["academia.attendance.report"],
    audiences: ["admin", "teacher"]
  },
  {
    title: "GradeBook",
    href: "/gradebook",
    permissions: ["gradebook.view"],
    audiences: ["admin", "teacher"]
  },
  {
    title: "Staff Reports",
    href: "/staffboard/attendance/reports",
    permissions: ["staffboard.attendance.report"],
    audiences: ["admin", "office"]
  }
] as const satisfies readonly PermissionMobileNavShortcut[];

const MOBILE_BOTTOM_NAVIGATION_ITEMS = {
  admin: [
    {
      title: "Home",
      href: "/dashboard",
      permissions: ["campuscore.tenant.view"],
      audiences: ["admin"]
    },
    {
      title: "Attendance",
      href: "/academia/attendance",
      permissions: ["academia.attendance.view"],
      audiences: ["admin"]
    },
    {
      title: "Users",
      href: "/campus-core/users",
      permissions: ["campuscore.user.view"],
      audiences: ["admin"]
    },
    {
      title: "Reports",
      href: "/staffboard/attendance/reports",
      permissions: ["staffboard.attendance.report"],
      audiences: ["admin"]
    }
  ],
  teacher: [
    {
      title: "Home",
      href: "/dashboard",
      permissions: ["campuscore.tenant.view"],
      audiences: ["teacher"]
    },
    {
      title: "My Class",
      href: "/academia/attendance/mark",
      permissions: ["academia.attendance.view", "academia.attendance.mark"],
      audiences: ["teacher"]
    },
    {
      title: "Attendance",
      href: "/academia/attendance/reports",
      permissions: ["academia.attendance.report"],
      audiences: ["teacher"]
    },
    {
      title: "GradeBook",
      href: "/gradebook",
      permissions: ["gradebook.view"],
      audiences: ["teacher"]
    },
    {
      title: "Students",
      href: "/academia/students",
      permissions: ["academia.student.view"],
      audiences: ["teacher"]
    }
  ],
  office: [
    {
      title: "Home",
      href: "/dashboard",
      permissions: ["campuscore.tenant.view"],
      audiences: ["office"]
    },
    {
      title: "Attendance",
      href: "/staffboard/attendance",
      permissions: ["staffboard.attendance.view"],
      audiences: ["office"]
    },
    {
      title: "Scan QR",
      href: "/staffboard/attendance/scan",
      permissions: ["staffboard.attendance.self_scan"],
      audiences: ["office"]
    },
    {
      title: "My Attendance",
      href: "/staffboard/attendance/me",
      permissions: ["staffboard.attendance.self_view"],
      audiences: ["office"]
    }
  ],
  staff: [
    {
      title: "Home",
      href: "/dashboard",
      permissions: ["campuscore.tenant.view"],
      audiences: ["staff"]
    },
    {
      title: "Scan QR",
      href: "/staffboard/attendance/scan",
      permissions: ["staffboard.attendance.self_scan"],
      audiences: ["staff"]
    },
    {
      title: "My Attendance",
      href: "/staffboard/attendance/me",
      permissions: ["staffboard.attendance.self_view"],
      audiences: ["staff"]
    },
    {
      title: "Profile",
      href: "/account/change-password",
      permissions: [],
      audiences: ["staff"]
    }
  ]
} as const satisfies Record<NavigationAudience, readonly PermissionMobileBottomNavItem[]>;

const ACTIVE_ROUTE_OVERRIDES = [
  { pattern: /^\/academia\/attendance\/mark(?:\/|$)/, href: "/academia/attendance" },
  { pattern: /^\/academia\/(?:classes|sections|subjects|class-sections)(?:\/|$)/, href: "/academia/setup" },
  { pattern: /^\/academia\/students\/[^/]+\/edit(?:\/|$)/, href: "/academia/students" },
  { pattern: /^\/academia\/guardians\/[^/]+\/edit(?:\/|$)/, href: "/academia/guardians" },
  { pattern: /^\/academia\/enrollments\/[^/]+\/edit(?:\/|$)/, href: "/academia/enrollments" },
  { pattern: /^\/staffboard\/staff\/[^/]+\/edit(?:\/|$)/, href: "/staffboard/staff" },
  { pattern: /^\/staffboard\/leave\/[0-9a-f-]+(?:\/|$)/i, href: "/staffboard/leave" },
  { pattern: /^\/gradebook\/(?:setup|schemes|terms|exam-types|grade-scales|exams|marks|submissions|verification|approvals|imports|results|report-cards|publications|corrections|enrichment|analytics|history)(?:\/|$)/, href: "/gradebook" }
] as const;

const DESKTOP_DOCK_GROUP_CONFIG = {
  Dashboard: {
    title: "Dashboard",
    preferredHref: "/dashboard",
    iconHref: "/dashboard",
    moduleKey: "dashboard"
  },
  CampusCore: {
    title: "CampusCore",
    preferredHref: "/campus-core/institutions",
    iconHref: "/campus-core",
    moduleKey: "campus-core"
  },
  Academia: {
    title: "Academia",
    preferredHref: "/academia",
    iconHref: "/academia",
    moduleKey: "academia"
  },
  GradeBook: {
    title: "GradeBook",
    preferredHref: "/gradebook",
    iconHref: "/gradebook",
    moduleKey: "gradebook"
  },
  "StaffBoard Lite": {
    title: "StaffBoard",
    preferredHref: "/staffboard",
    iconHref: "/staffboard",
    moduleKey: "staffboard"
  }
} as const;

export function canViewNavItem(permissions: ReadonlySet<PermissionCode>, item: PermissionNavItem) {
  return item.permissions.some((permission) => permissions.has(permission));
}

function hasEveryPermission(permissions: ReadonlySet<PermissionCode>, requiredPermissions: readonly PermissionCode[]) {
  return requiredPermissions.every((permission) => permissions.has(permission));
}

type NavigationFeatureOptions = {
  gradebookEnabled?: boolean;
};

export function getVisibleNavigationGroups(
  permissions: ReadonlySet<PermissionCode>,
  features: NavigationFeatureOptions = {}
) {
  return NAVIGATION_GROUPS
    .filter((group) => group.title !== "GradeBook" || features.gradebookEnabled === true)
    .map((group) => ({
      title: group.title,
      items: group.items
        .filter((item) => canViewNavItem(permissions, item))
        .map((item) => ({ title: item.title, href: item.href }))
    }))
    .filter((group) => group.items.length > 0);
}

export function getDesktopDockNavigationItems(groups: readonly NavGroup[]): DesktopDockNavItem[] {
  return groups.flatMap((group) => {
    const config = DESKTOP_DOCK_GROUP_CONFIG[group.title as keyof typeof DESKTOP_DOCK_GROUP_CONFIG];
    if (!config || group.items.length === 0) return [];

    const target = group.items.find((item) => item.href === config.preferredHref) ?? group.items[0];
    return [{
      title: config.title,
      href: target.href,
      iconHref: config.iconHref,
      moduleKey: config.moduleKey,
      activeHrefs: group.items.map((item) => item.href)
    }];
  });
}

export function getNavigationAudience(
  permissions: ReadonlySet<PermissionCode>,
  roleCodes: readonly string[] = []
): NavigationAudience {
  if (hasPrincipalRole(roleCodes)) return "admin";
  if (roleCodes.includes("OFFICE_STAFF")) return "office";
  if (hasTeacherRole(roleCodes)) return "teacher";
  if (roleCodes.includes("STAFF")) return "staff";
  if (ADMIN_NAV_SIGNALS.some((permission) => permissions.has(permission))) return "admin";
  if (TEACHER_NAV_SIGNALS.some((permission) => permissions.has(permission))) return "teacher";
  return "staff";
}

export function getPrimaryMobileNavigationItems(
  permissions: ReadonlySet<PermissionCode>,
  roleCodes: readonly string[] = [],
  features: NavigationFeatureOptions = {}
) {
  const audience = getNavigationAudience(permissions, roleCodes);
  const visibleShortcuts = MOBILE_NAVIGATION_SHORTCUTS.filter(
    (shortcut) =>
      (shortcut.href !== "/gradebook" || features.gradebookEnabled === true) &&
      shortcut.audiences.some((shortcutAudience) => shortcutAudience === audience) &&
      hasEveryPermission(permissions, shortcut.permissions)
  );
  const uniqueShortcuts = new Map<string, MobileNavShortcut>();

  for (const shortcut of visibleShortcuts) {
    if (!uniqueShortcuts.has(shortcut.href)) {
      uniqueShortcuts.set(shortcut.href, { title: shortcut.title, href: shortcut.href });
    }
  }

  return Array.from(uniqueShortcuts.values()).slice(0, 4);
}

export function getMobileBottomNavigationItems(
  permissions: ReadonlySet<PermissionCode>,
  roleCodes: readonly string[] = [],
  features: NavigationFeatureOptions = {}
) {
  const audience = getNavigationAudience(permissions, roleCodes);
  const visibleGroups = getVisibleNavigationGroups(permissions, features);
  const visibleItems = MOBILE_BOTTOM_NAVIGATION_ITEMS[audience].filter(
    (item) =>
      (item.href !== "/gradebook" || features.gradebookEnabled === true) &&
      item.audiences.some((itemAudience) => itemAudience === audience) &&
      hasEveryPermission(permissions, item.permissions)
  );
  const uniqueItems = new Map<string, MobileBottomNavItem>();

  for (const item of visibleItems) {
    if (!uniqueItems.has(item.href)) {
      uniqueItems.set(item.href, { title: item.title, href: item.href });
    }
  }

  const primaryItems = Array.from(uniqueItems.values()).slice(0, 4);
  if (visibleGroups.length === 0) return primaryItems;

  return [
    ...primaryItems,
    {
      title: "More",
      href: "#mobile-more-menu",
      kind: "more"
    }
  ] satisfies MobileBottomNavItem[];
}

export function getActiveNavHref(groups: readonly NavGroup[], pathname: string) {
  const normalizedPathname = pathname.split("?")[0] || "/";
  const items = groups.flatMap((group) => group.items);
  const override = ACTIVE_ROUTE_OVERRIDES.find((route) => route.pattern.test(normalizedPathname));
  if (override && items.some((item) => item.href === override.href)) return override.href;

  const matchingItems = items.filter(
    (item) => normalizedPathname === item.href || normalizedPathname.startsWith(`${item.href}/`)
  );
  return [...matchingItems].sort((a, b) => b.href.length - a.href.length)[0]?.href ?? null;
}

export function isNavItemActive(item: Pick<NavItem, "href">, pathname: string, activeHref: string | null) {
  const normalizedPathname = pathname.split("?")[0] || "/";
  if (normalizedPathname === item.href || item.href === activeHref) return true;
  if (activeHref && activeHref !== item.href && activeHref.startsWith(`${item.href}/`)) return false;

  return normalizedPathname.startsWith(`${item.href}/`);
}
