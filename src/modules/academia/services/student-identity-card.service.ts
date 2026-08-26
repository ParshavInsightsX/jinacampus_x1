import { Prisma } from "@prisma/client";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { getStudentStorageClient } from "@/lib/storage/supabase-storage";
import type { TenantContext } from "@/lib/tenant/context";
import { ACADEMIA_AUDIT_EVENTS } from "@/modules/academia/audit-events";
import {
  deactivateStudentIdentityCardSchema,
  issueStudentIdentityCardSchema
} from "@/modules/academia/schemas/student-identity-card.schema";
import { validationError } from "./shared";

const studentCardEnrollmentSelect = Prisma.validator<Prisma.EnrollmentSelect>()({
  id: true,
  tenantId: true,
  branchId: true,
  academicYearId: true,
  studentId: true,
  status: true,
  rollNumber: true,
  academicYear: {
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      institutionId: true
    }
  },
  classSection: {
    select: {
      id: true,
      displayName: true,
      academicClass: { select: { name: true } },
      section: { select: { name: true } }
    }
  },
  branch: {
    select: {
      id: true,
      name: true,
      code: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      institution: {
        select: {
          id: true,
          name: true,
          displayName: true,
          logoUrl: true
        }
      }
    }
  },
  student: {
    select: {
      id: true,
      branchId: true,
      admissionNumber: true,
      fullName: true,
      displayName: true,
      firstName: true,
      middleName: true,
      lastName: true,
      dateOfBirth: true,
      bloodGroup: true,
      fatherName: true,
      motherName: true,
      guardianName: true,
      status: true,
      documents: {
        where: { type: "PASSPORT_PHOTO", deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true }
      },
      guardianLinks: {
        orderBy: [{ isPrimary: "desc" }, { isEmergencyContact: "desc" }],
        take: 3,
        select: {
          isPrimary: true,
          isEmergencyContact: true,
          relation: true,
          guardian: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              displayName: true,
              phone: true
            }
          }
        }
      }
    }
  }
});

type StudentCardEnrollment = Prisma.EnrollmentGetPayload<{
  select: typeof studentCardEnrollmentSelect;
}>;

const studentCardRecordSelect = Prisma.validator<Prisma.StudentIdentityCardSelect>()({
  id: true,
  tenantId: true,
  institutionId: true,
  branchId: true,
  academicYearId: true,
  studentId: true,
  enrollmentId: true,
  cardVersion: true,
  status: true,
  issuedAt: true,
  validFrom: true,
  validUntil: true,
  printCount: true,
  lastPrintedAt: true,
  deactivatedAt: true,
  deactivationReason: true,
  enrollment: { select: studentCardEnrollmentSelect }
});

type StudentCardRecord = Prisma.StudentIdentityCardGetPayload<{
  select: typeof studentCardRecordSelect;
}>;

export type StudentIdentityCardData = {
  cardId: string;
  cardVersion: number;
  status: string;
  studentId: string;
  enrollmentId: string;
  studentName: string;
  admissionNumber: string;
  className: string;
  sectionName: string;
  classSectionName: string;
  academicYearName: string;
  rollNumber: string | null;
  dateOfBirth: string | null;
  bloodGroup: string | null;
  guardianName: string | null;
  emergencyContact: string | null;
  institutionName: string;
  institutionLogoUrl: string | null;
  branchName: string;
  branchCode: string;
  branchAddress: string | null;
  branchContact: string | null;
  photoUrl: string | null;
  issuedAt: string;
  validFrom: string;
  validUntil: string | null;
  printCount: number;
};

function studentName(enrollment: StudentCardEnrollment) {
  const student = enrollment.student;
  return student.fullName ?? student.displayName ??
    [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

function guardianName(enrollment: StudentCardEnrollment) {
  const link = enrollment.student.guardianLinks.find((item) => item.isPrimary) ??
    enrollment.student.guardianLinks[0];
  if (link) {
    return link.guardian.displayName ??
      [link.guardian.firstName, link.guardian.middleName, link.guardian.lastName].filter(Boolean).join(" ");
  }
  return enrollment.student.guardianName ?? enrollment.student.fatherName ?? enrollment.student.motherName;
}

function emergencyContact(enrollment: StudentCardEnrollment) {
  return (
    enrollment.student.guardianLinks.find((item) => item.isEmergencyContact)?.guardian.phone ??
    enrollment.student.guardianLinks.find((item) => item.isPrimary)?.guardian.phone ??
    enrollment.student.guardianLinks.find((item) => item.guardian.phone)?.guardian.phone ??
    null
  );
}

function branchAddress(enrollment: StudentCardEnrollment) {
  const branch = enrollment.branch;
  const value = [
    branch.addressLine1,
    branch.addressLine2,
    branch.city,
    branch.state,
    branch.postalCode
  ].filter(Boolean).join(", ");
  return value || null;
}

function cardData(record: StudentCardRecord): StudentIdentityCardData {
  const enrollment = record.enrollment;
  return {
    cardId: record.id,
    cardVersion: record.cardVersion,
    status: record.status,
    studentId: record.studentId,
    enrollmentId: record.enrollmentId,
    studentName: studentName(enrollment),
    admissionNumber: enrollment.student.admissionNumber,
    className: enrollment.classSection.academicClass.name,
    sectionName: enrollment.classSection.section.name,
    classSectionName: enrollment.classSection.displayName,
    academicYearName: enrollment.academicYear.name,
    rollNumber: enrollment.rollNumber,
    dateOfBirth: enrollment.student.dateOfBirth?.toISOString() ?? null,
    bloodGroup: enrollment.student.bloodGroup,
    guardianName: guardianName(enrollment),
    emergencyContact: emergencyContact(enrollment),
    institutionName:
      enrollment.branch.institution.displayName ?? enrollment.branch.institution.name,
    institutionLogoUrl: enrollment.branch.institution.logoUrl,
    branchName: enrollment.branch.name,
    branchCode: enrollment.branch.code,
    branchAddress: branchAddress(enrollment),
    branchContact: enrollment.branch.phone ?? enrollment.branch.email,
    photoUrl: enrollment.student.documents[0]
      ? "/api/academia/students/" + enrollment.student.id + "/identity-card/photo"
      : null,
    issuedAt: record.issuedAt.toISOString(),
    validFrom: record.validFrom.toISOString(),
    validUntil: record.validUntil?.toISOString() ?? null,
    printCount: record.printCount
  };
}

async function authorizeStudentCard(
  ctx: TenantContext,
  branchId: string,
  academicYearId: string
) {
  await requirePermission({
    ctx,
    permission: "academia.student.id_card.manage",
    branchId,
    academicYearId
  });
}

async function loadEnrollment(
  ctx: TenantContext,
  enrollmentId: string,
  expectedStudentId?: string
) {
  const enrollment = await db.enrollment.findFirst({
    where: {
      id: enrollmentId,
      tenantId: ctx.tenantId,
      studentId: expectedStudentId,
      branchId: { in: ctx.accessibleBranchIds },
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: studentCardEnrollmentSelect
  });
  if (!enrollment) throw notFound("STUDENT_ENROLLMENT_NOT_FOUND");
  await authorizeStudentCard(ctx, enrollment.branchId, enrollment.academicYearId);
  return enrollment;
}

async function loadCard(ctx: TenantContext, cardId: string) {
  const card = await db.studentIdentityCard.findFirst({
    where: {
      id: cardId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      institutionId: ctx.institutionId ?? undefined
    },
    select: studentCardRecordSelect
  });
  if (!card) throw notFound("STUDENT_ID_CARD_NOT_FOUND");
  await authorizeStudentCard(ctx, card.branchId, card.academicYearId);
  return card;
}

function validateAcademicYearValidity(
  enrollment: StudentCardEnrollment,
  validFrom: Date,
  validUntil: Date | null
) {
  const start = enrollment.academicYear.startDate.getTime();
  const end = enrollment.academicYear.endDate.getTime();
  if (validFrom.getTime() < start || validFrom.getTime() > end) {
    throw validationError("STUDENT_ID_CARD_VALID_FROM_OUTSIDE_ACADEMIC_YEAR");
  }
  if (validUntil && (validUntil.getTime() < validFrom.getTime() || validUntil.getTime() > end)) {
    throw validationError("STUDENT_ID_CARD_VALID_UNTIL_OUTSIDE_ACADEMIC_YEAR");
  }
}

export async function issueStudentIdentityCard(ctx: TenantContext, input: unknown) {
  const data = issueStudentIdentityCardSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const enrollment = await loadEnrollment(ctx, data.enrollmentId, data.studentId);
  if (enrollment.status !== "ACTIVE" || enrollment.student.status !== "ACTIVE") {
    throw validationError("STUDENT_ID_CARD_REQUIRES_ACTIVE_ENROLLMENT");
  }

  const validUntil = data.validUntil ?? enrollment.academicYear.endDate;
  validateAcademicYearValidity(enrollment, data.validFrom, validUntil);

  const card = await db.$transaction(async (tx) => {
    const current = await tx.studentIdentityCard.findMany({
      where: {
        tenantId: ctx.tenantId,
        studentId: enrollment.studentId,
        academicYearId: enrollment.academicYearId,
        status: "ACTIVE"
      },
      select: { id: true, cardVersion: true }
    });
    if (current.length > 0 && (!data.reason || data.reason.trim().length < 5)) {
      throw validationError("STUDENT_ID_CARD_REISSUE_REASON_REQUIRED");
    }

    const latest = await tx.studentIdentityCard.aggregate({
      where: {
        tenantId: ctx.tenantId,
        studentId: enrollment.studentId,
        academicYearId: enrollment.academicYearId
      },
      _max: { cardVersion: true }
    });
    const now = new Date();
    if (current.length > 0) {
      await tx.studentIdentityCard.updateMany({
        where: { tenantId: ctx.tenantId, id: { in: current.map((item) => item.id) } },
        data: {
          status: "SUPERSEDED",
          deactivatedById: ctx.userId,
          deactivatedAt: now,
          deactivationReason: data.reason
        }
      });
    }

    const created = await tx.studentIdentityCard.create({
      data: {
        tenantId: ctx.tenantId,
        institutionId: enrollment.branch.institution.id,
        branchId: enrollment.branchId,
        academicYearId: enrollment.academicYearId,
        studentId: enrollment.studentId,
        enrollmentId: enrollment.id,
        cardVersion: (latest._max.cardVersion ?? 0) + 1,
        status: "ACTIVE",
        issuedById: ctx.userId,
        issuedAt: now,
        validFrom: data.validFrom,
        validUntil
      },
      select: studentCardRecordSelect
    });

    await writeAuditLog({
      ctx,
      action: current.length > 0
        ? ACADEMIA_AUDIT_EVENTS.STUDENT_ID_CARD_REISSUED
        : ACADEMIA_AUDIT_EVENTS.STUDENT_ID_CARD_GENERATED,
      entityType: "StudentIdentityCard",
      entityId: created.id,
      branchId: enrollment.branchId,
      academicYearId: enrollment.academicYearId,
      after: {
        cardVersion: created.cardVersion,
        status: created.status,
        studentId: created.studentId,
        enrollmentId: created.enrollmentId,
        validFrom: created.validFrom,
        validUntil: created.validUntil
      },
      metadata: {
        replacedCardCount: current.length,
        reasonProvided: Boolean(data.reason)
      }
    }, tx);
    return created;
  }, { maxWait: 5_000, timeout: 15_000 });

  return cardData(card);
}

export async function getStudentIdentityCard(ctx: TenantContext, cardId: string) {
  const card = await loadCard(ctx, cardId);
  if (card.status !== "ACTIVE") throw validationError("STUDENT_ID_CARD_NOT_ACTIVE");
  const now = Date.now();
  if (card.validUntil && card.validUntil.getTime() < now) {
    throw validationError("STUDENT_ID_CARD_EXPIRED");
  }

  await writeAuditLog({
    ctx,
    action: ACADEMIA_AUDIT_EVENTS.STUDENT_ID_CARD_VIEWED,
    entityType: "StudentIdentityCard",
    entityId: card.id,
    branchId: card.branchId,
    academicYearId: card.academicYearId,
    metadata: {
      studentId: card.studentId,
      cardVersion: card.cardVersion
    }
  });
  return cardData(card);
}

export async function recordStudentIdentityCardPrint(ctx: TenantContext, cardId: string) {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const card = await loadCard(ctx, cardId);
  if (card.status !== "ACTIVE") throw validationError("STUDENT_ID_CARD_NOT_ACTIVE");

  return db.$transaction(async (tx) => {
    const printedAt = new Date();
    const updated = await tx.studentIdentityCard.update({
      where: { id: card.id },
      data: {
        printCount: { increment: 1 },
        lastPrintedAt: printedAt,
        lastPrintedById: ctx.userId
      },
      select: { id: true, printCount: true, lastPrintedAt: true }
    });
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ID_CARD_PRINTED,
      entityType: "StudentIdentityCard",
      entityId: card.id,
      branchId: card.branchId,
      academicYearId: card.academicYearId,
      metadata: {
        studentId: card.studentId,
        cardVersion: card.cardVersion,
        printCount: updated.printCount
      }
    }, tx);
    return {
      cardId: updated.id,
      printCount: updated.printCount,
      printedAt: updated.lastPrintedAt?.toISOString() ?? printedAt.toISOString()
    };
  });
}

export async function deactivateStudentIdentityCard(ctx: TenantContext, input: unknown) {
  const data = deactivateStudentIdentityCardSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const card = await loadCard(ctx, data.cardId);
  if (card.status !== "ACTIVE") throw validationError("STUDENT_ID_CARD_NOT_ACTIVE");

  return db.$transaction(async (tx) => {
    const deactivatedAt = new Date();
    const updated = await tx.studentIdentityCard.update({
      where: { id: card.id },
      data: {
        status: "DEACTIVATED",
        deactivatedById: ctx.userId,
        deactivatedAt,
        deactivationReason: data.reason
      },
      select: { id: true, status: true, deactivatedAt: true }
    });
    await writeAuditLog({
      ctx,
      action: ACADEMIA_AUDIT_EVENTS.STUDENT_ID_CARD_DEACTIVATED,
      entityType: "StudentIdentityCard",
      entityId: card.id,
      branchId: card.branchId,
      academicYearId: card.academicYearId,
      before: { status: card.status },
      after: { status: updated.status, deactivatedAt: updated.deactivatedAt },
      metadata: {
        studentId: card.studentId,
        cardVersion: card.cardVersion,
        reason: data.reason
      }
    }, tx);
    return {
      ...updated,
      studentId: card.studentId
    };
  });
}

export async function getStudentIdentityCardWorkspace(ctx: TenantContext, studentId: string) {
  const student = await db.student.findFirst({
    where: {
      id: studentId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: { id: true, branchId: true }
  });
  if (!student) throw notFound("STUDENT_NOT_FOUND");

  const enrollments = await db.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      studentId: student.id,
      branchId: student.branchId,
      academicYearId: ctx.activeAcademicYearId ?? undefined
    },
    orderBy: [{ academicYear: { startDate: "desc" } }, { enrolledOn: "desc" }],
    select: studentCardEnrollmentSelect
  });
  if (enrollments.length === 0) {
    await requirePermission({
      ctx,
      permission: "academia.student.id_card.manage",
      branchId: student.branchId,
      academicYearId: ctx.activeAcademicYearId
    });
  } else {
    for (const enrollment of enrollments) {
      await authorizeStudentCard(ctx, enrollment.branchId, enrollment.academicYearId);
    }
  }

  const cards = await db.studentIdentityCard.findMany({
    where: {
      tenantId: ctx.tenantId,
      studentId: student.id,
      branchId: student.branchId,
      academicYearId: ctx.activeAcademicYearId ?? undefined
    },
    orderBy: [{ issuedAt: "desc" }],
    select: {
      id: true,
      enrollmentId: true,
      cardVersion: true,
      status: true,
      issuedAt: true,
      validFrom: true,
      validUntil: true,
      printCount: true,
      lastPrintedAt: true,
      deactivatedAt: true,
      deactivationReason: true
    }
  });

  return {
    studentId: student.id,
    enrollments: enrollments.map((enrollment) => ({
      id: enrollment.id,
      academicYearId: enrollment.academicYearId,
      academicYearName: enrollment.academicYear.name,
      academicYearStartDate: enrollment.academicYear.startDate.toISOString(),
      academicYearEndDate: enrollment.academicYear.endDate.toISOString(),
      branchId: enrollment.branchId,
      classSectionName: enrollment.classSection.displayName,
      status: enrollment.status
    })),
    cards: cards.map((card) => ({
      ...card,
      issuedAt: card.issuedAt.toISOString(),
      validFrom: card.validFrom.toISOString(),
      validUntil: card.validUntil?.toISOString() ?? null,
      lastPrintedAt: card.lastPrintedAt?.toISOString() ?? null,
      deactivatedAt: card.deactivatedAt?.toISOString() ?? null
    }))
  };
}

export async function createStudentIdentityCardPhotoUrl(ctx: TenantContext, studentId: string) {
  const student = await db.student.findFirst({
    where: {
      id: studentId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: {
      id: true,
      branchId: true,
      enrollments: {
        where: {
          tenantId: ctx.tenantId,
          academicYearId: ctx.activeAcademicYearId ?? undefined
        },
        orderBy: { enrolledOn: "desc" },
        take: 1,
        select: { academicYearId: true }
      }
    }
  });
  if (!student) throw notFound("STUDENT_NOT_FOUND");
  const academicYearId = student.enrollments[0]?.academicYearId ?? ctx.activeAcademicYearId;
  await requirePermission({
    ctx,
    permission: "academia.student.id_card.manage",
    branchId: student.branchId,
    academicYearId
  });

  const document = await db.studentDocument.findFirst({
    where: {
      tenantId: ctx.tenantId,
      branchId: student.branchId,
      studentId: student.id,
      type: "PASSPORT_PHOTO",
      deletedAt: null
    },
    orderBy: { createdAt: "desc" },
    select: { storageBucket: true, storagePath: true }
  });
  if (!document) throw notFound("STUDENT_PHOTO_NOT_FOUND");

  const { client } = getStudentStorageClient();
  const { data, error } = await client.storage
    .from(document.storageBucket)
    .createSignedUrl(document.storagePath, 60, { download: false });
  if (error || !data?.signedUrl) {
    throw new AppError("STUDENT_PHOTO_DOWNLOAD_FAILED", "STUDENT_PHOTO_DOWNLOAD_FAILED", 503);
  }
  return data.signedUrl;
}
