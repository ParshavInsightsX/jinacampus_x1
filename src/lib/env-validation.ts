import { z } from "zod";

type EnvironmentInput = Readonly<Record<string, string | undefined>>;

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional()
);

const postgresUrl = z.string().url().refine(
  (value) => value.startsWith("postgresql://") || value.startsWith("postgres://"),
  "Must be a PostgreSQL connection URL."
);

const optionalPostgresUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  postgresUrl.optional()
);

const optionalUrl = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().url().optional()
);

const environmentSchema = z.object({
  DATABASE_URL: postgresUrl,
  DIRECT_URL: optionalPostgresUrl,
  APP_URL: z.string().url().default("http://localhost:3000"),
  WEBAUTHN_ORIGIN: z.string().url().optional(),
  WEBAUTHN_RP_ID: optionalText,
  SESSION_COOKIE_NAME: z.string().min(1).default("jc_session"),
  PLATFORM_SESSION_COOKIE_NAME: z.string().min(1).default("jc_platform_session"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  SESSION_SECRET: optionalText,
  PASSWORD_PEPPER: z.string().min(16),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  COMMERCIAL_BOOTSTRAP_ENABLED: z.enum(["true", "false"]).default("false"),
  DEV_DEMO_SEED_ENABLED: z.enum(["true", "false"]).default("false"),
  RESET_SEED_ADMIN_PASSWORD: z.enum(["true", "false"]).default("false"),
  OTP_QA_ENABLED: z.enum(["true", "false"]).default("false"),
  SMS_PROVIDER: z.string().trim().min(1).default("dev"),
  SEED_TENANT_NAME: optionalText,
  SEED_TENANT_SLUG: optionalText,
  SEED_ADMIN_EMAIL: optionalText,
  SEED_ADMIN_PHONE: optionalText,
  SEED_ADMIN_TEMP_PASSWORD: optionalText,
  SEED_INSTITUTION_NAME: optionalText,
  SEED_INSTITUTION_CODE: optionalText,
  SEED_BRANCH_NAME: optionalText,
  SEED_BRANCH_CODE: optionalText,
  SEED_ACADEMIC_YEAR_NAME: optionalText,
  SEED_ACADEMIC_YEAR_START_DATE: optionalText,
  SEED_ACADEMIC_YEAR_END_DATE: optionalText,
  SUPABASE_URL: optionalUrl,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  STUDENT_DOCUMENTS_BUCKET: z.string().trim().min(1).default("student-documents"),
  STUDENT_DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(6_000_000).default(4_000_000),
  STAFF_LEAVE_DOCUMENTS_BUCKET: z.string().trim().min(1).default("staff-leave-documents"),
  STAFF_LEAVE_DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(6_000_000).default(4_000_000),
  STAFF_PROFILE_PHOTOS_BUCKET: z.string().trim().min(1).default("staff-profile-photos"),
  STAFF_PROFILE_PHOTO_MAX_BYTES: z.coerce.number().int().min(1024).max(4_000_000).default(2_000_000),
  INSTITUTION_LOGOS_BUCKET: z.string().trim().min(1).default("institution-logos"),
  INSTITUTION_LOGO_MAX_BYTES: z.coerce.number().int().min(1024).max(4_000_000).default(2_000_000),
  INSTITUTION_REGULATORY_DOCUMENTS_BUCKET: z.string().trim().min(1).default("institution-regulatory-documents"),
  INSTITUTION_REGULATORY_DOCUMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(6_000_000).default(4_000_000),
  GRADEBOOK_STORAGE_BUCKET: z.string().trim().min(1).default("gradebook-private"),
  GRADEBOOK_IMPORT_MAX_BYTES: z.coerce.number().int().min(1024).max(20_000_000).default(10_000_000),
  GRADEBOOK_REPORT_CARD_MAX_BYTES: z.coerce.number().int().min(1024).max(10_000_000).default(5_000_000),
}).passthrough();

function isLocalDatabaseUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function configurationError(fields: readonly string[]) {
  return new Error(`Invalid environment configuration: ${fields.join(", ")}.`);
}

export function validateEnvironment(environment: EnvironmentInput) {
  const parsed = environmentSchema.safeParse(environment);
  if (!parsed.success) {
    const fields = Array.from(new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "environment")));
    throw configurationError(fields);
  }

  const value = parsed.data;
  const missing: string[] = [];
  if (value.NODE_ENV === "production") {
    if (!value.DIRECT_URL) missing.push("DIRECT_URL");
    if (!value.SESSION_SECRET || value.SESSION_SECRET.length < 32) missing.push("SESSION_SECRET (minimum 32 characters)");
    if (isLocalDatabaseUrl(value.DATABASE_URL)) missing.push("DATABASE_URL must not use localhost in production");
    if (value.DIRECT_URL && isLocalDatabaseUrl(value.DIRECT_URL)) missing.push("DIRECT_URL must not use localhost in production");
    if (value.DEV_DEMO_SEED_ENABLED === "true") missing.push("DEV_DEMO_SEED_ENABLED must be false in production");
    const webAuthnOrigin = value.WEBAUTHN_ORIGIN ?? value.APP_URL;
    if (!webAuthnOrigin.startsWith("https://")) missing.push("WEBAUTHN_ORIGIN must use HTTPS in production");
  }

  if (value.COMMERCIAL_BOOTSTRAP_ENABLED === "true") {
    for (const field of [
      "SEED_TENANT_NAME",
      "SEED_TENANT_SLUG",
      "SEED_ADMIN_EMAIL",
      "SEED_ADMIN_TEMP_PASSWORD"
    ] as const) {
      if (!value[field]) missing.push(field);
    }
  }

  if ((value.OTP_QA_ENABLED === "true" || value.SMS_PROVIDER !== "dev") && !value.SEED_ADMIN_PHONE) {
    missing.push("SEED_ADMIN_PHONE");
  }
  if (Boolean(value.SUPABASE_URL) !== Boolean(value.SUPABASE_SERVICE_ROLE_KEY)) {
    missing.push("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured together");
  }
  if (missing.length > 0) throw configurationError(missing);

  return {
    ...value,
    DIRECT_URL: value.DIRECT_URL ?? value.DATABASE_URL,
    SESSION_SECRET: value.SESSION_SECRET ?? value.PASSWORD_PEPPER
  };
}

export type AppEnvironment = ReturnType<typeof validateEnvironment>;
