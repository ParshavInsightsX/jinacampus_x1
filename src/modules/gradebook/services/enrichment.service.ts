import type { Prisma } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import {
  coScholasticSchemeIdSchema,
  createCoScholasticSchemeSchema,
  saveCoScholasticEntriesSchema,
  saveTeacherRemarkSchema
} from "@/modules/gradebook/schemas/enrichment.schemas";
import { resolveGradebookRequestContext, type GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

async function requireClassTeacherOrManager(request: GradebookRequestContext, classSectionId: string) {
  if (request.permissions.has("gradebook.coscholastic.approve") || request.permissions.has("gradebook.remark.principal.enter")) return;
  const classSection = await db.classSection.findFirst({
    where: { id: classSectionId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, classTeacherUserId: request.userId },
    select: { id: true }
  });
  if (!classSection) throw notFound("GRADEBOOK_CLASS_SECTION_NOT_FOUND");
}

export async function createCoScholasticScheme(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.coscholastic.manage_areas", feature: "coScholastic" });
  const data = createCoScholasticSchemeSchema.parse(input);
  const branch = await db.branch.findFirst({ where: { id: request.branchId, tenantId: request.tenantId }, select: { institutionId: true } });
  if (!branch) throw notFound("BRANCH_NOT_FOUND");
  const latest = await db.gradebookCoScholasticSchemeVersion.findFirst({ where: { tenantId: request.tenantId, code: data.code }, orderBy: { versionNumber: "desc" } });
  const configurationHash = hashCanonicalJson(data);
  return db.$transaction(async (tx) => {
    const scheme = await tx.gradebookCoScholasticSchemeVersion.create({
      data: {
        tenantId: request.tenantId,
        institutionId: branch.institutionId,
        academicYearId: request.academicYearId,
        code: data.code,
        name: data.name,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        ratingScaleJson: data.ratingScale,
        configurationHash,
        createdById: request.userId,
        areas: {
          create: data.areas.map((area, areaIndex) => ({
            tenantId: request.tenantId,
            code: area.code,
            name: area.name,
            description: area.description,
            category: area.category,
            displayOrder: areaIndex + 1,
            indicators: {
              create: area.indicators.map((indicator, indicatorIndex) => ({
                tenantId: request.tenantId,
                code: indicator.code,
                name: indicator.name,
                description: indicator.description,
                displayOrder: indicatorIndex + 1,
                remarkRequired: indicator.remarkRequired
              }))
            }
          }))
        }
      },
      include: { areas: { include: { indicators: true } } }
    });
    await writeAuditLog({
      ctx: request,
      action: "gradebook.coscholastic.scheme_created",
      entityType: "GradebookCoScholasticSchemeVersion",
      entityId: scheme.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { code: scheme.code, versionNumber: scheme.versionNumber, configurationHash, areaCount: data.areas.length },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return scheme;
  });
}

export async function activateCoScholasticScheme(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.coscholastic.manage_areas", feature: "coScholastic" });
  const { schemeVersionId } = coScholasticSchemeIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scheme = await tx.gradebookCoScholasticSchemeVersion.findFirst({ where: { id: schemeVersionId, tenantId: request.tenantId, academicYearId: request.academicYearId } });
    if (!scheme) throw notFound("GRADEBOOK_COSCHOLASTIC_SCHEME_NOT_FOUND");
    if (scheme.status !== "DRAFT") throw conflict("GRADEBOOK_COSCHOLASTIC_SCHEME_NOT_ACTIVATABLE");
    await tx.gradebookCoScholasticSchemeVersion.updateMany({ where: { tenantId: request.tenantId, code: scheme.code, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    const updated = await tx.gradebookCoScholasticSchemeVersion.update({ where: { id: scheme.id }, data: { status: "ACTIVE", activatedAt: new Date(), activatedById: request.userId } });
    await writeAuditLog({ ctx: request, action: "gradebook.coscholastic.scheme_activated", entityType: "GradebookCoScholasticSchemeVersion", entityId: scheme.id, branchId: request.branchId, academicYearId: request.academicYearId, after: { status: updated.status, configurationHash: updated.configurationHash }, metadata: { correlationId: request.correlationId } }, tx);
    return updated;
  });
}

export async function saveCoScholasticEntries(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.coscholastic.enter", feature: "coScholastic" });
  const data = saveCoScholasticEntriesSchema.parse(input);
  const scheme = await db.gradebookCoScholasticSchemeVersion.findFirst({
    where: { id: data.schemeVersionId, tenantId: request.tenantId, academicYearId: request.academicYearId, status: "ACTIVE" },
    include: { areas: { include: { indicators: true } } }
  });
  if (!scheme) throw notFound("GRADEBOOK_COSCHOLASTIC_SCHEME_NOT_FOUND");
  const term = await db.gradebookExamTerm.findFirst({ where: { id: data.termId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!term) throw notFound("GRADEBOOK_TERM_NOT_FOUND");
  const indicatorById = new Map(scheme.areas.flatMap((area) => area.indicators).map((indicator) => [indicator.id, indicator]));
  const ratingCodes = new Set((scheme.ratingScaleJson as Array<{ code?: unknown }>).flatMap((rating) => typeof rating.code === "string" ? [rating.code] : []));
  const enrollmentIds = Array.from(new Set(data.entries.map((entry) => entry.enrollmentId)));
  const enrollments = await db.enrollment.findMany({ where: { tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, id: { in: enrollmentIds }, status: "ACTIVE" }, select: { id: true, studentId: true, classSectionId: true } });
  if (enrollments.length !== enrollmentIds.length) throw notFound("GRADEBOOK_ENROLLMENT_NOT_FOUND");
  const enrollmentById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  for (const classSectionId of new Set(enrollments.map((enrollment) => enrollment.classSectionId))) await requireClassTeacherOrManager(request, classSectionId);
  for (const entry of data.entries) {
    const indicator = indicatorById.get(entry.indicatorId);
    if (!indicator) throw notFound("GRADEBOOK_COSCHOLASTIC_INDICATOR_NOT_FOUND");
    if (!ratingCodes.has(entry.ratingCode)) throw new AppError("GRADEBOOK_COSCHOLASTIC_RATING_INVALID", "GRADEBOOK_COSCHOLASTIC_RATING_INVALID", 400);
    if (indicator.remarkRequired && !entry.observation) throw new AppError("GRADEBOOK_COSCHOLASTIC_OBSERVATION_REQUIRED", "GRADEBOOK_COSCHOLASTIC_OBSERVATION_REQUIRED", 400);
  }
  return db.$transaction(async (tx) => {
    for (const entry of data.entries) {
      const enrollment = enrollmentById.get(entry.enrollmentId)!;
      await tx.gradebookCoScholasticEntry.upsert({
        where: { tenantId_schemeVersionId_termId_enrollmentId_indicatorId: { tenantId: request.tenantId, schemeVersionId: scheme.id, termId: term.id, enrollmentId: enrollment.id, indicatorId: entry.indicatorId } },
        create: { tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, schemeVersionId: scheme.id, termId: term.id, enrollmentId: enrollment.id, studentId: enrollment.studentId, indicatorId: entry.indicatorId, ratingCode: entry.ratingCode, observation: entry.observation, evaluatorUserId: request.userId },
        update: { ratingCode: entry.ratingCode, observation: entry.observation, status: "DRAFT", evaluatorUserId: request.userId, approvedAt: null, approvedById: null }
      });
    }
    await writeAuditLog({ ctx: request, action: "gradebook.coscholastic.entries_saved", entityType: "GradebookCoScholasticSchemeVersion", entityId: scheme.id, branchId: request.branchId, academicYearId: request.academicYearId, after: { termId: term.id, entryCount: data.entries.length, enrollmentCount: enrollmentIds.length }, metadata: { correlationId: request.correlationId } }, tx);
    return { savedCount: data.entries.length };
  });
}

export async function saveTeacherRemark(ctx: TenantContext, input: unknown) {
  const data = saveTeacherRemarkSchema.parse(input);
  const permission = data.remarkType === "SUBJECT_TEACHER" ? "gradebook.remark.subject.enter" as const : data.remarkType === "CLASS_TEACHER" ? "gradebook.remark.class_teacher.enter" as const : "gradebook.remark.principal.enter" as const;
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "coScholastic" });
  const exam = await db.gradebookExam.findFirst({ where: { id: data.examId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId } });
  if (!exam) throw notFound("GRADEBOOK_EXAM_NOT_FOUND");
  const enrollment = await db.enrollment.findFirst({ where: { id: data.enrollmentId, tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId }, select: { id: true, studentId: true, classSectionId: true } });
  if (!enrollment) throw notFound("GRADEBOOK_ENROLLMENT_NOT_FOUND");
  if (data.remarkType === "SUBJECT_TEACHER") {
    if (!data.examSubjectId) throw new AppError("GRADEBOOK_REMARK_SUBJECT_REQUIRED", "GRADEBOOK_REMARK_SUBJECT_REQUIRED", 400);
    const assignment = await db.gradebookTeacherMarkAssignment.findFirst({ where: { tenantId: request.tenantId, examId: exam.id, examSubjectId: data.examSubjectId, teacherUserId: request.userId, status: "ACTIVE", examClassSection: { classSectionId: enrollment.classSectionId } } });
    if (!assignment && !request.permissions.has("gradebook.remark.approve")) throw notFound("GRADEBOOK_EXAM_SUBJECT_NOT_FOUND");
  } else if (data.remarkType === "CLASS_TEACHER") {
    await requireClassTeacherOrManager(request, enrollment.classSectionId);
  }
  if (data.templateId) {
    const template = await db.gradebookRemarkTemplate.findFirst({ where: { id: data.templateId, tenantId: request.tenantId, remarkType: data.remarkType, status: "ACTIVE" } });
    if (!template) throw notFound("GRADEBOOK_REMARK_TEMPLATE_NOT_FOUND");
  }
  return db.$transaction(async (tx) => {
    const existing = await tx.gradebookTeacherRemark.findFirst({ where: { tenantId: request.tenantId, examId: exam.id, enrollmentId: enrollment.id, examSubjectId: data.examSubjectId ?? null, remarkType: data.remarkType } });
    const remark = existing
      ? await tx.gradebookTeacherRemark.update({ where: { id: existing.id }, data: { templateId: data.templateId, remarkText: data.remarkText, languageCode: data.languageCode, status: "DRAFT", enteredById: request.userId, approvedAt: null, approvedById: null } })
      : await tx.gradebookTeacherRemark.create({ data: { tenantId: request.tenantId, branchId: request.branchId, academicYearId: request.academicYearId, examId: exam.id, enrollmentId: enrollment.id, studentId: enrollment.studentId, examSubjectId: data.examSubjectId, templateId: data.templateId, remarkType: data.remarkType, remarkText: data.remarkText, languageCode: data.languageCode, enteredById: request.userId } });
    await writeAuditLog({ ctx: request, action: "gradebook.remark.saved", entityType: "GradebookTeacherRemark", entityId: remark.id, branchId: request.branchId, academicYearId: request.academicYearId, after: { examId: exam.id, enrollmentId: enrollment.id, examSubjectId: data.examSubjectId ?? null, remarkType: data.remarkType, status: remark.status }, metadata: { correlationId: request.correlationId } }, tx);
    return remark;
  });
}
