import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { detectSchoolCastAttachmentMimeType } from "@/lib/files/schoolcast-attachment-file";
import {
  ensureSchoolCastStorageBucket,
  getSchoolCastStorageClient
} from "@/lib/storage/supabase-storage";
import { SCHOOLCAST_AUDIT_EVENTS } from "@/modules/schoolcast/audit-events";
import { processSchoolCastOutboxSchema } from "@/modules/schoolcast/schemas";
import {
  scanSchoolCastAttachmentBytes,
  SchoolCastMalwareScannerError
} from "@/modules/schoolcast/services/malware-scanner.service";
import { settleWithConcurrency } from "@/modules/schoolcast/services/worker-concurrency";

function retryDelaySeconds(attempt: number) {
  return Math.min(3_600, 30 * (2 ** Math.max(0, attempt - 1)));
}

function safeFailureCode(error: unknown) {
  if (error instanceof SchoolCastMalwareScannerError) return error.code;
  return "SCHOOLCAST_ATTACHMENT_SCAN_FAILED";
}

function branchScope(attachment: {
  communication: { branchId: string | null; academicYearId: string | null } | null;
  homeworkVersion: { homeworkItem: { branchId: string; academicYearId: string } } | null;
}) {
  return {
    branchId: attachment.communication?.branchId
      ?? attachment.homeworkVersion?.homeworkItem.branchId
      ?? null,
    academicYearId: attachment.communication?.academicYearId
      ?? attachment.homeworkVersion?.homeworkItem.academicYearId
      ?? null
  };
}

function safeStoragePath(input: {
  tenantId: string;
  branchId: string | null;
  storagePath: string;
}) {
  if (!input.branchId || input.storagePath.includes("..") || input.storagePath.includes("\\")) {
    throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_STORAGE_SCOPE_INVALID", false);
  }
  const expectedPrefix = `${input.tenantId}/${input.branchId}/schoolcast/`;
  if (!input.storagePath.startsWith(expectedPrefix)) {
    throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_STORAGE_SCOPE_INVALID", false);
  }
  if (input.storagePath.startsWith(`${expectedPrefix}quarantine/`)) {
    return input.storagePath.replace(`${expectedPrefix}quarantine/`, `${expectedPrefix}safe/`);
  }
  return input.storagePath.replace(expectedPrefix, `${expectedPrefix}safe/`);
}

export type SchoolCastAttachmentScanRunResult = {
  scannerMode: "DISABLED" | "CLAMAV";
  claimed: number;
  safe: number;
  rejected: number;
  retrying: number;
  failed: number;
};

export async function processSchoolCastAttachmentScans(
  input: unknown
): Promise<SchoolCastAttachmentScanRunResult> {
  const data = processSchoolCastOutboxSchema.parse(input);
  const result: SchoolCastAttachmentScanRunResult = {
    scannerMode: env.SCHOOLCAST_MALWARE_SCANNER_MODE,
    claimed: 0,
    safe: 0,
    rejected: 0,
    retrying: 0,
    failed: 0
  };
  if (env.SCHOOLCAST_MALWARE_SCANNER_MODE !== "CLAMAV") return result;

  await ensureSchoolCastStorageBucket();
  const { client, bucket } = getSchoolCastStorageClient();
  const now = new Date();
  const leaseUntil = new Date(now.getTime() + data.leaseSeconds * 1000);
  const candidates = await db.$transaction((tx) => tx.$queryRaw<Array<{ id: string; tenantId: string }>>(Prisma.sql`
    WITH candidates AS (
      SELECT attachment."id"
      FROM "schoolcast_attachments" AS attachment
      WHERE attachment."deletedAt" IS NULL
        AND attachment."scanStatus" IN ('PENDING', 'FAILED')
        AND attachment."scanAttemptCount" < ${env.SCHOOLCAST_SCAN_MAX_ATTEMPTS}
        AND attachment."scanAvailableAt" <= ${now}
        AND (attachment."scanLeaseUntil" IS NULL OR attachment."scanLeaseUntil" < ${now})
      ORDER BY attachment."scanAvailableAt" ASC, attachment."createdAt" ASC
      FOR UPDATE OF attachment SKIP LOCKED
      LIMIT ${data.limit}
    )
    UPDATE "schoolcast_attachments" AS attachment
    SET "scanLockedAt" = ${now},
        "scanLeaseUntil" = ${leaseUntil},
        "scanLockOwner" = ${data.workerId},
        "scanAttemptCount" = attachment."scanAttemptCount" + 1,
        "scanFailureCode" = NULL,
        "updatedAt" = ${now}
    FROM candidates
    WHERE attachment."id" = candidates."id"
    RETURNING attachment."id", attachment."tenantId"
  `));
  result.claimed = candidates.length;

  const outcomes = await settleWithConcurrency(candidates, data.concurrency, async (candidate) => {
    const renewed = await db.schoolCastAttachment.updateMany({
      where: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        deletedAt: null,
        scanLockOwner: data.workerId
      },
      data: { scanLeaseUntil: new Date(Date.now() + data.leaseSeconds * 1000) }
    });
    if (renewed.count !== 1) return;

    const attachment = await db.schoolCastAttachment.findFirst({
      where: {
        id: candidate.id,
        tenantId: candidate.tenantId,
        deletedAt: null,
        scanLockOwner: data.workerId
      },
      include: {
        communication: { select: { branchId: true, academicYearId: true } },
        homeworkVersion: {
          select: { homeworkItem: { select: { branchId: true, academicYearId: true } } }
        }
      }
    });
    if (!attachment) return;
    const scope = branchScope(attachment);

    await db.auditLog.create({
      data: {
        tenantId: attachment.tenantId,
        branchId: scope.branchId,
        academicYearId: scope.academicYearId,
        actorUserId: null,
        action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_SCAN_STARTED,
        entityType: "SchoolCastAttachment",
        entityId: attachment.id,
        metadataJson: {
          attemptCount: attachment.scanAttemptCount,
          workerId: data.workerId
        }
      }
    });

    try {
      if (attachment.storageBucket !== bucket) {
        throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_STORAGE_BUCKET_INVALID", false);
      }
      const safePath = safeStoragePath({
        tenantId: attachment.tenantId,
        branchId: scope.branchId,
        storagePath: attachment.storagePath
      });
      const download = await client.storage.from(bucket).download(attachment.storagePath);
      if (download.error || !download.data) {
        throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_QUARANTINE_DOWNLOAD_FAILED", true);
      }
      const bytes = new Uint8Array(await download.data.arrayBuffer());
      const checksum = createHash("sha256").update(bytes).digest("hex");
      const detectedMimeType = detectSchoolCastAttachmentMimeType(bytes);
      if (
        bytes.byteLength !== attachment.sizeBytes ||
        checksum !== attachment.checksumSha256 ||
        detectedMimeType !== attachment.mimeType
      ) {
        throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_INTEGRITY_CHECK_FAILED", false);
      }

      const scan = await scanSchoolCastAttachmentBytes(bytes);
      if (scan.status === "INFECTED") {
        await db.$transaction(async (tx) => {
          const updated = await tx.schoolCastAttachment.updateMany({
            where: {
              id: attachment.id,
              tenantId: attachment.tenantId,
              scanLockOwner: data.workerId
            },
            data: {
              scanStatus: "REJECTED",
              scanCompletedAt: new Date(),
              scanEngine: scan.engine,
              scanReference: scan.reference,
              scanFailureCode: "SCHOOLCAST_ATTACHMENT_MALWARE_DETECTED",
              scanLockedAt: null,
              scanLeaseUntil: null,
              scanLockOwner: null
            }
          });
          if (updated.count !== 1) throw new Error("SCHOOLCAST_ATTACHMENT_SCAN_LEASE_LOST");
          await tx.auditLog.create({
            data: {
              tenantId: attachment.tenantId,
              branchId: scope.branchId,
              academicYearId: scope.academicYearId,
              actorUserId: null,
              action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_SCAN_REJECTED,
              entityType: "SchoolCastAttachment",
              entityId: attachment.id,
              metadataJson: {
                attemptCount: attachment.scanAttemptCount,
                scanEngine: scan.engine,
                scanReference: scan.reference,
                failureCode: "SCHOOLCAST_ATTACHMENT_MALWARE_DETECTED"
              }
            }
          });
        });
        await client.storage.from(bucket).remove([attachment.storagePath]);
        result.rejected += 1;
        return;
      }

      const move = await client.storage.from(bucket).move(attachment.storagePath, safePath);
      if (move.error) {
        throw new SchoolCastMalwareScannerError("SCHOOLCAST_ATTACHMENT_SAFE_MOVE_FAILED", true);
      }
      try {
        await db.$transaction(async (tx) => {
          const updated = await tx.schoolCastAttachment.updateMany({
            where: {
              id: attachment.id,
              tenantId: attachment.tenantId,
              scanLockOwner: data.workerId
            },
            data: {
              storagePath: safePath,
              scanStatus: "SAFE",
              scanCompletedAt: new Date(),
              scanEngine: scan.engine,
              scanReference: scan.reference,
              scanFailureCode: null,
              scanLockedAt: null,
              scanLeaseUntil: null,
              scanLockOwner: null
            }
          });
          if (updated.count !== 1) throw new Error("SCHOOLCAST_ATTACHMENT_SCAN_LEASE_LOST");
          await tx.auditLog.create({
            data: {
              tenantId: attachment.tenantId,
              branchId: scope.branchId,
              academicYearId: scope.academicYearId,
              actorUserId: null,
              action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_SCAN_SAFE,
              entityType: "SchoolCastAttachment",
              entityId: attachment.id,
              metadataJson: {
                attemptCount: attachment.scanAttemptCount,
                scanEngine: scan.engine
              }
            }
          });
        });
      } catch (error) {
        await client.storage.from(bucket).move(safePath, attachment.storagePath);
        throw error;
      }
      result.safe += 1;
    } catch (error) {
      const scannerError = error instanceof SchoolCastMalwareScannerError ? error : null;
      const permanent = scannerError?.retryable === false;
      const failureCode = safeFailureCode(error);
      if (permanent) {
        await db.$transaction(async (tx) => {
          const updated = await tx.schoolCastAttachment.updateMany({
            where: { id: attachment.id, tenantId: attachment.tenantId, scanLockOwner: data.workerId },
            data: {
              scanStatus: "REJECTED",
              scanCompletedAt: new Date(),
              scanFailureCode: failureCode,
              scanLockedAt: null,
              scanLeaseUntil: null,
              scanLockOwner: null
            }
          });
          if (updated.count !== 1) throw new Error("SCHOOLCAST_ATTACHMENT_SCAN_LEASE_LOST");
          await tx.auditLog.create({
            data: {
              tenantId: attachment.tenantId,
              branchId: scope.branchId,
              academicYearId: scope.academicYearId,
              actorUserId: null,
              action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_SCAN_REJECTED,
              entityType: "SchoolCastAttachment",
              entityId: attachment.id,
              metadataJson: {
                attemptCount: attachment.scanAttemptCount,
                failureCode
              }
            }
          });
        });
        await client.storage.from(bucket).remove([attachment.storagePath]);
        result.rejected += 1;
        return;
      }

      const retrying = attachment.scanAttemptCount < env.SCHOOLCAST_SCAN_MAX_ATTEMPTS;
      await db.$transaction(async (tx) => {
        const updated = await tx.schoolCastAttachment.updateMany({
          where: { id: attachment.id, tenantId: attachment.tenantId, scanLockOwner: data.workerId },
          data: {
            scanStatus: "FAILED",
            scanAvailableAt: retrying
              ? new Date(Date.now() + retryDelaySeconds(attachment.scanAttemptCount) * 1000)
              : new Date(),
            scanCompletedAt: retrying ? null : new Date(),
            scanFailureCode: failureCode,
            scanLockedAt: null,
            scanLeaseUntil: null,
            scanLockOwner: null
          }
        });
        if (updated.count !== 1) throw new Error("SCHOOLCAST_ATTACHMENT_SCAN_LEASE_LOST");
        await tx.auditLog.create({
          data: {
            tenantId: attachment.tenantId,
            branchId: scope.branchId,
            academicYearId: scope.academicYearId,
            actorUserId: null,
            action: SCHOOLCAST_AUDIT_EVENTS.ATTACHMENT_SCAN_FAILED,
            entityType: "SchoolCastAttachment",
            entityId: attachment.id,
            metadataJson: {
              attemptCount: attachment.scanAttemptCount,
              failureCode,
              retrying
            }
          }
        });
      });
      if (retrying) result.retrying += 1;
      else result.failed += 1;
    }
  });

  result.failed += outcomes.filter((outcome) => outcome.status === "rejected").length;
  return result;
}
