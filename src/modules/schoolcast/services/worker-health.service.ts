import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { probeSchoolCastMalwareScanner } from "@/modules/schoolcast/services/malware-scanner.service";

function ageSeconds(date: Date | null, now: Date) {
  return date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1_000)) : 0;
}

export async function getSchoolCastWorkerHealth(now = new Date()) {
  const [
    domainPending,
    domainProcessing,
    domainFailed,
    outboxPending,
    outboxSending,
    outboxUndeliverable,
    attachmentPending,
    attachmentFailed,
    attachmentRejected,
    scheduledDue,
    oldestDomain,
    oldestOutbox,
    oldestAttachment
  ] = await db.$transaction([
    db.schoolCastDomainEvent.count({ where: { status: "PENDING", availableAt: { lte: now } } }),
    db.schoolCastDomainEvent.count({ where: { status: "PROCESSING" } }),
    db.schoolCastDomainEvent.count({ where: { status: "FAILED" } }),
    db.notificationOutbox.count({
      where: { schoolCastCommunicationId: { not: null }, status: { in: ["QUEUED", "RETRYING"] }, availableAt: { lte: now } }
    }),
    db.notificationOutbox.count({ where: { schoolCastCommunicationId: { not: null }, status: "SENDING" } }),
    db.notificationOutbox.count({ where: { schoolCastCommunicationId: { not: null }, status: "UNDELIVERABLE" } }),
    db.schoolCastAttachment.count({ where: { deletedAt: null, scanStatus: "PENDING", scanAvailableAt: { lte: now } } }),
    db.schoolCastAttachment.count({ where: { deletedAt: null, scanStatus: "FAILED" } }),
    db.schoolCastAttachment.count({ where: { deletedAt: null, scanStatus: "REJECTED" } }),
    db.schoolCastCommunication.count({ where: { status: "SCHEDULED", scheduledAtUtc: { lte: now } } }),
    db.schoolCastDomainEvent.findFirst({
      where: { status: "PENDING", availableAt: { lte: now } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    db.notificationOutbox.findFirst({
      where: { schoolCastCommunicationId: { not: null }, status: { in: ["QUEUED", "RETRYING"] }, availableAt: { lte: now } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" }
    }),
    db.schoolCastAttachment.findFirst({
      where: { deletedAt: null, scanStatus: { in: ["PENDING", "FAILED"] }, scanAvailableAt: { lte: now } },
      select: { createdAt: true },
      orderBy: { createdAt: "asc" }
    })
  ]);

  const scannerHealth = await probeSchoolCastMalwareScanner();
  const queueDepth = domainPending + outboxPending + attachmentPending + scheduledDue;
  const oldestAgeSeconds = Math.max(
    ageSeconds(oldestDomain?.createdAt ?? null, now),
    ageSeconds(oldestOutbox?.createdAt ?? null, now),
    ageSeconds(oldestAttachment?.createdAt ?? null, now)
  );
  const reasons: string[] = [];
  if (queueDepth >= env.SCHOOLCAST_WORKER_ALERT_QUEUE_DEPTH) reasons.push("QUEUE_DEPTH_HIGH");
  if (oldestAgeSeconds >= env.SCHOOLCAST_WORKER_ALERT_OLDEST_AGE_SECONDS) reasons.push("QUEUE_AGE_HIGH");
  if (domainFailed > 0 || outboxUndeliverable > 0) reasons.push("DEAD_LETTER_PRESENT");
  if (attachmentFailed > 0) reasons.push("ATTACHMENT_SCAN_FAILURE_PRESENT");
  if (attachmentPending > 0 && env.SCHOOLCAST_MALWARE_SCANNER_MODE === "DISABLED") {
    reasons.push("SCANNER_DISABLED_WITH_QUARANTINE_BACKLOG");
  }
  if (env.SCHOOLCAST_MALWARE_SCANNER_MODE === "CLAMAV" && scannerHealth.status !== "READY") {
    reasons.push("SCANNER_UNAVAILABLE");
  }

  return {
    status: reasons.length === 0 ? "HEALTHY" as const : "DEGRADED" as const,
    checkedAt: now.toISOString(),
    reasons,
    scanner: scannerHealth,
    queueDepth,
    oldestAgeSeconds,
    queues: {
      domainEvents: { pending: domainPending, processing: domainProcessing, failed: domainFailed },
      deliveries: { pending: outboxPending, sending: outboxSending, undeliverable: outboxUndeliverable },
      attachments: { pending: attachmentPending, failed: attachmentFailed, rejected: attachmentRejected },
      scheduledPublications: { due: scheduledDue }
    }
  };
}
