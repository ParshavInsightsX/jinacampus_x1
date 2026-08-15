import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { validateEnvironment } from "@/lib/env-validation";

const productionEnvironment = {
  NODE_ENV: "production",
  APP_URL: "https://app.jinacampus.example",
  DATABASE_URL: "postgresql://runtime.example:secret@region.pooler.supabase.com:6543/postgres",
  DIRECT_URL: "postgresql://migration.example:secret@db.project.supabase.co:5432/postgres",
  SESSION_SECRET: "session-secret-with-at-least-32-characters",
  PASSWORD_PEPPER: "password-pepper-at-least-16-characters",
  COMMERCIAL_BOOTSTRAP_ENABLED: "false",
  DEV_DEMO_SEED_ENABLED: "false",
  RESET_SEED_ADMIN_PASSWORD: "false",
  SMS_PROVIDER: "dev"
};

describe("deployment environment validation", () => {
  it("accepts separate pooled runtime and direct migration URLs", () => {
    const env = validateEnvironment(productionEnvironment);
    expect(env.DATABASE_URL).toContain("pooler.supabase.com:6543");
    expect(env.DIRECT_URL).toContain("db.project.supabase.co:5432");
  });

  it("rejects localhost database URLs in production", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      DATABASE_URL: "postgresql://user:password@localhost:5432/app"
    })).toThrow("DATABASE_URL must not use localhost in production");
    expect(() => validateEnvironment({
      ...productionEnvironment,
      DIRECT_URL: "postgresql://user:password@127.0.0.1:5432/app"
    })).toThrow("DIRECT_URL must not use localhost in production");
  });

  it("requires DIRECT_URL and a strong session secret in production", () => {
    expect(() => validateEnvironment({ ...productionEnvironment, DIRECT_URL: undefined }))
      .toThrow("DIRECT_URL");
    expect(() => validateEnvironment({ ...productionEnvironment, SESSION_SECRET: "too-short" }))
      .toThrow("SESSION_SECRET");
  });

  it("blocks development fixtures in production", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      DEV_DEMO_SEED_ENABLED: "true"
    })).toThrow("DEV_DEMO_SEED_ENABLED must be false in production");
  });

  it("blocks SchoolCast workers outside the FULL release scope", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_RELEASE_SCOPE: "IN_APP_CORE",
      SCHOOLCAST_WORKER_ENABLED: "true"
    })).toThrow("SCHOOLCAST_RELEASE_SCOPE must be FULL");
  });
  it("keeps SchoolCast workers fail-closed and requires an explicit hosted topology", () => {
    const disabled = validateEnvironment(productionEnvironment);
    expect(disabled.SCHOOLCAST_WORKER_ENABLED).toBe("false");
    expect(disabled.SCHOOLCAST_RELEASE_SCOPE).toBe("DISABLED");

    const explicitlyDisabled = validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_RELEASE_SCOPE: "DISABLED",
      SCHOOLCAST_WORKER_ENABLED: "false"
    });
    expect(explicitlyDisabled.SCHOOLCAST_RELEASE_SCOPE).toBe("DISABLED");
    expect(explicitlyDisabled.SCHOOLCAST_WORKER_ENABLED).toBe("false");

    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_RELEASE_SCOPE: "INVALID"
    })).toThrow();

    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "yes"
    })).toThrow();

    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "true",
      SCHOOLCAST_RELEASE_SCOPE: "FULL",
    })).toThrow("SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT");

    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "true",
      SCHOOLCAST_RELEASE_SCOPE: "FULL",
      SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: "STAGING",
      SCHOOLCAST_WORKER_DATABASE_PROJECT_REF: "supabase"
    })).toThrow("SCHOOLCAST_WORKER_REPLICA_ID");

    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "true",
      SCHOOLCAST_RELEASE_SCOPE: "FULL",
      SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: "PRODUCTION",
      SCHOOLCAST_WORKER_DATABASE_PROJECT_REF: "supabase",
      SCHOOLCAST_WORKER_REPLICA_ID: "worker-a",
      SCHOOLCAST_EXTERNAL_HEARTBEAT_URL: "https://monitor.example/checks/worker-a",
      SCHOOLCAST_WORKER_RUN_MODE: "ONCE"
    })).toThrow("SCHOOLCAST_WORKER_RUN_MODE must be CONTINUOUS");

    const hosted = validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "true",
      SCHOOLCAST_RELEASE_SCOPE: "FULL",
      SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: "PRODUCTION",
      SCHOOLCAST_WORKER_DATABASE_PROJECT_REF: "supabase",
      SCHOOLCAST_WORKER_REPLICA_ID: "worker-a",
      SCHOOLCAST_EXTERNAL_HEARTBEAT_URL: "https://monitor.example/checks/worker-a",
      SCHOOLCAST_WORKER_RUN_MODE: "CONTINUOUS"
    });
    expect(hosted.SCHOOLCAST_WORKER_ENABLED).toBe("true");
    expect(hosted.SCHOOLCAST_WORKER_HEALTH_PORT).toBe(9_464);
  });

  it("rejects a hosted worker pointed at an unexpected database project", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      SCHOOLCAST_WORKER_ENABLED: "true",
      SCHOOLCAST_RELEASE_SCOPE: "FULL",
      SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: "PRODUCTION",
      SCHOOLCAST_WORKER_DATABASE_PROJECT_REF: "unexpectedproject",
      SCHOOLCAST_WORKER_REPLICA_ID: "worker-a",
      SCHOOLCAST_EXTERNAL_HEARTBEAT_URL: "https://monitor.example/checks/worker-a",
      SCHOOLCAST_WORKER_RUN_MODE: "CONTINUOUS"
    })).toThrow("DATABASE_URL must match SCHOOLCAST_WORKER_DATABASE_PROJECT_REF");
  });

  it("rejects insecure or local external worker heartbeat endpoints", () => {
    for (const url of [
      "http://monitor.example/checks/worker-a",
      "https://user:password@monitor.example/checks/worker-a",
      "https://localhost/checks/worker-a",
      "https://replace-monitor.example/checks/worker-a"
    ]) {
      expect(() => validateEnvironment({
        ...productionEnvironment,
        SCHOOLCAST_WORKER_ENABLED: "true",
        SCHOOLCAST_RELEASE_SCOPE: "FULL",
        SCHOOLCAST_WORKER_DEPLOYMENT_ENVIRONMENT: "STAGING",
        SCHOOLCAST_WORKER_DATABASE_PROJECT_REF: "supabase",
        SCHOOLCAST_WORKER_REPLICA_ID: "worker-a",
        SCHOOLCAST_EXTERNAL_HEARTBEAT_URL: url
      })).toThrow("SCHOOLCAST_EXTERNAL_HEARTBEAT_URL");
    }
  });
  it("requires commercial bootstrap tenant and administrator values", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      COMMERCIAL_BOOTSTRAP_ENABLED: "true"
    })).toThrow("SEED_TENANT_NAME");
  });

  it("requires a seeded administrator phone for OTP QA or non-development SMS", () => {
    expect(() => validateEnvironment({
      ...productionEnvironment,
      OTP_QA_ENABLED: "true"
    })).toThrow("SEED_ADMIN_PHONE");
    expect(() => validateEnvironment({
      ...productionEnvironment,
      SMS_PROVIDER: "approved-provider"
    })).toThrow("SEED_ADMIN_PHONE");
  });

  it("uses local-only fallbacks outside production and HMACs session tokens", () => {
    const env = validateEnvironment({
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://user:password@localhost:5432/app",
      PASSWORD_PEPPER: "local-password-pepper"
    });
    const sessionSource = readFileSync(resolve(process.cwd(), "src/lib/auth/session.ts"), "utf8");

    expect(env.DIRECT_URL).toBe(env.DATABASE_URL);
    expect(env.SESSION_SECRET).toBe(env.PASSWORD_PEPPER);
    expect(sessionSource).toContain('createHmac("sha256", env.SESSION_SECRET)');
    expect(sessionSource).not.toContain("createHash");
  });

  it("configures Prisma and npm scripts for hosted production deployment", () => {
    const schema = readFileSync(resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
      regions?: string[];
    };
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts: Record<string, string>;
      prisma?: { seed?: string };
    };

    expect(schema).toContain('url       = env("DATABASE_URL")');
    expect(schema).toContain('directUrl = env("DIRECT_URL")');
    expect(packageJson.scripts).toMatchObject({
      build: "next build",
      postinstall: "prisma generate",
      "db:migrate:deploy": "prisma migrate deploy",
      "db:migrate:status": "prisma migrate status",
      "db:seed": "prisma db seed"
    });
    expect(packageJson.prisma?.seed).toBe("node --import tsx prisma/seed.ts");
    expect(vercelConfig.regions).toEqual(["icn1"]);
  });
});
