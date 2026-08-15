export type SchoolCastExternalHeartbeatResult = {
  status: "DISABLED" | "DELIVERED" | "FAILED";
  code: "NOT_CONFIGURED" | "DELIVERED" | "HTTP_ERROR" | "TIMEOUT" | "REQUEST_FAILED";
};

type ExternalHeartbeatInput = {
  url?: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
};

export async function sendSchoolCastExternalHeartbeat(
  input: ExternalHeartbeatInput
): Promise<SchoolCastExternalHeartbeatResult> {
  if (!input.url) return { status: "DISABLED", code: "NOT_CONFIGURED" };

  const fetchImpl = input.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(input.url, {
      method: "POST",
      body: null,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(input.timeoutMs)
    });
    return response.ok
      ? { status: "DELIVERED", code: "DELIVERED" }
      : { status: "FAILED", code: "HTTP_ERROR" };
  } catch (error) {
    return {
      status: "FAILED",
      code: error instanceof DOMException && error.name === "TimeoutError"
        ? "TIMEOUT"
        : "REQUEST_FAILED"
    };
  }
}
