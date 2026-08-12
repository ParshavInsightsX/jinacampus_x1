import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import type { PermissionCode } from "@/lib/rbac/permissions";
import type { TenantContext } from "@/lib/tenant/context";
import { getGradebookFeatureState } from "@/modules/gradebook/feature";
import {
  requireGradebookCapability,
  resolveGradebookRequestContext,
  type GradebookRequestContext
} from "@/modules/gradebook/services/request-context.service";

function hasAnyPermission(
  request: GradebookRequestContext,
  permissions: readonly PermissionCode[]
) {
  return permissions.some((permission) => request.permissions.has(permission));
}

function requireAnyPermission(
  request: GradebookRequestContext,
  permissions: readonly PermissionCode[]
) {
  if (!hasAnyPermission(request, permissions)) {
    throw new AppError("GRADEBOOK_SCOPE_FORBIDDEN", "GRADEBOOK_SCOPE_FORBIDDEN", 403);
  }
}

function hasBroadExamAccess(request: GradebookRequestContext) {
  return hasAnyPermission(request, [
    "gradebook.exam.create",
    "gradebook.exam.update",
    "gradebook.exam.activate",
    "gradebook.assignment.manage",
    "gradebook.marks.verify",
    "gradebook.marks.approve",
    "gradebook.result.calculate",
    "gradebook.result.approve",
    "gradebook.result.publish",
    "gradebook.reportcard.generate",
    "gradebook.reportcard.approve"
  ]);
}

function examVisibility(request: GradebookRequestContext): Prisma.GradebookExamWhereInput {
  if (hasBroadExamAccess(request)) return {};
  return {
    teacherAssignments: {
      some: {
        tenantId: request.tenantId,
        teacherUserId: request.userId,
        status: "ACTIVE"
      }
    }
  };
}

function batchVisibility(request: GradebookRequestContext): Prisma.GradebookMarkEntryBatchWhereInput {
  if (hasAnyPermission(request, [
    "gradebook.marks.verify",
    "gradebook.marks.approve",
    "gradebook.marks.return",
    "gradebook.marks.progress.view"
  ])) return {};
  return {
    teacherAssignment: {
      tenantId: request.tenantId,
      teacherUserId: request.userId,
      status: "ACTIVE"
    }
  };
}

function activeScope(request: GradebookRequestContext) {
  return {
    tenantId: request.tenantId,
    branchId: request.branchId,
    academicYearId: request.academicYearId
  } as const;
}

export async function getGradebookMvpDashboard(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, {
    permission: "gradebook.dashboard.view"
  });
  const features = await getGradebookFeatureState(request);
  const scope = activeScope(request);
  const visibleExams = { ...scope, ...examVisibility(request) };
  const visibleBatches = { ...scope, ...batchVisibility(request) };

  const [
    examCount,
    activeExamCount,
    assignedBatchCount,
    pendingBatchCount,
    approvedRunCount,
    pendingResultRunCount,
    publishedResultCount,
    failedJobCount,
    pendingCorrectionCount,
    recentBatches,
    recentJobs
  ] = await Promise.all([
    db.gradebookExam.count({ where: visibleExams }),
    db.gradebookExam.count({ where: { ...visibleExams, status: { in: ["CONFIGURED", "SCHEDULED", "MARKS_OPEN", "UNDER_REVIEW"] } } }),
    db.gradebookMarkEntryBatch.count({ where: visibleBatches }),
    db.gradebookMarkEntryBatch.count({ where: { ...visibleBatches, status: { in: ["NOT_STARTED", "IN_PROGRESS", "RETURNED", "REOPENED"] } } }),
    db.gradebookResultRun.count({ where: { ...scope, exam: examVisibility(request), status: "APPROVED" } }),
    db.gradebookResultRun.count({ where: { ...scope, exam: examVisibility(request), status: { in: ["QUEUED", "RUNNING", "COMPLETED"] } } }),
    db.gradebookResultPublication.count({ where: { ...scope, status: "PUBLISHED", resultRun: { exam: examVisibility(request) } } }),
    db.gradebookJob.count({ where: { ...scope, status: { in: ["FAILED", "DEAD_LETTER"] } } }),
    db.gradebookCorrectionRequest.count({ where: { ...scope, status: { in: ["REQUESTED", "UNDER_REVIEW", "APPROVED", "OPENED"] }, exam: examVisibility(request) } }),
    db.gradebookMarkEntryBatch.findMany({
      where: visibleBatches,
      select: {
        id: true,
        status: true,
        version: true,
        entryClosedAt: true,
        completionCountsJson: true,
        exam: { select: { name: true } },
        examClassSection: { select: { classSection: { select: { displayName: true } } } },
        examSubject: { select: { subject: { select: { code: true, name: true } } } }
      },
      orderBy: { updatedAt: "desc" },
      take: 8
    }),
    db.gradebookJob.findMany({
      where: scope,
      select: { id: true, jobType: true, status: true, attemptCount: true, lastErrorCode: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 8
    })
  ]);

  return {
    context: {
      branchId: request.branchId,
      branchName: request.activeBranchName ?? "Active branch",
      academicYearId: request.academicYearId,
      academicYearName: request.activeAcademicYearName ?? "Active academic year",
      timeZone: request.timeZone
    },
    features,
    capabilities: {
      canConfigure: hasAnyPermission(request, ["gradebook.scheme.manage", "gradebook.term.manage", "gradebook.exam_type.manage"]),
      canCreateExam: request.permissions.has("gradebook.exam.create"),
      canReviewMarks: hasAnyPermission(request, ["gradebook.marks.verify", "gradebook.marks.approve"]),
      canCalculateResults: request.permissions.has("gradebook.result.calculate"),
      canGenerateReportCards: request.permissions.has("gradebook.reportcard.generate"),
      canPublish: request.permissions.has("gradebook.result.publish"),
      canViewAnalytics: hasAnyPermission(request, ["gradebook.analytics.view_institution", "gradebook.analytics.view_branch", "gradebook.analytics.view_class_section", "gradebook.analytics.view_subject", "gradebook.analytics.view_student", "gradebook.analytics.view_own"])
    },
    metrics: {
      examCount,
      activeExamCount,
      assignedBatchCount,
      pendingBatchCount,
      approvedRunCount,
      pendingResultRunCount,
      publishedResultCount,
      failedJobCount,
      pendingCorrectionCount
    },
    recentBatches,
    recentJobs
  };
}

export async function getGradebookSectionNavigation(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx);
  const features = await getGradebookFeatureState(request);
  const items: Array<{ title: string; href: string }> = [
    { title: "Dashboard", href: "/gradebook" }
  ];
  if (features.configuration && hasAnyPermission(request, ["gradebook.scheme.view", "gradebook.term.view", "gradebook.exam_type.view", "gradebook.grade_scale.view", "gradebook.calculation_rules.view"])) {
    items.push({ title: "Configuration", href: "/gradebook/setup" });
  }
  if (request.permissions.has("gradebook.exam.view")) items.push({ title: "Examinations", href: "/gradebook/exams" });
  if (features.marksEntry && request.permissions.has("gradebook.marks.view")) items.push({ title: "Marks", href: "/gradebook/marks" });
  if (features.import && request.permissions.has("gradebook.import.create")) items.push({ title: "Imports", href: "/gradebook/imports" });
  if (features.resultCalculation && request.permissions.has("gradebook.result.view")) items.push({ title: "Results", href: "/gradebook/results" });
  if (features.reportCards && request.permissions.has("gradebook.reportcard.view")) items.push({ title: "Report cards", href: "/gradebook/report-cards" });
  if (features.coScholastic && hasAnyPermission(request, ["gradebook.coscholastic.view", "gradebook.coscholastic.enter", "gradebook.remark.subject.enter", "gradebook.remark.class_teacher.enter", "gradebook.remark.principal.enter"])) items.push({ title: "Enrichment", href: "/gradebook/enrichment" });
  if (features.resultCalculation && hasAnyPermission(request, ["gradebook.marks.reopen.request", "gradebook.marks.reopen.review", "gradebook.result.correction.request", "gradebook.result.correction.approve", "gradebook.adjustment.view_audit"])) {
    items.push({ title: "Corrections", href: "/gradebook/corrections" });
  }
  if (features.analytics && hasAnyPermission(request, ["gradebook.analytics.view_institution", "gradebook.analytics.view_branch", "gradebook.analytics.view_class_section", "gradebook.analytics.view_subject", "gradebook.analytics.view_student", "gradebook.analytics.view_own"])) {
    items.push({ title: "Analytics", href: "/gradebook/analytics" });
  }
  if (request.permissions.has("gradebook.history.view")) items.push({ title: "History", href: "/gradebook/history" });
  return items;
}

export async function getGradebookConfigurationWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { feature: "configuration" });
  requireAnyPermission(request, [
    "gradebook.scheme.view",
    "gradebook.term.view",
    "gradebook.exam_type.view",
    "gradebook.grade_scale.view",
    "gradebook.calculation_rules.view"
  ]);
  const scope = activeScope(request);

  const [schemes, terms, examTypes, gradeScales, calculationRuleSets] = await Promise.all([
    db.gradebookAssessmentScheme.findMany({
      where: { tenantId: request.tenantId, OR: [{ branchId: request.branchId }, { branchId: null }] },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        status: true,
        versions: {
          where: { OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] },
          select: { id: true, versionNumber: true, status: true, configurationHash: true },
          orderBy: { versionNumber: "desc" }
        }
      },
      orderBy: { name: "asc" }
    }),
    db.gradebookExamTerm.findMany({
      where: scope,
      select: {
        id: true,
        code: true,
        name: true,
        displayName: true,
        sequence: true,
        startDate: true,
        endDate: true,
        isReportCardTerm: true,
        status: true,
        version: true,
        schemeVersionId: true,
        _count: { select: { exams: true } }
      },
      orderBy: [{ sequence: "asc" }, { startDate: "asc" }]
    }),
    db.gradebookExamType.findMany({
      where: { tenantId: request.tenantId },
      select: {
        id: true,
        code: true,
        name: true,
        category: true,
        defaultMaximumMarks: true,
        defaultPassingMarks: true,
        defaultWeightagePercent: true,
        allowsSpecialStatuses: true,
        requiresSchedule: true,
        status: true,
        version: true
      },
      orderBy: { name: "asc" }
    }),
    db.gradebookGradeScale.findMany({
      where: { tenantId: request.tenantId, OR: [{ branchId: request.branchId }, { branchId: null }] },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        versions: {
          where: { OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] },
          select: { id: true, versionNumber: true, scoreBasis: true, decimalPlaces: true, status: true, configurationHash: true, _count: { select: { rules: true } } },
          orderBy: { versionNumber: "desc" }
        }
      },
      orderBy: { name: "asc" }
    }),
    db.gradebookCalculationRuleSet.findMany({
      where: { tenantId: request.tenantId, OR: [{ branchId: request.branchId }, { branchId: null }] },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        versions: {
          where: { OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] },
          select: { id: true, versionNumber: true, strategy: true, status: true, configurationHash: true },
          orderBy: { versionNumber: "desc" }
        }
      },
      orderBy: { name: "asc" }
    })
  ]);

  return {
    context: { branchId: request.branchId, academicYearId: request.academicYearId },
    capabilities: {
      canManageSchemes: request.permissions.has("gradebook.scheme.manage"),
      canActivateSchemes: request.permissions.has("gradebook.scheme.activate"),
      canManageTerms: request.permissions.has("gradebook.term.manage"),
      canTransitionTerms: hasAnyPermission(request, ["gradebook.term.activate", "gradebook.term.close", "gradebook.term.archive"]),
      canManageExamTypes: request.permissions.has("gradebook.exam_type.manage"),
      canManageGradeScales: request.permissions.has("gradebook.grade_scale.manage"),
      canActivateGradeScales: request.permissions.has("gradebook.grade_scale.activate"),
      canManageCalculationRules: request.permissions.has("gradebook.calculation_rules.manage"),
      canActivateCalculationRules: request.permissions.has("gradebook.calculation_rules.activate")
    },
    schemes,
    terms,
    examTypes,
    gradeScales,
    calculationRuleSets
  };
}

export async function getGradebookExamsWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.view" });
  const scope = activeScope(request);
  const visibility = examVisibility(request);
  const [exams, terms, examTypes, classSections, subjects, gradeScaleVersions, calculationRuleSetVersions, schemeVersions] = await Promise.all([
    db.gradebookExam.findMany({
      where: { ...scope, ...visibility },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        version: true,
        marksEntryOpensAt: true,
        marksEntryClosesAt: true,
        term: { select: { name: true } },
        examType: { select: { name: true, category: true } },
        _count: { select: { classSections: true, subjects: true, schedules: true, teacherAssignments: true, GradebookMarkEntryBatch: true, GradebookResultRun: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 100
    }),
    db.gradebookExamTerm.findMany({ where: { ...scope, status: "ACTIVE" }, select: { id: true, code: true, name: true, startDate: true, endDate: true }, orderBy: { sequence: "asc" } }),
    db.gradebookExamType.findMany({ where: { tenantId: request.tenantId, status: "ACTIVE" }, select: { id: true, code: true, name: true, defaultMaximumMarks: true, defaultPassingMarks: true }, orderBy: { name: "asc" } }),
    db.classSection.findMany({ where: { ...scope, status: "ACTIVE" }, select: { id: true, displayName: true }, orderBy: { displayName: "asc" } }),
    db.subject.findMany({ where: { tenantId: request.tenantId, status: "ACTIVE" }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
    db.gradebookGradeScaleVersion.findMany({ where: { tenantId: request.tenantId, status: "ACTIVE", OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] }, select: { id: true, versionNumber: true, gradeScale: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.gradebookCalculationRuleSetVersion.findMany({ where: { tenantId: request.tenantId, status: "ACTIVE", OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] }, select: { id: true, versionNumber: true, strategy: true, ruleSet: { select: { name: true } } }, orderBy: { createdAt: "desc" } }),
    db.gradebookAssessmentSchemeVersion.findMany({ where: { tenantId: request.tenantId, status: "ACTIVE", OR: [{ academicYearId: request.academicYearId }, { academicYearId: null }] }, select: { id: true, versionNumber: true, scheme: { select: { name: true } } }, orderBy: { createdAt: "desc" } })
  ]);

  return {
    capabilities: {
      canCreate: request.permissions.has("gradebook.exam.create"),
      canActivate: request.permissions.has("gradebook.exam.activate"),
      canCancel: request.permissions.has("gradebook.exam.cancel"),
      canManageAssignments: request.permissions.has("gradebook.assignment.manage"),
      canManageSchedule: request.permissions.has("gradebook.exam.schedule.manage")
    },
    exams,
    terms,
    examTypes,
    classSections,
    subjects,
    gradeScaleVersions,
    calculationRuleSetVersions,
    schemeVersions
  };
}

export async function getGradebookExamDetail(ctx: TenantContext, examId: string) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam.view" });
  const exam = await db.gradebookExam.findFirst({
    where: { id: examId, ...activeScope(request), ...examVisibility(request) },
    include: {
      term: true,
      examType: true,
      classSections: { include: { classSection: { include: { academicClass: true, section: true } } } },
      subjects: { include: { subject: true, components: { orderBy: { displayOrder: "asc" } } }, orderBy: { displayOrder: "asc" } },
      schedules: { include: { examClassSection: { include: { classSection: true } }, examSubject: { include: { subject: true } } }, orderBy: [{ examDate: "asc" }, { startTime: "asc" }] },
      teacherAssignments: { include: { teacherUser: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } }, examClassSection: { include: { classSection: true } }, examSubject: { include: { subject: true } } }, orderBy: { createdAt: "desc" } },
      GradebookMarkEntryBatch: { select: { id: true, status: true, version: true, completionCountsJson: true, teacherMarkAssignmentId: true } },
      GradebookResultRun: { select: { id: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } }
    }
  });
  if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");

  const teachers = request.permissions.has("gradebook.assignment.manage")
    ? await db.user.findMany({
        where: {
          tenantId: request.tenantId,
          status: "ACTIVE",
          branchAccesses: { some: { tenantId: request.tenantId, branchId: request.branchId, isActive: true } },
          roleAssignments: { some: { tenantId: request.tenantId, isActive: true, role: { code: { in: ["TEACHER", "CLASS_TEACHER"] } } } }
        },
        select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }]
      })
    : [];

  return {
    exam,
    teachers,
    capabilities: {
      canActivate: request.permissions.has("gradebook.exam.activate"),
      canCancel: request.permissions.has("gradebook.exam.cancel"),
      canManageAssignments: request.permissions.has("gradebook.assignment.manage"),
      canManageSchedule: request.permissions.has("gradebook.exam.schedule.manage"),
      canPublishSchedule: request.permissions.has("gradebook.exam.schedule.publish"),
      canCalculateResults: request.permissions.has("gradebook.result.calculate")
    }
  };
}

export async function getGradebookMarksQueue(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.view", feature: "marksEntry" });
  const batches = await db.gradebookMarkEntryBatch.findMany({
    where: { ...activeScope(request), ...batchVisibility(request) },
    include: {
      exam: { select: { name: true, marksEntryOpensAt: true, marksEntryClosesAt: true } },
      examClassSection: { include: { classSection: true } },
      examSubject: { include: { subject: true, components: { orderBy: { displayOrder: "asc" } } } },
      teacherAssignment: { include: { teacherUser: { select: { id: true, displayName: true, firstName: true, lastName: true, email: true } } } },
      _count: { select: { marks: true, importJobs: true } }
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 200
  });
  return {
    batches,
    capabilities: {
      canImport: request.permissions.has("gradebook.import.create"),
      canVerify: request.permissions.has("gradebook.marks.verify"),
      canApprove: request.permissions.has("gradebook.marks.approve"),
      canReturn: request.permissions.has("gradebook.marks.return")
    }
  };
}

export async function getGradebookWorkflowQueue(
  ctx: TenantContext,
  queue: "SUBMISSIONS" | "VERIFICATION" | "APPROVALS"
) {
  const permission = queue === "SUBMISSIONS"
    ? "gradebook.marks.progress.view"
    : queue === "VERIFICATION"
      ? "gradebook.marks.verify"
      : "gradebook.marks.approve";
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "marksEntry" });
  const statuses = queue === "SUBMISSIONS"
    ? ["SUBMITTED", "RETURNED"] as const
    : queue === "VERIFICATION"
      ? ["SUBMITTED"] as const
      : ["VERIFIED"] as const;
  return db.gradebookMarkEntryBatch.findMany({
    where: { ...activeScope(request), status: { in: [...statuses] } },
    include: {
      exam: { select: { name: true } },
      examClassSection: { include: { classSection: true } },
      examSubject: { include: { subject: true } },
      teacherAssignment: { include: { teacherUser: { select: { displayName: true, firstName: true, lastName: true, email: true } } } }
    },
    orderBy: { updatedAt: "asc" },
    take: 200
  });
}

export async function getGradebookImportsWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.import.create", feature: "import" });
  const batches = await db.gradebookMarkEntryBatch.findMany({
    where: { ...activeScope(request), ...batchVisibility(request), status: { in: ["NOT_STARTED", "IN_PROGRESS", "RETURNED", "REOPENED"] } },
    select: { id: true, status: true, version: true, exam: { select: { name: true } }, examClassSection: { select: { classSection: { select: { displayName: true } } } }, examSubject: { select: { subject: { select: { code: true, name: true } } } } },
    orderBy: { updatedAt: "desc" }
  });
  const jobs = await db.gradebookExamImportJob.findMany({
    where: { ...activeScope(request), batch: batchVisibility(request) },
    select: { id: true, originalFileName: true, fileHash: true, status: true, totalRowCount: true, validRowCount: true, invalidRowCount: true, warningRowCount: true, appliedAt: true, createdAt: true, batch: { select: { id: true, exam: { select: { name: true } }, examClassSection: { select: { classSection: { select: { displayName: true } } } }, examSubject: { select: { subject: { select: { name: true } } } } } } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  return { batches, jobs };
}

export async function getGradebookResultsWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.view", feature: "resultCalculation" });
  const scope = activeScope(request);
  const visibility = examVisibility(request);
  const [exams, resultRuns] = await Promise.all([
    db.gradebookExam.findMany({
      where: { ...scope, ...visibility, status: { in: ["UNDER_REVIEW", "APPROVED", "PUBLISHED", "ARCHIVED"] } },
      select: { id: true, name: true, status: true, classSections: { select: { id: true, classSection: { select: { displayName: true } } } } },
      orderBy: { updatedAt: "desc" }
    }),
    db.gradebookResultRun.findMany({
      where: { ...scope, exam: visibility },
      include: { exam: { select: { name: true } }, examClassSection: { include: { classSection: true } }, _count: { select: { subjectResults: true, overallResults: true, reportCards: true, publications: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  return {
    exams,
    resultRuns,
    capabilities: {
      canCalculate: request.permissions.has("gradebook.result.calculate"),
      canApprove: request.permissions.has("gradebook.result.approve"),
      canGenerateReportCards: request.permissions.has("gradebook.reportcard.generate")
    }
  };
}

export async function getGradebookResultRunDetail(ctx: TenantContext, resultRunId: string) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.view", feature: "resultCalculation" });
  const run = await db.gradebookResultRun.findFirst({
    where: { id: resultRunId, ...activeScope(request), exam: examVisibility(request) },
    include: {
      exam: { include: { term: true } },
      examClassSection: { include: { classSection: true } },
      subjectResults: { include: { examSubject: { include: { subject: true } }, enrollment: { include: { student: true } } }, orderBy: [{ enrollment: { rollNumber: "asc" } }, { examSubject: { displayOrder: "asc" } }] },
      overallResults: { include: { enrollment: { include: { student: true } } }, orderBy: { enrollment: { rollNumber: "asc" } } },
      reportCards: { select: { id: true, enrollmentId: true, status: true, version: true } },
      publications: { select: { id: true, status: true, audience: true, publicationVersion: true, publishedAt: true } }
    }
  });
  if (!run) throw notFound("GRADEBOOK_RESULT_RUN_NOT_FOUND");
  return {
    run,
    capabilities: {
      canApprove: request.permissions.has("gradebook.result.approve"),
      canGenerateReportCards: request.permissions.has("gradebook.reportcard.generate"),
      canRequestCorrection: request.permissions.has("gradebook.result.correction.request")
    }
  };
}

export async function getGradebookReportCardWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.view", feature: "reportCards" });
  const scope = activeScope(request);
  const visibility = examVisibility(request);
  const [templates, approvedRuns, cards, publications] = await Promise.all([
    db.gradebookReportCardTemplate.findMany({
      where: { tenantId: request.tenantId, institutionId: request.institutionId, OR: [{ branchId: request.branchId }, { branchId: null }] },
      include: { versions: { orderBy: { versionNumber: "desc" } } },
      orderBy: { name: "asc" }
    }),
    db.gradebookResultRun.findMany({
      where: { ...scope, status: "APPROVED", exam: visibility },
      include: { exam: { select: { name: true } }, examClassSection: { include: { classSection: true } }, _count: { select: { overallResults: true, reportCards: true } } },
      orderBy: { approvedAt: "desc" }
    }),
    db.gradebookReportCard.findMany({
      where: { ...scope, resultRun: { exam: visibility } },
      include: { student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } }, resultRun: { include: { exam: { select: { name: true } } } } },
      orderBy: { createdAt: "desc" },
      take: 200
    }),
    db.gradebookResultPublication.findMany({
      where: { ...scope, resultRun: { exam: visibility } },
      include: { exam: { select: { name: true } }, _count: { select: { studentPublications: true } } },
      orderBy: { createdAt: "desc" },
      take: 100
    })
  ]);
  return {
    templates,
    approvedRuns,
    cards,
    publications,
    capabilities: {
      canManageTemplates: request.permissions.has("gradebook.reportcard.template.manage"),
      canGenerate: request.permissions.has("gradebook.reportcard.generate"),
      canApprove: request.permissions.has("gradebook.reportcard.approve"),
      canPreparePublication: request.permissions.has("gradebook.result.publication.prepare"),
      canPublish: request.permissions.has("gradebook.result.publish"),
      canRevoke: request.permissions.has("gradebook.result.revoke")
    }
  };
}

export async function getGradebookCorrectionsWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { feature: "resultCalculation" });
  requireAnyPermission(request, ["gradebook.marks.reopen.request", "gradebook.marks.reopen.review", "gradebook.result.correction.request", "gradebook.result.correction.approve", "gradebook.adjustment.view_audit"]);
  const scope = activeScope(request);
  const visibility = examVisibility(request);
  const [corrections, adjustments, markBatches, resultRuns, reportCards, subjectResults] = await Promise.all([
    db.gradebookCorrectionRequest.findMany({ where: { ...scope, exam: examVisibility(request) }, include: { exam: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.gradebookMarkAdjustment.findMany({ where: scope, orderBy: { createdAt: "desc" }, take: 100 }),
    db.gradebookMarkEntryBatch.findMany({ where: { ...scope, ...batchVisibility(request), status: { in: ["APPROVED", "LOCKED"] } }, select: { id: true, examId: true, status: true, exam: { select: { name: true } }, examClassSection: { select: { classSection: { select: { displayName: true } } } }, examSubject: { select: { subject: { select: { name: true } } } } }, orderBy: { updatedAt: "desc" }, take: 200 }),
    db.gradebookResultRun.findMany({ where: { ...scope, exam: visibility, status: { in: ["APPROVED", "PUBLISHED"] } }, select: { id: true, examId: true, status: true, exam: { select: { name: true } }, examClassSection: { select: { classSection: { select: { displayName: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    db.gradebookReportCard.findMany({ where: { ...scope, resultRun: { exam: visibility }, status: { in: ["APPROVED", "PUBLISHED"] } }, select: { id: true, status: true, resultRun: { select: { examId: true, exam: { select: { name: true } } } }, student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } } }, orderBy: { createdAt: "desc" }, take: 200 }),
    db.gradebookStudentSubjectResult.findMany({
      where: { tenantId: request.tenantId, resultRun: { ...scope, status: "APPROVED", exam: visibility } },
      select: {
        id: true,
        rawMarks: true,
        maximumMarks: true,
        resultRun: { select: { exam: { select: { name: true } } } },
        examSubject: { select: { subject: { select: { name: true } } } },
        enrollment: { select: { student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } } } }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    })
  ]);
  return {
    corrections,
    adjustments,
    markBatches,
    resultRuns,
    reportCards,
    subjectResults,
    capabilities: {
      canRequestMarkReopen: request.permissions.has("gradebook.marks.reopen.request"),
      canReviewMarkReopen: request.permissions.has("gradebook.marks.reopen.review") || request.permissions.has("gradebook.marks.reopen.approve"),
      canOpenMarkReopen: request.permissions.has("gradebook.marks.reopen.execute"),
      canRequestResultCorrection: request.permissions.has("gradebook.result.correction.request"),
      canApproveResultCorrection: request.permissions.has("gradebook.result.correction.approve"),
      canCloseCorrection: request.permissions.has("gradebook.result.republish"),
      canRequestAdjustment: request.permissions.has("gradebook.adjustment.request"),
      canApproveAdjustment: request.permissions.has("gradebook.adjustment.approve"),
      canApplyAdjustment: request.permissions.has("gradebook.adjustment.apply")
    }
  };
}

export async function getGradebookAnalyticsWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { feature: "analytics" });
  requireAnyPermission(request, ["gradebook.analytics.view_institution", "gradebook.analytics.view_branch", "gradebook.analytics.view_class_section", "gradebook.analytics.view_subject", "gradebook.analytics.view_student", "gradebook.analytics.view_own"]);
  const runs = await db.gradebookResultRun.findMany({
    where: { ...activeScope(request), status: "APPROVED", exam: examVisibility(request) },
    include: {
      exam: { select: { name: true } },
      examClassSection: { include: { classSection: true } },
      subjectResults: { include: { examSubject: { include: { subject: true } } } },
      overallResults: true
    },
    orderBy: { approvedAt: "desc" },
    take: 50
  });
  const subjectAccumulator = new Map<string, { code: string; name: string; total: number; count: number; passed: number; failed: number }>();
  for (const run of runs) {
    for (const result of run.subjectResults) {
      const subject = result.examSubject.subject;
      const row = subjectAccumulator.get(subject.id) ?? { code: subject.code, name: subject.name, total: 0, count: 0, passed: 0, failed: 0 };
      if (result.percentage !== null) {
        row.total += Number(result.percentage);
        row.count += 1;
      }
      if (result.resultStatus === "PASS") row.passed += 1;
      if (result.resultStatus === "FAIL") row.failed += 1;
      subjectAccumulator.set(subject.id, row);
    }
  }
  const totalStudents = runs.reduce((sum, run) => sum + run.overallResults.length, 0);
  const passedStudents = runs.reduce((sum, run) => sum + run.overallResults.filter((result) => result.resultStatus === "PASS").length, 0);
  return {
    metrics: {
      approvedRunCount: runs.length,
      totalStudents,
      passedStudents,
      passRate: totalStudents > 0 ? passedStudents / totalStudents * 100 : null
    },
    subjects: Array.from(subjectAccumulator.values()).map((subject) => ({
      ...subject,
      averagePercentage: subject.count > 0 ? subject.total / subject.count : null
    })).sort((a, b) => a.name.localeCompare(b.name)),
    runs: runs.map((run) => ({
      id: run.id,
      examName: run.exam.name,
      classSectionName: run.examClassSection?.classSection.displayName ?? "All scoped classes",
      approvedAt: run.approvedAt,
      studentCount: run.overallResults.length
    }))
  };
}

export async function getGradebookEnrichmentWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { feature: "coScholastic" });
  requireAnyPermission(request, [
    "gradebook.coscholastic.view",
    "gradebook.coscholastic.manage_areas",
    "gradebook.coscholastic.enter",
    "gradebook.remark.subject.enter",
    "gradebook.remark.class_teacher.enter",
    "gradebook.remark.principal.enter"
  ]);
  const scope = activeScope(request);
  const hasBroadAccess = hasAnyPermission(request, ["gradebook.coscholastic.manage_areas", "gradebook.coscholastic.approve", "gradebook.remark.principal.enter"]);
  const assignedClassSections = hasBroadAccess ? [] : await db.gradebookTeacherMarkAssignment.findMany({
    where: { ...scope, teacherUserId: request.userId, status: "ACTIVE" },
    select: { examClassSection: { select: { classSectionId: true } } }
  });
  const assignedClassSectionIds = Array.from(new Set(assignedClassSections.map((item) => item.examClassSection.classSectionId)));
  const classSections = await db.classSection.findMany({
    where: {
      ...scope,
      status: "ACTIVE",
      ...(hasBroadAccess ? {} : { OR: [{ classTeacherUserId: request.userId }, { id: { in: assignedClassSectionIds } }] })
    },
    select: { id: true, displayName: true },
    orderBy: { displayName: "asc" }
  });
  const classSectionIds = classSections.map((item) => item.id);
  const [schemes, terms, enrollments, exams, entries, remarks] = await Promise.all([
    db.gradebookCoScholasticSchemeVersion.findMany({ where: { tenantId: request.tenantId, academicYearId: request.academicYearId }, include: { areas: { include: { indicators: { orderBy: { displayOrder: "asc" } } }, orderBy: { displayOrder: "asc" } } }, orderBy: { versionNumber: "desc" } }),
    db.gradebookExamTerm.findMany({ where: { ...scope, status: { in: ["ACTIVE", "CLOSED"] } }, select: { id: true, name: true, status: true }, orderBy: { sequence: "asc" } }),
    db.enrollment.findMany({ where: { ...scope, classSectionId: { in: classSectionIds }, status: "ACTIVE", student: { status: "ACTIVE" } }, select: { id: true, rollNumber: true, classSection: { select: { displayName: true } }, student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } } }, orderBy: [{ classSection: { displayName: "asc" } }, { rollNumber: "asc" }] }),
    db.gradebookExam.findMany({ where: { ...scope, ...examVisibility(request), status: { notIn: ["DRAFT", "CANCELLED", "ARCHIVED"] } }, select: { id: true, name: true, subjects: { select: { id: true, displayName: true, subject: { select: { code: true, name: true } } } } }, orderBy: { createdAt: "desc" } }),
    db.gradebookCoScholasticEntry.findMany({ where: { ...scope, enrollment: { classSectionId: { in: classSectionIds } } }, select: { id: true, ratingCode: true, observation: true, status: true, indicator: { select: { name: true } }, enrollment: { select: { student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } } } } }, orderBy: { updatedAt: "desc" }, take: 100 }),
    db.gradebookTeacherRemark.findMany({ where: { ...scope, enrollment: { classSectionId: { in: classSectionIds } } }, select: { id: true, remarkType: true, remarkText: true, status: true, exam: { select: { name: true } }, enrollment: { select: { student: { select: { admissionNumber: true, displayName: true, fullName: true, firstName: true, lastName: true } } } } }, orderBy: { updatedAt: "desc" }, take: 100 })
  ]);
  return {
    schemes,
    terms,
    classSections,
    enrollments,
    exams,
    entries,
    remarks,
    capabilities: {
      canManageSchemes: request.permissions.has("gradebook.coscholastic.manage_areas"),
      canEnterCoScholastic: request.permissions.has("gradebook.coscholastic.enter"),
      canEnterSubjectRemark: request.permissions.has("gradebook.remark.subject.enter"),
      canEnterClassRemark: request.permissions.has("gradebook.remark.class_teacher.enter"),
      canEnterPrincipalRemark: request.permissions.has("gradebook.remark.principal.enter")
    }
  };
}

export async function getGradebookHistoryWorkspace(ctx: TenantContext) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.history.view" });
  const publications = await db.gradebookResultPublication.findMany({
    where: { ...activeScope(request), status: "PUBLISHED", resultRun: { status: "APPROVED", exam: examVisibility(request) } },
    include: {
      exam: { include: { term: true } },
      resultRun: { include: { examClassSection: { include: { classSection: true } } } },
      _count: { select: { studentPublications: true } }
    },
    orderBy: { publishedAt: "desc" },
    take: 100
  });
  return publications;
}

export async function assertGradebookReportCardAccess(ctx: TenantContext, reportCardId: string) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.view", feature: "reportCards" });
  requireGradebookCapability(request, "gradebook.reportcard.view");
  const card = await db.gradebookReportCard.findFirst({
    where: { id: reportCardId, ...activeScope(request), resultRun: { exam: examVisibility(request) } },
    select: { id: true }
  });
  if (!card) throw notFound("GRADEBOOK_REPORT_CARD_NOT_FOUND");
  return card;
}

export type GradebookMvpDashboard = Awaited<ReturnType<typeof getGradebookMvpDashboard>>;
export type GradebookConfigurationWorkspace = Awaited<ReturnType<typeof getGradebookConfigurationWorkspace>>;
export type GradebookExamsWorkspace = Awaited<ReturnType<typeof getGradebookExamsWorkspace>>;
export type GradebookMarksQueue = Awaited<ReturnType<typeof getGradebookMarksQueue>>;
export type GradebookResultsWorkspace = Awaited<ReturnType<typeof getGradebookResultsWorkspace>>;
export type GradebookReportCardWorkspace = Awaited<ReturnType<typeof getGradebookReportCardWorkspace>>;
export type GradebookEnrichmentWorkspace = Awaited<ReturnType<typeof getGradebookEnrichmentWorkspace>>;
