export const ACADEMIA_PERMISSIONS = [
  "academia.class.manage",
  "academia.section.manage",
  "academia.subject.manage",
  "academia.student.view",
  "academia.student.create",
  "academia.student.update",
  "academia.student.id_card.manage",
  "academia.guardian.manage",
  "academia.enrollment.manage",
  "academia.promotion.manage",
  "academia.attendance.view",
  "academia.attendance.mark",
  "academia.attendance.update",
  "academia.attendance.correct",
  "academia.attendance.lock",
  "academia.attendance.coverage.manage",
  "academia.attendance.report"
] as const;

export type AcademiaPermissionCode = (typeof ACADEMIA_PERMISSIONS)[number];
