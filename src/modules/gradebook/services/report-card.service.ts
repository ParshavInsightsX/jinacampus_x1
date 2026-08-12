import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { ensureGradebookStorageBucket, getGradebookStorageClient } from "@/lib/storage/supabase-storage";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  createReportCardTemplateSchema,
  generateReportCardsSchema,
  preparePublicationSchema,
  publicationIdSchema,
  reportCardIdSchema,
  reportCardTemplateConfigurationSchema,
  reportCardTemplateVersionIdSchema,
  revokePublicationSchema
} from "@/modules/gradebook/schemas/report-card.schemas";
import { createAttendanceSummarySnapshot } from "@/modules/gradebook/services/attendance-summary.service";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { renderReportCardPdf, type ReportCardPdfSnapshot } from "@/modules/gradebook/services/report-card-pdf.service";
import { resolveGradebookRequestContext, type GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

function displayStudentName(student: { displayName: string | null; fullName: string | null; firstName: string; middleName: string | null; lastName: string | null }) {
  return student.displayName || student.fullName || [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

async function resolveInstitution(request: GradebookRequestContext) {
  const branch = await db.branch.findFirst({
    where: { id: request.branchId, tenantId: request.tenantId },
    include: { institution: true }
  });
  if (!branch) throw notFound("BRANCH_NOT_FOUND");
  return branch;
}

export async function createReportCardTemplate(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.template.manage", feature: "reportCards" });
  const data = createReportCardTemplateSchema.parse(input);
  const branch = await resolveInstitution(request);
  const configurationHash = hashCanonicalJson(data.configuration);
  return db.$transaction(async (tx) => {
    const template = await tx.gradebookReportCardTemplate.create({
      data: {
        tenantId: request.tenantId,
        institutionId: branch.institutionId,
        branchId: request.branchId,
        code: data.code,
        name: data.name,
        description: data.description,
        createdById: request.userId,
        updatedById: request.userId,
        versions: {
          create: {
            tenantId: request.tenantId,
            versionNumber: 1,
            configurationJson: data.configuration,
            configurationHash,
            locale: data.locale,
            createdById: request.userId
          }
        }
      },
      include: { versions: true }
    });
    await writeAuditLog({
      ctx: request,
      action: "gradebook.report_card.template_created",
      entityType: "GradebookReportCardTemplate",
      entityId: template.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { code: template.code, name: template.name, configurationHash },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return template;
  });
}

export async function activateReportCardTemplateVersion(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.template.manage", feature: "reportCards" });
  const { templateVersionId } = reportCardTemplateVersionIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const version = await tx.gradebookReportCardTemplateVersion.findFirst({
      where: { id: templateVersionId, tenantId: request.tenantId, template: { branchId: request.branchId } },
      include: { template: true }
    });
    if (!version) throw notFound("GRADEBOOK_REPORT_CARD_TEMPLATE_VERSION_NOT_FOUND");
    if (version.status !== "DRAFT") throw conflict("GRADEBOOK_REPORT_CARD_TEMPLATE_NOT_ACTIVATABLE");
    reportCardTemplateConfigurationSchema.parse(version.configurationJson);
    await tx.gradebookReportCardTemplateVersion.updateMany({
      where: { tenantId: request.tenantId, templateId: version.templateId, status: "ACTIVE" },
      data: { status: "SUPERSEDED" }
    });
    const updated = await tx.gradebookReportCardTemplateVersion.update({
      where: { id: version.id },
      data: { status: "ACTIVE", activatedAt: new Date(), activatedById: request.userId }
    });
    await tx.gradebookReportCardTemplate.update({ where: { id: version.templateId }, data: { status: "ACTIVE", updatedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: "gradebook.report_card.template_activated",
      entityType: "GradebookReportCardTemplateVersion",
      entityId: version.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { status: updated.status, versionNumber: updated.versionNumber, configurationHash: updated.configurationHash },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return updated;
  });
}

async function loadReportRun(request: GradebookRequestContext, resultRunId: string) {
  const run = await db.gradebookResultRun.findFirst({
    where: { id: resultRunId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
    include: {
      exam: { include: { term: true } },
      examClassSection: { include: { classSection: { include: { academicClass: true, section: true } } } },
      subjectResults: { include: { examSubject: { include: { subject: true } } } },
      overallResults: {
        include: {
          enrollment: { include: { student: true, academicYear: true, branch: { include: { institution: true } }, classSection: { include: { academicClass: true, section: true } } } }
        }
      }
    }
  });
  if (!run) throw notFound("GRADEBOOK_RESULT_RUN_NOT_FOUND");
  return run;
}

export async function generateReportCards(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.generate", feature: "reportCards" });
  const data = generateReportCardsSchema.parse(input);
  const run = await loadReportRun(request, data.resultRunId);
  if (run.status !== "APPROVED") throw conflict("GRADEBOOK_RESULT_RUN_NOT_APPROVED");
  if (!run.examClassSection) throw conflict("GRADEBOOK_REPORT_CARD_CLASS_SCOPE_REQUIRED");
  const templateVersion = await db.gradebookReportCardTemplateVersion.findFirst({
    where: { id: data.templateVersionId, tenantId: request.tenantId, status: "ACTIVE", template: { branchId: request.branchId } },
    include: { template: true }
  });
  if (!templateVersion) throw notFound("GRADEBOOK_REPORT_CARD_TEMPLATE_VERSION_NOT_FOUND");
  const configuration = reportCardTemplateConfigurationSchema.parse(templateVersion.configurationJson);
  const periodStart = data.attendancePeriodStart ?? run.exam.term.startDate;
  const periodEnd = data.attendancePeriodEnd ?? run.exam.term.endDate;
  const subjectResultsByEnrollment = new Map<string, typeof run.subjectResults>();
  for (const result of run.subjectResults) {
    const values = subjectResultsByEnrollment.get(result.enrollmentId) ?? [];
    values.push(result);
    subjectResultsByEnrollment.set(result.enrollmentId, values);
  }
  await ensureGradebookStorageBucket();
  const { client, bucket, reportCardMaxBytes } = getGradebookStorageClient();
  const summary = { requested: run.overallResults.length, generated: 0, failed: 0, failures: [] as Array<{ enrollmentId: string; code: string }> };
  for (const overall of run.overallResults) {
    let reportCardId: string | null = null;
    try {
      const attendance = configuration.showAttendance
        ? await createAttendanceSummarySnapshot(ctx, { enrollmentId: overall.enrollmentId, periodStart, periodEnd, termId: run.exam.termId, resultRunId: run.id })
        : null;
      const latest = await db.gradebookReportCard.findFirst({
        where: { tenantId: request.tenantId, enrollmentId: overall.enrollmentId, resultRunId: run.id },
        orderBy: { version: "desc" }
      });
      if (latest && ["APPROVED", "PUBLISHED"].includes(latest.status)) {
        summary.generated += 1;
        continue;
      }
      const institution = overall.enrollment.branch.institution;
      const classSection = overall.enrollment.classSection;
      const subjects = subjectResultsByEnrollment.get(overall.enrollmentId) ?? [];
      const generatedAt = new Date();
      const snapshot: ReportCardPdfSnapshot = {
        institution: {
          name: institution.displayName || institution.name,
          branch: overall.enrollment.branch.name,
          academicYear: overall.enrollment.academicYear.name
        },
        report: { title: configuration.title, examName: run.exam.name, generatedAt: generatedAt.toISOString() },
        student: {
          name: displayStudentName(overall.enrollment.student),
          scholarNumber: overall.enrollment.student.admissionNumber,
          classSection: `${classSection.academicClass.name} - ${classSection.section.name}`,
          rollNumber: overall.enrollment.rollNumber
        },
        subjects: subjects.map((subjectResult) => ({
          name: subjectResult.examSubject.subject.name,
          marks: subjectResult.rawMarks?.toString() ?? null,
          maximumMarks: subjectResult.maximumMarks?.toString() ?? null,
          percentage: subjectResult.percentage?.toString() ?? null,
          grade: subjectResult.letterGrade,
          status: subjectResult.resultStatus
        })),
        overall: {
          totalMarks: overall.totalMarks?.toString() ?? null,
          maximumMarks: overall.maximumMarks?.toString() ?? null,
          percentage: overall.overallPercentage?.toString() ?? null,
          grade: overall.overallLetterGrade,
          status: overall.resultStatus,
          promotionEligible: overall.promotionEligible === true
        },
        attendance: attendance ? {
          eligibleDays: attendance.eligibleDays,
          markedDays: attendance.markedDays,
          presentDays: attendance.presentDays.toString(),
          absentDays: attendance.absentDays.toString(),
          percentage: attendance.attendancePercentage?.toString() ?? null
        } : null,
        signatureLabels: configuration.signatureLabels
      };
      const snapshotHash = hashCanonicalJson(snapshot);
      const version = (latest?.version ?? 0) + 1;
      const queued = await db.gradebookReportCard.create({
        data: {
          tenantId: request.tenantId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          enrollmentId: overall.enrollmentId,
          studentId: overall.studentId,
          resultRunId: run.id,
          templateVersionId: templateVersion.id,
          attendanceSummarySnapshotId: attendance?.id,
          version,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          snapshotHash,
          status: "GENERATING",
          supersedesReportCardId: latest?.id,
          createdById: request.userId
        }
      });
      reportCardId = queued.id;
      const pdf = await renderReportCardPdf(snapshot);
      if (pdf.byteLength > reportCardMaxBytes) throw new Error("GRADEBOOK_REPORT_CARD_FILE_TOO_LARGE");
      const pdfChecksum = createHash("sha256").update(pdf).digest("hex");
      const objectKey = `${request.tenantId}/${request.branchId}/${request.academicYearId}/report-cards/${run.id}/${overall.studentId}/v${version}-${snapshotHash.slice(0, 12)}.pdf`;
      const { error: uploadError } = await client.storage.from(bucket).upload(objectKey, pdf, { contentType: "application/pdf", cacheControl: "0", upsert: false });
      if (uploadError) throw new Error("GRADEBOOK_REPORT_CARD_UPLOAD_FAILED");
      try {
        await db.$transaction(async (tx) => {
          await tx.gradebookReportCard.update({ where: { id: queued.id }, data: { status: "GENERATED", pdfObjectKey: objectKey, pdfChecksum, generatedAt } });
          if (attendance && attendance.status !== "FROZEN") {
            await tx.gradebookAttendanceSummarySnapshot.update({ where: { id: attendance.id }, data: { status: "FROZEN", frozenAt: generatedAt } });
          }
          await writeAuditLog({
            ctx: request,
            action: GRADEBOOK_AUDIT_EVENTS.REPORT_CARDS_GENERATED,
            entityType: "GradebookReportCard",
            entityId: queued.id,
            branchId: request.branchId,
            academicYearId: request.academicYearId,
            after: { resultRunId: run.id, studentId: overall.studentId, version, snapshotHash, pdfChecksum, status: "GENERATED" },
            metadata: { correlationId: request.correlationId }
          }, tx);
        });
      } catch (error) {
        await client.storage.from(bucket).remove([objectKey]);
        throw error;
      }
      summary.generated += 1;
    } catch (error) {
      const code = error instanceof Error && /^GRADEBOOK_/.test(error.message) ? error.message : "GRADEBOOK_REPORT_CARD_GENERATION_FAILED";
      if (reportCardId) await db.gradebookReportCard.updateMany({ where: { id: reportCardId, tenantId: request.tenantId }, data: { status: "FAILED", generationErrorCode: code } });
      summary.failed += 1;
      summary.failures.push({ enrollmentId: overall.enrollmentId, code });
    }
  }
  return summary;
}

export async function approveReportCard(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.approve", feature: "reportCards" });
  const { reportCardId } = reportCardIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const card = await tx.gradebookReportCard.findFirst({ where: { id: reportCardId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
    if (!card) throw notFound("GRADEBOOK_REPORT_CARD_NOT_FOUND");
    if (card.status !== "GENERATED") throw conflict("GRADEBOOK_REPORT_CARD_NOT_APPROVABLE");
    if (card.createdById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
    const updated = await tx.gradebookReportCard.update({ where: { id: card.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.REPORT_CARD_APPROVED,
      entityType: "GradebookReportCard",
      entityId: card.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: card.status },
      after: { status: updated.status, snapshotHash: card.snapshotHash, pdfChecksum: card.pdfChecksum },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return updated;
  });
}

export async function prepareResultPublication(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.publication.prepare", feature: "publication" });
  const data = preparePublicationSchema.parse(input);
  const run = await loadReportRun(request, data.resultRunId);
  if (run.status !== "APPROVED") throw conflict("GRADEBOOK_RESULT_RUN_NOT_APPROVED");
  const cards = await db.gradebookReportCard.findMany({ where: { tenantId: request.tenantId, resultRunId: run.id, status: "APPROVED" }, orderBy: { version: "desc" } });
  const latestByEnrollment = new Map<string, typeof cards[number]>();
  for (const card of cards) if (!latestByEnrollment.has(card.enrollmentId)) latestByEnrollment.set(card.enrollmentId, card);
  const missing = run.overallResults.filter((result) => !latestByEnrollment.has(result.enrollmentId));
  if (missing.length > 0) throw conflict("GRADEBOOK_REPORT_CARDS_NOT_READY");
  const latest = await db.gradebookResultPublication.findFirst({ where: { tenantId: request.tenantId, resultRunId: run.id }, orderBy: { publicationVersion: "desc" } });
  const readinessSnapshot = { resultRunStatus: run.status, eligibleCount: run.overallResults.length, approvedReportCardCount: latestByEnrollment.size, checkedAt: new Date().toISOString() };
  return db.$transaction(async (tx) => {
    const publication = await tx.gradebookResultPublication.create({
      data: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        examId: run.examId,
        resultRunId: run.id,
        audience: data.audience,
        publicationVersion: (latest?.publicationVersion ?? 0) + 1,
        publishAt: data.publishAt,
        status: data.publishAt > new Date() ? "SCHEDULED" : "DRAFT",
        readinessSnapshotJson: readinessSnapshot,
        supersedesPublicationId: latest?.id,
        preparedById: request.userId,
        reason: data.reason,
        studentPublications: {
          create: run.overallResults.map((result) => ({
            tenantId: request.tenantId,
            enrollmentId: result.enrollmentId,
            studentId: result.studentId,
            reportCardId: latestByEnrollment.get(result.enrollmentId)!.id,
            isEligible: result.resultStatus !== "WITHHELD",
            exclusionCode: result.resultStatus === "WITHHELD" ? "RESULT_WITHHELD" : null
          }))
        }
      },
      include: { studentPublications: true }
    });
    await writeAuditLog({
      ctx: request,
      action: "gradebook.result.publication_prepared",
      entityType: "GradebookResultPublication",
      entityId: publication.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { status: publication.status, audience: publication.audience, publishAt: publication.publishAt, publicationVersion: publication.publicationVersion, readinessSnapshot },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return publication;
  });
}

export async function publishResults(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.publish", feature: "publication" });
  const { publicationId } = publicationIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const publication = await tx.gradebookResultPublication.findFirst({
      where: { id: publicationId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
      include: { resultRun: true, studentPublications: true }
    });
    if (!publication) throw notFound("GRADEBOOK_PUBLICATION_NOT_FOUND");
    if (!["DRAFT", "SCHEDULED"].includes(publication.status)) throw conflict("GRADEBOOK_PUBLICATION_NOT_PUBLISHABLE");
    if (publication.publishAt > new Date()) throw conflict("GRADEBOOK_PUBLICATION_NOT_DUE");
    if (publication.resultRun.status !== "APPROVED") throw conflict("GRADEBOOK_RESULT_RUN_NOT_APPROVED");
    if (publication.preparedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
    const publishedAt = new Date();
    const updated = await tx.gradebookResultPublication.update({ where: { id: publication.id }, data: { status: "PUBLISHED", publishedAt, publishedById: request.userId } });
    await tx.gradebookStudentResultPublication.updateMany({ where: { tenantId: request.tenantId, publicationId: publication.id, isEligible: true }, data: { publishedAt } });
    const reportCardIds = publication.studentPublications.filter((item) => item.isEligible && item.reportCardId).map((item) => item.reportCardId!);
    await tx.gradebookReportCard.updateMany({ where: { tenantId: request.tenantId, id: { in: reportCardIds }, status: "APPROVED" }, data: { status: "PUBLISHED", publishedAt } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.RESULT_PUBLISHED,
      entityType: "GradebookResultPublication",
      entityId: publication.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: publication.status },
      after: { status: updated.status, publishedAt, eligibleCount: reportCardIds.length },
      metadata: { correlationId: request.correlationId }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: "gradebook.result.published.v1",
      aggregateType: "GradebookResultPublication",
      aggregateId: publication.id,
      payload: { publicationId: publication.id, resultRunId: publication.resultRunId, audience: publication.audience, eligibleCount: reportCardIds.length },
      idempotencyKey: `publication:${publication.id}:published`
    });
    return updated;
  });
}

export async function revokeResultPublication(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.result.revoke", feature: "publication" });
  const data = revokePublicationSchema.parse(input);
  return db.$transaction(async (tx) => {
    const publication = await tx.gradebookResultPublication.findFirst({
      where: { id: data.publicationId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
      include: { studentPublications: true }
    });
    if (!publication) throw notFound("GRADEBOOK_PUBLICATION_NOT_FOUND");
    if (publication.status !== "PUBLISHED") throw conflict("GRADEBOOK_PUBLICATION_NOT_REVOCABLE");
    const revokedAt = new Date();
    const updated = await tx.gradebookResultPublication.update({ where: { id: publication.id }, data: { status: "REVOKED", revokedAt, revokedById: request.userId, reason: data.reason } });
    const reportCardIds = publication.studentPublications.flatMap((item) => item.reportCardId ? [item.reportCardId] : []);
    await tx.gradebookReportCard.updateMany({ where: { tenantId: request.tenantId, id: { in: reportCardIds }, status: "PUBLISHED" }, data: { status: "REVOKED", revokedAt, revokedById: request.userId, revocationReason: data.reason } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.RESULT_REVOKED,
      entityType: "GradebookResultPublication",
      entityId: publication.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: publication.status },
      after: { status: updated.status, revokedAt, reason: data.reason },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return updated;
  });
}

async function requireReportCardAccess(request: GradebookRequestContext, reportCardId: string) {
  const card = await db.gradebookReportCard.findFirst({
    where: { id: reportCardId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId },
    include: { resultRun: true }
  });
  if (!card) throw notFound("GRADEBOOK_REPORT_CARD_NOT_FOUND");
  const broadAccess = request.permissions.has("gradebook.reportcard.approve") || request.permissions.has("gradebook.result.publish");
  if (!broadAccess) {
    const assignment = await db.gradebookTeacherMarkAssignment.findFirst({
      where: { tenantId: request.tenantId, examId: card.resultRun.examId, examClassSectionId: card.resultRun.examClassSectionId ?? undefined, teacherUserId: request.userId, status: "ACTIVE" },
      select: { id: true }
    });
    if (!assignment) throw notFound("GRADEBOOK_REPORT_CARD_NOT_FOUND");
  }
  return card;
}

export async function createReportCardDownloadUrl(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.reportcard.view", feature: "reportCards" });
  const { reportCardId } = reportCardIdSchema.parse(input);
  const card = await requireReportCardAccess(request, reportCardId);
  if (!card.pdfObjectKey || !card.pdfChecksum || !["GENERATED", "APPROVED", "PUBLISHED"].includes(card.status)) throw conflict("GRADEBOOK_REPORT_CARD_FILE_NOT_AVAILABLE");
  const { client, bucket } = getGradebookStorageClient();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(card.pdfObjectKey, 60, { download: `report-card-v${card.version}.pdf` });
  if (error || !data?.signedUrl) throw new AppError("GRADEBOOK_REPORT_CARD_DOWNLOAD_FAILED", "GRADEBOOK_REPORT_CARD_DOWNLOAD_FAILED", 503);
  await writeAuditLog({
    ctx: request,
    action: "gradebook.report_card.downloaded",
    entityType: "GradebookReportCard",
    entityId: card.id,
    branchId: request.branchId,
    academicYearId: request.academicYearId,
    metadata: { correlationId: request.correlationId, version: card.version, snapshotHash: card.snapshotHash }
  });
  return data.signedUrl;
}
