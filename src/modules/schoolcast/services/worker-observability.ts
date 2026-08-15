import { createServer, type Server } from "node:http";

export type SchoolCastWorkerHealthSnapshot = {
  status: "HEALTHY" | "DEGRADED";
  queueDepth: number;
  oldestAgeSeconds: number;
  scanner: { status: "READY" | "DISABLED" | "UNAVAILABLE" };
  queues: {
    domainEvents: { pending: number; processing: number; failed: number };
    deliveries: { pending: number; sending: number; undeliverable: number };
    attachments: { pending: number; failed: number; rejected: number };
    scheduledPublications: { due: number };
  };
};

type WorkerCycleResult = {
  health: SchoolCastWorkerHealthSnapshot;
  workerErrors: number;
};

type WorkerObservabilityOptions = {
  port: number;
  heartbeatTimeoutSeconds: number;
  externalHeartbeatConfigured?: boolean;
  now?: () => number;
};

type WorkerState = {
  startedAtMs: number;
  cycleStartedAtMs: number | null;
  cycleCompletedAtMs: number | null;
  cycleDurationMs: number;
  successfulCycles: number;
  degradedCycles: number;
  failedCycles: number;
  workerErrors: number;
  externalHeartbeatSuccesses: number;
  externalHeartbeatFailures: number;
  lastExternalHeartbeatSuccessAtMs: number | null;
  latestHealth: SchoolCastWorkerHealthSnapshot | null;
  shuttingDown: boolean;
};

function seconds(milliseconds: number) {
  return Math.max(0, milliseconds / 1_000);
}

function metric(name: string, value: number, labels?: string) {
  return `${name}${labels ? `{${labels}}` : ""} ${Number.isFinite(value) ? value : 0}`;
}

export function createSchoolCastWorkerObservability(options: WorkerObservabilityOptions) {
  const now = options.now ?? Date.now;
  const state: WorkerState = {
    startedAtMs: now(),
    cycleStartedAtMs: null,
    cycleCompletedAtMs: null,
    cycleDurationMs: 0,
    successfulCycles: 0,
    degradedCycles: 0,
    failedCycles: 0,
    workerErrors: 0,
    externalHeartbeatSuccesses: 0,
    externalHeartbeatFailures: 0,
    lastExternalHeartbeatSuccessAtMs: null,
    latestHealth: null,
    shuttingDown: false
  };
  let server: Server | null = null;

  function heartbeatAgeSeconds(at = now()) {
    const heartbeatAt = state.cycleCompletedAtMs ?? state.cycleStartedAtMs ?? state.startedAtMs;
    return seconds(at - heartbeatAt);
  }

  function isLive(at = now()) {
    return !state.shuttingDown && heartbeatAgeSeconds(at) <= options.heartbeatTimeoutSeconds;
  }

  function isReady(at = now()) {
    return isLive(at)
      && state.latestHealth?.status === "HEALTHY"
      && state.workerErrors === 0
      && state.cycleCompletedAtMs !== null;
  }

  function markCycleStarted() {
    state.cycleStartedAtMs = now();
  }

  function markCycleCompleted(result: WorkerCycleResult) {
    const completedAtMs = now();
    state.cycleDurationMs = Math.max(0, completedAtMs - (state.cycleStartedAtMs ?? completedAtMs));
    state.cycleCompletedAtMs = completedAtMs;
    state.latestHealth = result.health;
    state.workerErrors = result.workerErrors;
    if (result.health.status === "HEALTHY" && result.workerErrors === 0) state.successfulCycles += 1;
    else state.degradedCycles += 1;
  }

  function markCycleFailed() {
    state.failedCycles += 1;
    state.cycleCompletedAtMs = now();
    state.cycleDurationMs = Math.max(0, state.cycleCompletedAtMs - (state.cycleStartedAtMs ?? state.cycleCompletedAtMs));
    state.workerErrors += 1;
  }

  function markExternalHeartbeat(status: "DISABLED" | "DELIVERED" | "FAILED") {
    if (status === "DISABLED") return;
    if (status === "DELIVERED") {
      state.externalHeartbeatSuccesses += 1;
      state.lastExternalHeartbeatSuccessAtMs = now();
      return;
    }
    state.externalHeartbeatFailures += 1;
  }

  function markShuttingDown() {
    state.shuttingDown = true;
  }

  function renderMetrics(at = now()) {
    const health = state.latestHealth;
    const lines = [
      "# HELP schoolcast_worker_live Whether the worker process heartbeat is current.",
      "# TYPE schoolcast_worker_live gauge",
      metric("schoolcast_worker_live", isLive(at) ? 1 : 0),
      "# HELP schoolcast_worker_ready Whether the latest worker cycle and queue health are ready.",
      "# TYPE schoolcast_worker_ready gauge",
      metric("schoolcast_worker_ready", isReady(at) ? 1 : 0),
      "# HELP schoolcast_worker_uptime_seconds Worker process uptime.",
      "# TYPE schoolcast_worker_uptime_seconds gauge",
      metric("schoolcast_worker_uptime_seconds", seconds(at - state.startedAtMs)),
      "# HELP schoolcast_worker_heartbeat_age_seconds Seconds since the latest worker heartbeat.",
      "# TYPE schoolcast_worker_heartbeat_age_seconds gauge",
      metric("schoolcast_worker_heartbeat_age_seconds", heartbeatAgeSeconds(at)),
      "# HELP schoolcast_worker_external_heartbeat_configured Whether an external dead-man heartbeat is configured.",
      "# TYPE schoolcast_worker_external_heartbeat_configured gauge",
      metric("schoolcast_worker_external_heartbeat_configured", options.externalHeartbeatConfigured ? 1 : 0),
      "# HELP schoolcast_worker_external_heartbeat_deliveries_total External heartbeat delivery attempts by bounded result.",
      "# TYPE schoolcast_worker_external_heartbeat_deliveries_total counter",
      metric("schoolcast_worker_external_heartbeat_deliveries_total", state.externalHeartbeatSuccesses, 'result="success"'),
      metric("schoolcast_worker_external_heartbeat_deliveries_total", state.externalHeartbeatFailures, 'result="failure"'),
      "# HELP schoolcast_worker_external_heartbeat_last_success_timestamp_seconds Unix timestamp of the latest successful external heartbeat.",
      "# TYPE schoolcast_worker_external_heartbeat_last_success_timestamp_seconds gauge",
      metric(
        "schoolcast_worker_external_heartbeat_last_success_timestamp_seconds",
        state.lastExternalHeartbeatSuccessAtMs === null ? 0 : state.lastExternalHeartbeatSuccessAtMs / 1_000
      ),
      "# HELP schoolcast_worker_cycle_duration_seconds Duration of the latest cycle.",
      "# TYPE schoolcast_worker_cycle_duration_seconds gauge",
      metric("schoolcast_worker_cycle_duration_seconds", seconds(state.cycleDurationMs)),
      "# HELP schoolcast_worker_cycles_total Worker cycles by result.",
      "# TYPE schoolcast_worker_cycles_total counter",
      metric("schoolcast_worker_cycles_total", state.successfulCycles, 'result="success"'),
      metric("schoolcast_worker_cycles_total", state.degradedCycles, 'result="degraded"'),
      metric("schoolcast_worker_cycles_total", state.failedCycles, 'result="failed"'),
      "# HELP schoolcast_worker_errors Latest cycle worker error count.",
      "# TYPE schoolcast_worker_errors gauge",
      metric("schoolcast_worker_errors", state.workerErrors),
      "# HELP schoolcast_worker_queue_depth Total due SchoolCast work items.",
      "# TYPE schoolcast_worker_queue_depth gauge",
      metric("schoolcast_worker_queue_depth", health?.queueDepth ?? 0),
      "# HELP schoolcast_worker_queue_oldest_age_seconds Age of the oldest due work item.",
      "# TYPE schoolcast_worker_queue_oldest_age_seconds gauge",
      metric("schoolcast_worker_queue_oldest_age_seconds", health?.oldestAgeSeconds ?? 0),
      "# HELP schoolcast_worker_scanner_ready Whether the configured scanner is ready.",
      "# TYPE schoolcast_worker_scanner_ready gauge",
      metric("schoolcast_worker_scanner_ready", health?.scanner.status === "READY" ? 1 : 0),
      "# HELP schoolcast_worker_queue_items SchoolCast queue items by bounded queue and state.",
      "# TYPE schoolcast_worker_queue_items gauge",
      metric("schoolcast_worker_queue_items", health?.queues.domainEvents.pending ?? 0, 'queue="domain_events",state="pending"'),
      metric("schoolcast_worker_queue_items", health?.queues.domainEvents.processing ?? 0, 'queue="domain_events",state="processing"'),
      metric("schoolcast_worker_queue_items", health?.queues.domainEvents.failed ?? 0, 'queue="domain_events",state="failed"'),
      metric("schoolcast_worker_queue_items", health?.queues.deliveries.pending ?? 0, 'queue="deliveries",state="pending"'),
      metric("schoolcast_worker_queue_items", health?.queues.deliveries.sending ?? 0, 'queue="deliveries",state="sending"'),
      metric("schoolcast_worker_queue_items", health?.queues.deliveries.undeliverable ?? 0, 'queue="deliveries",state="undeliverable"'),
      metric("schoolcast_worker_queue_items", health?.queues.attachments.pending ?? 0, 'queue="attachments",state="pending"'),
      metric("schoolcast_worker_queue_items", health?.queues.attachments.failed ?? 0, 'queue="attachments",state="failed"'),
      metric("schoolcast_worker_queue_items", health?.queues.attachments.rejected ?? 0, 'queue="attachments",state="rejected"'),
      metric("schoolcast_worker_queue_items", health?.queues.scheduledPublications.due ?? 0, 'queue="scheduled_publications",state="due"')
    ];
    return `${lines.join("\n")}\n`;
  }

  function statusPayload(ready: boolean, at = now()) {
    return JSON.stringify({
      status: ready ? "HEALTHY" : "UNHEALTHY",
      heartbeatAgeSeconds: Math.floor(heartbeatAgeSeconds(at))
    });
  }

  async function start() {
    if (server) return;
    server = createServer((request, response) => {
      response.setHeader("Cache-Control", "no-store");
      if (request.method !== "GET") {
        response.writeHead(405).end();
        return;
      }
      if (request.url === "/metrics") {
        response.setHeader("Content-Type", "text/plain; version=0.0.4; charset=utf-8");
        response.writeHead(200).end(renderMetrics());
        return;
      }
      if (request.url === "/livez") {
        const live = isLive();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(live ? 200 : 503).end(statusPayload(live));
        return;
      }
      if (request.url === "/readyz") {
        const ready = isReady();
        response.setHeader("Content-Type", "application/json; charset=utf-8");
        response.writeHead(ready ? 200 : 503).end(statusPayload(ready));
        return;
      }
      response.writeHead(404).end();
    });
    await new Promise<void>((resolve, reject) => {
      server?.once("error", reject);
      server?.listen(options.port, "0.0.0.0", resolve);
    });
  }

  async function stop() {
    if (!server) return;
    const activeServer = server;
    server = null;
    await new Promise<void>((resolve, reject) => {
      activeServer.close((error) => error ? reject(error) : resolve());
    });
  }

  return {
    isLive,
    isReady,
    markCycleStarted,
    markCycleCompleted,
    markCycleFailed,
    markExternalHeartbeat,
    markShuttingDown,
    renderMetrics,
    start,
    stop
  };
}
