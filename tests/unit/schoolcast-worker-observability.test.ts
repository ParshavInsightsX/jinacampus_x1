import { describe, expect, it } from "vitest";

import {
  createSchoolCastWorkerObservability,
  type SchoolCastWorkerHealthSnapshot
} from "@/modules/schoolcast/services/worker-observability";

function health(overrides: Partial<SchoolCastWorkerHealthSnapshot> = {}): SchoolCastWorkerHealthSnapshot {
  return {
    status: "HEALTHY",
    queueDepth: 7,
    oldestAgeSeconds: 42,
    scanner: { status: "READY" },
    queues: {
      domainEvents: { pending: 1, processing: 2, failed: 0 },
      deliveries: { pending: 3, sending: 1, undeliverable: 0 },
      attachments: { pending: 1, failed: 0, rejected: 0 },
      scheduledPublications: { due: 1 }
    },
    ...overrides
  };
}

describe("SchoolCast worker observability", () => {
  it("distinguishes process liveness from queue readiness", () => {
    let currentTime = 100_000;
    const observability = createSchoolCastWorkerObservability({
      port: 9_464,
      heartbeatTimeoutSeconds: 300,
      now: () => currentTime
    });

    expect(observability.isLive()).toBe(true);
    expect(observability.isReady()).toBe(false);

    observability.markCycleStarted();
    currentTime += 1_250;
    observability.markCycleCompleted({ health: health(), workerErrors: 0 });

    expect(observability.isLive()).toBe(true);
    expect(observability.isReady()).toBe(true);

    observability.markCycleStarted();
    currentTime += 500;
    observability.markCycleCompleted({
      health: health({ status: "DEGRADED" }),
      workerErrors: 1
    });

    expect(observability.isLive()).toBe(true);
    expect(observability.isReady()).toBe(false);
  });

  it("emits bounded Prometheus metrics without tenant or recipient labels", () => {
    let currentTime = 200_000;
    const observability = createSchoolCastWorkerObservability({
      port: 9_464,
      heartbeatTimeoutSeconds: 300,
      externalHeartbeatConfigured: true,
      now: () => currentTime
    });
    observability.markCycleStarted();
    currentTime += 2_000;
    observability.markCycleCompleted({ health: health(), workerErrors: 0 });
    observability.markExternalHeartbeat("DELIVERED");
    observability.markExternalHeartbeat("FAILED");

    const metrics = observability.renderMetrics();

    expect(metrics).toContain("schoolcast_worker_live 1");
    expect(metrics).toContain("schoolcast_worker_ready 1");
expect(metrics).toContain("schoolcast_worker_cycle_duration_seconds 2");
    expect(metrics).toContain("schoolcast_worker_external_heartbeat_configured 1");
    expect(metrics).toContain('schoolcast_worker_external_heartbeat_deliveries_total{result="success"} 1');
    expect(metrics).toContain('schoolcast_worker_external_heartbeat_deliveries_total{result="failure"} 1');
    expect(metrics).toContain("schoolcast_worker_queue_depth 7");
    expect(metrics).toContain("schoolcast_worker_queue_oldest_age_seconds 42");
    expect(metrics).toContain('schoolcast_worker_queue_items{queue="domain_events",state="processing"} 2');
    expect(metrics).not.toMatch(/tenant|recipient|message|contact|object_path|database_url/i);
  });

  it("marks a stalled cycle unhealthy without restarting on queue degradation alone", () => {
    let currentTime = 300_000;
    const observability = createSchoolCastWorkerObservability({
      port: 9_464,
      heartbeatTimeoutSeconds: 30,
      now: () => currentTime
    });
    observability.markCycleStarted();
    currentTime += 31_000;

    expect(observability.isLive()).toBe(false);

    observability.markCycleFailed();
    const metrics = observability.renderMetrics();
    expect(metrics).toContain('schoolcast_worker_cycles_total{result="failed"} 1');
    expect(metrics).toContain("schoolcast_worker_errors 1");
  });
});
