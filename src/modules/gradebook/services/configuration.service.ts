import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  createAssessmentSchemeSchema,
  createCalculationRuleSetSchema,
  createExamTermSchema,
  createExamTypeSchema,
  createGradeScaleSchema,
  gradebookConfigurationIdSchema,
  transitionExamTypeSchema,
  transitionExamTermSchema
} from "@/modules/gradebook/schemas/configuration.schemas";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { resolveGradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import type { TenantContext } from "@/lib/tenant/context";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";

function conflict(code: string) {
  return new AppError(code, code, 409);
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function validateGradeRules(rules: Array<{ minimumInclusive: number; maximumInclusive: number }>, decimalPlaces: number) {
  const ordered = [...rules].sort((a, b) => a.minimumInclusive - b.minimumInclusive);
  const unit = 1 / 10 ** decimalPlaces;
  if (ordered[0]?.minimumInclusive !== 0 || ordered.at(-1)?.maximumInclusive !== 100) {
    throw new AppError("GRADEBOOK_GRADE_SCALE_COVERAGE_INVALID", "GRADEBOOK_GRADE_SCALE_COVERAGE_INVALID", 400);
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (!previous || !current) continue;
    const expected = Number((previous.maximumInclusive + unit).toFixed(decimalPlaces));
    if (Number(current.minimumInclusive.toFixed(decimalPlaces)) !== expected) {
      throw new AppError("GRADEBOOK_GRADE_SCALE_RANGE_INVALID", "GRADEBOOK_GRADE_SCALE_RANGE_INVALID", 400);
    }
  }
}

export async function createAssessmentScheme(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.scheme.manage", feature: "configuration" });
  const data = createAssessmentSchemeSchema.parse(input);
  const configurationHash = hashCanonicalJson(data.configuration);

  try {
    return await db.$transaction(async (tx) => {
      const scheme = await tx.gradebookAssessmentScheme.create({
        data: {
          tenantId: request.tenantId,
          institutionId: request.institutionId,
          branchId: request.branchId,
          code: data.code,
          name: data.name,
          description: data.description,
          createdById: request.userId,
          updatedById: request.userId,
          versions: {
            create: {
              tenantId: request.tenantId,
              academicYearId: request.academicYearId,
              versionNumber: 1,
              configurationJson: data.configuration as Prisma.InputJsonValue,
              configurationHash,
              createdById: request.userId
            }
          }
        },
        include: { versions: true }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.SCHEME_CREATED,
        entityType: "GradebookAssessmentScheme",
        entityId: scheme.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: { code: scheme.code, name: scheme.name, configurationHash, versionNumber: 1 },
        metadata: { correlationId: request.correlationId }
      }, tx);
      return scheme;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_SCHEME_CODE_EXISTS");
    throw error;
  }
}

export async function activateAssessmentScheme(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.scheme.activate", feature: "configuration" });
  const { id } = gradebookConfigurationIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scheme = await tx.gradebookAssessmentScheme.findFirst({
      where: { id, tenantId: request.tenantId, branchId: request.branchId },
      include: { versions: { where: { status: "DRAFT" }, orderBy: { versionNumber: "desc" }, take: 1 } }
    });
    const version = scheme?.versions[0];
    if (!scheme || !version) throw notFound("GRADEBOOK_SCHEME_NOT_FOUND");
    await tx.gradebookAssessmentSchemeVersion.updateMany({
      where: { tenantId: request.tenantId, schemeId: scheme.id, status: "ACTIVE" },
      data: { status: "SUPERSEDED" }
    });
    const activatedAt = new Date();
    await tx.gradebookAssessmentSchemeVersion.update({
      where: { id: version.id },
      data: { status: "ACTIVE", activatedAt, activatedById: request.userId }
    });
    const updated = await tx.gradebookAssessmentScheme.update({ where: { id: scheme.id }, data: { status: "ACTIVE", updatedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.SCHEME_ACTIVATED,
      entityType: "GradebookAssessmentSchemeVersion",
      entityId: version.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: version.status },
      after: { status: "ACTIVE", versionNumber: version.versionNumber, configurationHash: version.configurationHash },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return updated;
  });
}

export async function createExamTerm(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.term.manage", feature: "configuration" });
  const data = createExamTermSchema.parse(input);
  const academicYear = await db.academicYear.findFirst({
    where: { id: request.academicYearId, tenantId: request.tenantId, institutionId: request.institutionId },
    select: { startDate: true, endDate: true, status: true }
  });
  if (!academicYear || academicYear.status === "ARCHIVED") throw notFound("GRADEBOOK_ACADEMIC_YEAR_NOT_FOUND");
  if (data.startDate < academicYear.startDate || data.endDate > academicYear.endDate) {
    throw new AppError("GRADEBOOK_TERM_OUTSIDE_ACADEMIC_YEAR", "GRADEBOOK_TERM_OUTSIDE_ACADEMIC_YEAR", 400);
  }
  if (!data.allowDateOverlap) {
    const overlap = await db.gradebookExamTerm.findFirst({
      where: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        status: { notIn: ["ARCHIVED", "CANCELLED"] },
        startDate: { lte: data.endDate },
        endDate: { gte: data.startDate }
      },
      select: { id: true }
    });
    if (overlap) throw conflict("GRADEBOOK_TERM_DATE_OVERLAP");
  }

  try {
    return await db.$transaction(async (tx) => {
      if (data.schemeVersionId) {
        const scheme = await tx.gradebookAssessmentSchemeVersion.findFirst({
          where: { id: data.schemeVersionId, tenantId: request.tenantId, status: "ACTIVE" },
          select: { id: true }
        });
        if (!scheme) throw notFound("GRADEBOOK_SCHEME_VERSION_NOT_FOUND");
      }
      const term = await tx.gradebookExamTerm.create({
        data: {
          tenantId: request.tenantId,
          institutionId: request.institutionId,
          branchId: request.branchId,
          academicYearId: request.academicYearId,
          schemeVersionId: data.schemeVersionId,
          code: data.code,
          name: data.name,
          displayName: data.displayName,
          sequence: data.sequence,
          startDate: data.startDate,
          endDate: data.endDate,
          resultPublicationStartAt: data.resultPublicationStartAt,
          isReportCardTerm: data.isReportCardTerm,
          allowDateOverlap: data.allowDateOverlap,
          createdById: request.userId,
          updatedById: request.userId
        }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.TERM_CREATED,
        entityType: "GradebookExamTerm",
        entityId: term.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: { code: term.code, name: term.name, startDate: term.startDate, endDate: term.endDate, status: term.status },
        metadata: { correlationId: request.correlationId }
      }, tx);
      return term;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_TERM_CODE_EXISTS");
    throw error;
  }
}

export async function transitionExamTerm(ctx: TenantContext, input: unknown) {
  const data = transitionExamTermSchema.parse(input);
  const permission = data.action === "ACTIVATE"
    ? "gradebook.term.activate" as const
    : data.action === "CLOSE"
      ? "gradebook.term.close" as const
      : "gradebook.term.archive" as const;
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "configuration" });
  const target = data.action === "ACTIVATE" ? "ACTIVE" : data.action === "CLOSE" ? "CLOSED" : "ARCHIVED";
  const auditAction = data.action === "ACTIVATE"
    ? GRADEBOOK_AUDIT_EVENTS.TERM_ACTIVATED
    : data.action === "CLOSE"
      ? GRADEBOOK_AUDIT_EVENTS.TERM_CLOSED
      : GRADEBOOK_AUDIT_EVENTS.TERM_ARCHIVED;

  return db.$transaction(async (tx) => {
    const term = await tx.gradebookExamTerm.findFirst({ where: { id: data.termId, tenantId: request.tenantId, branchId: request.branchId } });
    if (!term) throw notFound("GRADEBOOK_TERM_NOT_FOUND");
    const allowed = data.action === "ACTIVATE"
      ? term.status === "DRAFT"
      : data.action === "CLOSE"
        ? term.status === "ACTIVE"
        : term.status === "CLOSED";
    if (!allowed) throw conflict("GRADEBOOK_TERM_TRANSITION_INVALID");
    const changed = await tx.gradebookExamTerm.updateMany({
      where: { id: term.id, tenantId: request.tenantId, version: data.expectedVersion, status: term.status },
      data: {
        status: target,
        version: { increment: 1 },
        updatedById: request.userId,
        ...(data.action === "ACTIVATE" ? { activatedAt: new Date(), activatedById: request.userId } : {}),
        ...(data.action === "CLOSE" ? { closedAt: new Date(), closedById: request.userId } : {}),
        ...(data.action === "ARCHIVE" ? { archivedAt: new Date(), archivedById: request.userId } : {})
      }
    });
    if (changed.count !== 1) throw conflict("GRADEBOOK_VERSION_CONFLICT");
    await writeAuditLog({
      ctx: request,
      action: auditAction,
      entityType: "GradebookExamTerm",
      entityId: term.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: term.status, version: term.version },
      after: { status: target, version: term.version + 1 },
      metadata: { correlationId: request.correlationId }
    }, tx);
    await enqueueGradebookDomainEvent(tx, request, {
      eventType: `gradebook.term.${target.toLowerCase()}.v1`,
      aggregateType: "GradebookExamTerm",
      aggregateId: term.id,
      payload: { termId: term.id, status: target },
      idempotencyKey: `term:${term.id}:${target}:${term.version + 1}`
    });
    return { id: term.id, status: target, version: term.version + 1 };
  });
}

export async function createExamType(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.exam_type.manage", feature: "configuration" });
  const data = createExamTypeSchema.parse(input);
  try {
    const examType = await db.gradebookExamType.create({
      data: { tenantId: request.tenantId, ...data, createdById: request.userId, updatedById: request.userId }
    });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.EXAM_TYPE_CREATED,
      entityType: "GradebookExamType",
      entityId: examType.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      after: { code: examType.code, name: examType.name, category: examType.category, status: examType.status },
      metadata: { correlationId: request.correlationId }
    });
    return examType;
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_EXAM_TYPE_CODE_EXISTS");
    throw error;
  }
}

export async function transitionExamType(ctx: TenantContext, input: unknown) {
  const data = transitionExamTypeSchema.parse(input);
  const permission = data.action === "ACTIVATE"
    ? "gradebook.exam_type.activate" as const
    : "gradebook.exam_type.archive" as const;
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "configuration" });
  const target = data.action === "ACTIVATE" ? "ACTIVE" : "ARCHIVED";
  return db.$transaction(async (tx) => {
    const examType = await tx.gradebookExamType.findFirst({
      where: { id: data.examTypeId, tenantId: request.tenantId }
    });
    if (!examType) throw notFound("GRADEBOOK_EXAM_TYPE_NOT_FOUND");
    const allowed = data.action === "ACTIVATE"
      ? examType.status === "DRAFT"
      : examType.status !== "ARCHIVED";
    if (!allowed) throw conflict("GRADEBOOK_EXAM_TYPE_TRANSITION_INVALID");
    if (data.action === "ARCHIVE") {
      const inUse = await tx.gradebookExam.count({
        where: { tenantId: request.tenantId, examTypeId: examType.id, status: { notIn: ["ARCHIVED", "CANCELLED"] } }
      });
      if (inUse > 0) throw conflict("GRADEBOOK_EXAM_TYPE_IN_USE");
    }
    const changed = await tx.gradebookExamType.updateMany({
      where: { id: examType.id, tenantId: request.tenantId, version: data.expectedVersion, status: examType.status },
      data: {
        status: target,
        version: { increment: 1 },
        updatedById: request.userId,
        ...(data.action === "ACTIVATE" ? { activatedAt: new Date() } : { archivedAt: new Date() })
      }
    });
    if (changed.count !== 1) throw conflict("GRADEBOOK_VERSION_CONFLICT");
    await writeAuditLog({
      ctx: request,
      action: data.action === "ACTIVATE" ? GRADEBOOK_AUDIT_EVENTS.EXAM_TYPE_ACTIVATED : GRADEBOOK_AUDIT_EVENTS.EXAM_TYPE_ARCHIVED,
      entityType: "GradebookExamType",
      entityId: examType.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: examType.status, version: examType.version },
      after: { status: target, version: examType.version + 1 },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return { id: examType.id, status: target, version: examType.version + 1 };
  });
}

export async function createGradeScale(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.grade_scale.manage", feature: "configuration" });
  const data = createGradeScaleSchema.parse(input);
  validateGradeRules(data.rules, data.decimalPlaces);
  const configurationHash = hashCanonicalJson({
    scoreBasis: data.scoreBasis,
    roundingMode: data.roundingMode,
    decimalPlaces: data.decimalPlaces,
    rules: data.rules
  });
  try {
    return await db.$transaction(async (tx) => {
      const scale = await tx.gradebookGradeScale.create({
        data: {
          tenantId: request.tenantId,
          institutionId: request.institutionId,
          branchId: request.branchId,
          code: data.code,
          name: data.name,
          description: data.description,
          createdById: request.userId,
          updatedById: request.userId,
          versions: {
            create: {
              tenantId: request.tenantId,
              academicYearId: data.academicYearId ?? request.academicYearId,
              versionNumber: 1,
              scoreBasis: data.scoreBasis,
              roundingMode: data.roundingMode,
              decimalPlaces: data.decimalPlaces,
              configurationHash,
              createdById: request.userId,
              rules: {
                create: data.rules.map((rule) => ({ tenantId: request.tenantId, ...rule }))
              }
            }
          }
        },
        include: { versions: { include: { rules: true } } }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.GRADE_SCALE_CREATED,
        entityType: "GradebookGradeScale",
        entityId: scale.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: { code: scale.code, name: scale.name, configurationHash, ruleCount: data.rules.length },
        metadata: { correlationId: request.correlationId }
      }, tx);
      return scale;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_GRADE_SCALE_CODE_EXISTS");
    throw error;
  }
}

export async function createCalculationRuleSet(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.calculation_rules.manage", feature: "configuration" });
  const data = createCalculationRuleSetSchema.parse(input);
  const configurationHash = hashCanonicalJson({ strategy: data.strategy, rules: data.rules });
  try {
    return await db.$transaction(async (tx) => {
      const ruleSet = await tx.gradebookCalculationRuleSet.create({
        data: {
          tenantId: request.tenantId,
          institutionId: request.institutionId,
          branchId: request.branchId,
          code: data.code,
          name: data.name,
          description: data.description,
          createdById: request.userId,
          updatedById: request.userId,
          versions: {
            create: {
              tenantId: request.tenantId,
              academicYearId: data.academicYearId ?? request.academicYearId,
              versionNumber: 1,
              strategy: data.strategy,
              rulesJson: data.rules,
              configurationHash,
              createdById: request.userId
            }
          }
        },
        include: { versions: true }
      });
      await writeAuditLog({
        ctx: request,
        action: GRADEBOOK_AUDIT_EVENTS.CALCULATION_RULES_CREATED,
        entityType: "GradebookCalculationRuleSet",
        entityId: ruleSet.id,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        after: { code: ruleSet.code, name: ruleSet.name, configurationHash, strategy: data.strategy },
        metadata: { correlationId: request.correlationId }
      }, tx);
      return ruleSet;
    });
  } catch (error) {
    if (isUniqueConstraint(error)) throw conflict("GRADEBOOK_CALCULATION_RULE_CODE_EXISTS");
    throw error;
  }
}

export async function activateGradeScale(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.grade_scale.activate", feature: "configuration" });
  const { id } = gradebookConfigurationIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const scale = await tx.gradebookGradeScale.findFirst({
      where: { id, tenantId: request.tenantId, branchId: request.branchId },
      include: { versions: { where: { status: "DRAFT" }, include: { rules: true }, orderBy: { versionNumber: "desc" }, take: 1 } }
    });
    const version = scale?.versions[0];
    if (!scale || !version) throw notFound("GRADEBOOK_GRADE_SCALE_NOT_FOUND");
    validateGradeRules(version.rules.map((rule) => ({
      minimumInclusive: Number(rule.minimumInclusive),
      maximumInclusive: Number(rule.maximumInclusive)
    })), version.decimalPlaces);
    await tx.gradebookGradeScaleVersion.updateMany({ where: { tenantId: request.tenantId, gradeScaleId: scale.id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    await tx.gradebookGradeScaleVersion.update({
      where: { id: version.id },
      data: { status: "ACTIVE", activatedAt: new Date(), activatedById: request.userId }
    });
    await tx.gradebookGradeScale.update({ where: { id: scale.id }, data: { status: "ACTIVE", updatedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.GRADE_SCALE_ACTIVATED,
      entityType: "GradebookGradeScaleVersion",
      entityId: version.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: version.status },
      after: { status: "ACTIVE", versionNumber: version.versionNumber, configurationHash: version.configurationHash },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return { id: scale.id, versionId: version.id };
  });
}

export async function activateCalculationRuleSet(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.calculation_rules.activate", feature: "configuration" });
  const { id } = gradebookConfigurationIdSchema.parse(input);
  return db.$transaction(async (tx) => {
    const ruleSet = await tx.gradebookCalculationRuleSet.findFirst({
      where: { id, tenantId: request.tenantId, branchId: request.branchId },
      include: { versions: { where: { status: "DRAFT" }, orderBy: { versionNumber: "desc" }, take: 1 } }
    });
    const version = ruleSet?.versions[0];
    if (!ruleSet || !version) throw notFound("GRADEBOOK_CALCULATION_RULES_NOT_FOUND");
    await tx.gradebookCalculationRuleSetVersion.updateMany({ where: { tenantId: request.tenantId, ruleSetId: ruleSet.id, status: "ACTIVE" }, data: { status: "SUPERSEDED" } });
    await tx.gradebookCalculationRuleSetVersion.update({ where: { id: version.id }, data: { status: "ACTIVE", activatedAt: new Date(), activatedById: request.userId } });
    await tx.gradebookCalculationRuleSet.update({ where: { id: ruleSet.id }, data: { status: "ACTIVE", updatedById: request.userId } });
    await writeAuditLog({
      ctx: request,
      action: GRADEBOOK_AUDIT_EVENTS.CALCULATION_RULES_ACTIVATED,
      entityType: "GradebookCalculationRuleSetVersion",
      entityId: version.id,
      branchId: request.branchId,
      academicYearId: request.academicYearId,
      before: { status: version.status },
      after: { status: "ACTIVE", versionNumber: version.versionNumber, configurationHash: version.configurationHash },
      metadata: { correlationId: request.correlationId }
    }, tx);
    return { id: ruleSet.id, versionId: version.id };
  });
}
