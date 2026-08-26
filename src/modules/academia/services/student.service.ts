import { db } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { writeAuditLog } from "@/lib/audit/audit-log";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  type CreateStudentInput,
  createStudentSchema,
  maskAadhaarNumber,
  maskBankAccountNumber,
  updateStudentSchema
} from "@/modules/academia/schemas";
import { idSchema, studentStatusSchema } from "@/modules/academia/schemas/shared";
import {
  type AcademiaDbClient,
  conflict,
  displayName,
  ensureActiveBranch,
  requireBranchPermission
} from "./shared";

function lastFourDigits(value: string) {
  return value.replace(/\D/g, "").slice(-4);
}

function resolveStudentNames(data: {
  fullName?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  displayName?: string;
}) {
  const firstName = data.firstName ?? data.fullName ?? "";
  const fullName = data.fullName ?? displayName([firstName, data.middleName, data.lastName]);
  return {
    firstName,
    fullName,
    displayName: data.displayName ?? fullName
  };
}

export async function createStudentRecord(
  tx: AcademiaDbClient,
  ctx: TenantContext,
  data: CreateStudentInput
) {
  await ensureActiveBranch(tx, ctx, data.branchId);

  const existing = await tx.student.findFirst({
    where: { tenantId: ctx.tenantId, admissionNumber: data.admissionNumber },
    select: { id: true }
  });
  if (existing) throw conflict("STUDENT_ADMISSION_NUMBER_EXISTS");

  const {
    aadhaarNumber,
    bankAccountNumber,
    firstName: _firstName,
    fullName: _fullName,
    displayName: _displayName,
    joinedAt,
    ...studentData
  } = data;
  const names = resolveStudentNames(data);

  const student = await tx.student.create({
    data: {
      ...studentData,
      tenantId: ctx.tenantId,
      firstName: names.firstName,
      fullName: names.fullName,
      displayName: names.displayName,
      joinedAt: joinedAt ?? data.admissionDate,
      aadhaarMasked: aadhaarNumber ? maskAadhaarNumber(aadhaarNumber) : undefined,
      aadhaarLast4: aadhaarNumber ? lastFourDigits(aadhaarNumber) : undefined,
      bankAccountMasked: bankAccountNumber ? maskBankAccountNumber(bankAccountNumber) : undefined,
      bankAccountLast4: bankAccountNumber ? lastFourDigits(bankAccountNumber) : undefined,
      createdById: ctx.userId
    }
  });
  await writeAuditLog({
    ctx,
    action: ACADEMIA_AUDIT_EVENTS.STUDENT_CREATED,
    entityType: "Student",
    entityId: student.id,
    branchId: student.branchId,
    after: student
  }, tx);
  return student;
}

export async function createStudent(ctx: TenantContext, input: unknown) {
  const data = createStudentSchema.parse(input);
  await requireBranchPermission(ctx, "academia.student.create", data.branchId);

  return db.$transaction((tx) => createStudentRecord(tx, ctx, data));
}

export async function updateStudent(ctx: TenantContext, input: unknown) {
  const { studentId, ...data } = updateStudentSchema.parse(input);

  return db.$transaction(async (tx) => {
    const before = await tx.student.findFirst({ where: { id: studentId, tenantId: ctx.tenantId } });
    if (!before) throw notFound("STUDENT_NOT_FOUND");

    await requireBranchPermission(ctx, "academia.student.update", before.branchId);
    if (data.branchId && data.branchId !== before.branchId) {
      await requireBranchPermission(ctx, "academia.student.update", data.branchId);
      await ensureActiveBranch(tx, ctx, data.branchId);
    }

    if (data.admissionNumber && data.admissionNumber !== before.admissionNumber) {
      const duplicate = await tx.student.findFirst({
        where: { tenantId: ctx.tenantId, admissionNumber: data.admissionNumber, id: { not: studentId } },
        select: { id: true }
      });
      if (duplicate) throw conflict("STUDENT_ADMISSION_NUMBER_EXISTS");
    }

    const {
      aadhaarNumber,
      bankAccountNumber,
      fullName,
      firstName,
      displayName: preferredDisplayName,
      ...studentData
    } = data;
    const nextNames = resolveStudentNames({
      fullName: fullName ?? before.fullName ?? before.displayName ?? undefined,
      firstName: firstName ?? before.firstName,
      middleName: data.middleName ?? before.middleName ?? undefined,
      lastName: data.lastName ?? before.lastName ?? undefined,
      displayName: preferredDisplayName
    });
    const shouldRefreshDisplayName = !preferredDisplayName && Boolean(fullName || firstName || data.middleName || data.lastName);
    const sensitiveUpdate =
      aadhaarNumber || bankAccountNumber
        ? {
            ...(aadhaarNumber
              ? {
                  aadhaarMasked: maskAadhaarNumber(aadhaarNumber),
                  aadhaarLast4: lastFourDigits(aadhaarNumber)
                }
              : {}),
            ...(bankAccountNumber
              ? {
                  bankAccountMasked: maskBankAccountNumber(bankAccountNumber),
                  bankAccountLast4: lastFourDigits(bankAccountNumber)
                }
              : {})
          }
        : {};
    const after = await tx.student.update({
      where: { id: studentId },
      data: {
        ...studentData,
        ...sensitiveUpdate,
        firstName: firstName ?? (fullName ? nextNames.firstName : undefined),
        fullName,
        displayName: shouldRefreshDisplayName
          ? nextNames.displayName
          : preferredDisplayName,
        updatedById: ctx.userId
      }
    });
    const auditAction =
      aadhaarNumber || bankAccountNumber
        ? ACADEMIA_AUDIT_EVENTS.STUDENT_SENSITIVE_FIELDS_UPDATED
        : data.status && data.status !== before.status
          ? ACADEMIA_AUDIT_EVENTS.STUDENT_STATUS_CHANGED
          : ACADEMIA_AUDIT_EVENTS.STUDENT_UPDATED;
    await writeAuditLog({
      ctx,
      action: auditAction,
      entityType: "Student",
      entityId: after.id,
      branchId: after.branchId,
      before,
      after
    }, tx);
    return after;
  });
}

export async function updateStudentStatus(ctx: TenantContext, studentId: string, status: unknown) {
  const id = idSchema.parse(studentId);
  const nextStatus = studentStatusSchema.parse(status);

  return db.$transaction(async (tx) => {
    const before = await tx.student.findFirst({ where: { id, tenantId: ctx.tenantId } });
    if (!before) throw notFound("STUDENT_NOT_FOUND");

    await requireBranchPermission(ctx, "academia.student.update", before.branchId);
    const after = await tx.student.update({
      where: { id },
      data: { status: nextStatus, updatedById: ctx.userId }
    });
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_STATUS_CHANGED,
      entityType: "Student",
      entityId: after.id,
      branchId: after.branchId,
      before,
      after
    }, tx);
    return after;
  });
}

export async function deactivateStudent(ctx: TenantContext, studentId: string) {
  return updateStudentStatus(ctx, studentId, "INACTIVE");
}
