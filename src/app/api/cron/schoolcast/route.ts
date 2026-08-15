import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { getSchoolCastDeploymentPolicy } from "@/modules/schoolcast/deployment-policy";
import { processSchoolCastAttachmentScans } from "@/modules/schoolcast/services/attachment-scan-worker.service";
import { processSchoolCastOutbox } from "@/modules/schoolcast/services/outbox-worker.service";
import { processScheduledSchoolCastCommunications } from "@/modules/schoolcast/services/scheduled-publication-worker.service";
import {
  processGradebookSchoolCastEvents,
  processSchoolCastSourceEvents
} from "@/modules/schoolcast/services/source-event-worker.service";
import { getSchoolCastWorkerHealth } from "@/modules/schoolcast/services/worker-health.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validAuthorization(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!env.SCHOOLCAST_WORKER_SECRET || !authorization?.startsWith("Bearer ")) return false;
  const actual = Buffer.from(authorization.slice("Bearer ".length));
  const expected = Buffer.from(env.SCHOOLCAST_WORKER_SECRET);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function defaultWorkerInput() {
  return {
    limit: env.SCHOOLCAST_WORKER_BATCH_SIZE,
    concurrency: env.SCHOOLCAST_WORKER_CONCURRENCY,
    leaseSeconds: env.SCHOOLCAST_WORKER_LEASE_SECONDS,
    workerId: "vercel-schoolcast-" + Date.now()
  };
}

async function runSchoolCastWorkers() {
  const workerInput = defaultWorkerInput();
  const attachmentScans = await processSchoolCastAttachmentScans(workerInput);
  const gradebookBridge = await processGradebookSchoolCastEvents(workerInput);
  const sourceEvents = await processSchoolCastSourceEvents(workerInput);
  const scheduledPublications = await processScheduledSchoolCastCommunications(workerInput);
  const outbox = await processSchoolCastOutbox(workerInput);
  const health = await getSchoolCastWorkerHealth();

  const logRecord = {
    event: "schoolcast.worker.completed",
    status: health.status,
    attachmentScans,
    gradebookBridge,
    sourceEvents,
    scheduledPublications,
    outbox,
    health
  };
  if (health.status === "DEGRADED") console.error(JSON.stringify(logRecord));
  else console.info(JSON.stringify(logRecord));

  return { attachmentScans, gradebookBridge, sourceEvents, scheduledPublications, outbox, health };
}

async function handle(request: Request) {
  if (getSchoolCastDeploymentPolicy().scope !== "FULL") {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (env.SCHOOLCAST_WORKER_ENABLED !== "true" || !env.SCHOOLCAST_WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "SchoolCast worker is not configured." }, { status: 503 });
  }
  if (!validAuthorization(request)) {
    return NextResponse.json({ ok: false, error: "Unauthenticated." }, { status: 401 });
  }
  try {
    const result = await runSchoolCastWorkers();
    const healthy = result.health.status === "HEALTHY";
    return NextResponse.json({ ok: healthy, result }, { status: healthy ? 200 : 503 });
  } catch {
    console.error(JSON.stringify({ event: "schoolcast.worker.failed", status: "FAILED" }));
    return NextResponse.json({ ok: false, error: "SchoolCast worker run failed." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}