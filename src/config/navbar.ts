export const NAVBAR_AUTO_HIDE_CONFIG = {
  topThreshold: 64,
  hideThreshold: 80,
  directionDelta: 10,
  revealZoneHeight: 12
} as const;

export type NavbarRouteContext = {
  title: string;
  section?: string;
  parentHref?: string;
  parentLabel?: string;
};

type NavbarRouteRule = NavbarRouteContext & {
  pattern: RegExp;
};

const NAVBAR_ROUTE_RULES: readonly NavbarRouteRule[] = [
  { pattern: /^\/dashboard\/?$/, title: "Dashboard" },
  { pattern: /^\/gradebook\/exams\/[^/]+\/?$/, title: "Examination details", section: "GradeBook", parentHref: "/gradebook/exams", parentLabel: "Examinations" },
  { pattern: /^\/gradebook\/exams\/?$/, title: "Examinations", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/marks\/[^/]+\/?$/, title: "Marks batch", section: "GradeBook", parentHref: "/gradebook/marks", parentLabel: "Marks" },
  { pattern: /^\/gradebook\/marks\/?$/, title: "Marks entry", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/(?:submissions|verification|approvals)\/?$/, title: "Marks review", section: "GradeBook", parentHref: "/gradebook/marks", parentLabel: "Marks" },
  { pattern: /^\/gradebook\/imports\/?$/, title: "Marks imports", section: "GradeBook", parentHref: "/gradebook/marks", parentLabel: "Marks" },
  { pattern: /^\/gradebook\/results\/[^/]+\/?$/, title: "Result run", section: "GradeBook", parentHref: "/gradebook/results", parentLabel: "Results" },
  { pattern: /^\/gradebook\/results\/?$/, title: "Results", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/report-cards\/?$/, title: "Report cards", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/publications\/?$/, title: "Result publications", section: "GradeBook", parentHref: "/gradebook/report-cards", parentLabel: "Report cards" },
  { pattern: /^\/gradebook\/corrections\/?$/, title: "Corrections", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/enrichment\/?$/, title: "Co-scholastic and remarks", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/analytics\/?$/, title: "Result analytics", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/history\/?$/, title: "Result history", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/(?:setup|schemes|terms|exam-types|grade-scales)\/?$/, title: "GradeBook configuration", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/assessments\/[^/]+\/?$/, title: "Marks entry", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/reports\/?$/, title: "Published results", section: "GradeBook", parentHref: "/gradebook", parentLabel: "GradeBook" },
  { pattern: /^\/gradebook\/?$/, title: "GradeBook", section: "GradeBook" },
  { pattern: /^\/schoolcast\/(?:communications|notices|broadcasts)\/[^/]+\/?$/, title: "Communication details", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/notices\/new\/?$/, title: "Create notice", section: "SchoolCast", parentHref: "/schoolcast/notices", parentLabel: "Notices" },
  { pattern: /^\/schoolcast\/notices\/?$/, title: "Notices", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/broadcasts\/new\/?$/, title: "Create broadcast", section: "SchoolCast", parentHref: "/schoolcast/broadcasts", parentLabel: "Broadcasts" },
  { pattern: /^\/schoolcast\/broadcasts\/?$/, title: "Broadcasts", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/approvals\/?$/, title: "Approvals", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/homework\/new\/?$/, title: "Create homework or classwork", section: "SchoolCast", parentHref: "/schoolcast/homework", parentLabel: "Homework" },
  { pattern: /^\/schoolcast\/homework\/[^/]+\/?$/, title: "Homework details", section: "SchoolCast", parentHref: "/schoolcast/homework", parentLabel: "Homework" },
  { pattern: /^\/schoolcast\/homework\/?$/, title: "Homework and classwork", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/delivery\/?$/, title: "Delivery operations", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/analytics\/?$/, title: "Communication analytics", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/templates\/?$/, title: "Templates", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/calendar\/?$/, title: "Communication calendar", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/settings\/?$/, title: "SchoolCast settings", section: "SchoolCast", parentHref: "/schoolcast", parentLabel: "SchoolCast" },
  { pattern: /^\/schoolcast\/?$/, title: "SchoolCast", section: "SchoolCast" },
  { pattern: /^\/notifications\/?$/, title: "Notifications", section: "SchoolCast" },
  { pattern: /^\/campus-core\/institutions\/[^/]+\/edit\/?$/, title: "Edit school profile", section: "CampusCore", parentHref: "/campus-core/institutions", parentLabel: "School profile" },
  { pattern: /^\/campus-core\/institutions\/[^/]+\/?$/, title: "School profile", section: "CampusCore", parentHref: "/campus-core/institutions", parentLabel: "Schools" },
  { pattern: /^\/campus-core\/institutions\/?$/, title: "School profile", section: "CampusCore" },
  { pattern: /^\/campus-core\/branches\/[^/]+\/edit\/?$/, title: "Edit branch", section: "CampusCore", parentHref: "/campus-core/branches", parentLabel: "Branches" },
  { pattern: /^\/campus-core\/branches\/[^/]+\/?$/, title: "Branch details", section: "CampusCore", parentHref: "/campus-core/branches", parentLabel: "Branches" },
  { pattern: /^\/campus-core\/branches\/?$/, title: "Branches", section: "CampusCore" },
  { pattern: /^\/campus-core\/academic-years\/?$/, title: "Academic years", section: "CampusCore" },
  { pattern: /^\/campus-core\/calendar\/?$/, title: "Academic calendar", section: "CampusCore" },
  { pattern: /^\/campus-core\/users\/[^/]+\/reset-password\/?$/, title: "Reset password", section: "CampusCore", parentHref: "/campus-core/users", parentLabel: "Users" },
  { pattern: /^\/campus-core\/users\/[^/]+\/edit\/?$/, title: "Edit user", section: "CampusCore", parentHref: "/campus-core/users", parentLabel: "Users" },
  { pattern: /^\/campus-core\/users\/[^/]+\/?$/, title: "User details", section: "CampusCore", parentHref: "/campus-core/users", parentLabel: "Users" },
  { pattern: /^\/campus-core\/users\/?$/, title: "Users", section: "CampusCore" },
  { pattern: /^\/campus-core\/roles\/?$/, title: "Roles and access", section: "CampusCore" },
  { pattern: /^\/campus-core\/settings\/?$/, title: "School settings", section: "CampusCore" },
  { pattern: /^\/campus-core\/readiness\/?$/, title: "School readiness", section: "CampusCore" },
  { pattern: /^\/campus-core\/audit-logs\/?$/, title: "Audit logs", section: "CampusCore" },
  { pattern: /^\/academia\/students\/create\/?$/, title: "Register student", section: "Academia", parentHref: "/academia/students", parentLabel: "Students" },
  { pattern: /^\/academia\/students\/[^/]+\/edit\/?$/, title: "Edit student", section: "Academia", parentHref: "/academia/students", parentLabel: "Students" },
  { pattern: /^\/academia\/students\/[^/]+\/?$/, title: "Student profile", section: "Academia", parentHref: "/academia/students", parentLabel: "Students" },
  { pattern: /^\/academia\/students\/?$/, title: "Students", section: "Academia" },
  { pattern: /^\/academia\/promotions\/?$/, title: "Student promotion", section: "Academia", parentHref: "/academia", parentLabel: "Academia" },
  { pattern: /^\/academia\/attendance\/reports\/?$/, title: "Student attendance reports", section: "Academia", parentHref: "/academia/attendance", parentLabel: "Attendance" },
  { pattern: /^\/academia\/attendance\/mark\/?$/, title: "Mark attendance", section: "Academia", parentHref: "/academia/attendance", parentLabel: "Attendance" },
  { pattern: /^\/academia\/attendance\/?$/, title: "Student attendance", section: "Academia" },
  { pattern: /^\/academia\/(?:classes|sections|subjects|class-sections)(?:\/[^/]+\/edit)?\/?$/, title: "Academic setup", section: "Academia", parentHref: "/academia/setup", parentLabel: "Academic setup" },
  { pattern: /^\/academia\/setup\/?$/, title: "Academic setup", section: "Academia" },
  { pattern: /^\/academia\/guardians(?:\/[^/]+\/edit)?\/?$/, title: "Guardians", section: "Academia" },
  { pattern: /^\/academia\/enrollments(?:\/[^/]+\/edit)?\/?$/, title: "Enrollments", section: "Academia" },
  { pattern: /^\/academia\/?$/, title: "Academia" },
  { pattern: /^\/staffboard\/staff\/[^/]+\/edit\/?$/, title: "Edit staff profile", section: "StaffBoard Lite", parentHref: "/staffboard/staff", parentLabel: "Staff profiles" },
  { pattern: /^\/staffboard\/staff\/?$/, title: "Staff profiles", section: "StaffBoard Lite" },
  { pattern: /^\/staffboard\/categories\/?$/, title: "Staff categories", section: "StaffBoard Lite" },
  { pattern: /^\/staffboard\/attendance\/reports\/?$/, title: "Staff attendance reports", section: "StaffBoard Lite", parentHref: "/staffboard/attendance", parentLabel: "Attendance" },
  { pattern: /^\/staffboard\/attendance\/scan\/?$/, title: "Scan attendance QR", section: "StaffBoard Lite", parentHref: "/staffboard/attendance/me", parentLabel: "My attendance" },
  { pattern: /^\/staffboard\/attendance\/qr\/?$/, title: "QR attendance console", section: "StaffBoard Lite", parentHref: "/staffboard/attendance", parentLabel: "Attendance" },
  { pattern: /^\/staffboard\/attendance\/me\/?$/, title: "My attendance", section: "StaffBoard Lite" },
  { pattern: /^\/staffboard\/attendance\/?$/, title: "Staff attendance", section: "StaffBoard Lite" },
  { pattern: /^\/staffboard\/?$/, title: "StaffBoard Lite" },
  { pattern: /^\/account\/change-password\/?$/, title: "Account security", section: "Account" },
  { pattern: /^\/account\/workspaces\/?$/, title: "Workspace", section: "Account" }
];

const AUTO_HIDE_DISABLED_ROUTES = [
  /^\/academia\/attendance\/mark(?:\/|$)/,
  /^\/staffboard\/attendance\/scan(?:\/|$)/
] as const;

function normalizePathname(pathname: string) {
  const withoutQuery = pathname.split("?")[0] || "/";
  return withoutQuery.length > 1 ? withoutQuery.replace(/\/$/, "") : withoutQuery;
}

export function getNavbarRouteContext(pathname: string): NavbarRouteContext {
  const normalizedPathname = normalizePathname(pathname);
  const match = NAVBAR_ROUTE_RULES.find((rule) => rule.pattern.test(normalizedPathname));

  if (!match) return { title: "Workspace" };

  return {
    title: match.title,
    section: match.section,
    parentHref: match.parentHref,
    parentLabel: match.parentLabel
  };
}

export function isNavbarAutoHideEnabled(pathname: string) {
  const normalizedPathname = normalizePathname(pathname);
  return !AUTO_HIDE_DISABLED_ROUTES.some((pattern) => pattern.test(normalizedPathname));
}
