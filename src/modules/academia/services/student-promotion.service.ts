import { randomUUID } from "node:crypto";
import type {
  EnrollmentStatus,
  Prisma,
  StudentPromotionOutcome,
  StudentStatus
} from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  createStudentPromotionBatchSchema,
  reverseStudentPromotionBatchSchema,
  type CreateStudentPromotionBatchInput
} from "@/modules/academia/schemas";
import { conflict, validationError } from "./shared";

type PromotionDecision = CreateStudentPromotionBatchInput["entries"][number];

const outcomeToSourceStatus: Partial<Record<StudentPromotionOutcome, EnrollmentStatus>> = {
  PROMOTED: "PROMOTED",
  NOT_PROMOTED: "COMPLETED",
  REPEAT_SAME_CLASS: "COMPLETED",
  TRANSFERRED: "TRANSFERRED",
  SCHOOL_LEFT: "WITHDRAWN"
};

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime();
}

function dateKey(value: Date | null) {
  return value ? value.toISOString() : "NULL";
}

function groupIdsByStatusAndDate<TStatus extends string>(
  rows: Array<{ id: string; status: TStatus; date: Date | null }>
) {
  const groups = new Map<string, { ids: string[]; status: TStatus; date: Date | null }>();
  for (const row of rows) {
    const key = `${row.status}:${dateKey(row.date)}`;
    const group = groups.get(key) ?? { ids: [], status: row.status, date: row.date };
    group.ids.push(row.id);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function countOutcomes(outcomes: StudentPromotionOutcome[]) {
  return outcomes.reduce<Record<string, number>>((summary, outcome) => {
    summary[outcome] = (summary[outcome] ?? 0) + 1;
    return summary;
  }, {});
}

async function loadSourceScope(ctx: TenantContext, sourceClassSectionId: string, sourceAcademicYearId: string) {
  const source = await db.classSection.findFirst({
    where: {
      id: sourceClassSectionId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      academicYearId: sourceAcademicYearId,
      status: "ACTIVE"
    },
    select: { id: true, branchId: true, academicYearId: true }
  });
  if (!source) throw notFound("PROMOTION_SOURCE_CLASS_SECTION_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "academia.promotion.manage",
    branchId: source.branchId,
    academicYearId: source.academicYearId
  });
  return source;
}

function targetClassSectionForDecision(
  decision: PromotionDecision,
  defaultTargetClassSectionId: string
) {
  if (decision.outcome === "PROMOTED") return defaultTargetClassSectionId;
  if (decision.outcome === "REPEAT_SAME_CLASS") return decision.targetClassSectionId ?? null;
  if (decision.targetClassSectionId) {
    throw validationError("PROMOTION_TARGET_NOT_ALLOWED_FOR_OUTCOME");
  }
  return null;
}

export async function createStudentPromotionBatch(ctx: TenantContext, input: unknown) {
  const data = createStudentPromotionBatchSchema.parse(input);
  const sourceScope = await loadSourceScope(ctx, data.sourceClassSectionId, data.sourceAcademicYearId);
  await requirePermission({
    ctx,
    permission: "academia.promotion.manage",
    branchId: sourceScope.branchId,
    academicYearId: data.targetAcademicYearId
  });

  return db.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({
      where: { id: sourceScope.branchId, tenantId: ctx.tenantId, status: "ACTIVE" },
      select: { id: true, institutionId: true }
    });
    if (!branch) throw notFound("BRANCH_NOT_FOUND");

    const academicYears = await tx.academicYear.findMany({
      where: {
        id: { in: [data.sourceAcademicYearId, data.targetAcademicYearId] },
        tenantId: ctx.tenantId,
        institutionId: branch.institutionId,
        status: { not: "ARCHIVED" }
      },
      select: { id: true, name: true, startDate: true, endDate: true }
    });
    const sourceAcademicYear = academicYears.find((year) => year.id === data.sourceAcademicYearId);
    const targetAcademicYear = academicYears.find((year) => year.id === data.targetAcademicYearId);
    if (!sourceAcademicYear || !targetAcademicYear) throw notFound("PROMOTION_ACADEMIC_YEAR_NOT_FOUND");
    if (sourceAcademicYear.id === targetAcademicYear.id || targetAcademicYear.startDate <= sourceAcademicYear.startDate) {
      throw validationError("PROMOTION_TARGET_ACADEMIC_YEAR_MUST_FOLLOW_SOURCE");
    }
    if (data.effectiveDate < targetAcademicYear.startDate || data.effectiveDate > targetAcademicYear.endDate) {
      throw validationError("PROMOTION_EFFECTIVE_DATE_OUTSIDE_TARGET_YEAR");
    }

    const requestedTargetIds = Array.from(new Set([
      data.defaultTargetClassSectionId,
      ...data.entries.map((entry) => entry.targetClassSectionId).filter((id): id is string => Boolean(id))
    ]));
    const classSections = await tx.classSection.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        status: "ACTIVE",
        OR: [
          { id: data.sourceClassSectionId, academicYearId: data.sourceAcademicYearId },
          { id: { in: requestedTargetIds }, academicYearId: data.targetAcademicYearId }
        ]
      },
      select: {
        id: true,
        academicYearId: true,
        classId: true,
        sectionId: true,
        displayName: true,
        capacity: true,
        academicClass: { select: { name: true } },
        section: { select: { name: true } }
      }
    });
    const sourceClassSection = classSections.find((classSection) => classSection.id === data.sourceClassSectionId);
    const defaultTargetClassSection = classSections.find(
      (classSection) => classSection.id === data.defaultTargetClassSectionId
    );
    if (!sourceClassSection) throw notFound("PROMOTION_SOURCE_CLASS_SECTION_NOT_FOUND");
    if (!defaultTargetClassSection) throw notFound("PROMOTION_TARGET_CLASS_SECTION_NOT_FOUND");
    if (defaultTargetClassSection.classId === sourceClassSection.classId) {
      throw validationError("PROMOTION_NEXT_CLASS_MUST_DIFFER_FROM_SOURCE");
    }
    const targetSectionsById = new Map(classSections
      .filter((classSection) => classSection.academicYearId === data.targetAcademicYearId)
      .map((classSection) => [classSection.id, classSection]));

    const sourceEnrollments = await tx.enrollment.findMany({
      where: {
        tenantId: ctx.tenantId,
        branchId: branch.id,
        academicYearId: data.sourceAcademicYearId,
        classSectionId: data.sourceClassSectionId,
        status: "ACTIVE",
        student: { status: "ACTIVE" }
      },
      select: {
        id: true,
        studentId: true,
        status: true,
        leftOn: true,
        student: { select: { id: true, status: true, leftAt: true } }
      },
      orderBy: [{ rollNumber: "asc" }, { student: { displayName: "asc" } }]
    });
    if (sourceEnrollments.length === 0) throw validationError("PROMOTION_NO_ACTIVE_ENROLLMENTS");

    const sourceEnrollmentById = new Map(sourceEnrollments.map((enrollment) => [enrollment.id, enrollment]));
    for (const decision of data.entries) {
      const sourceEnrollment = sourceEnrollmentById.get(decision.sourceEnrollmentId);
      if (!sourceEnrollment || sourceEnrollment.studentId !== decision.studentId) {
        throw notFound("PROMOTION_SOURCE_ENROLLMENT_NOT_FOUND");
      }
      const targetClassSectionId = targetClassSectionForDecision(decision, data.defaultTargetClassSectionId);
      if (!targetClassSectionId) continue;
      const targetClassSection = targetSectionsById.get(targetClassSectionId);
      if (!targetClassSection) throw notFound("PROMOTION_TARGET_CLASS_SECTION_NOT_FOUND");
      if (decision.outcome === "REPEAT_SAME_CLASS" && targetClassSection.classId !== sourceClassSection.classId) {
        throw validationError("PROMOTION_REPEAT_TARGET_MUST_USE_SOURCE_CLASS");
      }
    }

    const previouslyProcessed = await tx.studentPromotionItem.findMany({
      where: {
        tenantId: ctx.tenantId,
        sourceEnrollmentId: { in: data.entries.map((entry) => entry.sourceEnrollmentId) },
        selected: true,
        batch: { status: "COMPLETED" }
      },
      select: { sourceEnrollmentId: true }
    });
    if (previouslyProcessed.length > 0) throw conflict("PROMOTION_DECISION_ALREADY_RECORDED");

    const targetDecisions = data.entries.map((decision) => ({
      decision,
      targetClassSectionId: targetClassSectionForDecision(decision, data.defaultTargetClassSectionId)
    })).filter((entry): entry is { decision: PromotionDecision; targetClassSectionId: string } => (
      Boolean(entry.targetClassSectionId)
    ));
    const existingTargetEnrollments = targetDecisions.length > 0
      ? await tx.enrollment.findMany({
          where: {
            tenantId: ctx.tenantId,
            academicYearId: data.targetAcademicYearId,
            studentId: { in: targetDecisions.map(({ decision }) => decision.studentId) }
          },
          select: { studentId: true }
        })
      : [];
    if (existingTargetEnrollments.length > 0) throw conflict("PROMOTION_TARGET_ENROLLMENT_ALREADY_EXISTS");

    const additionsByClassSection = new Map<string, number>();
    for (const { targetClassSectionId } of targetDecisions) {
      additionsByClassSection.set(
        targetClassSectionId,
        (additionsByClassSection.get(targetClassSectionId) ?? 0) + 1
      );
    }
    for (const [targetClassSectionId, additions] of additionsByClassSection) {
      const targetClassSection = targetSectionsById.get(targetClassSectionId);
      if (!targetClassSection?.capacity) continue;
      const activeCount = await tx.enrollment.count({
        where: {
          tenantId: ctx.tenantId,
          academicYearId: data.targetAcademicYearId,
          classSectionId: targetClassSectionId,
          status: "ACTIVE"
        }
      });
      if (activeCount + additions > targetClassSection.capacity) {
        throw conflict("PROMOTION_TARGET_CLASS_SECTION_CAPACITY_EXCEEDED");
      }
    }

    const batchId = randomUUID();
    const targetEnrollmentIdBySource = new Map<string, string>();
    const targetEnrollmentRows: Prisma.EnrollmentCreateManyInput[] = targetDecisions.map(
      ({ decision, targetClassSectionId }) => {
        const id = randomUUID();
        targetEnrollmentIdBySource.set(decision.sourceEnrollmentId, id);
        return {
          id,
          tenantId: ctx.tenantId,
          branchId: branch.id,
          academicYearId: data.targetAcademicYearId,
          studentId: decision.studentId,
          classSectionId: targetClassSectionId,
          status: "ACTIVE",
          enrolledOn: data.effectiveDate,
          createdById: ctx.userId
        };
      }
    );
    const selectedEnrollmentIds = new Set(data.entries.map((entry) => entry.sourceEnrollmentId));
    const allOutcomes: StudentPromotionOutcome[] = [
      ...data.entries.map((entry) => entry.outcome),
      ...sourceEnrollments.filter((enrollment) => !selectedEnrollmentIds.has(enrollment.id)).map(() => "EXCLUDED" as const)
    ];
    const outcomeSummary = countOutcomes(allOutcomes);

    const batch = await tx.studentPromotionBatch.create({
      data: {
        id: batchId,
        tenantId: ctx.tenantId,
        branchId: branch.id,
        sourceAcademicYearId: data.sourceAcademicYearId,
        targetAcademicYearId: data.targetAcademicYearId,
        sourceClassSectionId: data.sourceClassSectionId,
        defaultTargetClassSectionId: data.defaultTargetClassSectionId,
        status: "COMPLETED",
        effectiveDate: data.effectiveDate,
        remarks: data.remarks,
        resultsPublicationConfirmed: true,
        selectedCount: data.entries.length,
        excludedCount: sourceEnrollments.length - data.entries.length,
        outcomeSummary,
        createdById: ctx.userId
      }
    });

    if (targetEnrollmentRows.length > 0) {
      const created = await tx.enrollment.createMany({ data: targetEnrollmentRows });
      if (created.count !== targetEnrollmentRows.length) throw conflict("PROMOTION_TARGET_ENROLLMENT_WRITE_INCOMPLETE");
    }

    const decisionsBySource = new Map(data.entries.map((entry) => [entry.sourceEnrollmentId, entry]));
    const sourceStatusUpdates = new Map<EnrollmentStatus, string[]>();
    for (const decision of data.entries) {
      const nextStatus = outcomeToSourceStatus[decision.outcome];
      if (!nextStatus) continue;
      sourceStatusUpdates.set(nextStatus, [...(sourceStatusUpdates.get(nextStatus) ?? []), decision.sourceEnrollmentId]);
    }
    for (const [status, ids] of sourceStatusUpdates) {
      const update = await tx.enrollment.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: ids }, status: "ACTIVE" },
        data: { status, leftOn: sourceAcademicYear.endDate, updatedById: ctx.userId }
      });
      if (update.count !== ids.length) throw conflict("PROMOTION_SOURCE_ENROLLMENT_CHANGED");
    }

    const transferredStudentIds = data.entries
      .filter((entry) => entry.outcome === "TRANSFERRED")
      .map((entry) => entry.studentId);
    const schoolLeftStudentIds = data.entries
      .filter((entry) => entry.outcome === "SCHOOL_LEFT")
      .map((entry) => entry.studentId);
    if (transferredStudentIds.length > 0) {
      const update = await tx.student.updateMany({
        where: { tenantId: ctx.tenantId, branchId: branch.id, id: { in: transferredStudentIds }, status: "ACTIVE" },
        data: { status: "TRANSFERRED", leftAt: data.effectiveDate, updatedById: ctx.userId }
      });
      if (update.count !== transferredStudentIds.length) throw conflict("PROMOTION_STUDENT_LIFECYCLE_CHANGED");
    }
    if (schoolLeftStudentIds.length > 0) {
      const update = await tx.student.updateMany({
        where: { tenantId: ctx.tenantId, branchId: branch.id, id: { in: schoolLeftStudentIds }, status: "ACTIVE" },
        data: { status: "WITHDRAWN", leftAt: data.effectiveDate, updatedById: ctx.userId }
      });
      if (update.count !== schoolLeftStudentIds.length) throw conflict("PROMOTION_STUDENT_LIFECYCLE_CHANGED");
    }

    const itemRows: Prisma.StudentPromotionItemCreateManyInput[] = sourceEnrollments.map((sourceEnrollment) => {
      const decision = decisionsBySource.get(sourceEnrollment.id);
      const targetClassSectionId = decision
        ? targetClassSectionForDecision(decision, data.defaultTargetClassSectionId)
        : null;
      return {
        id: randomUUID(),
        tenantId: ctx.tenantId,
        branchId: branch.id,
        batchId,
        studentId: sourceEnrollment.studentId,
        sourceEnrollmentId: sourceEnrollment.id,
        targetEnrollmentId: targetEnrollmentIdBySource.get(sourceEnrollment.id) ?? null,
        targetClassSectionId,
        selected: Boolean(decision),
        outcome: decision?.outcome ?? "EXCLUDED",
        decisionRemarks: decision?.remarks,
        sourceEnrollmentStatusBefore: sourceEnrollment.status,
        sourceEnrollmentLeftOnBefore: sourceEnrollment.leftOn,
        studentStatusBefore: sourceEnrollment.student.status,
        studentLeftAtBefore: sourceEnrollment.student.leftAt
      };
    });
    const createdItems = await tx.studentPromotionItem.createMany({ data: itemRows });
    if (createdItems.count !== itemRows.length) throw conflict("PROMOTION_DECISION_WRITE_INCOMPLETE");

    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_PROMOTION_BATCH_COMPLETED,
      entityType: "StudentPromotionBatch",
      entityId: batch.id,
      branchId: branch.id,
      academicYearId: data.targetAcademicYearId,
      after: {
        status: batch.status,
        effectiveDate: batch.effectiveDate,
        selectedCount: batch.selectedCount,
        excludedCount: batch.excludedCount,
        outcomeSummary
      },
      metadata: {
        sourceAcademicYearId: data.sourceAcademicYearId,
        targetAcademicYearId: data.targetAcademicYearId,
        sourceClassSectionId: data.sourceClassSectionId,
        defaultTargetClassSectionId: data.defaultTargetClassSectionId,
        resultsPublicationConfirmed: true
      }
    }, tx);

    return {
      id: batch.id,
      selectedCount: batch.selectedCount,
      excludedCount: batch.excludedCount,
      outcomeSummary
    };
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}

function expectedStudentStatus(outcome: StudentPromotionOutcome, previous: StudentStatus) {
  if (outcome === "TRANSFERRED") return "TRANSFERRED" satisfies StudentStatus;
  if (outcome === "SCHOOL_LEFT") return "WITHDRAWN" satisfies StudentStatus;
  return previous;
}

function expectedSourceEnrollmentStatus(outcome: StudentPromotionOutcome, previous: EnrollmentStatus) {
  return outcomeToSourceStatus[outcome] ?? previous;
}

export async function reverseStudentPromotionBatch(ctx: TenantContext, input: unknown) {
  const data = reverseStudentPromotionBatchSchema.parse(input);
  const existingBatch = await db.studentPromotionBatch.findFirst({
    where: { id: data.batchId, tenantId: ctx.tenantId, branchId: { in: ctx.accessibleBranchIds } },
    select: { id: true, branchId: true, targetAcademicYearId: true }
  });
  if (!existingBatch) throw notFound("PROMOTION_BATCH_NOT_FOUND");
  await requirePermission({
    ctx,
    permission: "academia.promotion.manage",
    branchId: existingBatch.branchId,
    academicYearId: existingBatch.targetAcademicYearId
  });

  return db.$transaction(async (tx) => {
    const batch = await tx.studentPromotionBatch.findFirst({
      where: { id: data.batchId, tenantId: ctx.tenantId, branchId: existingBatch.branchId },
      include: {
        sourceAcademicYear: { select: { endDate: true } },
        items: {
          where: { selected: true },
          include: {
            student: { select: { id: true, status: true, leftAt: true } },
            sourceEnrollment: { select: { id: true, status: true, leftOn: true } },
            targetEnrollment: { select: { id: true, status: true } }
          }
        }
      }
    });
    if (!batch) throw notFound("PROMOTION_BATCH_NOT_FOUND");
    if (batch.status === "REVERSED") throw conflict("PROMOTION_BATCH_ALREADY_REVERSED");

    const targetEnrollmentIds = batch.items
      .map((item) => item.targetEnrollmentId)
      .filter((id): id is string => Boolean(id));
    if (targetEnrollmentIds.length > 0) {
      const targetAttendanceCount = await tx.studentAttendanceRecord.count({
        where: { tenantId: ctx.tenantId, enrollmentId: { in: targetEnrollmentIds } }
      });
      if (targetAttendanceCount > 0) throw conflict("PROMOTION_REVERSAL_BLOCKED_BY_TARGET_ACTIVITY");
    }

    for (const item of batch.items) {
      const expectedEnrollmentStatus = expectedSourceEnrollmentStatus(item.outcome, item.sourceEnrollmentStatusBefore);
      const expectedEnrollmentLeftOn = outcomeToSourceStatus[item.outcome]
        ? batch.sourceAcademicYear.endDate
        : item.sourceEnrollmentLeftOnBefore;
      if (
        item.sourceEnrollment.status !== expectedEnrollmentStatus ||
        !sameDate(item.sourceEnrollment.leftOn, expectedEnrollmentLeftOn)
      ) {
        throw conflict("PROMOTION_REVERSAL_BLOCKED_BY_LATER_CHANGES");
      }
      const expectedStatus = expectedStudentStatus(item.outcome, item.studentStatusBefore);
      const expectedLeftAt = item.outcome === "TRANSFERRED" || item.outcome === "SCHOOL_LEFT"
        ? batch.effectiveDate
        : item.studentLeftAtBefore;
      const targetEnrollmentRequired = item.outcome === "PROMOTED" || item.outcome === "REPEAT_SAME_CLASS";
      if (
        item.student.status !== expectedStatus ||
        !sameDate(item.student.leftAt, expectedLeftAt) ||
        (targetEnrollmentRequired && !item.targetEnrollment)
      ) {
        throw conflict("PROMOTION_REVERSAL_BLOCKED_BY_LATER_CHANGES");
      }
      if (item.targetEnrollment && item.targetEnrollment.status !== "ACTIVE") {
        throw conflict("PROMOTION_REVERSAL_BLOCKED_BY_LATER_CHANGES");
      }
    }

    if (targetEnrollmentIds.length > 0) {
      await tx.enrollment.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: targetEnrollmentIds }, status: "ACTIVE" },
        data: { status: "CANCELLED", leftOn: batch.effectiveDate, updatedById: ctx.userId }
      });
    }

    const sourceEnrollmentRestoreGroups = groupIdsByStatusAndDate(batch.items.map((item) => ({
      id: item.sourceEnrollmentId,
      status: item.sourceEnrollmentStatusBefore,
      date: item.sourceEnrollmentLeftOnBefore
    })));
    for (const group of sourceEnrollmentRestoreGroups) {
      await tx.enrollment.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: group.ids } },
        data: { status: group.status, leftOn: group.date, updatedById: ctx.userId }
      });
    }

    const studentRestoreGroups = groupIdsByStatusAndDate(batch.items
      .filter((item) => item.outcome === "TRANSFERRED" || item.outcome === "SCHOOL_LEFT")
      .map((item) => ({ id: item.studentId, status: item.studentStatusBefore, date: item.studentLeftAtBefore })));
    for (const group of studentRestoreGroups) {
      await tx.student.updateMany({
        where: { tenantId: ctx.tenantId, branchId: batch.branchId, id: { in: group.ids } },
        data: { status: group.status, leftAt: group.date, updatedById: ctx.userId }
      });
    }

    const reversedAt = new Date();
    await tx.studentPromotionItem.updateMany({
      where: { tenantId: ctx.tenantId, batchId: batch.id, selected: true },
      data: { reversedAt, reversedById: ctx.userId }
    });
    const reversedBatch = await tx.studentPromotionBatch.update({
      where: { id: batch.id },
      data: {
        status: "REVERSED",
        reversedAt,
        reversedById: ctx.userId,
        reversalReason: data.reason
      }
    });

    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_PROMOTION_BATCH_REVERSED,
      entityType: "StudentPromotionBatch",
      entityId: batch.id,
      branchId: batch.branchId,
      academicYearId: batch.targetAcademicYearId,
      before: { status: batch.status },
      after: { status: reversedBatch.status, reversedAt },
      metadata: { reason: data.reason, selectedCount: batch.selectedCount }
    }, tx);

    return { id: reversedBatch.id, status: reversedBatch.status };
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}
