import { describe, expect, it } from "vitest";
import { getPrismaRuntimeDatabaseUrl } from "../../src/lib/db-connection";

describe("Prisma runtime database URL", () => {
  it("adds transaction-pooler compatibility flags on port 6543", () => {
    const result = getPrismaRuntimeDatabaseUrl(
      "postgresql://user:password@pooler.example.com:6543/postgres?sslmode=require"
    );

    const url = new URL(result!);
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("30");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });

  it("preserves explicitly configured pooler values", () => {
    const result = getPrismaRuntimeDatabaseUrl(
      "postgresql://user:password@pooler.example.com:6543/postgres?pgbouncer=true&connection_limit=3&pool_timeout=20"
    );

    const url = new URL(result!);
    expect(url.searchParams.get("pgbouncer")).toBe("true");
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(url.searchParams.get("pool_timeout")).toBe("20");
  });

  it("does not alter direct or session-mode connections", () => {
    const value = "postgresql://user:password@db.example.com:5432/postgres?sslmode=require";
    expect(getPrismaRuntimeDatabaseUrl(value)).toBe(value);
  });

  it("leaves invalid values unchanged for environment validation", () => {
    expect(getPrismaRuntimeDatabaseUrl("not-a-postgres-url")).toBe("not-a-postgres-url");
  });
});
