import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlatformAdministratorContext } from "@/lib/auth/platform-administrator-session";

const deleteDelegates = [
  "notificationDeliveryLog",
  "notificationOutbox",
  "whatsAppIntegrationSetting",
  "notificationTemplate",
  "communicationPreference",
  "staffLeaveDocument",
  "staffLeaveApplicationAction",
  "inAppNotification",
  "studentAttendanceRecord",
  "staffAttendanceRecord",
  "academicCalendarEntry",
  "staffLeaveApplication",
  "staffLeaveBalance",
  "staffLeaveApprover",
  "staffLeaveType",
  "staffLeaveSetting",
  "staffAttendanceQrToken",
  "gradebookStudentResultPublication",
  "gradebookResultPublication",
  "gradebookReportCard",
  "gradebookAttendanceSummarySnapshot",
  "gradebookReportCardTemplateVersion",
  "gradebookReportCardTemplate",
  "gradebookMarkAdjustment",
  "gradebookCorrectionRequest",
  "gradebookStudentSubjectResult",
  "gradebookStudentOverallResult",
  "gradebookResultRun",
  "gradebookTeacherRemark",
  "gradebookCoScholasticEntry",
  "gradebookCoScholasticIndicator",
  "gradebookCoScholasticArea",
  "gradebookCoScholasticSchemeVersion",
  "gradebookRemarkTemplate",
  "gradebookExamImportRow",
  "gradebookExamImportJob",
  "gradebookStudentMarkRevision",
  "gradebookMarkWorkflowEvent",
  "gradebookStudentMark",
  "gradebookMarkEntryBatch",
  "gradebookTeacherMarkAssignment",
  "gradebookExamSchedule",
  "gradebookExamSubjectComponent",
  "gradebookExamSubject",
  "gradebookExamClassSection",
  "gradebookAssessmentComponent",
  "gradebookExam",
  "gradebookExamTerm",
  "gradebookAssessmentSchemeVersion",
  "gradebookAssessmentScheme",
  "gradebookGradeRule",
  "gradebookGradeScaleVersion",
  "gradebookGradeScale",
  "gradebookCalculationRuleSetVersion",
  "gradebookCalculationRuleSet",
  "gradebookExamType",
  "gradebookJob",
  "gradebookDomainEventOutbox",
  "gradebookMark",
  "gradebookAssessment",
  "classSectionSubject",
  "studentPromotionItem",
  "studentPromotionBatch",
  "enrollment",
  "studentGuardianLink",
  "classSection",
  "student",
  "guardian",
  "staffProfile",
  "subject",
  "class",
  "section",
  "attendanceSetting",
  "auditLog",
  "passkeyChallenge",
  "passkeyCredential",
  "loginOtp",
  "session",
  "userBranchAccess",
  "userRoleAssignment",
  "rolePermission",
  "user",
  "role",
  "tenantSettings",
  "academicYear",
  "branch",
  "institution"
] as const;

const mocks = vi.hoisted(() => {
  const tx: Record<string, unknown> = {};
  for (const delegate of [
    "notificationDeliveryLog", "notificationOutbox", "whatsAppIntegrationSetting",
    "notificationTemplate", "communicationPreference", "staffLeaveDocument",
    "staffLeaveApplicationAction", "inAppNotification", "studentAttendanceRecord",
    "staffAttendanceRecord", "academicCalendarEntry", "staffLeaveApplication", "staffLeaveBalance",
    "staffLeaveApprover", "staffLeaveType", "staffLeaveSetting", "staffAttendanceQrToken",
    "gradebookStudentResultPublication", "gradebookResultPublication", "gradebookReportCard",
    "gradebookAttendanceSummarySnapshot", "gradebookReportCardTemplateVersion", "gradebookReportCardTemplate",
    "gradebookMarkAdjustment", "gradebookCorrectionRequest", "gradebookStudentSubjectResult",
    "gradebookStudentOverallResult", "gradebookResultRun", "gradebookTeacherRemark",
    "gradebookCoScholasticEntry", "gradebookCoScholasticIndicator", "gradebookCoScholasticArea",
    "gradebookCoScholasticSchemeVersion", "gradebookRemarkTemplate", "gradebookExamImportRow",
    "gradebookExamImportJob", "gradebookStudentMarkRevision", "gradebookMarkWorkflowEvent",
    "gradebookStudentMark", "gradebookMarkEntryBatch", "gradebookTeacherMarkAssignment",
    "gradebookExamSchedule", "gradebookExamSubjectComponent", "gradebookExamSubject",
    "gradebookExamClassSection", "gradebookAssessmentComponent", "gradebookExam", "gradebookExamTerm",
    "gradebookAssessmentSchemeVersion", "gradebookAssessmentScheme", "gradebookGradeRule",
    "gradebookGradeScaleVersion", "gradebookGradeScale", "gradebookCalculationRuleSetVersion",
    "gradebookCalculationRuleSet", "gradebookExamType", "gradebookJob", "gradebookDomainEventOutbox",
    "gradebookMark", "gradebookAssessment", "classSectionSubject",
    "studentPromotionItem", "studentPromotionBatch",
    "enrollment", "studentGuardianLink",
    "classSection", "student", "guardian", "staffProfile", "subject", "class", "section",
    "attendanceSetting", "auditLog", "passkeyChallenge", "passkeyCredential", "loginOtp",
    "session", "userBranchAccess", "userRoleAssignment", "rolePermission", "user", "role",
    "tenantSettings", "academicYear", "branch", "institution"
  ]) {
    tx[delegate] = {
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 })
    };
  }
  tx.tenant = {
    findUnique: vi.fn(),
    delete: vi.fn().mockResolvedValue({})
  };
  return {
    tx,
    db: { $transaction: vi.fn() },
    writePlatformAuditLog: vi.fn(),
    hashPassword: vi.fn(),
    verifyPassword: vi.fn()
  };
});

vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/audit/platform-audit-log", () => ({
  writePlatformAuditLog: mocks.writePlatformAuditLog
}));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword
}));

import { deleteSchoolPermanently } from "@/modules/campus-core/administrator-services";

const ctx: PlatformAdministratorContext = {
  administratorId: "administrator-id",
  sessionId: "platform-session-id",
  email: "operator@example.test",
  displayName: "Platform Operator",
  canManagePrincipalRecovery: false,
  passwordChangeRequired: false
};

const dependencySummary = {
  institutions: 1,
  branches: 1,
  users: 1,
  students: 1,
  staffProfiles: 1,
  studentAttendanceRecords: 1,
  staffAttendanceRecords: 1,
  auditLogs: 1,
  notificationOutboxItems: 1,
  roles: 1,
  classSectionSubjects: 1,
  gradebookAssessments: 1,
  gradebookMarks: 1
};

describe("permanent administrator school deletion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mocks.tx.tenant as { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> })
      .findUnique.mockResolvedValue({
        id: "school-id",
        name: "Disposable QA School",
        slug: "disposable-qa-school",
        status: "ACTIVE",
        _count: dependencySummary
      });
    mocks.db.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => unknown) => callback(mocks.tx));
  });

  it("removes every tenant-owned dependency and then the tenant in one transaction", async () => {
    await expect(deleteSchoolPermanently(ctx, {
      tenantId: "school-id",
      confirmDelete: "Delete School"
    })).resolves.toEqual(expect.objectContaining({ tenantId: "school-id" }));

    for (const delegate of deleteDelegates) {
      const model = mocks.tx[delegate] as { deleteMany: ReturnType<typeof vi.fn> };
      expect(model.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "school-id" } });
    }
    expect((mocks.tx.gradebookExamSchedule as { updateMany: ReturnType<typeof vi.fn> }).updateMany)
      .toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "school-id", supersedesScheduleId: { not: null } } }));
    expect((mocks.tx.gradebookResultRun as { updateMany: ReturnType<typeof vi.fn> }).updateMany)
      .toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "school-id", supersedesResultRunId: { not: null } } }));
    expect((mocks.tx.tenant as { delete: ReturnType<typeof vi.fn> }).delete)
      .toHaveBeenCalledWith({ where: { id: "school-id" } });
  });

  it("retains a platform audit record without a tenant foreign key", async () => {
    await deleteSchoolPermanently(ctx, {
      tenantId: "school-id",
      confirmDelete: "Delete School"
    });

    expect(mocks.writePlatformAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      ctx,
      action: "platform.school.deleted",
      entityType: "Tenant",
      entityId: "school-id",
      metadata: expect.objectContaining({
        schoolId: "disposable-qa-school",
        dependencySummary,
        permanent: true
      })
    }), mocks.tx);
  });
});
