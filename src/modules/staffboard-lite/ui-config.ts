import type { PermissionCode } from "@/lib/rbac/permissions";

export type StaffboardModuleKey = "staff" | "categories" | "attendance" | "qr-attendance" | "scan" | "reports" | "leave" | "leave-review";

export type StaffboardModuleCard = {
  key: StaffboardModuleKey;
  title: string;
  description: string;
  href: string | null;
  permissions: readonly PermissionCode[];
  status?: "coming-soon";
};

export type StaffboardListPageConfig = {
  title: string;
  description: string;
  actionLabel: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  columns: readonly string[];
};

export type StaffCategoryCard = {
  title: string;
  value: string;
  description: string;
};

export const staffboardRoutes = {
  overview: "/staffboard",
  staff: "/staffboard/staff",
  categories: "/staffboard/categories",
  attendance: "/staffboard/attendance",
  qr: "/staffboard/attendance/qr",
  scan: "/staffboard/attendance/scan",
  reports: "/staffboard/attendance/reports",
  leave: "/staffboard/leave",
  leaveReview: "/staffboard/leave/review"
} as const;

export const staffboardModuleCards: readonly StaffboardModuleCard[] = [
  {
    key: "staff",
    title: "Staff Profiles",
    description: "Manage teacher, admin, accountant, driver, helper, security, and other staff profiles.",
    href: staffboardRoutes.staff,
    permissions: ["staffboard.staff.view"]
  },
  {
    key: "categories",
    title: "Staff Categories",
    description: "View StaffBoard Lite categories such as Teacher, Admin, Accountant, Driver, Security, and Support Staff.",
    href: staffboardRoutes.categories,
    permissions: ["staffboard.staff.view"]
  },
  {
    key: "qr-attendance",
    title: "QR Attendance Console",
    description: "Generate, regenerate, and deactivate audited five-hour branch QR codes for staff attendance.",
    href: staffboardRoutes.qr,
    permissions: ["staffboard.attendance.qr.generate"]
  },
  {
    key: "scan",
    title: "Scan QR",
    description: "Staff can submit check-in and check-out by scanning the active branch QR code.",
    href: staffboardRoutes.scan,
    permissions: ["staffboard.attendance.self_scan"]
  },
  {
    key: "attendance",
    title: "Staff Attendance",
    description: "Review daily staff check-in and check-out records with permission-gated correction entry points.",
    href: staffboardRoutes.attendance,
    permissions: ["staffboard.attendance.view"]
  },
  {
    key: "reports",
    title: "Staff Attendance Reports",
    description: "Review daily, teacher, non-teaching, late, half-day, monthly, and correction reports.",
    href: staffboardRoutes.reports,
    permissions: ["staffboard.attendance.report"]
  },
  {
    key: "leave",
    title: "My Leave",
    description: "Apply for leave, review balances, upload supporting documents, and track decisions.",
    href: staffboardRoutes.leave,
    permissions: ["staffboard.leave.self_view"]
  },
  {
    key: "leave-review",
    title: "Leave Management",
    description: "Review branch leave applications and keep approved leave synchronised with attendance.",
    href: staffboardRoutes.leaveReview,
    permissions: ["staffboard.leave.view"]
  }
] as const;

export function getVisibleStaffboardModuleCards(permissions: ReadonlySet<PermissionCode>) {
  return staffboardModuleCards.filter((card) => card.permissions.some((permission) => permissions.has(permission)));
}

export const staffProfileListConfig = {
  title: "Staff Profiles",
  description: "Manage teaching and non-teaching staff profiles across school branches.",
  actionLabel: "Add Staff",
  searchPlaceholder: "Search staff by name, employee code, designation, department, phone, or email",
  emptyTitle: "No staff profiles found",
  emptyDescription: "Add your first staff profile so QR attendance, correction, and reports can be used.",
  columns: [
    "Employee Code",
    "Staff Name",
    "Staff Type",
    "Designation",
    "Department",
    "Branch",
    "Employment Status",
    "App Access",
    "Updated At",
    "Actions"
  ]
} as const satisfies StaffboardListPageConfig;

export const staffCategoryCards: readonly StaffCategoryCard[] = [
  { title: "Teacher", value: "TEACHER", description: "Teaching staff responsible for academics and classroom operations." },
  { title: "Admin", value: "ADMIN", description: "Administrative staff who support daily school office workflows." },
  { title: "Accountant", value: "ACCOUNTANT", description: "Accounts team members who support fee and finance workflows later." },
  { title: "Librarian", value: "LIBRARIAN", description: "Library staff for future BookNest readiness." },
  { title: "Driver", value: "DRIVER", description: "Transport staff category reserved for future operations." },
  { title: "Helper", value: "HELPER", description: "Support staff who assist branch operations." },
  { title: "Security", value: "SECURITY", description: "Gate and campus security staff." },
  { title: "Peon", value: "PEON", description: "School support staff for office and campus tasks." },
  { title: "Cleaning Staff", value: "CLEANING_STAFF", description: "Housekeeping and cleanliness staff." },
  { title: "Management", value: "MANAGEMENT", description: "School leadership and management team members." },
  { title: "Other", value: "OTHER", description: "Other staff categories used by the school." }
] as const;
