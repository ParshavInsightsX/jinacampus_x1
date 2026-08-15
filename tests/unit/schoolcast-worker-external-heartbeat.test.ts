import { describe, expect, it, vi } from "vitest";

import { sendSchoolCastExternalHeartbeat } from "@/modules/schoolcast/services/worker-external-heartbeat";

describe("SchoolCast external worker heartbeat", () => {
  it("does nothing when the external dead-man path is not configured", async () => {
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(sendSchoolCastExternalHeartbeat({ timeoutMs: 3_000, fetchImpl }))
      .resolves.toEqual({ status: "DISABLED", code: "NOT_CONFIGURED" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends an empty POST without logging or serializing application data", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));

    await expect(sendSchoolCastExternalHeartbeat({
      url: "https://monitor.example/check/replica-a",
      timeoutMs: 3_000,
      fetchImpl
    })).resolves.toEqual({ status: "DELIVERED", code: "DELIVERED" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://monitor.example/check/replica-a",
      expect.objectContaining({ method: "POST", body: null, cache: "no-store", redirect: "error" })
    );
  });

  it("returns bounded failure codes without exposing the heartbeat URL", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 503 }));

    const result = await sendSchoolCastExternalHeartbeat({
      url: "https://monitor.example/check/private-token",
      timeoutMs: 3_000,
      fetchImpl
    });

    expect(result).toEqual({ status: "FAILED", code: "HTTP_ERROR" });
    expect(JSON.stringify(result)).not.toContain("private-token");
  });
});
