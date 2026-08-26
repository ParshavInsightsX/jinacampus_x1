export const ENTITLEMENT_MODULE_KEYS = {
  ATTENDANCE: "attendance",
  GRADEBOOK: "gradebook"
} as const;

export type EntitlementModuleKey =
  (typeof ENTITLEMENT_MODULE_KEYS)[keyof typeof ENTITLEMENT_MODULE_KEYS];

export type EntitlementAccess = "DISABLED" | "READ_ONLY" | "FULL";

export type EntitlementDefinition = {
  moduleKey: EntitlementModuleKey;
  featureKey: string;
  label: string;
  description: string;
  defaultAccess: EntitlementAccess;
};

export const ATTENDANCE_ENTITLEMENT_FEATURES = {
  MODULE: "module",
  STUDENT_ATTENDANCE: "student_attendance",
  STAFF_ATTENDANCE: "staff_attendance",
  MARKING: "marking",
  CORRECTION: "correction",
  QR: "qr",
  REPORTS: "reports",
  EXCEPTION_MANAGEMENT: "exception_management",
  CALENDAR_LEAVE_INTEGRATION: "calendar_leave_integration",
  SETTINGS: "settings",
  APPROVAL_AUDIT: "approval_audit"
} as const;

export type AttendanceEntitlementFeature =
  (typeof ATTENDANCE_ENTITLEMENT_FEATURES)[keyof typeof ATTENDANCE_ENTITLEMENT_FEATURES];

export const GRADEBOOK_ENTITLEMENT_FEATURES = {
  MODULE: "module",
  CONFIGURATION: "configuration",
  MARKS_ENTRY: "marks_entry",
  IMPORT: "import",
  RESULT_CALCULATION: "result_calculation",
  CO_SCHOLASTIC: "co_scholastic",
  REPORT_CARDS: "report_cards",
  PUBLICATION: "publication",
  ANALYTICS: "analytics",
  PORTAL_RESULTS: "portal_results"
} as const;

export type GradebookEntitlementFeature =
  (typeof GRADEBOOK_ENTITLEMENT_FEATURES)[keyof typeof GRADEBOOK_ENTITLEMENT_FEATURES];

export const ATTENDANCE_ENTITLEMENT_DEFINITIONS = [
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MODULE,
    label: "Attendance module",
    description: "Controls institution access to all student and staff attendance capabilities.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STUDENT_ATTENDANCE,
    label: "Student attendance",
    description: "Daily class attendance, student history, and attendance status.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE,
    label: "Staff attendance",
    description: "Staff attendance records, own status, and attendance administration.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.MARKING,
    label: "Mark attendance",
    description: "Create and submit authorised student attendance records.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.CORRECTION,
    label: "Attendance correction",
    description: "Correct student or staff attendance with required reasons and audit history.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.QR,
    label: "QR attendance",
    description: "Generate, scan, deactivate, and validate staff attendance QR codes.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.REPORTS,
    label: "Attendance reports",
    description: "View student and staff attendance reports. Data export remains a separate future capability.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.EXCEPTION_MANAGEMENT,
    label: "Late and absence management",
    description: "Review and manage attendance exceptions, late arrivals, and absences.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.CALENDAR_LEAVE_INTEGRATION,
    label: "Holiday and leave integration",
    description: "Preserve attendance treatment for approved leave and institution holidays.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.SETTINGS,
    label: "Attendance settings",
    description: "Manage branch attendance rules, QR controls, and notification preferences.",
    defaultAccess: "FULL"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.ATTENDANCE,
    featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.APPROVAL_AUDIT,
    label: "Approval and audit access",
    description: "Review protected attendance corrections, approvals, and related audit evidence.",
    defaultAccess: "FULL"
  }
] as const satisfies readonly EntitlementDefinition[];

export const GRADEBOOK_ENTITLEMENT_DEFINITIONS = [
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.MODULE,
    label: "GradeBook module",
    description: "Controls institution access to the GradeBook workspace.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.CONFIGURATION,
    label: "Configuration",
    description: "Schemes, terms, exam types, grade scales, and calculation policy.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.MARKS_ENTRY,
    label: "Marks entry",
    description: "Assignments, draft marks, submission, verification, and approval queues.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.IMPORT,
    label: "Spreadsheet import",
    description: "Private, validated CSV and Excel marks import workflows.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.RESULT_CALCULATION,
    label: "Result calculation",
    description: "Versioned deterministic result calculation and approval.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.CO_SCHOLASTIC,
    label: "Co-scholastic",
    description: "Institution-defined areas, ratings, and teacher evaluation.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.REPORT_CARDS,
    label: "Report cards",
    description: "Immutable report-card snapshots and private documents.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.PUBLICATION,
    label: "Publication",
    description: "Controlled result and report-card publication.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.ANALYTICS,
    label: "Analytics",
    description: "Approved-result operational summaries and academic history.",
    defaultAccess: "DISABLED"
  },
  {
    moduleKey: ENTITLEMENT_MODULE_KEYS.GRADEBOOK,
    featureKey: GRADEBOOK_ENTITLEMENT_FEATURES.PORTAL_RESULTS,
    label: "Portal results",
    description: "Reserved student and guardian result access when portals are approved.",
    defaultAccess: "DISABLED"
  }
] as const satisfies readonly EntitlementDefinition[];

export const INSTITUTION_ENTITLEMENT_DEFINITIONS = [
  ...ATTENDANCE_ENTITLEMENT_DEFINITIONS,
  ...GRADEBOOK_ENTITLEMENT_DEFINITIONS
] as const satisfies readonly EntitlementDefinition[];

export function entitlementFormFieldName(moduleKey: string, featureKey: string) {
  return "entitlement__" + moduleKey + "__" + featureKey;
}

export function isKnownEntitlementPair(moduleKey: string, featureKey: string) {
  return INSTITUTION_ENTITLEMENT_DEFINITIONS.some(
    (definition) => definition.moduleKey === moduleKey && definition.featureKey === featureKey
  );
}
