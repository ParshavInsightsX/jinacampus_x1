export const ACADEMIA_PERMISSIONS = [
  "academia.class.manage",
  "academia.section.manage",
  "academia.subject.manage",
  "academia.student.view",
  "academia.student.create",
  "academia.student.update",
  "academia.guardian.manage",
  "academia.enrollment.manage",
  "academia.promotion.manage",
  "academia.attendance.view",
  "academia.attendance.mark",
  "academia.attendance.update",
  "academia.attendance.correct",
  "academia.attendance.lock",
  "academia.attendance.report"
] as const;

export type AcademiaPermissionCode = (typeof ACADEMIA_PERMISSIONS)[number];
