export const GRADEBOOK_PERMISSIONS = [
  "gradebook.view",
  "gradebook.setup.manage",
  "gradebook.assessment.manage",
  "gradebook.marks.enter",
  "gradebook.publish",
  "gradebook.report"
] as const;

export type GradebookPermissionCode = (typeof GRADEBOOK_PERMISSIONS)[number];
