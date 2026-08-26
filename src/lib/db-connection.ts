const SUPAVISOR_TRANSACTION_PORT = "6543";
const DEFAULT_SERVERLESS_CONNECTION_LIMIT = "3";
const DEFAULT_SERVERLESS_POOL_TIMEOUT_SECONDS = "30";

export function getPrismaRuntimeDatabaseUrl(value = process.env.DATABASE_URL) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.port !== SUPAVISOR_TRANSACTION_PORT) return value;

    if (!url.searchParams.has("pgbouncer")) {
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set("connection_limit", DEFAULT_SERVERLESS_CONNECTION_LIMIT);
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set("pool_timeout", DEFAULT_SERVERLESS_POOL_TIMEOUT_SECONDS);
    }

    return url.toString();
  } catch {
    return value;
  }
}
