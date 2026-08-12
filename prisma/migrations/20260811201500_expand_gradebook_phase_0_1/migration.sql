-- CreateEnum
CREATE TYPE "GradebookConfigurationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GradebookExamTermStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookExamTypeCategory" AS ENUM ('WRITTEN', 'PRACTICAL', 'ORAL', 'PROJECT', 'INTERNAL', 'FORMATIVE', 'SUMMATIVE', 'OTHER');

-- CreateEnum
CREATE TYPE "GradebookExamTypeStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "GradebookScoreBasis" AS ENUM ('PERCENTAGE', 'WEIGHTED_PERCENTAGE', 'RAW_SCORE', 'GRADE_ONLY');

-- CreateEnum
CREATE TYPE "GradebookRoundingMode" AS ENUM ('HALF_UP', 'HALF_EVEN', 'FLOOR', 'CEILING');

-- CreateEnum
CREATE TYPE "GradebookCalculationStrategy" AS ENUM ('SUM_COMPONENTS_RAW', 'WEIGHTED_COMPONENTS', 'SCALE_TO_MAXIMUM');

-- CreateEnum
CREATE TYPE "GradebookExamStatus" AS ENUM ('DRAFT', 'CONFIGURED', 'SCHEDULED', 'MARKS_OPEN', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED', 'CANCELLED', 'REOPENED');

-- CreateEnum
CREATE TYPE "GradebookPublicationPolicy" AS ENUM ('MANUAL', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "GradebookScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'COMPLETED', 'RESCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookTeacherAssignmentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GradebookJobType" AS ENUM ('GENERATE_MARK_BATCHES', 'PARSE_MARKS_IMPORT', 'APPLY_MARKS_IMPORT', 'EXPORT_MARKS', 'CALCULATE_RESULT_RUN', 'GENERATE_ATTENDANCE_SUMMARIES', 'GENERATE_REPORT_CARDS', 'PUBLISH_RESULTS', 'REBUILD_RESULT_ANALYTICS', 'RETENTION_INTEGRITY');

-- CreateEnum
CREATE TYPE "GradebookJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "GradebookDomainEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'DEAD_LETTER');

-- CreateEnum
CREATE TYPE "GradebookMarkEntryBatchStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'APPROVED', 'LOCKED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookSpecialExamStatus" AS ENUM ('ABSENT', 'EXEMPTED', 'MEDICAL_LEAVE', 'NOT_APPLICABLE', 'WITHHELD', 'RESULT_PENDING');

-- CreateEnum
CREATE TYPE "GradebookImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'VALIDATED', 'READY_TO_APPLY', 'APPLYING', 'APPLIED', 'FAILED', 'CANCELLED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GradebookResultRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookSubjectResultStatus" AS ENUM ('PASS', 'FAIL', 'PENDING', 'WITHHELD', 'EXEMPTED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "GradebookOverallResultStatus" AS ENUM ('PASS', 'FAIL', 'PROMOTED', 'NOT_PROMOTED', 'PENDING', 'WITHHELD');

-- CreateEnum
CREATE TYPE "GradebookAdjustmentType" AS ENUM ('GRACE', 'MODERATION', 'CORRECTION', 'OTHER_AUTHORISED');

-- CreateEnum
CREATE TYPE "GradebookAdjustmentStatus" AS ENUM ('DRAFT', 'REQUESTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookCorrectionType" AS ENUM ('MARK_REOPEN', 'RESULT_CORRECTION', 'RE_EVALUATION', 'REPORT_CARD_REISSUE');

-- CreateEnum
CREATE TYPE "GradebookCorrectionStatus" AS ENUM ('DRAFT', 'REQUESTED', 'UNDER_REVIEW', 'RETURNED', 'APPROVED', 'REJECTED', 'OPENED', 'CORRECTED', 'RESUBMITTED', 'RECALCULATED', 'REPUBLISHED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookRemarkType" AS ENUM ('SUBJECT_TEACHER', 'CLASS_TEACHER', 'PRINCIPAL');

-- CreateEnum
CREATE TYPE "GradebookEntryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'RETURNED', 'VERIFIED', 'APPROVED', 'LOCKED');

-- CreateEnum
CREATE TYPE "GradebookAttendanceSnapshotStatus" AS ENUM ('PENDING', 'GENERATED', 'VERIFIED', 'FROZEN', 'STALE');

-- CreateEnum
CREATE TYPE "GradebookReportCardStatus" AS ENUM ('QUEUED', 'GENERATING', 'GENERATED', 'REVIEWED', 'APPROVED', 'PUBLISHED', 'FAILED', 'REJECTED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "GradebookPublicationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'PARTIALLY_PUBLISHED', 'REVOKED', 'SUPERSEDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "GradebookPublicationAudience" AS ENUM ('STUDENT', 'GUARDIAN', 'STUDENT_AND_GUARDIAN');

-- AlterTable
ALTER TABLE "tenant_settings" ADD COLUMN     "gradebookAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookCoScholasticEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookConfigurationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookImportEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookMarksEntryEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookPortalResultsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookPublicationEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookReportCardsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gradebookResultCalculationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "gradebook_assessment_schemes" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_assessment_schemes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_assessment_scheme_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "schemeId" UUID NOT NULL,
    "academicYearId" UUID,
    "versionNumber" INTEGER NOT NULL,
    "configurationJson" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE,
    "effectiveUntil" DATE,
    "activatedAt" TIMESTAMP(3),
    "activatedById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_assessment_scheme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_terms" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "schemeVersionId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "sequence" INTEGER NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "resultPublicationStartAt" TIMESTAMP(3),
    "isReportCardTerm" BOOLEAN NOT NULL DEFAULT true,
    "allowDateOverlap" BOOLEAN NOT NULL DEFAULT false,
    "metadataJson" JSONB,
    "status" "GradebookExamTermStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "activatedById" UUID,
    "activatedAt" TIMESTAMP(3),
    "closedById" UUID,
    "closedAt" TIMESTAMP(3),
    "archivedById" UUID,
    "archivedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_types" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "GradebookExamTypeCategory" NOT NULL,
    "defaultMaximumMarks" DECIMAL(10,2),
    "defaultPassingMarks" DECIMAL(10,2),
    "defaultWeightagePercent" DECIMAL(7,4),
    "allowsSpecialStatuses" BOOLEAN NOT NULL DEFAULT true,
    "requiresSchedule" BOOLEAN NOT NULL DEFAULT true,
    "requiresRoom" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "status" "GradebookExamTypeStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_grade_scales" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_grade_scales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_grade_scale_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "gradeScaleId" UUID NOT NULL,
    "academicYearId" UUID,
    "versionNumber" INTEGER NOT NULL,
    "scoreBasis" "GradebookScoreBasis" NOT NULL DEFAULT 'PERCENTAGE',
    "roundingMode" "GradebookRoundingMode" NOT NULL DEFAULT 'HALF_UP',
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "configurationHash" TEXT NOT NULL,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE,
    "effectiveUntil" DATE,
    "activatedAt" TIMESTAMP(3),
    "activatedById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_grade_scale_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_grade_rules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "gradeScaleVersionId" UUID NOT NULL,
    "minimumInclusive" DECIMAL(12,4) NOT NULL,
    "maximumInclusive" DECIMAL(12,4) NOT NULL,
    "letterGrade" TEXT NOT NULL,
    "gradePoint" DECIMAL(7,4),
    "remarkTemplate" TEXT,
    "isPassing" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_grade_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_calculation_rule_sets" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_calculation_rule_sets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_calculation_rule_set_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "ruleSetId" UUID NOT NULL,
    "academicYearId" UUID,
    "versionNumber" INTEGER NOT NULL,
    "strategy" "GradebookCalculationStrategy" NOT NULL,
    "rulesJson" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" DATE,
    "effectiveUntil" DATE,
    "activatedAt" TIMESTAMP(3),
    "activatedById" UUID,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_calculation_rule_set_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exams" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "examTypeId" UUID NOT NULL,
    "schemeVersionId" UUID,
    "gradeScaleVersionId" UUID,
    "calculationRuleSetVersionId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "instructions" TEXT,
    "marksEntryOpensAt" TIMESTAMP(3),
    "marksEntryClosesAt" TIMESTAMP(3),
    "resultPublicationPolicy" "GradebookPublicationPolicy" NOT NULL DEFAULT 'MANUAL',
    "scheduledPublishAt" TIMESTAMP(3),
    "status" "GradebookExamStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "activatedById" UUID,
    "activatedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_class_sections" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "classSectionId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_exam_class_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_subjects" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "displayName" TEXT,
    "maximumMarks" DECIMAL(10,2),
    "passingMarks" DECIMAL(10,2),
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_assessment_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "examTypeId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_assessment_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_subject_components" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "componentId" UUID,
    "examTypeId" UUID,
    "componentCode" TEXT NOT NULL,
    "componentName" TEXT NOT NULL,
    "maximumMarks" DECIMAL(10,2) NOT NULL,
    "passingMarks" DECIMAL(10,2),
    "weightagePercent" DECIMAL(7,4),
    "displayOrder" INTEGER NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "roundingMode" "GradebookRoundingMode",
    "decimalPlaces" INTEGER,
    "specialStatusPolicyJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_subject_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_schedules" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "examClassSectionId" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "examSubjectComponentId" UUID,
    "examDate" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "reportingTime" TEXT,
    "roomName" TEXT,
    "instructions" TEXT,
    "studentGroupRuleJson" JSONB,
    "invigilatorUserIdsJson" JSONB,
    "status" "GradebookScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "supersedesScheduleId" UUID,
    "changeReason" TEXT,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_teacher_mark_assignments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "examClassSectionId" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "examSubjectComponentId" UUID,
    "teacherUserId" UUID NOT NULL,
    "sourceClassSectionSubjectId" UUID,
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "canSubmit" BOOLEAN NOT NULL DEFAULT true,
    "status" "GradebookTeacherAssignmentStatus" NOT NULL DEFAULT 'DRAFT',
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "overrideReason" TEXT,
    "createdById" UUID NOT NULL,
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_teacher_mark_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_jobs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "academicYearId" UUID,
    "jobType" "GradebookJobType" NOT NULL,
    "scopeJson" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "GradebookJobStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_domain_event_outbox" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID,
    "academicYearId" UUID,
    "eventType" TEXT NOT NULL,
    "eventVersion" INTEGER NOT NULL DEFAULT 1,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "GradebookDomainEventStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_domain_event_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_mark_entry_batches" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "teacherMarkAssignmentId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "examClassSectionId" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "status" "GradebookMarkEntryBatchStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "entryOpenedAt" TIMESTAMP(3),
    "entryClosedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "submittedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "lockedAt" TIMESTAMP(3),
    "lockedById" UUID,
    "returnedAt" TIMESTAMP(3),
    "returnedById" UUID,
    "returnReason" TEXT,
    "approvalComment" TEXT,
    "verificationJson" JSONB,
    "completionCountsJson" JSONB,
    "rosterSnapshotJson" JSONB NOT NULL,
    "snapshotHash" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_mark_entry_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_student_marks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "markEntryBatchId" UUID NOT NULL,
    "examSubjectComponentId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "marksObtained" DECIMAL(10,2),
    "specialStatus" "GradebookSpecialExamStatus",
    "statusReason" TEXT,
    "publicRemark" TEXT,
    "teacherRemark" TEXT,
    "rowVersion" INTEGER NOT NULL DEFAULT 1,
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_student_marks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_student_mark_revisions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "markEntryBatchId" UUID NOT NULL,
    "studentMarkId" UUID NOT NULL,
    "batchVersion" INTEGER NOT NULL,
    "beforeJson" JSONB,
    "afterJson" JSONB NOT NULL,
    "reason" TEXT,
    "actorUserId" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_student_mark_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_mark_workflow_events" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "markEntryBatchId" UUID NOT NULL,
    "fromStatus" "GradebookMarkEntryBatchStatus",
    "toStatus" "GradebookMarkEntryBatchStatus" NOT NULL,
    "batchVersion" INTEGER NOT NULL,
    "reason" TEXT,
    "metadataJson" JSONB,
    "actorUserId" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_mark_workflow_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_import_jobs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "markEntryBatchId" UUID NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "originalObjectKey" TEXT NOT NULL,
    "errorObjectKey" TEXT,
    "fileHash" TEXT NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "status" "GradebookImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "totalRowCount" INTEGER NOT NULL DEFAULT 0,
    "validRowCount" INTEGER NOT NULL DEFAULT 0,
    "invalidRowCount" INTEGER NOT NULL DEFAULT 0,
    "warningRowCount" INTEGER NOT NULL DEFAULT 0,
    "applyIdempotencyKey" TEXT,
    "failureCode" TEXT,
    "failureSummary" TEXT,
    "uploadedById" UUID NOT NULL,
    "appliedById" UUID,
    "appliedAt" TIMESTAMP(3),
    "cancelledById" UUID,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_exam_import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_exam_import_rows" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "enrollmentId" UUID,
    "examSubjectComponentId" UUID,
    "parsedValueJson" JSONB,
    "normalisedValueJson" JSONB,
    "validationErrorsJson" JSONB,
    "validationWarningsJson" JSONB,
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_exam_import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_result_runs" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "examClassSectionId" UUID,
    "inputSnapshotHash" TEXT NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "GradebookResultRunStatus" NOT NULL DEFAULT 'QUEUED',
    "supersedesResultRunId" UUID,
    "startedById" UUID NOT NULL,
    "approvedById" UUID,
    "rejectedById" UUID,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "failureCode" TEXT,
    "summaryJson" JSONB,
    "configurationSnapshotJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_result_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_student_subject_results" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "resultRunId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "examSubjectId" UUID NOT NULL,
    "rawMarks" DECIMAL(12,4),
    "maximumMarks" DECIMAL(12,4),
    "weightedScore" DECIMAL(12,4),
    "percentage" DECIMAL(9,4),
    "letterGrade" TEXT,
    "gradePoint" DECIMAL(7,4),
    "resultStatus" "GradebookSubjectResultStatus" NOT NULL,
    "specialStatus" "GradebookSpecialExamStatus",
    "adjustmentTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "calculationDetailJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_student_subject_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_student_overall_results" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "resultRunId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "totalMarks" DECIMAL(12,4),
    "maximumMarks" DECIMAL(12,4),
    "overallPercentage" DECIMAL(9,4),
    "overallLetterGrade" TEXT,
    "overallGradePoint" DECIMAL(7,4),
    "passedSubjectCount" INTEGER NOT NULL DEFAULT 0,
    "failedSubjectCount" INTEGER NOT NULL DEFAULT 0,
    "pendingSubjectCount" INTEGER NOT NULL DEFAULT 0,
    "resultStatus" "GradebookOverallResultStatus" NOT NULL,
    "promotionEligible" BOOLEAN,
    "calculationDetailJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_student_overall_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_mark_adjustments" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "adjustmentType" "GradebookAdjustmentType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "originalValueJson" JSONB NOT NULL,
    "proposedDelta" DECIMAL(10,2),
    "proposedValue" DECIMAL(10,2),
    "appliedValue" DECIMAL(10,2),
    "maximumAllowed" DECIMAL(10,2),
    "policyVersionHash" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceObjectKey" TEXT,
    "impactPreviewJson" JSONB NOT NULL,
    "status" "GradebookAdjustmentStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedById" UUID NOT NULL,
    "reviewedById" UUID,
    "approvedById" UUID,
    "appliedById" UUID,
    "replacementResultRunId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_mark_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_correction_requests" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "requestType" "GradebookCorrectionType" NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "requestedChangeJson" JSONB NOT NULL,
    "impactPreviewJson" JSONB NOT NULL,
    "status" "GradebookCorrectionStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedScopeJson" JSONB,
    "approvedUntil" TIMESTAMP(3),
    "supersededVersionId" UUID,
    "replacementVersionId" UUID,
    "requestedById" UUID NOT NULL,
    "reviewedById" UUID,
    "approvedById" UUID,
    "openedById" UUID,
    "closedById" UUID,
    "reviewReason" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_correction_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_remark_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "remarkType" "GradebookRemarkType" NOT NULL,
    "text" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_remark_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_teacher_remarks" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "examSubjectId" UUID,
    "templateId" UUID,
    "remarkType" "GradebookRemarkType" NOT NULL,
    "remarkText" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "status" "GradebookEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "enteredById" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_teacher_remarks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_co_scholastic_scheme_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "academicYearId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "ratingScaleJson" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "activatedById" UUID,
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_co_scholastic_scheme_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_co_scholastic_areas" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "schemeVersionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_co_scholastic_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_co_scholastic_indicators" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "areaId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "displayOrder" INTEGER NOT NULL,
    "remarkRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_co_scholastic_indicators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_co_scholastic_entries" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "schemeVersionId" UUID NOT NULL,
    "termId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "indicatorId" UUID NOT NULL,
    "ratingCode" TEXT NOT NULL,
    "observation" TEXT,
    "status" "GradebookEntryStatus" NOT NULL DEFAULT 'DRAFT',
    "evaluatorUserId" UUID NOT NULL,
    "approvedById" UUID,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_co_scholastic_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_attendance_summary_snapshots" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "termId" UUID,
    "resultRunId" UUID,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "eligibleDays" INTEGER NOT NULL,
    "markedDays" INTEGER NOT NULL,
    "presentDays" DECIMAL(8,2) NOT NULL,
    "absentDays" DECIMAL(8,2) NOT NULL,
    "lateDays" DECIMAL(8,2) NOT NULL,
    "halfDays" DECIMAL(8,2) NOT NULL,
    "leaveDays" DECIMAL(8,2) NOT NULL,
    "excusedDays" DECIMAL(8,2) NOT NULL,
    "unmarkedDays" INTEGER NOT NULL,
    "attendancePercentage" DECIMAL(9,4),
    "sourceCutoffAt" TIMESTAMP(3) NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "attendancePolicyHash" TEXT NOT NULL,
    "status" "GradebookAttendanceSnapshotStatus" NOT NULL DEFAULT 'GENERATED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "generatedById" UUID NOT NULL,
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "frozenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_attendance_summary_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_report_card_templates" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "branchId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "updatedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_report_card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_report_card_template_versions" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "templateId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "configurationJson" JSONB NOT NULL,
    "configurationHash" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "status" "GradebookConfigurationStatus" NOT NULL DEFAULT 'DRAFT',
    "activatedById" UUID,
    "activatedAt" TIMESTAMP(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_report_card_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_report_cards" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "resultRunId" UUID NOT NULL,
    "templateVersionId" UUID NOT NULL,
    "attendanceSummarySnapshotId" UUID,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "pdfObjectKey" TEXT,
    "pdfChecksum" TEXT,
    "status" "GradebookReportCardStatus" NOT NULL DEFAULT 'QUEUED',
    "supersedesReportCardId" UUID,
    "generationErrorCode" TEXT,
    "generatedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revocationReason" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_report_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_result_publications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "branchId" UUID NOT NULL,
    "academicYearId" UUID NOT NULL,
    "examId" UUID NOT NULL,
    "resultRunId" UUID NOT NULL,
    "audience" "GradebookPublicationAudience" NOT NULL,
    "publicationVersion" INTEGER NOT NULL,
    "publishAt" TIMESTAMP(3) NOT NULL,
    "status" "GradebookPublicationStatus" NOT NULL DEFAULT 'DRAFT',
    "readinessSnapshotJson" JSONB NOT NULL,
    "supersedesPublicationId" UUID,
    "preparedById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMP(3),
    "revokedById" UUID,
    "revokedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gradebook_result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gradebook_student_result_publications" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "publicationId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "reportCardId" UUID,
    "isEligible" BOOLEAN NOT NULL DEFAULT true,
    "exclusionCode" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gradebook_student_result_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gradebook_assessment_schemes_tenantId_institutionId_branchI_idx" ON "gradebook_assessment_schemes"("tenantId", "institutionId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_assessment_schemes_tenantId_code_key" ON "gradebook_assessment_schemes"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_assessment_scheme_versions_tenantId_academicYearI_idx" ON "gradebook_assessment_scheme_versions"("tenantId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_assessment_scheme_versions_tenantId_configuration_idx" ON "gradebook_assessment_scheme_versions"("tenantId", "configurationHash");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_assessment_scheme_versions_tenantId_schemeId_vers_key" ON "gradebook_assessment_scheme_versions"("tenantId", "schemeId", "versionNumber");

-- CreateIndex
CREATE INDEX "gradebook_exam_terms_tenantId_branchId_academicYearId_statu_idx" ON "gradebook_exam_terms"("tenantId", "branchId", "academicYearId", "status", "sequence");

-- CreateIndex
CREATE INDEX "gradebook_exam_terms_tenantId_institutionId_academicYearId_idx" ON "gradebook_exam_terms"("tenantId", "institutionId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_terms_tenantId_branchId_academicYearId_code_key" ON "gradebook_exam_terms"("tenantId", "branchId", "academicYearId", "code");

-- CreateIndex
CREATE INDEX "gradebook_exam_types_tenantId_status_category_idx" ON "gradebook_exam_types"("tenantId", "status", "category");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_types_tenantId_code_key" ON "gradebook_exam_types"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_grade_scales_tenantId_institutionId_branchId_stat_idx" ON "gradebook_grade_scales"("tenantId", "institutionId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_grade_scales_tenantId_code_key" ON "gradebook_grade_scales"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_grade_scale_versions_tenantId_academicYearId_stat_idx" ON "gradebook_grade_scale_versions"("tenantId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_grade_scale_versions_tenantId_configurationHash_idx" ON "gradebook_grade_scale_versions"("tenantId", "configurationHash");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_grade_scale_versions_tenantId_gradeScaleId_versio_key" ON "gradebook_grade_scale_versions"("tenantId", "gradeScaleId", "versionNumber");

-- CreateIndex
CREATE INDEX "gradebook_grade_rules_tenantId_gradeScaleVersionId_displayO_idx" ON "gradebook_grade_rules"("tenantId", "gradeScaleVersionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_grade_rules_tenantId_gradeScaleVersionId_letterGr_key" ON "gradebook_grade_rules"("tenantId", "gradeScaleVersionId", "letterGrade");

-- CreateIndex
CREATE INDEX "gradebook_calculation_rule_sets_tenantId_institutionId_bran_idx" ON "gradebook_calculation_rule_sets"("tenantId", "institutionId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_calculation_rule_sets_tenantId_code_key" ON "gradebook_calculation_rule_sets"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_calculation_rule_set_versions_tenantId_academicYe_idx" ON "gradebook_calculation_rule_set_versions"("tenantId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_calculation_rule_set_versions_tenantId_configurat_idx" ON "gradebook_calculation_rule_set_versions"("tenantId", "configurationHash");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_calculation_rule_set_versions_tenantId_ruleSetId__key" ON "gradebook_calculation_rule_set_versions"("tenantId", "ruleSetId", "versionNumber");

-- CreateIndex
CREATE INDEX "gradebook_exams_tenantId_branchId_academicYearId_termId_sta_idx" ON "gradebook_exams"("tenantId", "branchId", "academicYearId", "termId", "status");

-- CreateIndex
CREATE INDEX "gradebook_exams_tenantId_institutionId_status_idx" ON "gradebook_exams"("tenantId", "institutionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exams_tenantId_branchId_academicYearId_code_key" ON "gradebook_exams"("tenantId", "branchId", "academicYearId", "code");

-- CreateIndex
CREATE INDEX "gradebook_exam_class_sections_tenantId_branchId_academicYea_idx" ON "gradebook_exam_class_sections"("tenantId", "branchId", "academicYearId", "classSectionId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_class_sections_tenantId_examId_classSectionI_key" ON "gradebook_exam_class_sections"("tenantId", "examId", "classSectionId");

-- CreateIndex
CREATE INDEX "gradebook_exam_subjects_tenantId_examId_displayOrder_idx" ON "gradebook_exam_subjects"("tenantId", "examId", "displayOrder");

-- CreateIndex
CREATE INDEX "gradebook_exam_subjects_tenantId_subjectId_examId_idx" ON "gradebook_exam_subjects"("tenantId", "subjectId", "examId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_subjects_tenantId_examId_subjectId_key" ON "gradebook_exam_subjects"("tenantId", "examId", "subjectId");

-- CreateIndex
CREATE INDEX "gradebook_assessment_components_tenantId_status_idx" ON "gradebook_assessment_components"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_assessment_components_tenantId_code_key" ON "gradebook_assessment_components"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_exam_subject_components_tenantId_examSubjectId_di_idx" ON "gradebook_exam_subject_components"("tenantId", "examSubjectId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_subject_components_tenantId_examSubjectId_co_key" ON "gradebook_exam_subject_components"("tenantId", "examSubjectId", "componentCode");

-- CreateIndex
CREATE INDEX "gradebook_exam_schedules_tenantId_branchId_academicYearId_e_idx" ON "gradebook_exam_schedules"("tenantId", "branchId", "academicYearId", "examDate", "startTime");

-- CreateIndex
CREATE INDEX "gradebook_exam_schedules_tenantId_examClassSectionId_examDa_idx" ON "gradebook_exam_schedules"("tenantId", "examClassSectionId", "examDate");

-- CreateIndex
CREATE INDEX "gradebook_exam_schedules_tenantId_roomName_examDate_idx" ON "gradebook_exam_schedules"("tenantId", "roomName", "examDate");

-- CreateIndex
CREATE INDEX "gradebook_teacher_mark_assignments_tenantId_teacherUserId_s_idx" ON "gradebook_teacher_mark_assignments"("tenantId", "teacherUserId", "status");

-- CreateIndex
CREATE INDEX "gradebook_teacher_mark_assignments_tenantId_examId_examClas_idx" ON "gradebook_teacher_mark_assignments"("tenantId", "examId", "examClassSectionId", "examSubjectId");

-- CreateIndex
CREATE INDEX "gradebook_teacher_mark_assignments_tenantId_branchId_academ_idx" ON "gradebook_teacher_mark_assignments"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_jobs_idempotencyKey_key" ON "gradebook_jobs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "gradebook_jobs_tenantId_status_scheduledAt_idx" ON "gradebook_jobs"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "gradebook_jobs_tenantId_jobType_createdAt_idx" ON "gradebook_jobs"("tenantId", "jobType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_domain_event_outbox_idempotencyKey_key" ON "gradebook_domain_event_outbox"("idempotencyKey");

-- CreateIndex
CREATE INDEX "gradebook_domain_event_outbox_tenantId_status_scheduledAt_idx" ON "gradebook_domain_event_outbox"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "gradebook_domain_event_outbox_tenantId_eventType_createdAt_idx" ON "gradebook_domain_event_outbox"("tenantId", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "gradebook_domain_event_outbox_tenantId_aggregateType_aggreg_idx" ON "gradebook_domain_event_outbox"("tenantId", "aggregateType", "aggregateId");

-- CreateIndex
CREATE INDEX "gradebook_mark_entry_batches_tenantId_examId_examClassSecti_idx" ON "gradebook_mark_entry_batches"("tenantId", "examId", "examClassSectionId", "examSubjectId", "status");

-- CreateIndex
CREATE INDEX "gradebook_mark_entry_batches_tenantId_branchId_academicYear_idx" ON "gradebook_mark_entry_batches"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_mark_entry_batches_tenantId_teacherMarkAssignment_key" ON "gradebook_mark_entry_batches"("tenantId", "teacherMarkAssignmentId");

-- CreateIndex
CREATE INDEX "gradebook_student_marks_tenantId_enrollmentId_academicYearI_idx" ON "gradebook_student_marks"("tenantId", "enrollmentId", "academicYearId");

-- CreateIndex
CREATE INDEX "gradebook_student_marks_tenantId_studentId_academicYearId_idx" ON "gradebook_student_marks"("tenantId", "studentId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_student_marks_tenantId_markEntryBatchId_enrollmen_key" ON "gradebook_student_marks"("tenantId", "markEntryBatchId", "enrollmentId", "examSubjectComponentId");

-- CreateIndex
CREATE INDEX "gradebook_student_mark_revisions_tenantId_studentMarkId_cre_idx" ON "gradebook_student_mark_revisions"("tenantId", "studentMarkId", "createdAt");

-- CreateIndex
CREATE INDEX "gradebook_student_mark_revisions_tenantId_markEntryBatchId__idx" ON "gradebook_student_mark_revisions"("tenantId", "markEntryBatchId", "batchVersion");

-- CreateIndex
CREATE INDEX "gradebook_mark_workflow_events_tenantId_markEntryBatchId_cr_idx" ON "gradebook_mark_workflow_events"("tenantId", "markEntryBatchId", "createdAt");

-- CreateIndex
CREATE INDEX "gradebook_mark_workflow_events_tenantId_toStatus_createdAt_idx" ON "gradebook_mark_workflow_events"("tenantId", "toStatus", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_import_jobs_applyIdempotencyKey_key" ON "gradebook_exam_import_jobs"("applyIdempotencyKey");

-- CreateIndex
CREATE INDEX "gradebook_exam_import_jobs_tenantId_status_createdAt_idx" ON "gradebook_exam_import_jobs"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "gradebook_exam_import_jobs_tenantId_branchId_academicYearId_idx" ON "gradebook_exam_import_jobs"("tenantId", "branchId", "academicYearId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_import_jobs_tenantId_markEntryBatchId_fileHa_key" ON "gradebook_exam_import_jobs"("tenantId", "markEntryBatchId", "fileHash");

-- CreateIndex
CREATE INDEX "gradebook_exam_import_rows_tenantId_importJobId_isValid_idx" ON "gradebook_exam_import_rows"("tenantId", "importJobId", "isValid");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_exam_import_rows_tenantId_importJobId_rowNumber_key" ON "gradebook_exam_import_rows"("tenantId", "importJobId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_result_runs_idempotencyKey_key" ON "gradebook_result_runs"("idempotencyKey");

-- CreateIndex
CREATE INDEX "gradebook_result_runs_tenantId_examId_examClassSectionId_st_idx" ON "gradebook_result_runs"("tenantId", "examId", "examClassSectionId", "status");

-- CreateIndex
CREATE INDEX "gradebook_result_runs_tenantId_branchId_academicYearId_stat_idx" ON "gradebook_result_runs"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_student_subject_results_tenantId_enrollmentId_res_idx" ON "gradebook_student_subject_results"("tenantId", "enrollmentId", "resultRunId");

-- CreateIndex
CREATE INDEX "gradebook_student_subject_results_tenantId_examSubjectId_re_idx" ON "gradebook_student_subject_results"("tenantId", "examSubjectId", "resultStatus");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_student_subject_results_tenantId_resultRunId_enro_key" ON "gradebook_student_subject_results"("tenantId", "resultRunId", "enrollmentId", "examSubjectId");

-- CreateIndex
CREATE INDEX "gradebook_student_overall_results_tenantId_enrollmentId_res_idx" ON "gradebook_student_overall_results"("tenantId", "enrollmentId", "resultRunId");

-- CreateIndex
CREATE INDEX "gradebook_student_overall_results_tenantId_resultStatus_res_idx" ON "gradebook_student_overall_results"("tenantId", "resultStatus", "resultRunId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_student_overall_results_tenantId_resultRunId_enro_key" ON "gradebook_student_overall_results"("tenantId", "resultRunId", "enrollmentId");

-- CreateIndex
CREATE INDEX "gradebook_mark_adjustments_tenantId_targetType_targetId_sta_idx" ON "gradebook_mark_adjustments"("tenantId", "targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "gradebook_mark_adjustments_tenantId_branchId_academicYearId_idx" ON "gradebook_mark_adjustments"("tenantId", "branchId", "academicYearId", "createdAt");

-- CreateIndex
CREATE INDEX "gradebook_mark_adjustments_tenantId_replacementResultRunId_idx" ON "gradebook_mark_adjustments"("tenantId", "replacementResultRunId");

-- CreateIndex
CREATE INDEX "gradebook_correction_requests_tenantId_examId_status_reques_idx" ON "gradebook_correction_requests"("tenantId", "examId", "status", "requestedAt");

-- CreateIndex
CREATE INDEX "gradebook_correction_requests_tenantId_targetType_targetId__idx" ON "gradebook_correction_requests"("tenantId", "targetType", "targetId", "status");

-- CreateIndex
CREATE INDEX "gradebook_remark_templates_tenantId_remarkType_status_idx" ON "gradebook_remark_templates"("tenantId", "remarkType", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_remark_templates_tenantId_code_key" ON "gradebook_remark_templates"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_teacher_remarks_tenantId_branchId_academicYearId__idx" ON "gradebook_teacher_remarks"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_teacher_remarks_tenantId_examId_enrollmentId_exam_key" ON "gradebook_teacher_remarks"("tenantId", "examId", "enrollmentId", "examSubjectId", "remarkType");

-- CreateIndex
CREATE INDEX "gradebook_co_scholastic_scheme_versions_tenantId_institutio_idx" ON "gradebook_co_scholastic_scheme_versions"("tenantId", "institutionId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_co_scholastic_scheme_versions_tenantId_code_versi_key" ON "gradebook_co_scholastic_scheme_versions"("tenantId", "code", "versionNumber");

-- CreateIndex
CREATE INDEX "gradebook_co_scholastic_areas_tenantId_schemeVersionId_disp_idx" ON "gradebook_co_scholastic_areas"("tenantId", "schemeVersionId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_co_scholastic_areas_tenantId_schemeVersionId_code_key" ON "gradebook_co_scholastic_areas"("tenantId", "schemeVersionId", "code");

-- CreateIndex
CREATE INDEX "gradebook_co_scholastic_indicators_tenantId_areaId_displayO_idx" ON "gradebook_co_scholastic_indicators"("tenantId", "areaId", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_co_scholastic_indicators_tenantId_areaId_code_key" ON "gradebook_co_scholastic_indicators"("tenantId", "areaId", "code");

-- CreateIndex
CREATE INDEX "gradebook_co_scholastic_entries_tenantId_branchId_academicY_idx" ON "gradebook_co_scholastic_entries"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_co_scholastic_entries_tenantId_schemeVersionId_te_key" ON "gradebook_co_scholastic_entries"("tenantId", "schemeVersionId", "termId", "enrollmentId", "indicatorId");

-- CreateIndex
CREATE INDEX "gradebook_attendance_summary_snapshots_tenantId_branchId_ac_idx" ON "gradebook_attendance_summary_snapshots"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_attendance_summary_snapshots_tenantId_resultRunId_idx" ON "gradebook_attendance_summary_snapshots"("tenantId", "resultRunId", "enrollmentId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_attendance_summary_snapshots_tenantId_enrollmentI_key" ON "gradebook_attendance_summary_snapshots"("tenantId", "enrollmentId", "periodStart", "periodEnd", "version");

-- CreateIndex
CREATE INDEX "gradebook_report_card_templates_tenantId_institutionId_bran_idx" ON "gradebook_report_card_templates"("tenantId", "institutionId", "branchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_report_card_templates_tenantId_code_key" ON "gradebook_report_card_templates"("tenantId", "code");

-- CreateIndex
CREATE INDEX "gradebook_report_card_template_versions_tenantId_status_cre_idx" ON "gradebook_report_card_template_versions"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_report_card_template_versions_tenantId_templateId_key" ON "gradebook_report_card_template_versions"("tenantId", "templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "gradebook_report_cards_tenantId_resultRunId_status_idx" ON "gradebook_report_cards"("tenantId", "resultRunId", "status");

-- CreateIndex
CREATE INDEX "gradebook_report_cards_tenantId_studentId_academicYearId_st_idx" ON "gradebook_report_cards"("tenantId", "studentId", "academicYearId", "status");

-- CreateIndex
CREATE INDEX "gradebook_report_cards_tenantId_pdfObjectKey_idx" ON "gradebook_report_cards"("tenantId", "pdfObjectKey");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_report_cards_tenantId_enrollmentId_resultRunId_ve_key" ON "gradebook_report_cards"("tenantId", "enrollmentId", "resultRunId", "version");

-- CreateIndex
CREATE INDEX "gradebook_result_publications_tenantId_examId_status_publis_idx" ON "gradebook_result_publications"("tenantId", "examId", "status", "publishAt");

-- CreateIndex
CREATE INDEX "gradebook_result_publications_tenantId_branchId_academicYea_idx" ON "gradebook_result_publications"("tenantId", "branchId", "academicYearId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_result_publications_tenantId_resultRunId_publicat_key" ON "gradebook_result_publications"("tenantId", "resultRunId", "publicationVersion");

-- CreateIndex
CREATE INDEX "gradebook_student_result_publications_tenantId_studentId_pu_idx" ON "gradebook_student_result_publications"("tenantId", "studentId", "publishedAt");

-- CreateIndex
CREATE INDEX "gradebook_student_result_publications_tenantId_reportCardId_idx" ON "gradebook_student_result_publications"("tenantId", "reportCardId");

-- CreateIndex
CREATE UNIQUE INDEX "gradebook_student_result_publications_tenantId_publicationI_key" ON "gradebook_student_result_publications"("tenantId", "publicationId", "enrollmentId");

-- AddForeignKey
ALTER TABLE "gradebook_assessment_schemes" ADD CONSTRAINT "gradebook_assessment_schemes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_schemes" ADD CONSTRAINT "gradebook_assessment_schemes_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_schemes" ADD CONSTRAINT "gradebook_assessment_schemes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_scheme_versions" ADD CONSTRAINT "gradebook_assessment_scheme_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_scheme_versions" ADD CONSTRAINT "gradebook_assessment_scheme_versions_schemeId_fkey" FOREIGN KEY ("schemeId") REFERENCES "gradebook_assessment_schemes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_scheme_versions" ADD CONSTRAINT "gradebook_assessment_scheme_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_schemeVersionId_fkey" FOREIGN KEY ("schemeVersionId") REFERENCES "gradebook_assessment_scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_types" ADD CONSTRAINT "gradebook_exam_types_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scales" ADD CONSTRAINT "gradebook_grade_scales_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scales" ADD CONSTRAINT "gradebook_grade_scales_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scales" ADD CONSTRAINT "gradebook_grade_scales_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scale_versions" ADD CONSTRAINT "gradebook_grade_scale_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scale_versions" ADD CONSTRAINT "gradebook_grade_scale_versions_gradeScaleId_fkey" FOREIGN KEY ("gradeScaleId") REFERENCES "gradebook_grade_scales"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_scale_versions" ADD CONSTRAINT "gradebook_grade_scale_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_rules" ADD CONSTRAINT "gradebook_grade_rules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_grade_rules" ADD CONSTRAINT "gradebook_grade_rules_gradeScaleVersionId_fkey" FOREIGN KEY ("gradeScaleVersionId") REFERENCES "gradebook_grade_scale_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_sets" ADD CONSTRAINT "gradebook_calculation_rule_sets_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_sets" ADD CONSTRAINT "gradebook_calculation_rule_sets_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_sets" ADD CONSTRAINT "gradebook_calculation_rule_sets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_set_versions" ADD CONSTRAINT "gradebook_calculation_rule_set_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_set_versions" ADD CONSTRAINT "gradebook_calculation_rule_set_versions_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "gradebook_calculation_rule_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_calculation_rule_set_versions" ADD CONSTRAINT "gradebook_calculation_rule_set_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_termId_fkey" FOREIGN KEY ("termId") REFERENCES "gradebook_exam_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "gradebook_exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_schemeVersionId_fkey" FOREIGN KEY ("schemeVersionId") REFERENCES "gradebook_assessment_scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_gradeScaleVersionId_fkey" FOREIGN KEY ("gradeScaleVersionId") REFERENCES "gradebook_grade_scale_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exams" ADD CONSTRAINT "gradebook_exams_calculationRuleSetVersionId_fkey" FOREIGN KEY ("calculationRuleSetVersionId") REFERENCES "gradebook_calculation_rule_set_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_class_sections" ADD CONSTRAINT "gradebook_exam_class_sections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_class_sections" ADD CONSTRAINT "gradebook_exam_class_sections_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_class_sections" ADD CONSTRAINT "gradebook_exam_class_sections_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_class_sections" ADD CONSTRAINT "gradebook_exam_class_sections_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_class_sections" ADD CONSTRAINT "gradebook_exam_class_sections_classSectionId_fkey" FOREIGN KEY ("classSectionId") REFERENCES "class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subjects" ADD CONSTRAINT "gradebook_exam_subjects_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subjects" ADD CONSTRAINT "gradebook_exam_subjects_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subjects" ADD CONSTRAINT "gradebook_exam_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_components" ADD CONSTRAINT "gradebook_assessment_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_assessment_components" ADD CONSTRAINT "gradebook_assessment_components_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "gradebook_exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subject_components" ADD CONSTRAINT "gradebook_exam_subject_components_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subject_components" ADD CONSTRAINT "gradebook_exam_subject_components_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subject_components" ADD CONSTRAINT "gradebook_exam_subject_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "gradebook_assessment_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_subject_components" ADD CONSTRAINT "gradebook_exam_subject_components_examTypeId_fkey" FOREIGN KEY ("examTypeId") REFERENCES "gradebook_exam_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_examClassSectionId_fkey" FOREIGN KEY ("examClassSectionId") REFERENCES "gradebook_exam_class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_examSubjectComponentId_fkey" FOREIGN KEY ("examSubjectComponentId") REFERENCES "gradebook_exam_subject_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_supersedesScheduleId_fkey" FOREIGN KEY ("supersedesScheduleId") REFERENCES "gradebook_exam_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_examClassSectionId_fkey" FOREIGN KEY ("examClassSectionId") REFERENCES "gradebook_exam_class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_examSubjectComponentId_fkey" FOREIGN KEY ("examSubjectComponentId") REFERENCES "gradebook_exam_subject_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_teacherUserId_fkey" FOREIGN KEY ("teacherUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_mark_assignments_sourceClassSectionSubje_fkey" FOREIGN KEY ("sourceClassSectionSubjectId") REFERENCES "class_section_subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_jobs" ADD CONSTRAINT "gradebook_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_jobs" ADD CONSTRAINT "gradebook_jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_jobs" ADD CONSTRAINT "gradebook_jobs_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_domain_event_outbox" ADD CONSTRAINT "gradebook_domain_event_outbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_domain_event_outbox" ADD CONSTRAINT "gradebook_domain_event_outbox_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_domain_event_outbox" ADD CONSTRAINT "gradebook_domain_event_outbox_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_teacherMarkAssignmentId_fkey" FOREIGN KEY ("teacherMarkAssignmentId") REFERENCES "gradebook_teacher_mark_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_examClassSectionId_fkey" FOREIGN KEY ("examClassSectionId") REFERENCES "gradebook_exam_class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_entry_batches_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_markEntryBatchId_fkey" FOREIGN KEY ("markEntryBatchId") REFERENCES "gradebook_mark_entry_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_examSubjectComponentId_fkey" FOREIGN KEY ("examSubjectComponentId") REFERENCES "gradebook_exam_subject_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_mark_revisions" ADD CONSTRAINT "gradebook_student_mark_revisions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_mark_revisions" ADD CONSTRAINT "gradebook_student_mark_revisions_markEntryBatchId_fkey" FOREIGN KEY ("markEntryBatchId") REFERENCES "gradebook_mark_entry_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_mark_revisions" ADD CONSTRAINT "gradebook_student_mark_revisions_studentMarkId_fkey" FOREIGN KEY ("studentMarkId") REFERENCES "gradebook_student_marks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_workflow_events" ADD CONSTRAINT "gradebook_mark_workflow_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_workflow_events" ADD CONSTRAINT "gradebook_mark_workflow_events_markEntryBatchId_fkey" FOREIGN KEY ("markEntryBatchId") REFERENCES "gradebook_mark_entry_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_import_jobs" ADD CONSTRAINT "gradebook_exam_import_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_import_jobs" ADD CONSTRAINT "gradebook_exam_import_jobs_markEntryBatchId_fkey" FOREIGN KEY ("markEntryBatchId") REFERENCES "gradebook_mark_entry_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_import_rows" ADD CONSTRAINT "gradebook_exam_import_rows_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_exam_import_rows" ADD CONSTRAINT "gradebook_exam_import_rows_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "gradebook_exam_import_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_examClassSectionId_fkey" FOREIGN KEY ("examClassSectionId") REFERENCES "gradebook_exam_class_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_runs" ADD CONSTRAINT "gradebook_result_runs_supersedesResultRunId_fkey" FOREIGN KEY ("supersedesResultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_student_subject_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_student_subject_results_resultRunId_fkey" FOREIGN KEY ("resultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_student_subject_results_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_student_subject_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_student_subject_results_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_overall_results" ADD CONSTRAINT "gradebook_student_overall_results_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_overall_results" ADD CONSTRAINT "gradebook_student_overall_results_resultRunId_fkey" FOREIGN KEY ("resultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_overall_results" ADD CONSTRAINT "gradebook_student_overall_results_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_overall_results" ADD CONSTRAINT "gradebook_student_overall_results_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_mark_adjustments" ADD CONSTRAINT "gradebook_mark_adjustments_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_correction_requests" ADD CONSTRAINT "gradebook_correction_requests_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_correction_requests" ADD CONSTRAINT "gradebook_correction_requests_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_remark_templates" ADD CONSTRAINT "gradebook_remark_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_examSubjectId_fkey" FOREIGN KEY ("examSubjectId") REFERENCES "gradebook_exam_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_teacher_remarks" ADD CONSTRAINT "gradebook_teacher_remarks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "gradebook_remark_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_scheme_versions" ADD CONSTRAINT "gradebook_co_scholastic_scheme_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_scheme_versions" ADD CONSTRAINT "gradebook_co_scholastic_scheme_versions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_scheme_versions" ADD CONSTRAINT "gradebook_co_scholastic_scheme_versions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_areas" ADD CONSTRAINT "gradebook_co_scholastic_areas_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_areas" ADD CONSTRAINT "gradebook_co_scholastic_areas_schemeVersionId_fkey" FOREIGN KEY ("schemeVersionId") REFERENCES "gradebook_co_scholastic_scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_indicators" ADD CONSTRAINT "gradebook_co_scholastic_indicators_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_indicators" ADD CONSTRAINT "gradebook_co_scholastic_indicators_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "gradebook_co_scholastic_areas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_schemeVersionId_fkey" FOREIGN KEY ("schemeVersionId") REFERENCES "gradebook_co_scholastic_scheme_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_termId_fkey" FOREIGN KEY ("termId") REFERENCES "gradebook_exam_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_co_scholastic_entries" ADD CONSTRAINT "gradebook_co_scholastic_entries_indicatorId_fkey" FOREIGN KEY ("indicatorId") REFERENCES "gradebook_co_scholastic_indicators"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_summary_snapshots_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_summary_snapshots_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_summary_snapshots_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_summary_snapshots_termId_fkey" FOREIGN KEY ("termId") REFERENCES "gradebook_exam_terms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_summary_snapshots_resultRunId_fkey" FOREIGN KEY ("resultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_card_templates" ADD CONSTRAINT "gradebook_report_card_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_card_templates" ADD CONSTRAINT "gradebook_report_card_templates_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_card_templates" ADD CONSTRAINT "gradebook_report_card_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_card_template_versions" ADD CONSTRAINT "gradebook_report_card_template_versions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_card_template_versions" ADD CONSTRAINT "gradebook_report_card_template_versions_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "gradebook_report_card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_resultRunId_fkey" FOREIGN KEY ("resultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "gradebook_report_card_template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_attendanceSummarySnapshotId_fkey" FOREIGN KEY ("attendanceSummarySnapshotId") REFERENCES "gradebook_attendance_summary_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_supersedesReportCardId_fkey" FOREIGN KEY ("supersedesReportCardId") REFERENCES "gradebook_report_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_publications" ADD CONSTRAINT "gradebook_result_publications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_publications" ADD CONSTRAINT "gradebook_result_publications_examId_fkey" FOREIGN KEY ("examId") REFERENCES "gradebook_exams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_publications" ADD CONSTRAINT "gradebook_result_publications_resultRunId_fkey" FOREIGN KEY ("resultRunId") REFERENCES "gradebook_result_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_result_publications" ADD CONSTRAINT "gradebook_result_publications_supersedesPublicationId_fkey" FOREIGN KEY ("supersedesPublicationId") REFERENCES "gradebook_result_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_result_publications" ADD CONSTRAINT "gradebook_student_result_publications_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_result_publications" ADD CONSTRAINT "gradebook_student_result_publications_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "gradebook_result_publications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_result_publications" ADD CONSTRAINT "gradebook_student_result_publications_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_result_publications" ADD CONSTRAINT "gradebook_student_result_publications_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gradebook_student_result_publications" ADD CONSTRAINT "gradebook_student_result_publications_reportCardId_fkey" FOREIGN KEY ("reportCardId") REFERENCES "gradebook_report_cards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GradeBook policy invariants that are safer to enforce in PostgreSQL as well
-- as in the service layer.
ALTER TABLE "gradebook_exam_terms" ADD CONSTRAINT "gradebook_exam_terms_dates_check" CHECK ("endDate" >= "startDate");
ALTER TABLE "gradebook_exam_types" ADD CONSTRAINT "gradebook_exam_types_default_marks_check" CHECK (
  ("defaultMaximumMarks" IS NULL OR "defaultMaximumMarks" > 0) AND
  ("defaultPassingMarks" IS NULL OR "defaultPassingMarks" >= 0) AND
  ("defaultMaximumMarks" IS NULL OR "defaultPassingMarks" IS NULL OR "defaultPassingMarks" <= "defaultMaximumMarks") AND
  ("defaultWeightagePercent" IS NULL OR ("defaultWeightagePercent" >= 0 AND "defaultWeightagePercent" <= 100))
);
ALTER TABLE "gradebook_grade_scale_versions" ADD CONSTRAINT "gradebook_grade_scale_versions_precision_check" CHECK ("versionNumber" > 0 AND "decimalPlaces" BETWEEN 0 AND 4);
ALTER TABLE "gradebook_grade_rules" ADD CONSTRAINT "gradebook_grade_rules_range_check" CHECK ("minimumInclusive" <= "maximumInclusive");
ALTER TABLE "gradebook_calculation_rule_set_versions" ADD CONSTRAINT "gradebook_calculation_versions_version_check" CHECK ("versionNumber" > 0);
ALTER TABLE "gradebook_exam_subjects" ADD CONSTRAINT "gradebook_exam_subjects_marks_check" CHECK (
  ("maximumMarks" IS NULL OR "maximumMarks" > 0) AND
  ("passingMarks" IS NULL OR "passingMarks" >= 0) AND
  ("maximumMarks" IS NULL OR "passingMarks" IS NULL OR "passingMarks" <= "maximumMarks")
);
ALTER TABLE "gradebook_exam_subject_components" ADD CONSTRAINT "gradebook_exam_subject_components_marks_check" CHECK (
  "maximumMarks" > 0 AND
  ("passingMarks" IS NULL OR ("passingMarks" >= 0 AND "passingMarks" <= "maximumMarks")) AND
  ("weightagePercent" IS NULL OR ("weightagePercent" >= 0 AND "weightagePercent" <= 100)) AND
  ("decimalPlaces" IS NULL OR "decimalPlaces" BETWEEN 0 AND 4)
);
ALTER TABLE "gradebook_exam_schedules" ADD CONSTRAINT "gradebook_exam_schedules_time_check" CHECK ("startTime" < "endTime");
ALTER TABLE "gradebook_teacher_mark_assignments" ADD CONSTRAINT "gradebook_teacher_assignments_dates_check" CHECK ("validUntil" IS NULL OR "validFrom" IS NULL OR "validUntil" > "validFrom");
ALTER TABLE "gradebook_jobs" ADD CONSTRAINT "gradebook_jobs_attempts_check" CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0);
ALTER TABLE "gradebook_mark_entry_batches" ADD CONSTRAINT "gradebook_mark_batches_version_check" CHECK ("version" > 0);
ALTER TABLE "gradebook_student_marks" ADD CONSTRAINT "gradebook_student_marks_value_check" CHECK (
  NOT ("marksObtained" IS NOT NULL AND "specialStatus" IS NOT NULL) AND
  ("marksObtained" IS NULL OR "marksObtained" >= 0) AND
  "rowVersion" > 0
);
ALTER TABLE "gradebook_exam_import_jobs" ADD CONSTRAINT "gradebook_import_counts_check" CHECK (
  "templateVersion" > 0 AND "totalRowCount" >= 0 AND "validRowCount" >= 0 AND
  "invalidRowCount" >= 0 AND "warningRowCount" >= 0
);
ALTER TABLE "gradebook_student_subject_results" ADD CONSTRAINT "gradebook_subject_results_percentage_check" CHECK ("percentage" IS NULL OR ("percentage" >= 0 AND "percentage" <= 100));
ALTER TABLE "gradebook_student_overall_results" ADD CONSTRAINT "gradebook_overall_results_percentage_check" CHECK ("overallPercentage" IS NULL OR ("overallPercentage" >= 0 AND "overallPercentage" <= 100));
ALTER TABLE "gradebook_attendance_summary_snapshots" ADD CONSTRAINT "gradebook_attendance_snapshots_counts_check" CHECK (
  "periodEnd" >= "periodStart" AND "eligibleDays" >= 0 AND "markedDays" >= 0 AND "unmarkedDays" >= 0 AND
  "presentDays" >= 0 AND "absentDays" >= 0 AND "lateDays" >= 0 AND "halfDays" >= 0 AND "leaveDays" >= 0 AND "excusedDays" >= 0 AND
  ("attendancePercentage" IS NULL OR ("attendancePercentage" >= 0 AND "attendancePercentage" <= 100)) AND "version" > 0
);
ALTER TABLE "gradebook_report_card_template_versions" ADD CONSTRAINT "gradebook_report_card_template_versions_version_check" CHECK ("versionNumber" > 0);
ALTER TABLE "gradebook_report_cards" ADD CONSTRAINT "gradebook_report_cards_version_check" CHECK ("version" > 0);
ALTER TABLE "gradebook_result_publications" ADD CONSTRAINT "gradebook_result_publications_version_check" CHECK ("publicationVersion" > 0);

-- Hosted direct-client access is intentionally denied. Server-side Prisma,
-- session context, branch checks and RBAC remain authoritative.
ALTER TABLE "gradebook_assessment_schemes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_assessment_scheme_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_terms" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_grade_scales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_grade_scale_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_grade_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_calculation_rule_sets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_calculation_rule_set_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_class_sections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_subjects" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_assessment_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_subject_components" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_schedules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_teacher_mark_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_domain_event_outbox" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_mark_entry_batches" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_student_marks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_student_mark_revisions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_mark_workflow_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_import_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_exam_import_rows" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_result_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_student_subject_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_student_overall_results" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_mark_adjustments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_correction_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_remark_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_teacher_remarks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_co_scholastic_scheme_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_co_scholastic_areas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_co_scholastic_indicators" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_co_scholastic_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_attendance_summary_snapshots" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_report_card_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_report_card_template_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_report_cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_result_publications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "gradebook_student_result_publications" ENABLE ROW LEVEL SECURITY;

-- Add the expanded permission catalogue without enabling GradeBook for any
-- tenant. Descriptions are operational and contain no school data.
INSERT INTO "permissions" ("id", "code", "module", "description", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), code, 'GRADEBOOK'::"PermissionModule", description, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (
  SELECT code, 'GradeBook capability: ' || replace(code, '.', ' ') AS description
  FROM unnest(ARRAY[
    'gradebook.dashboard.view',
    'gradebook.scheme.view', 'gradebook.scheme.manage', 'gradebook.scheme.activate',
    'gradebook.term.view', 'gradebook.term.manage', 'gradebook.term.activate', 'gradebook.term.close', 'gradebook.term.archive',
    'gradebook.exam_type.view', 'gradebook.exam_type.manage', 'gradebook.exam_type.activate', 'gradebook.exam_type.archive',
    'gradebook.grade_scale.view', 'gradebook.grade_scale.manage', 'gradebook.grade_scale.activate', 'gradebook.grade_scale.archive',
    'gradebook.calculation_rules.view', 'gradebook.calculation_rules.manage', 'gradebook.calculation_rules.activate',
    'gradebook.component.view', 'gradebook.component.manage', 'gradebook.settings.manage',
    'gradebook.exam.view', 'gradebook.exam.create', 'gradebook.exam.update', 'gradebook.exam.activate', 'gradebook.exam.cancel', 'gradebook.exam.readiness.view',
    'gradebook.exam.schedule.view', 'gradebook.exam.schedule.manage', 'gradebook.exam.schedule.publish', 'gradebook.exam.schedule.cancel',
    'gradebook.assignment.view', 'gradebook.assignment.manage', 'gradebook.assignment.override',
    'gradebook.marks.view', 'gradebook.marks.save_draft', 'gradebook.marks.submit', 'gradebook.marks.verify', 'gradebook.marks.return', 'gradebook.marks.approve', 'gradebook.marks.lock',
    'gradebook.marks.progress.view', 'gradebook.marks.view_progress', 'gradebook.marks.special_status.enter', 'gradebook.marks.special_status.verify',
    'gradebook.import.download_template', 'gradebook.import.create', 'gradebook.import.validate', 'gradebook.import.apply', 'gradebook.import.cancel', 'gradebook.marks.export',
    'gradebook.adjustment.request', 'gradebook.adjustment.review', 'gradebook.adjustment.approve', 'gradebook.adjustment.reject', 'gradebook.adjustment.apply', 'gradebook.adjustment.view_audit',
    'gradebook.marks.reopen.request', 'gradebook.marks.reopen.review', 'gradebook.marks.reopen.approve', 'gradebook.marks.reopen.execute',
    'gradebook.result.calculate', 'gradebook.result.view', 'gradebook.result.view_preview', 'gradebook.result.approve', 'gradebook.result.recalculate',
    'gradebook.result.publication.prepare', 'gradebook.result.publish', 'gradebook.result.revoke', 'gradebook.result.withhold', 'gradebook.result.release_withheld',
    'gradebook.result.view_published', 'gradebook.result.view_own', 'gradebook.result.view_linked_student',
    'gradebook.result.correction.request', 'gradebook.result.correction.approve', 'gradebook.result.republish',
    'gradebook.remark.subject.enter', 'gradebook.remark.enter_subject', 'gradebook.remark.class_teacher.enter', 'gradebook.remark.principal.enter',
    'gradebook.remark.template.manage', 'gradebook.remark.verify', 'gradebook.remark.approve',
    'gradebook.coscholastic.view', 'gradebook.coscholastic.manage_areas', 'gradebook.coscholastic.enter', 'gradebook.coscholastic.submit', 'gradebook.coscholastic.verify', 'gradebook.coscholastic.approve',
    'gradebook.attendance_summary.view', 'gradebook.attendance_summary.generate', 'gradebook.attendance_summary.refresh',
    'gradebook.reportcard.template.view', 'gradebook.reportcard.template.manage', 'gradebook.reportcard.preview', 'gradebook.reportcard.generate', 'gradebook.reportcard.approve', 'gradebook.reportcard.view', 'gradebook.reportcard.reprint',
    'gradebook.history.view', 'gradebook.history.view_student', 'gradebook.history.view_versions', 'gradebook.history.reprint', 'gradebook.history.export_transcript',
    'gradebook.analytics.view_institution', 'gradebook.analytics.view_branch', 'gradebook.analytics.view_class_section', 'gradebook.analytics.view_subject', 'gradebook.analytics.view_student', 'gradebook.analytics.view_own', 'gradebook.analytics.export',
    'gradebook.audit.view'
  ]::text[]) AS permission_codes(code)
) AS permission_rows
ON CONFLICT ("code") DO UPDATE SET
  "module" = EXCLUDED."module",
  "description" = EXCLUDED."description",
  "isActive" = true,
  "updatedAt" = CURRENT_TIMESTAMP;

-- School Principals and legacy governance aliases receive the expanded
-- catalogue. Platform ADMINISTRATOR remains a separate, zero-tenant role.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."module" = 'GRADEBOOK'::"PermissionModule"
WHERE role."code" IN ('PRINCIPAL', 'TENANT_OWNER', 'SUPER_ADMIN', 'ADMIN')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;

-- Teachers receive operational permissions only. Exact exam/class/subject
-- assignment checks remain mandatory in every marks/result service.
INSERT INTO "role_permissions" ("id", "tenantId", "roleId", "permissionId", "createdAt")
SELECT gen_random_uuid(), role."tenantId", role."id", permission."id", CURRENT_TIMESTAMP
FROM "roles" AS role
JOIN "permissions" AS permission ON permission."code" IN (
  'gradebook.view', 'gradebook.marks.enter', 'gradebook.report',
  'gradebook.dashboard.view', 'gradebook.exam.view', 'gradebook.exam.schedule.view',
  'gradebook.assignment.view', 'gradebook.marks.view', 'gradebook.marks.save_draft',
  'gradebook.marks.submit', 'gradebook.marks.progress.view', 'gradebook.marks.special_status.enter',
  'gradebook.import.download_template', 'gradebook.import.create', 'gradebook.import.validate',
  'gradebook.import.apply', 'gradebook.import.cancel', 'gradebook.marks.export',
  'gradebook.result.view', 'gradebook.result.view_preview', 'gradebook.result.view_published',
  'gradebook.remark.subject.enter', 'gradebook.remark.class_teacher.enter',
  'gradebook.coscholastic.view', 'gradebook.coscholastic.enter', 'gradebook.coscholastic.submit',
  'gradebook.attendance_summary.view', 'gradebook.reportcard.view',
  'gradebook.history.view', 'gradebook.history.view_student',
  'gradebook.analytics.view_class_section', 'gradebook.analytics.view_subject', 'gradebook.analytics.view_student'
)
WHERE role."code" IN ('TEACHER', 'CLASS_TEACHER')
ON CONFLICT ("tenantId", "roleId", "permissionId") DO NOTHING;
