import type { PermissionCode } from "@/lib/rbac/permissions";

export type AcademiaModuleKey =
  | "overview"
  | "setup"
  | "classes"
  | "sections"
  | "class-sections"
  | "subjects"
  | "students"
  | "guardians"
  | "enrollments"
  | "promotions"
  | "attendance";

export type AcademiaModuleCard = {
  key: AcademiaModuleKey;
  title: string;
  description: string;
  href: string | null;
  permissions: readonly PermissionCode[];
  status?: "coming-soon";
};

export type AcademiaListPageConfig = {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  searchPlaceholder: string;
  emptyTitle: string;
  emptyDescription: string;
  columns: readonly string[];
};

export const academiaAttendanceRoutes = {
  overview: "/academia/attendance",
  mark: "/academia/attendance/mark",
  coverage: "/academia/attendance/coverage",
  reports: "/academia/attendance/reports"
} as const;

export const academiaModuleCards: readonly AcademiaModuleCard[] = [
  {
    key: "setup",
    title: "Academic Setup",
    description: "Create classes, sections, class-section mappings, and the subject master in one guided workflow.",
    href: "/academia/setup",
    permissions: ["academia.class.manage", "academia.section.manage", "academia.subject.manage"]
  },
  {
    key: "students",
    title: "Students",
    description: "Review student profiles and academic record readiness.",
    href: "/academia/students",
    permissions: ["academia.student.view"]
  },
  {
    key: "promotions",
    title: "Student Promotion",
    description: "Review class-wise outcomes and create audited enrollments for the next academic year.",
    href: "/academia/promotions",
    permissions: ["academia.promotion.manage"]
  },
  {
    key: "attendance",
    title: "Attendance",
    description: "Mark daily full-day class-section attendance and review locked-state readiness.",
    href: academiaAttendanceRoutes.overview,
    permissions: ["academia.attendance.view", "academia.attendance.mark", "academia.attendance.report"]
  }
] as const;

export function getVisibleAcademiaModuleCards(permissions: ReadonlySet<PermissionCode>) {
  return academiaModuleCards.filter((card) => card.permissions.some((permission) => permissions.has(permission)));
}

export const academiaListPageConfigs = {
  classes: {
    title: "Classes",
    description: "Manage academic class levels such as Nursery, Class 1, Class 2, and so on.",
    actionLabel: "Add Class",
    actionHref: "/academia/setup#classes",
    searchPlaceholder: "Search classes by name or code",
    emptyTitle: "No classes yet",
    emptyDescription: "Add class levels such as Class 1 or Class 2 so sections, enrollments, and attendance can be organized.",
    columns: ["Name", "Code", "Status", "Sort Order", "Updated At", "Actions"]
  },
  sections: {
    title: "Sections",
    description: "Manage reusable section labels such as A, B, C, Red, Blue, or Morning.",
    actionLabel: "Add Section",
    actionHref: "/academia/setup#sections",
    searchPlaceholder: "Search sections by name or code",
    emptyTitle: "No sections yet",
    emptyDescription: "Create reusable section labels before setting up class-section mappings.",
    columns: ["Name", "Code", "Status", "Sort Order", "Updated At", "Actions"]
  },
  classSections: {
    title: "Class Sections",
    description: "Map classes and sections for a branch and academic year.",
    actionLabel: "Create Class Section",
    actionHref: "/academia/setup#class-sections",
    searchPlaceholder: "Search class sections",
    emptyTitle: "No class sections found",
    emptyDescription: "Create classes and sections before setting up class sections for a branch and academic year.",
    columns: ["Class", "Section", "Branch", "Academic Year", "Class Teacher", "Capacity", "Status", "Actions"]
  },
  subjects: {
    title: "Subjects",
    description: "Manage academic and co-curricular subjects.",
    actionLabel: "Add Subject",
    actionHref: "/academia/setup#subjects",
    searchPlaceholder: "Search subjects by name or code",
    emptyTitle: "No subjects yet",
    emptyDescription: "Add academic and co-curricular subjects so the school timetable and reports have clear subject records.",
    columns: ["Name", "Code", "Type", "Status", "Updated At", "Actions"]
  },
  students: {
    title: "Students",
    description: "Manage student profiles and academic records.",
    actionLabel: "Add Student",
    actionHref: "/academia/students/create",
    searchPlaceholder: "Search students by name or admission number",
    emptyTitle: "No students found",
    emptyDescription: "Add your first student profile to start managing enrollments and attendance.",
    columns: ["Scholar / Admission No.", "Student Name", "Current Class Section", "Father / Guardian", "Category", "Profile", "Status", "Actions"]
  },
  guardians: {
    title: "Guardians",
    description: "Manage parent and guardian contact profiles.",
    actionLabel: "Register Student",
    actionHref: "/academia/students/create#primary-guardian",
    searchPlaceholder: "Search guardians by name, phone, or email",
    emptyTitle: "No guardians found",
    emptyDescription: "Guardian profiles appear after they are linked to student records.",
    columns: ["Guardian Name", "Phone", "Email", "Linked Students", "Status", "Actions"]
  },
  enrollments: {
    title: "Enrollments",
    description: "Manage student class-section enrollment for the active academic year.",
    actionLabel: "Open Students",
    actionHref: "/academia/students",
    searchPlaceholder: "Search enrollments by student or roll number",
    emptyTitle: "No enrollments found",
    emptyDescription: "Enroll students into active class sections before marking attendance.",
    columns: ["Student", "Class Section", "Roll Number", "Enrollment Date", "Status", "Actions"]
  }
} as const satisfies Record<string, AcademiaListPageConfig>;
