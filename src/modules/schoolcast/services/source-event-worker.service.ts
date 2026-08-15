import { Prisma, type NotificationChannel } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { TenantContext } from "@/lib/tenant/context";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { schoolCastContentHash } from "@/modules/schoolcast/policy";
import { processSchoolCastOutboxSchema } from "@/modules/schoolcast/schemas";
import { settleWithConcurrency } from "@/modules/schoolcast/services/worker-concurrency";
import {
  createSchoolCastSourceCommunication,
  publishSchoolCastCommunication,
  type CreateSchoolCastSourceCommunicationInput
} from "@/modules/schoolcast/services/communication.service";
import {
  enqueueSchoolCastDomainEvent,
  SCHOOLCAST_SOURCE_EVENTS
} from "@/modules/schoolcast/services/domain-event.service";

const SOURCE_CHANNELS = ["IN_APP", "EMAIL", "WHATSAPP"] as const satisfies readonly NotificationChannel[];
const TARGET_CHUNK_SIZE = 500;
const MAX_AUDIENCE_RULES = 50;

class SchoolCastSourceEventError extends Error {
  constructor(
    public readonly code: string,
    public readonly retryable: boolean
  ) {
    super(code);
    this.name = "SchoolCastSourceEventError";
  }
}

type ClaimedSchoolCastEvent = {
  id: string;
  tenantId: string;
  claimedAt: Date;
};

type ClaimedGradebookEvent = {
  id: string;
  tenantId: string;
  claimedAt: Date;
};

type AutomationMapping = Omit<CreateSchoolCastSourceCommunicationInput, "sourceModule" | "sourceEntityType" | "sourceEntityId" | "sourceEntityVersionId"> & {
  actorUserId: string;
};

function jsonRecord(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function retryDelaySeconds(attempt: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempt - 1)));
}

function safeErrorCode(error: unknown) {
  if (error instanceof SchoolCastSourceEventError) return error.code;
  if (error instanceof Prisma.PrismaClientKnownRequestError && /^P\d{4}$/.test(error.code)) {
    return `SCHOOLCAST_SOURCE_DB_${error.code}`;
  }
  if (error instanceof Prisma.PrismaClientInitializationError) return "SCHOOLCAST_SOURCE_DB_UNAVAILABLE";
  if (error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "SCHOOLCAST_SOURCE_EVENT_FAILED";
}

function safeDisplay(value: string | null | undefined, fallback: string) {
  const normalized = value?.replace(/[<>\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim();
  return (normalized || fallback).slice(0, 160);
}

function nameOf(person: {
  displayName?: string | null;
  fullName?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
}) {
  return safeDisplay(
    person.displayName
      ?? person.fullName
      ?? [person.firstName, person.middleName, person.lastName].filter(Boolean).join(" "),
    "School community member"
  );
}

function formatDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone }).format(date);
}

function formatDateTime(date: Date | null, timeZone: string) {
  if (!date) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone
  }).format(date);
}

function formatStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function chunkRules(input: {
  ruleType: "STUDENT" | "STAFF" | "CUSTOM";
  targetIds: readonly string[];
  recipientTypes: readonly ("USER" | "STUDENT" | "GUARDIAN" | "STAFF")[];
  label: string;
}) {
  const unique = Array.from(new Set(input.targetIds));
  const rules: CreateSchoolCastSourceCommunicationInput["audienceRules"][number][] = [];
  for (let offset = 0; offset < unique.length; offset += TARGET_CHUNK_SIZE) {
    rules.push({
      ruleType: input.ruleType,
      mode: "INCLUDE",
      label: input.label,
      targetIds: unique.slice(offset, offset + TARGET_CHUNK_SIZE),
      roleCodes: [],
      recipientTypes: [...input.recipientTypes]
    });
  }
  if (rules.length > MAX_AUDIENCE_RULES) {
    throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_AUDIENCE_TOO_LARGE", false);
  }
  return rules;
}

async function buildAutomationContext(input: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  actorUserId: string;
  eventId: string;
}): Promise<TenantContext> {
  const [tenant, branch, academicYear, actor] = await Promise.all([
    db.tenant.findFirst({
      where: { id: input.tenantId, status: "ACTIVE" },
      select: { id: true, name: true, slug: true }
    }),
    db.branch.findFirst({
      where: { id: input.branchId, tenantId: input.tenantId, status: "ACTIVE", institution: { status: "ACTIVE" } },
      select: {
        id: true,
        name: true,
        code: true,
        timezone: true,
        institution: { select: { id: true, name: true, displayName: true, logoUrl: true } }
      }
    }),
    db.academicYear.findFirst({
      where: { id: input.academicYearId, tenantId: input.tenantId },
      select: { id: true, name: true, institutionId: true }
    }),
    db.user.findFirst({
      where: { id: input.actorUserId, tenantId: input.tenantId },
      select: { id: true, email: true, displayName: true, firstName: true, lastName: true, userType: true }
    })
  ]);
  if (!tenant || !branch || !academicYear || !actor || academicYear.institutionId !== branch.institution.id) {
    throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_CONTEXT_INVALID", false);
  }

  return {
    tenantId: tenant.id,
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
    userId: actor.id,
    userEmail: actor.email,
    userName: actor.displayName ?? [actor.firstName, actor.lastName].filter(Boolean).join(" "),
    userType: actor.userType,
    activeBranchId: branch.id,
    activeBranchName: branch.name,
    activeBranchCode: branch.code,
    timeZone: branch.timezone,
    accessibleBranchIds: [branch.id],
    activeAcademicYearId: academicYear.id,
    activeAcademicYearName: academicYear.name,
    institutionId: branch.institution.id,
    institutionName: branch.institution.name,
    institutionDisplayName: branch.institution.displayName,
    institutionLogoUrl: branch.institution.logoUrl,
    passwordChangeRequired: false,
    correlationId: `schoolcast-source:${input.eventId}`
  };
}

async function mapStudentAttendance(event: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  sourceEntityId: string;
}): Promise<AutomationMapping | null> {
  const record = await db.studentAttendanceRecord.findFirst({
    where: {
      id: event.sourceEntityId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      academicYearId: event.academicYearId
    },
    select: {
      studentId: true,
      status: true,
      attendanceDate: true,
      markedAt: true,
      correctedAt: true,
      markedById: true,
      correctedById: true,
      student: { select: { admissionNumber: true, fullName: true, displayName: true, firstName: true, middleName: true, lastName: true } },
      classSection: { select: { displayName: true } },
      branch: { select: { timezone: true } }
    }
  });
  const actorUserId = record?.correctedById ?? record?.markedById;
  if (!record || !actorUserId) return null;
  const studentName = nameOf(record.student);
  const markedAt = record.correctedAt ?? record.markedAt;
  return {
    actorUserId,
    branchId: event.branchId,
    academicYearId: event.academicYearId,
    type: "AUTOMATION",
    category: "ATTENDANCE",
    title: `Attendance update: ${studentName}`,
    summary: `${formatStatus(record.status)} on ${formatDate(record.attendanceDate, record.branch.timezone)}.`,
    content: `${studentName} (Scholar No. ${safeDisplay(record.student.admissionNumber, "Not available")}) was marked ${formatStatus(record.status)} for ${safeDisplay(record.classSection.displayName, "Class not available")} on ${formatDate(record.attendanceDate, record.branch.timezone)} at ${formatDateTime(markedAt, record.branch.timezone)}.`,
    audienceRules: chunkRules({
      ruleType: "STUDENT",
      targetIds: [record.studentId],
      recipientTypes: ["STUDENT", "GUARDIAN"],
      label: "Student attendance recipients"
    }),
    channels: SOURCE_CHANNELS
  };
}

async function mapStaffAttendance(event: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  sourceEntityId: string;
}): Promise<AutomationMapping | null> {
  const record = await db.staffAttendanceRecord.findFirst({
    where: {
      id: event.sourceEntityId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      academicYearId: event.academicYearId
    },
    select: {
      staffId: true,
      status: true,
      attendanceDate: true,
      checkInAt: true,
      checkOutAt: true,
      markedById: true,
      updatedById: true,
      staff: { select: { employeeCode: true, firstName: true, middleName: true, lastName: true } },
      branch: { select: { timezone: true } }
    }
  });
  const actorUserId = record?.updatedById ?? record?.markedById;
  if (!record || !actorUserId) return null;
  const staffName = nameOf(record.staff);
  return {
    actorUserId,
    branchId: event.branchId,
    academicYearId: event.academicYearId,
    type: "AUTOMATION",
    category: "ATTENDANCE",
    title: `Staff attendance update: ${staffName}`,
    summary: `${formatStatus(record.status)} on ${formatDate(record.attendanceDate, record.branch.timezone)}.`,
    content: `${staffName} (Employee Code ${safeDisplay(record.staff.employeeCode, "Not available")}) was marked ${formatStatus(record.status)} on ${formatDate(record.attendanceDate, record.branch.timezone)}. Check-in: ${formatDateTime(record.checkInAt, record.branch.timezone)}. Check-out: ${formatDateTime(record.checkOutAt, record.branch.timezone)}.`,
    audienceRules: chunkRules({
      ruleType: "STAFF",
      targetIds: [record.staffId],
      recipientTypes: ["STAFF"],
      label: "Staff attendance recipient"
    }),
    channels: SOURCE_CHANNELS
  };
}

async function mapStaffLeave(event: {
  tenantId: string;
  branchId: string;
  sourceEntityId: string;
  sourceEventId: string;
}): Promise<AutomationMapping | null> {
  const action = await db.staffLeaveApplicationAction.findFirst({
    where: {
      id: event.sourceEventId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      applicationId: event.sourceEntityId
    },
    select: {
      actorUserId: true,
      application: {
        select: {
          staffId: true,
          startDate: true,
          endDate: true,
          status: true,
          staff: { select: { firstName: true, middleName: true, lastName: true } },
          leaveType: { select: { name: true } },
          branch: { select: { timezone: true } }
        }
      }
    }
  });
  if (!action?.actorUserId) return null;
  const application = action.application;
  const staffName = nameOf(application.staff);
  return {
    actorUserId: action.actorUserId,
    branchId: event.branchId,
    academicYearId: "",
    type: "AUTOMATION",
    category: "LEAVE",
    title: `Leave update: ${staffName}`,
    summary: `${safeDisplay(application.leaveType.name, "Leave")} is ${formatStatus(application.status)}.`,
    content: `${staffName}'s ${safeDisplay(application.leaveType.name, "leave")} application for ${formatDate(application.startDate, application.branch.timezone)} to ${formatDate(application.endDate, application.branch.timezone)} is ${formatStatus(application.status)}.`,
    audienceRules: chunkRules({
      ruleType: "STAFF",
      targetIds: [application.staffId],
      recipientTypes: ["STAFF"],
      label: "Staff leave recipient"
    }),
    channels: SOURCE_CHANNELS
  };
}

async function mapCalendar(event: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  sourceEntityId: string;
}): Promise<AutomationMapping | null> {
  const entry = await db.academicCalendarEntry.findFirst({
    where: {
      id: event.sourceEntityId,
      tenantId: event.tenantId,
      academicYearId: event.academicYearId,
      OR: [{ branchId: null }, { branchId: event.branchId }]
    },
    select: {
      name: true,
      entryType: true,
      status: true,
      startDate: true,
      endDate: true,
      audiences: true,
      createdById: true,
      updatedById: true,
      institutionId: true
    }
  });
  const actorUserId = entry?.updatedById ?? entry?.createdById;
  if (!entry || !actorUserId) return null;
  const branch = await db.branch.findFirst({
    where: { id: event.branchId, tenantId: event.tenantId, institutionId: entry.institutionId, status: "ACTIVE" },
    select: { timezone: true }
  });
  if (!branch) return null;
  const rules: CreateSchoolCastSourceCommunicationInput["audienceRules"][number][] = [];
  if (entry.audiences.includes("STUDENTS")) {
    const enrollments = await db.enrollment.findMany({
      where: {
        tenantId: event.tenantId,
        branchId: event.branchId,
        academicYearId: event.academicYearId,
        status: "ACTIVE",
        student: { status: "ACTIVE" }
      },
      select: { studentId: true }
    });
    rules.push(...chunkRules({
      ruleType: "STUDENT",
      targetIds: enrollments.map((item) => item.studentId),
      recipientTypes: ["STUDENT", "GUARDIAN"],
      label: "Calendar student recipients"
    }));
  }
  const staffTypes: string[] = [];
  if (entry.audiences.includes("TEACHING_STAFF")) staffTypes.push("TEACHER");
  const includesNonTeaching = entry.audiences.includes("NON_TEACHING_STAFF");
  if (staffTypes.length > 0 || includesNonTeaching) {
    const staff = await db.staffProfile.findMany({
      where: {
        tenantId: event.tenantId,
        branchId: event.branchId,
        employmentStatus: "ACTIVE",
        ...(includesNonTeaching && staffTypes.length > 0
          ? {}
          : includesNonTeaching
            ? { staffType: { not: "TEACHER" } }
            : { staffType: "TEACHER" })
      },
      select: { id: true }
    });
    rules.push(...chunkRules({
      ruleType: "STAFF",
      targetIds: staff.map((item) => item.id),
      recipientTypes: ["STAFF"],
      label: "Calendar staff recipients"
    }));
  }
  if (rules.length === 0) return null;
  if (rules.length > MAX_AUDIENCE_RULES) {
    throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_AUDIENCE_TOO_LARGE", false);
  }
  const state = entry.status === "CANCELLED" ? "cancelled" : "scheduled";
  return {
    actorUserId,
    branchId: event.branchId,
    academicYearId: event.academicYearId,
    type: "AUTOMATION",
    category: "CALENDAR",
    title: `Calendar update: ${safeDisplay(entry.name, "School calendar")}`,
    summary: `${formatStatus(entry.entryType)} ${state}.`,
    content: `${safeDisplay(entry.name, "School calendar entry")} is ${state} for ${formatDate(entry.startDate, branch.timezone)} to ${formatDate(entry.endDate, branch.timezone)}.`,
    audienceRules: rules,
    channels: SOURCE_CHANNELS
  };
}

async function mapGradebookPublication(event: {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  sourceEntityId: string;
}): Promise<AutomationMapping | null> {
  const publication = await db.gradebookResultPublication.findFirst({
    where: {
      id: event.sourceEntityId,
      tenantId: event.tenantId,
      branchId: event.branchId,
      academicYearId: event.academicYearId,
      status: "PUBLISHED"
    },
    select: {
      audience: true,
      publishedById: true,
      publishedAt: true,
      exam: { select: { name: true, branch: { select: { timezone: true } } } },
      studentPublications: {
        where: { isEligible: true, publishedAt: { not: null } },
        select: { studentId: true }
      }
    }
  });
  if (!publication?.publishedById || publication.studentPublications.length === 0) return null;
  const recipientTypes = publication.audience === "STUDENT"
    ? ["STUDENT"] as const
    : publication.audience === "GUARDIAN"
      ? ["GUARDIAN"] as const
      : ["STUDENT", "GUARDIAN"] as const;
  return {
    actorUserId: publication.publishedById,
    branchId: event.branchId,
    academicYearId: event.academicYearId,
    type: "AUTOMATION",
    category: "GRADEBOOK",
    title: `Results published: ${safeDisplay(publication.exam.name, "Examination")}`,
    summary: "Approved results are now available to the authorised publication audience.",
    content: `${safeDisplay(publication.exam.name, "Examination")} results were published on ${formatDateTime(publication.publishedAt, publication.exam.branch.timezone)}. Sign in to JinaCampus to view the authorised result and report card.`,
    audienceRules: chunkRules({
      ruleType: "STUDENT",
      targetIds: publication.studentPublications.map((item) => item.studentId),
      recipientTypes,
      label: "GradeBook publication recipients"
    }),
    channels: SOURCE_CHANNELS
  };
}

async function mapEvent(event: {
  tenantId: string;
  branchId: string | null;
  academicYearId: string | null;
  sourceEventId: string;
  eventType: string;
  sourceEntityId: string;
}): Promise<AutomationMapping | null> {
  if (!event.branchId || !event.academicYearId) {
    throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_SCOPE_MISSING", false);
  }
  const scoped = { ...event, branchId: event.branchId, academicYearId: event.academicYearId };
  if (event.eventType === SCHOOLCAST_SOURCE_EVENTS.STUDENT_ATTENDANCE_RECORDED) return mapStudentAttendance(scoped);
  if (event.eventType === SCHOOLCAST_SOURCE_EVENTS.STAFF_ATTENDANCE_RECORDED) return mapStaffAttendance(scoped);
  if (event.eventType === SCHOOLCAST_SOURCE_EVENTS.STAFF_LEAVE_CHANGED) {
    const mapping = await mapStaffLeave(scoped);
    return mapping ? { ...mapping, academicYearId: event.academicYearId } : null;
  }
  if (event.eventType === SCHOOLCAST_SOURCE_EVENTS.CALENDAR_CHANGED) return mapCalendar(scoped);
  if (event.eventType === SCHOOLCAST_SOURCE_EVENTS.GRADEBOOK_RESULT_PUBLISHED) return mapGradebookPublication(scoped);
  throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_EVENT_UNSUPPORTED", false);
}

async function claimSchoolCastDomainEvents(input: {
  workerId: string;
  now: Date;
  staleBefore: Date;
  limit: number;
}) {
  const rows = await db.$transaction((tx) => tx.$queryRaw<Array<{ id: string; tenantId: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT event."id"
      FROM "schoolcast_domain_events" AS event
      INNER JOIN "tenant_settings" AS settings ON settings."tenantId" = event."tenantId"
      WHERE event."attemptCount" < ${env.SCHOOLCAST_DOMAIN_EVENT_MAX_ATTEMPTS}
        AND (
          (event."status" = 'PENDING' AND event."availableAt" <= ${input.now})
          OR (event."status" = 'PROCESSING' AND event."updatedAt" < ${input.staleBefore})
        )
        AND settings."schoolCastEnabled" = TRUE
        AND settings."schoolCastAutomationEnabled" = TRUE
      ORDER BY event."availableAt" ASC, event."createdAt" ASC
      FOR UPDATE OF event SKIP LOCKED
      LIMIT ${input.limit}
    )
    UPDATE "schoolcast_domain_events" AS event
    SET "status" = 'PROCESSING',
        "attemptCount" = event."attemptCount" + 1,
        "lastError" = NULL,
        "updatedAt" = ${input.now}
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."tenantId"
  `));
  return rows.map((row): ClaimedSchoolCastEvent => ({ ...row, claimedAt: input.now }));
}

async function finalizeIgnoredEvent(candidate: ClaimedSchoolCastEvent, eventType: string, sourceModule: string) {
  return db.$transaction(async (tx) => {
    const updated = await tx.schoolCastDomainEvent.updateMany({
      where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", updatedAt: candidate.claimedAt },
      data: { status: "IGNORED", processedAt: new Date(), lastError: "SCHOOLCAST_SOURCE_RECORD_NOT_ACTIONABLE" }
    });
    if (updated.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        tenantId: candidate.tenantId,
        actorUserId: null,
        action: SCHOOLCAST_AUDIT_EVENTS.DOMAIN_EVENT_IGNORED,
        entityType: "SchoolCastDomainEvent",
        entityId: candidate.id,
        metadataJson: { eventType, sourceModule, reasonCode: "SCHOOLCAST_SOURCE_RECORD_NOT_ACTIONABLE" }
      }
    });
    return true;
  });
}

async function processSchoolCastDomainEvent(candidate: ClaimedSchoolCastEvent, workerId: string) {
  const event = await db.schoolCastDomainEvent.findFirst({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", updatedAt: candidate.claimedAt }
  });
  if (!event) return "leaseLost" as const;
  const payload = jsonRecord(event.payloadJson);
  if (schoolCastContentHash(payload) !== event.payloadHash) {
    throw new SchoolCastSourceEventError("SCHOOLCAST_SOURCE_PAYLOAD_HASH_MISMATCH", false);
  }
  const mapping = await mapEvent(event);
  if (!mapping) {
    const ignored = await finalizeIgnoredEvent(candidate, event.eventType, event.sourceModule);
    return ignored ? "ignored" as const : "leaseLost" as const;
  }
  const ctx = await buildAutomationContext({
    tenantId: event.tenantId,
    branchId: mapping.branchId,
    academicYearId: mapping.academicYearId,
    actorUserId: mapping.actorUserId,
    eventId: event.id
  });
  const communication = await createSchoolCastSourceCommunication(ctx, {
    ...mapping,
    sourceModule: event.sourceModule,
    sourceEntityType: event.sourceEntityType,
    sourceEntityId: event.sourceEntityId,
    sourceEntityVersionId: event.id
  }, { source: "AUTOMATION", auditActorUserId: null });
  const published = await publishSchoolCastCommunication(
    ctx,
    { communicationId: communication.id },
    { source: "AUTOMATION", auditActorUserId: null }
  );
  const processedAt = new Date();
  const finalized = await db.$transaction(async (tx) => {
    const updated = await tx.schoolCastDomainEvent.updateMany({
      where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", updatedAt: candidate.claimedAt },
      data: { status: "PROCESSED", processedAt, lastError: null }
    });
    if (updated.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        tenantId: event.tenantId,
        branchId: event.branchId,
        academicYearId: event.academicYearId,
        actorUserId: null,
        action: SCHOOLCAST_AUDIT_EVENTS.DOMAIN_EVENT_PROCESSED,
        entityType: "SchoolCastDomainEvent",
        entityId: event.id,
        metadataJson: {
          sourceModule: event.sourceModule,
          eventType: event.eventType,
          communicationId: communication.id,
          recipientCount: published.recipientCount,
          workerId
        }
      }
    });
    return true;
  });
  return finalized ? "processed" as const : "leaseLost" as const;
}

async function releaseSchoolCastDomainEvent(candidate: ClaimedSchoolCastEvent, error: unknown, workerId: string) {
  const current = await db.schoolCastDomainEvent.findFirst({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", updatedAt: candidate.claimedAt },
    select: { attemptCount: true, branchId: true, academicYearId: true, eventType: true, sourceModule: true }
  });
  if (!current) return "leaseLost" as const;
  const retryable = !(error instanceof SchoolCastSourceEventError) || error.retryable;
  const retry = retryable && current.attemptCount < env.SCHOOLCAST_DOMAIN_EVENT_MAX_ATTEMPTS;
  const errorCode = safeErrorCode(error);
  const now = new Date();
  const finalized = await db.$transaction(async (tx) => {
    const updated = await tx.schoolCastDomainEvent.updateMany({
      where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", updatedAt: candidate.claimedAt },
      data: {
        status: retry ? "PENDING" : "FAILED",
        availableAt: retry ? new Date(now.getTime() + retryDelaySeconds(current.attemptCount) * 1000) : now,
        processedAt: retry ? null : now,
        lastError: errorCode
      }
    });
    if (updated.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        tenantId: candidate.tenantId,
        branchId: current.branchId,
        academicYearId: current.academicYearId,
        actorUserId: null,
        action: retry ? SCHOOLCAST_AUDIT_EVENTS.DOMAIN_EVENT_RETRYING : SCHOOLCAST_AUDIT_EVENTS.DOMAIN_EVENT_FAILED,
        entityType: "SchoolCastDomainEvent",
        entityId: candidate.id,
        metadataJson: {
          sourceModule: current.sourceModule,
          eventType: current.eventType,
          errorCode,
          attemptCount: current.attemptCount,
          retrying: retry,
          workerId
        }
      }
    });
    return true;
  });
  return finalized ? (retry ? "retrying" as const : "failed" as const) : "leaseLost" as const;
}

export type SchoolCastSourceEventRunResult = {
  claimed: number;
  processed: number;
  ignored: number;
  retrying: number;
  failed: number;
  leaseLost: number;
  workerErrors: number;
};

export async function processSchoolCastSourceEvents(input: unknown): Promise<SchoolCastSourceEventRunResult> {
  const data = processSchoolCastOutboxSchema.parse(input);
  const now = new Date();
  const candidates = await claimSchoolCastDomainEvents({
    workerId: data.workerId,
    now,
    staleBefore: new Date(now.getTime() - data.leaseSeconds * 1000),
    limit: data.limit
  });
  const result: SchoolCastSourceEventRunResult = {
    claimed: candidates.length,
    processed: 0,
    ignored: 0,
    retrying: 0,
    failed: 0,
    leaseLost: 0,
    workerErrors: 0
  };
  const outcomes = await settleWithConcurrency(candidates, data.concurrency, async (candidate) => {
    try {
      return await processSchoolCastDomainEvent(candidate, data.workerId);
    } catch (error) {
      return releaseSchoolCastDomainEvent(candidate, error, data.workerId);
    }
  });
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") result.workerErrors += 1;
    else if (outcome.value === "processed") result.processed += 1;
    else if (outcome.value === "ignored") result.ignored += 1;
    else if (outcome.value === "retrying") result.retrying += 1;
    else if (outcome.value === "failed") result.failed += 1;
    else if (outcome.value === "leaseLost") result.leaseLost += 1;
  }
  return result;
}

async function claimGradebookEvents(input: { now: Date; staleBefore: Date; limit: number }) {
  const rows = await db.$transaction((tx) => tx.$queryRaw<Array<{ id: string; tenantId: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT event."id"
      FROM "gradebook_domain_event_outbox" AS event
      INNER JOIN "tenant_settings" AS settings ON settings."tenantId" = event."tenantId"
      WHERE event."eventType" = ${SCHOOLCAST_SOURCE_EVENTS.GRADEBOOK_RESULT_PUBLISHED}
        AND event."attemptCount" < ${env.SCHOOLCAST_DOMAIN_EVENT_MAX_ATTEMPTS}
        AND (
          (event."status" IN ('PENDING', 'FAILED') AND event."scheduledAt" <= ${input.now})
          OR (event."status" = 'PROCESSING' AND event."lockedAt" < ${input.staleBefore})
        )
        AND settings."schoolCastEnabled" = TRUE
        AND settings."schoolCastAutomationEnabled" = TRUE
        AND settings."gradebookEnabled" = TRUE
        AND settings."gradebookPublicationEnabled" = TRUE
      ORDER BY event."scheduledAt" ASC, event."createdAt" ASC
      FOR UPDATE OF event SKIP LOCKED
      LIMIT ${input.limit}
    )
    UPDATE "gradebook_domain_event_outbox" AS event
    SET "status" = 'PROCESSING',
        "attemptCount" = event."attemptCount" + 1,
        "lockedAt" = ${input.now},
        "lastErrorCode" = NULL,
        "lastErrorMessage" = NULL,
        "updatedAt" = ${input.now}
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING event."id", event."tenantId"
  `));
  return rows.map((row): ClaimedGradebookEvent => ({ ...row, claimedAt: input.now }));
}

async function bridgeGradebookEvent(candidate: ClaimedGradebookEvent, workerId: string) {
  const event = await db.gradebookDomainEventOutbox.findFirst({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", lockedAt: candidate.claimedAt }
  });
  if (!event) return "leaseLost" as const;
  const payload = jsonRecord(event.payloadJson);
  const queued = await db.$transaction(async (tx) => enqueueSchoolCastDomainEvent(tx, {
    tenantId: event.tenantId,
    branchId: event.branchId,
    academicYearId: event.academicYearId,
    sourceModule: "GRADEBOOK",
    sourceEventId: event.id,
    eventType: SCHOOLCAST_SOURCE_EVENTS.GRADEBOOK_RESULT_PUBLISHED,
    sourceEntityType: event.aggregateType,
    sourceEntityId: event.aggregateId,
    payload: { ...payload, gradebookEventVersion: event.eventVersion }
  }));
  if (!queued.queued) throw new SchoolCastSourceEventError("SCHOOLCAST_AUTOMATION_DISABLED", false);
  const deliveredAt = new Date();
  const finalized = await db.$transaction(async (tx) => {
    const updated = await tx.gradebookDomainEventOutbox.updateMany({
      where: { id: event.id, tenantId: event.tenantId, status: "PROCESSING", lockedAt: candidate.claimedAt },
      data: { status: "DELIVERED", deliveredAt, lockedAt: null, lastErrorCode: null, lastErrorMessage: null }
    });
    if (updated.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        tenantId: event.tenantId,
        branchId: event.branchId,
        academicYearId: event.academicYearId,
        actorUserId: null,
        action: SCHOOLCAST_AUDIT_EVENTS.GRADEBOOK_EVENT_BRIDGED,
        entityType: "GradebookDomainEventOutbox",
        entityId: event.id,
        metadataJson: { eventType: event.eventType, schoolCastDomainEventId: queued.eventId, workerId }
      }
    });
    return true;
  });
  return finalized ? "bridged" as const : "leaseLost" as const;
}

async function releaseGradebookEvent(candidate: ClaimedGradebookEvent, error: unknown, workerId: string) {
  const event = await db.gradebookDomainEventOutbox.findFirst({
    where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", lockedAt: candidate.claimedAt },
    select: { attemptCount: true, branchId: true, academicYearId: true, eventType: true }
  });
  if (!event) return "leaseLost" as const;
  const retryable = !(error instanceof SchoolCastSourceEventError) || error.retryable;
  const retry = retryable && event.attemptCount < env.SCHOOLCAST_DOMAIN_EVENT_MAX_ATTEMPTS;
  const errorCode = safeErrorCode(error);
  const now = new Date();
  const finalized = await db.$transaction(async (tx) => {
    const updated = await tx.gradebookDomainEventOutbox.updateMany({
      where: { id: candidate.id, tenantId: candidate.tenantId, status: "PROCESSING", lockedAt: candidate.claimedAt },
      data: {
        status: retry ? "FAILED" : "DEAD_LETTER",
        scheduledAt: retry ? new Date(now.getTime() + retryDelaySeconds(event.attemptCount) * 1000) : now,
        lockedAt: null,
        lastErrorCode: errorCode,
        lastErrorMessage: "SchoolCast could not process this GradeBook publication event."
      }
    });
    if (updated.count !== 1) return false;
    await tx.auditLog.create({
      data: {
        tenantId: candidate.tenantId,
        branchId: event.branchId,
        academicYearId: event.academicYearId,
        actorUserId: null,
        action: retry ? SCHOOLCAST_AUDIT_EVENTS.GRADEBOOK_EVENT_RETRYING : SCHOOLCAST_AUDIT_EVENTS.GRADEBOOK_EVENT_DEAD_LETTER,
        entityType: "GradebookDomainEventOutbox",
        entityId: candidate.id,
        metadataJson: { eventType: event.eventType, errorCode, attemptCount: event.attemptCount, workerId }
      }
    });
    return true;
  });
  return finalized ? (retry ? "retrying" as const : "deadLetter" as const) : "leaseLost" as const;
}

export type GradebookSchoolCastBridgeRunResult = {
  claimed: number;
  bridged: number;
  retrying: number;
  deadLetter: number;
  leaseLost: number;
  workerErrors: number;
};

export async function processGradebookSchoolCastEvents(input: unknown): Promise<GradebookSchoolCastBridgeRunResult> {
  const data = processSchoolCastOutboxSchema.parse(input);
  const now = new Date();
  const candidates = await claimGradebookEvents({
    now,
    staleBefore: new Date(now.getTime() - data.leaseSeconds * 1000),
    limit: data.limit
  });
  const result: GradebookSchoolCastBridgeRunResult = {
    claimed: candidates.length,
    bridged: 0,
    retrying: 0,
    deadLetter: 0,
    leaseLost: 0,
    workerErrors: 0
  };
  const outcomes = await settleWithConcurrency(candidates, data.concurrency, async (candidate) => {
    try {
      return await bridgeGradebookEvent(candidate, data.workerId);
    } catch (error) {
      return releaseGradebookEvent(candidate, error, data.workerId);
    }
  });
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") result.workerErrors += 1;
    else if (outcome.value === "bridged") result.bridged += 1;
    else if (outcome.value === "retrying") result.retrying += 1;
    else if (outcome.value === "deadLetter") result.deadLetter += 1;
    else if (outcome.value === "leaseLost") result.leaseLost += 1;
  }
  return result;
}
