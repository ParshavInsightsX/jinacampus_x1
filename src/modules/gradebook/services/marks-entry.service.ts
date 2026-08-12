import { Prisma, type GradebookMarkEntryBatchStatus } from "@prisma/client";
import type { TenantContext } from "@/lib/tenant/context";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { GRADEBOOK_AUDIT_EVENTS } from "@/modules/gradebook/audit-events";
import {
  marksBatchIdSchema,
  returnMarksBatchSchema,
  saveMarksDraftSchema,
  transitionMarksBatchSchema
} from "@/modules/gradebook/schemas/marks.schemas";
import { enqueueGradebookDomainEvent } from "@/modules/gradebook/services/domain-event.service";
import { requireGradebookCapability, resolveGradebookRequestContext, type GradebookRequestContext } from "@/modules/gradebook/services/request-context.service";
import { hashCanonicalJson } from "@/modules/gradebook/utils/canonical-json";
import { requireStateTransition } from "@/modules/gradebook/utils/state-machine";

type RosterItem = {
  enrollmentId: string;
  studentId: string;
  scholarNumber?: string | null;
  rollNumber?: string | null;
  displayName?: string;
};

const transitions: Readonly<Record<GradebookMarkEntryBatchStatus, readonly GradebookMarkEntryBatchStatus[]>> = {
  NOT_STARTED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["RETURNED", "VERIFIED", "CANCELLED"],
  RETURNED: ["IN_PROGRESS", "SUBMITTED", "CANCELLED"],
  VERIFIED: ["RETURNED", "APPROVED"],
  APPROVED: ["LOCKED"],
  LOCKED: ["REOPENED"],
  REOPENED: ["IN_PROGRESS", "SUBMITTED", "CANCELLED"],
  CANCELLED: []
};

function conflict(code: string) {
  return new AppError(code, code, 409);
}

async function loadBatch(request: GradebookRequestContext, batchId: string) {
  const batch = await db.gradebookMarkEntryBatch.findFirst({
    where: {
      id: batchId,
      tenantId: request.tenantId,
      branchId: request.branchId,
      academicYearId: request.academicYearId
    },
    include: {
      teacherAssignment: true,
      exam: { select: { id: true, status: true, marksEntryOpensAt: true, marksEntryClosesAt: true } },
      examClassSection: { select: { id: true, classSectionId: true } },
      examSubject: {
        include: {
          components: { orderBy: { displayOrder: "asc" } },
          subject: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  if (!batch) throw notFound("GRADEBOOK_MARK_BATCH_NOT_FOUND");
  return batch;
}

function requireAssignedTeacher(request: GradebookRequestContext, batch: Awaited<ReturnType<typeof loadBatch>>, action: "EDIT" | "SUBMIT") {
  const assignment = batch.teacherAssignment;
  const now = new Date();
  if (
    assignment.teacherUserId !== request.userId ||
    assignment.status !== "ACTIVE" ||
    (assignment.validFrom && assignment.validFrom > now) ||
    (assignment.validUntil && assignment.validUntil <= now) ||
    (action === "EDIT" && !assignment.canEdit) ||
    (action === "SUBMIT" && !assignment.canSubmit)
  ) {
    throw notFound("GRADEBOOK_MARK_BATCH_NOT_FOUND");
  }
}

function parseRoster(value: Prisma.JsonValue): RosterItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RosterItem => (
    typeof item === "object" && item !== null &&
    typeof (item as Record<string, unknown>).enrollmentId === "string" &&
    typeof (item as Record<string, unknown>).studentId === "string"
  ));
}

function allowedComponents(batch: Awaited<ReturnType<typeof loadBatch>>) {
  return batch.teacherAssignment.examSubjectComponentId
    ? batch.examSubject.components.filter((component) => component.id === batch.teacherAssignment.examSubjectComponentId)
    : batch.examSubject.components;
}

function assertEntryWindow(batch: Awaited<ReturnType<typeof loadBatch>>) {
  const now = new Date();
  const opensAt = batch.entryOpenedAt ?? batch.exam.marksEntryOpensAt;
  const closesAt = batch.entryClosedAt ?? batch.exam.marksEntryClosesAt;
  if (opensAt && opensAt > now) throw conflict("GRADEBOOK_MARKS_WINDOW_NOT_OPEN");
  if (closesAt && closesAt <= now) throw conflict("GRADEBOOK_MARKS_WINDOW_CLOSED");
  if (!["MARKS_OPEN", "UNDER_REVIEW", "REOPENED"].includes(batch.exam.status)) throw conflict("GRADEBOOK_MARKS_WINDOW_NOT_OPEN");
}

export async function getTeacherMarksBatch(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.view", feature: "marksEntry" });
  const { batchId } = marksBatchIdSchema.parse(input);
  const batch = await loadBatch(request, batchId);
  const canReview = request.permissions.has("gradebook.marks.verify") || request.permissions.has("gradebook.marks.approve");
  if (!canReview) requireAssignedTeacher(request, batch, "EDIT");
  const marks = await db.gradebookStudentMark.findMany({
    where: { tenantId: request.tenantId, markEntryBatchId: batch.id },
    select: {
      enrollmentId: true,
      examSubjectComponentId: true,
      marksObtained: true,
      specialStatus: true,
      statusReason: true,
      publicRemark: true,
      teacherRemark: true,
      rowVersion: true
    },
    orderBy: [{ enrollmentId: "asc" }, { examSubjectComponentId: "asc" }]
  });
  return {
    id: batch.id,
    status: batch.status,
    version: batch.version,
    roster: parseRoster(batch.rosterSnapshotJson),
    subject: batch.examSubject.subject,
    components: allowedComponents(batch).map((component) => ({
      id: component.id,
      code: component.componentCode,
      name: component.componentName,
      maximumMarks: component.maximumMarks.toString(),
      passingMarks: component.passingMarks?.toString() ?? null,
      weightagePercent: component.weightagePercent?.toString() ?? null
    })),
    marks: marks.map((mark) => ({
      ...mark,
      marksObtained: mark.marksObtained?.toString() ?? null
    })),
    returnReason: batch.returnReason,
    completionCounts: batch.completionCountsJson
  };
}

export async function prepareMarksDraft(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.save_draft", feature: "marksEntry" });
  const data = saveMarksDraftSchema.parse(input);
  const batch = await loadBatch(request, data.batchId);
  requireAssignedTeacher(request, batch, "EDIT");
  assertEntryWindow(batch);
  if (!["NOT_STARTED", "IN_PROGRESS", "RETURNED", "REOPENED"].includes(batch.status)) throw conflict("GRADEBOOK_BATCH_LOCKED");
  if (batch.version !== data.expectedVersion) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");

  const roster = parseRoster(batch.rosterSnapshotJson);
  const rosterByEnrollment = new Map(roster.map((item) => [item.enrollmentId, item]));
  const components = allowedComponents(batch);
  const componentById = new Map(components.map((component) => [component.id, component]));
  for (const entry of data.entries) {
    if (!rosterByEnrollment.has(entry.enrollmentId) || !componentById.has(entry.componentId)) {
      throw notFound("GRADEBOOK_MARK_SCOPE_NOT_FOUND");
    }
    if (entry.value.kind === "NUMERIC") {
      const component = componentById.get(entry.componentId);
      if (!component || new Prisma.Decimal(entry.value.marksObtained).gt(component.maximumMarks)) {
        throw new AppError("GRADEBOOK_MARK_OUT_OF_RANGE", "GRADEBOOK_MARK_OUT_OF_RANGE", 400);
      }
    }
    if (entry.value.kind === "SPECIAL_STATUS" && !request.permissions.has("gradebook.marks.special_status.enter")) {
      throw new AppError("GRADEBOOK_SCOPE_FORBIDDEN", "GRADEBOOK_SCOPE_FORBIDDEN", 403);
    }
  }

  return { request, data, batch, roster, rosterByEnrollment, components };
}

export async function persistPreparedMarksDraft(
  tx: Prisma.TransactionClient,
  prepared: Awaited<ReturnType<typeof prepareMarksDraft>>
) {
  const { request, data, batch, roster, rosterByEnrollment, components } = prepared;
  const changed = await tx.gradebookMarkEntryBatch.updateMany({
    where: { id: batch.id, tenantId: request.tenantId, version: data.expectedVersion, status: batch.status },
    data: {
      status: "IN_PROGRESS",
      version: { increment: 1 },
      returnReason: null,
      returnedAt: null,
      returnedById: null
    }
  });
  if (changed.count !== 1) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");

  const existing = await tx.gradebookStudentMark.findMany({
    where: {
      tenantId: request.tenantId,
      markEntryBatchId: batch.id,
      OR: data.entries.map((entry) => ({ enrollmentId: entry.enrollmentId, examSubjectComponentId: entry.componentId }))
    }
  });
  const existingByKey = new Map(existing.map((mark) => [`${mark.enrollmentId}:${mark.examSubjectComponentId}`, mark]));
  for (const entry of data.entries) {
    const rosterItem = rosterByEnrollment.get(entry.enrollmentId);
    if (!rosterItem) throw notFound("GRADEBOOK_MARK_SCOPE_NOT_FOUND");
    const key = `${entry.enrollmentId}:${entry.componentId}`;
    const before = existingByKey.get(key);
    const value = entry.value.kind === "NUMERIC"
      ? { marksObtained: new Prisma.Decimal(entry.value.marksObtained), specialStatus: null, statusReason: null, publicRemark: null }
      : { marksObtained: null, specialStatus: entry.value.status, statusReason: entry.value.reason ?? null, publicRemark: entry.value.publicRemark ?? null };
    const mark = await tx.gradebookStudentMark.upsert({
      where: {
        tenantId_markEntryBatchId_enrollmentId_examSubjectComponentId: {
          tenantId: request.tenantId,
          markEntryBatchId: batch.id,
          enrollmentId: entry.enrollmentId,
          examSubjectComponentId: entry.componentId
        },
      },
      create: {
        tenantId: request.tenantId,
        branchId: request.branchId,
        academicYearId: request.academicYearId,
        markEntryBatchId: batch.id,
        examSubjectComponentId: entry.componentId,
        enrollmentId: entry.enrollmentId,
        studentId: rosterItem.studentId,
        ...value,
        teacherRemark: entry.teacherRemark,
        createdById: request.userId,
        updatedById: request.userId
      },
      update: {
        ...value,
        teacherRemark: entry.teacherRemark,
        rowVersion: { increment: 1 },
        updatedById: request.userId
      }
    });
    await tx.gradebookStudentMarkRevision.create({
      data: {
        tenantId: request.tenantId,
        markEntryBatchId: batch.id,
        studentMarkId: mark.id,
        batchVersion: batch.version + 1,
        beforeJson: before ? {
          marksObtained: before.marksObtained?.toString() ?? null,
          specialStatus: before.specialStatus,
          statusReason: before.statusReason,
          teacherRemark: before.teacherRemark,
          rowVersion: before.rowVersion
        } : undefined,
        afterJson: {
          marksObtained: mark.marksObtained?.toString() ?? null,
          specialStatus: mark.specialStatus,
          statusReason: mark.statusReason,
          teacherRemark: mark.teacherRemark,
          rowVersion: mark.rowVersion
        },
        actorUserId: request.userId,
        correlationId: request.correlationId
      }
    });
  }
  const entered = await tx.gradebookStudentMark.count({ where: { tenantId: request.tenantId, markEntryBatchId: batch.id } });
  const expected = roster.length * components.length;
  await tx.gradebookMarkEntryBatch.update({
    where: { id: batch.id },
    data: { completionCountsJson: { total: expected, entered, incomplete: Math.max(0, expected - entered) } }
  });
  await writeAuditLog({
    ctx: request,
    action: GRADEBOOK_AUDIT_EVENTS.MARKS_DRAFT_SAVED,
    entityType: "GradebookMarkEntryBatch",
    entityId: batch.id,
    branchId: request.branchId,
    academicYearId: request.academicYearId,
    before: { status: batch.status, version: batch.version },
    after: { status: "IN_PROGRESS", version: batch.version + 1, changedRowCount: data.entries.length },
    metadata: { correlationId: request.correlationId }
  }, tx);
  return { batchId: batch.id, version: batch.version + 1, savedCount: data.entries.length, entered, expected };
}

export async function saveMarksDraft(ctx: TenantContext, input: unknown) {
  const prepared = await prepareMarksDraft(ctx, input);
  return db.$transaction(async (tx) => {
    return persistPreparedMarksDraft(tx, prepared);
  });
}

export async function validateMarksBatch(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.view", feature: "marksEntry" });
  const { batchId } = marksBatchIdSchema.parse(input);
  const batch = await loadBatch(request, batchId);
  const canReview = request.permissions.has("gradebook.marks.verify") || request.permissions.has("gradebook.marks.approve");
  if (!canReview) requireAssignedTeacher(request, batch, "EDIT");
  const roster = parseRoster(batch.rosterSnapshotJson);
  const components = allowedComponents(batch);
  const marks = await db.gradebookStudentMark.findMany({ where: { tenantId: request.tenantId, markEntryBatchId: batch.id } });
  const errors: Array<{ code: string; enrollmentId?: string; componentId?: string }> = [];
  const marksByKey = new Map(marks.map((mark) => [`${mark.enrollmentId}:${mark.examSubjectComponentId}`, mark]));
  for (const student of roster) {
    for (const component of components) {
      const mark = marksByKey.get(`${student.enrollmentId}:${component.id}`);
      if (!mark) {
        errors.push({ code: "MARK_REQUIRED", enrollmentId: student.enrollmentId, componentId: component.id });
        continue;
      }
      if (mark.marksObtained === null && mark.specialStatus === null) {
        errors.push({ code: "MARK_VALUE_REQUIRED", enrollmentId: student.enrollmentId, componentId: component.id });
      }
      if (mark.marksObtained?.gt(component.maximumMarks)) {
        errors.push({ code: "MARK_OUT_OF_RANGE", enrollmentId: student.enrollmentId, componentId: component.id });
      }
    }
  }
  return { batchId: batch.id, valid: errors.length === 0, errors, expectedCount: roster.length * components.length, enteredCount: marks.length };
}

async function recordWorkflowTransition(
  tx: Prisma.TransactionClient,
  request: GradebookRequestContext,
  batch: Awaited<ReturnType<typeof loadBatch>>,
  next: GradebookMarkEntryBatchStatus,
  reason: string | null,
  auditAction: string
) {
  await tx.gradebookMarkWorkflowEvent.create({
    data: {
      tenantId: request.tenantId,
      markEntryBatchId: batch.id,
      fromStatus: batch.status,
      toStatus: next,
      batchVersion: batch.version + 1,
      reason,
      actorUserId: request.userId,
      correlationId: request.correlationId
    }
  });
  await writeAuditLog({
    ctx: request,
    action: auditAction,
    entityType: "GradebookMarkEntryBatch",
    entityId: batch.id,
    branchId: request.branchId,
    academicYearId: request.academicYearId,
    before: { status: batch.status, version: batch.version },
    after: { status: next, version: batch.version + 1 },
    metadata: { correlationId: request.correlationId, reason }
  }, tx);
  await enqueueGradebookDomainEvent(tx, request, {
    eventType: `gradebook.marks.${next.toLowerCase()}.v1`,
    aggregateType: "GradebookMarkEntryBatch",
    aggregateId: batch.id,
    payload: { batchId: batch.id, status: next, version: batch.version + 1 },
    idempotencyKey: `marks-batch:${batch.id}:${next}:${batch.version + 1}`
  });
}

export async function transitionMarksBatch(ctx: TenantContext, input: unknown) {
  const data = transitionMarksBatchSchema.parse(input);
  const permission = data.action === "SUBMIT"
    ? "gradebook.marks.submit" as const
    : data.action === "VERIFY"
      ? "gradebook.marks.verify" as const
      : data.action === "APPROVE"
        ? "gradebook.marks.approve" as const
        : "gradebook.marks.lock" as const;
  const request = await resolveGradebookRequestContext(ctx, { permission, feature: "marksEntry" });
  const batch = await loadBatch(request, data.batchId);
  if (batch.version !== data.expectedVersion) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");
  const next = data.action === "SUBMIT" ? "SUBMITTED" : data.action === "VERIFY" ? "VERIFIED" : data.action === "APPROVE" ? "APPROVED" : "LOCKED";
  requireStateTransition({ current: batch.status, next, transitions, errorCode: "GRADEBOOK_BATCH_TRANSITION_INVALID" });
  if (data.action === "SUBMIT") {
    requireAssignedTeacher(request, batch, "SUBMIT");
    assertEntryWindow(batch);
    const validation = await validateMarksBatch(ctx, { batchId: batch.id });
    if (!validation.valid) throw new AppError("GRADEBOOK_BATCH_INCOMPLETE", "GRADEBOOK_BATCH_INCOMPLETE", 400);
  } else {
    requireGradebookCapability(request, permission);
    if (data.action === "VERIFY" && batch.submittedById === request.userId) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
    if (data.action === "APPROVE" && (batch.submittedById === request.userId || batch.verifiedById === request.userId)) throw conflict("GRADEBOOK_SEGREGATION_OF_DUTIES");
  }

  const marks = await db.gradebookStudentMark.findMany({
    where: { tenantId: request.tenantId, markEntryBatchId: batch.id },
    select: { enrollmentId: true, examSubjectComponentId: true, marksObtained: true, specialStatus: true, rowVersion: true },
    orderBy: [{ enrollmentId: "asc" }, { examSubjectComponentId: "asc" }]
  });
  const snapshotHash = hashCanonicalJson(marks.map((mark) => ({
    ...mark,
    marksObtained: mark.marksObtained?.toString() ?? null
  })));
  const now = new Date();
  const auditAction = data.action === "SUBMIT"
    ? GRADEBOOK_AUDIT_EVENTS.MARK_BATCH_SUBMITTED
    : data.action === "VERIFY"
      ? GRADEBOOK_AUDIT_EVENTS.MARK_BATCH_VERIFIED
      : data.action === "APPROVE"
        ? GRADEBOOK_AUDIT_EVENTS.MARK_BATCH_APPROVED
        : GRADEBOOK_AUDIT_EVENTS.MARK_BATCH_LOCKED;
  return db.$transaction(async (tx) => {
    const changed = await tx.gradebookMarkEntryBatch.updateMany({
      where: { id: batch.id, tenantId: request.tenantId, status: batch.status, version: data.expectedVersion },
      data: {
        status: next,
        version: { increment: 1 },
        snapshotHash,
        ...(data.action === "SUBMIT" ? { submittedAt: now, submittedById: request.userId } : {}),
        ...(data.action === "VERIFY" ? { verifiedAt: now, verifiedById: request.userId, verificationJson: { valid: true } } : {}),
        ...(data.action === "APPROVE" ? { approvedAt: now, approvedById: request.userId, approvalComment: data.comment } : {}),
        ...(data.action === "LOCK" ? { lockedAt: now, lockedById: request.userId } : {})
      }
    });
    if (changed.count !== 1) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");
    await recordWorkflowTransition(tx, request, batch, next, data.comment ?? null, auditAction);
    return { batchId: batch.id, status: next, version: batch.version + 1, snapshotHash };
  });
}

export async function returnMarksBatch(ctx: TenantContext, input: unknown) {
  const request = await resolveGradebookRequestContext(ctx, { permission: "gradebook.marks.return", feature: "marksEntry" });
  const data = returnMarksBatchSchema.parse(input);
  const batch = await loadBatch(request, data.batchId);
  if (batch.version !== data.expectedVersion) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");
  requireStateTransition({ current: batch.status, next: "RETURNED", transitions, errorCode: "GRADEBOOK_BATCH_TRANSITION_INVALID" });
  return db.$transaction(async (tx) => {
    const changed = await tx.gradebookMarkEntryBatch.updateMany({
      where: { id: batch.id, tenantId: request.tenantId, status: batch.status, version: data.expectedVersion },
      data: { status: "RETURNED", version: { increment: 1 }, returnReason: data.reason, returnedAt: new Date(), returnedById: request.userId }
    });
    if (changed.count !== 1) throw conflict("GRADEBOOK_BATCH_VERSION_CONFLICT");
    await recordWorkflowTransition(tx, request, batch, "RETURNED", data.reason, GRADEBOOK_AUDIT_EVENTS.MARK_BATCH_RETURNED);
    return { batchId: batch.id, status: "RETURNED" as const, version: batch.version + 1 };
  });
}
