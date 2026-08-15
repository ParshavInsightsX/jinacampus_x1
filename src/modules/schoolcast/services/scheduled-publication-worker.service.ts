import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import type { TenantContext } from "@/lib/tenant/context";
import { processSchoolCastOutboxSchema } from "@/modules/schoolcast/schemas";
import { settleWithConcurrency } from "@/modules/schoolcast/services/worker-concurrency";
import { publishSchoolCastCommunication } from "@/modules/schoolcast/services/communication.service";

const MAX_PUBLICATION_ATTEMPTS = 8;

function retryDelaySeconds(attempt: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempt - 1)));
}

function safePublicationErrorCode(error: unknown) {
  if (error instanceof Error && /^SCHOOLCAST_[A-Z0-9_]+$/.test(error.message)) {
    return error.message;
  }
  return "SCHOOLCAST_SCHEDULED_PUBLICATION_FAILED";
}

type ClaimedPublication = {
  id: string;
  tenantId: string;
  branchId: string;
  academicYearId: string;
  publicationAttemptCount: number;
  claimedAt: Date;
};

async function claimScheduledPublications(input: {
  now: Date;
  staleBefore: Date;
  limit: number;
}) {
  return db.$transaction((tx) => tx.$queryRaw<ClaimedPublication[]>(Prisma.sql`
    WITH candidates AS (
      SELECT communication."id"
      FROM "schoolcast_communications" AS communication
      INNER JOIN "tenant_settings" AS settings
        ON settings."tenantId" = communication."tenantId"
      WHERE settings."schoolCastEnabled" = TRUE
        AND communication."branchId" IS NOT NULL
        AND communication."academicYearId" IS NOT NULL
        AND (
          (communication."type" IN ('HOMEWORK', 'CLASSWORK') AND settings."schoolCastHomeworkEnabled" = TRUE)
          OR (communication."type" NOT IN ('HOMEWORK', 'CLASSWORK') AND settings."schoolCastNoticesEnabled" = TRUE)
        )
        AND (
          (communication."status" = 'SCHEDULED' AND communication."scheduledAtUtc" <= ${input.now})
          OR (communication."status" = 'PUBLISHING' AND communication."updatedAt" <= ${input.staleBefore})
        )
      ORDER BY communication."scheduledAtUtc" ASC NULLS FIRST, communication."createdAt" ASC
      FOR UPDATE OF communication SKIP LOCKED
      LIMIT ${input.limit}
    )
    UPDATE "schoolcast_communications" AS communication
    SET "status" = 'PUBLISHING',
        "lastPublicationError" = NULL,
        "updatedAt" = ${input.now}
    FROM candidates
    WHERE communication."id" = candidates."id"
    RETURNING
      communication."id",
      communication."tenantId",
      communication."branchId",
      communication."academicYearId",
      communication."publicationAttemptCount",
      communication."updatedAt" AS "claimedAt"
  `));
}

async function buildScheduledPublicationContext(input: {
  communicationId: string;
  tenantId: string;
  branchId: string;
  academicYearId: string;
  workerId: string;
  claimedAt: Date;
}): Promise<TenantContext> {
  const communication = await db.schoolCastCommunication.findFirst({
    where: {
      id: input.communicationId,
      tenantId: input.tenantId,
      branchId: input.branchId,
      academicYearId: input.academicYearId,
      status: "PUBLISHING",
      updatedAt: input.claimedAt
    },
    select: {
      tenantId: true,
      institutionId: true,
      branchId: true,
      academicYearId: true,
      timeZoneId: true,
      tenant: { select: { name: true, slug: true, status: true } },
      institution: { select: { id: true, name: true, displayName: true, logoUrl: true, status: true } },
      branch: { select: { id: true, name: true, code: true, status: true } },
      academicYear: { select: { id: true, name: true, status: true, isActive: true } },
      updatedBy: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          displayName: true,
          userType: true,
          status: true,
          passwordCredential: { select: { mustChange: true } },
          branchAccesses: {
            where: {
              tenantId: input.tenantId,
              branchId: input.branchId,
              isActive: true
            },
            select: { id: true }
          }
        }
      }
    }
  });

  if (
    !communication?.branchId
    || !communication.academicYearId
    || !communication.institutionId
    || communication.tenant.status !== "ACTIVE"
    || communication.institution?.status !== "ACTIVE"
    || communication.branch?.status !== "ACTIVE"
    || communication.academicYear?.status !== "ACTIVE"
    || communication.academicYear.isActive !== true
    || communication.updatedBy.status !== "ACTIVE"
    || communication.updatedBy.passwordCredential?.mustChange === true
    || communication.updatedBy.branchAccesses.length === 0
  ) {
    throw new Error("SCHOOLCAST_SCHEDULER_CONTEXT_INVALID");
  }

  return {
    tenantId: communication.tenantId,
    tenantName: communication.tenant.name,
    tenantSlug: communication.tenant.slug,
    userId: communication.updatedBy.id,
    userEmail: communication.updatedBy.email,
    userName: communication.updatedBy.displayName
      ?? [communication.updatedBy.firstName, communication.updatedBy.lastName].filter(Boolean).join(" "),
    userType: communication.updatedBy.userType,
    activeBranchId: communication.branch.id,
    activeBranchName: communication.branch.name,
    activeBranchCode: communication.branch.code,
    timeZone: communication.timeZoneId,
    accessibleBranchIds: [communication.branch.id],
    activeAcademicYearId: communication.academicYear.id,
    activeAcademicYearName: communication.academicYear.name,
    institutionId: communication.institution.id,
    institutionName: communication.institution.name,
    institutionDisplayName: communication.institution.displayName,
    institutionLogoUrl: communication.institution.logoUrl,
    passwordChangeRequired: false,
    correlationId: "schoolcast-scheduler:" + input.workerId + ":" + randomUUID()
  };
}

export type SchoolCastScheduledPublicationRunResult = {
  claimed: number;
  published: number;
  retrying: number;
  failed: number;
  leaseLost: number;
  workerErrors: number;
};

async function processClaimedPublication(candidate: ClaimedPublication, workerId: string) {
  try {
    const ctx = await buildScheduledPublicationContext({
      communicationId: candidate.id,
      tenantId: candidate.tenantId,
      branchId: candidate.branchId,
      academicYearId: candidate.academicYearId,
      workerId,
      claimedAt: candidate.claimedAt
    });
    await publishSchoolCastCommunication(
      ctx,
      { communicationId: candidate.id },
      { source: "SCHEDULER", auditActorUserId: null, claimedAt: candidate.claimedAt }
    );
    return "published" as const;
  } catch (error) {
    const attemptCount = candidate.publicationAttemptCount + 1;
    const failed = attemptCount >= MAX_PUBLICATION_ATTEMPTS;
    const errorCode = safePublicationErrorCode(error);
    const nextAttemptAt = failed
      ? null
      : new Date(Date.now() + retryDelaySeconds(attemptCount) * 1000);
    const finalized = await db.$transaction(async (tx) => {
      const updated = await tx.schoolCastCommunication.updateMany({
        where: {
          id: candidate.id,
          tenantId: candidate.tenantId,
          status: "PUBLISHING",
          updatedAt: candidate.claimedAt
        },
        data: {
          status: failed ? "FAILED" : "SCHEDULED",
          scheduledAtUtc: nextAttemptAt,
          publicationAttemptCount: attemptCount,
          lastPublicationError: errorCode
        }
      });
      if (updated.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          tenantId: candidate.tenantId,
          branchId: candidate.branchId,
          academicYearId: candidate.academicYearId,
          actorUserId: null,
          action: failed
            ? "schoolcast.communication.publication_failed"
            : "schoolcast.communication.publication_retry_scheduled",
          entityType: "SchoolCastCommunication",
          entityId: candidate.id,
          metadataJson: {
            attemptCount,
            errorCode,
            nextAttemptAt: nextAttemptAt?.toISOString() ?? null,
            workerId
          }
        }
      });
      return true;
    });
    if (!finalized) return "leaseLost" as const;
    return failed ? "failed" as const : "retrying" as const;
  }
}

export async function processScheduledSchoolCastCommunications(
  input: unknown
): Promise<SchoolCastScheduledPublicationRunResult> {
  const data = processSchoolCastOutboxSchema.parse(input);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - data.leaseSeconds * 1000);
  const result: SchoolCastScheduledPublicationRunResult = {
    claimed: 0,
    published: 0,
    retrying: 0,
    failed: 0,
    leaseLost: 0,
    workerErrors: 0
  };

  const candidates = await claimScheduledPublications({
    now,
    staleBefore,
    limit: data.limit
  });
  result.claimed = candidates.length;
  const outcomes = await settleWithConcurrency(
    candidates,
    data.concurrency,
    (candidate) => processClaimedPublication(candidate, data.workerId)
  );
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      result.workerErrors += 1;
      continue;
    }
    if (outcome.value === "published") result.published += 1;
    else if (outcome.value === "retrying") result.retrying += 1;
    else if (outcome.value === "failed") result.failed += 1;
    else if (outcome.value === "leaseLost") result.leaseLost += 1;
  }
  return result;
}
