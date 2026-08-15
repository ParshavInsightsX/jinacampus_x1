import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db";
import { env } from "../src/lib/env";
import { processSchoolCastAttachmentScans } from "../src/modules/schoolcast/services/attachment-scan-worker.service";
import { processSchoolCastOutbox } from "../src/modules/schoolcast/services/outbox-worker.service";
import { processScheduledSchoolCastCommunications } from "../src/modules/schoolcast/services/scheduled-publication-worker.service";
import {
  processGradebookSchoolCastEvents,
  processSchoolCastSourceEvents
} from "../src/modules/schoolcast/services/source-event-worker.service";
import { sendSchoolCastExternalHeartbeat } from "../src/modules/schoolcast/services/worker-external-heartbeat";
import { getSchoolCastWorkerHealth } from "../src/modules/schoolcast/services/worker-health.service";
import { createSchoolCastWorkerObservability } from "../src/modules/schoolcast/services/worker-observability";

let shutdownRequested = false;
const observability = createSchoolCastWorkerObservability({
  port: env.SCHOOLCAST_WORKER_HEALTH_PORT,
  heartbeatTimeoutSeconds: env.SCHOOLCAST_WORKER_HEARTBEAT_TIMEOUT_SECONDS,
  externalHeartbeatConfigured: Boolean(env.SCHOOLCAST_EXTERNAL_HEARTBEAT_URL)
});

function requestShutdown() {
  shutdownRequested = true;
  observability.markShuttingDown();
}

process.once("SIGINT", requestShutdown);
process.once("SIGTERM", requestShutdown);

function workerInput() {
  return {
    limit: env.SCHOOLCAST_WORKER_BATCH_SIZE,
    concurrency: env.SCHOOLCAST_WORKER_CONCURRENCY,
    leaseSeconds: env.SCHOOLCAST_WORKER_LEASE_SECONDS,
    workerId: `schoolcast-${env.SCHOOLCAST_WORKER_REPLICA_ID ?? "local"}-${randomUUID()}`
  };
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runCycle() {
  observability.markCycleStarted();
  try {
    const input = workerInput();
    const attachmentPromise = processSchoolCastAttachmentScans(input);
    const gradebookBridge = await processGradebookSchoolCastEvents(input);
    const sourceEvents = await processSchoolCastSourceEvents(input);
    const scheduledPublications = await processScheduledSchoolCastCommunications(input);
    const outbox = await processSchoolCastOutbox(input);
    const attachmentScans = await attachmentPromise;
    const health = await getSchoolCastWorkerHealth();
    const workerErrors = sourceEvents.workerErrors
      + gradebookBridge.workerErrors
      + scheduledPublications.workerErrors
      + outbox.workerErrors;

    observability.markCycleCompleted({ health, workerErrors });
    const externalHeartbeat = await sendSchoolCastExternalHeartbeat({
      url: env.SCHOOLCAST_EXTERNAL_HEARTBEAT_URL,
      timeoutMs: env.SCHOOLCAST_EXTERNAL_HEARTBEAT_TIMEOUT_MS
    });
    observability.markExternalHeartbeat(externalHeartbeat.status);

    const result = {
      event: "schoolcast.worker.cycle_completed",
      status: health.status,
      attachmentScans,
      gradebookBridge,
      sourceEvents,
      scheduledPublications,
      outbox,
      health,
      externalHeartbeat
    };
    if (health.status === "DEGRADED" || workerErrors > 0 || externalHeartbeat.status === "FAILED") {
      console.error(JSON.stringify(result));
    } else {
      console.info(JSON.stringify(result));
    }
    return { health, workerErrors };
  } catch (error) {
    observability.markCycleFailed();
    throw error;
  }
}

async function main() {
  if (env.SCHOOLCAST_WORKER_ENABLED !== "true") {
    throw new Error("SCHOOLCAST_WORKER_DISABLED");
  }

  if (env.SCHOOLCAST_WORKER_RUN_MODE === "ONCE") {
    const result = await runCycle();
    if (result.health.status === "DEGRADED" || result.workerErrors > 0) process.exitCode = 2;
    return;
  }

  await observability.start();
  try {
    while (!shutdownRequested) {
      try {
        await runCycle();
      } catch {
        console.error(JSON.stringify({ event: "schoolcast.worker.cycle_failed", status: "FAILED" }));
      }
      if (!shutdownRequested) await sleep(env.SCHOOLCAST_WORKER_POLL_INTERVAL_MS);
    }
  } finally {
    observability.markShuttingDown();
    await observability.stop();
  }
}

main()
  .catch(() => {
    console.error(JSON.stringify({ event: "schoolcast.worker.fatal", status: "FAILED" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
