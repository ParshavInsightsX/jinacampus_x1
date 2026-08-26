import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Prisma, type StaffAttendanceFlag } from "@prisma/client";
import { dateOnlyInTimeZone } from "@/lib/dates/time-zone";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import type { TenantContext } from "@/lib/tenant/context";
import {
  ATTENDANCE_ENTITLEMENT_FEATURES,
  type AttendanceEntitlementFeature
} from "@/modules/campus-core/entitlements/catalog";
import { requireAttendanceEntitlements } from "@/modules/campus-core/entitlements/service";
import type { StaffAttendanceProjectionPolicy } from "@/modules/staffboard-lite/utils/staff-attendance-projection";
import { validationError } from "./shared";

export const STAFF_CREDENTIAL_PAYLOAD_TYPE = "JINACAMPUS_STAFF_ATTENDANCE_CREDENTIAL";
export const STAFF_CREDENTIAL_PAYLOAD_VERSION = 1;
const STAFF_CREDENTIAL_DERIVATION_CONTEXT = "jinacampus:staff-attendance-credential:v1";
export const STAFF_ATTENDANCE_TRANSACTION_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;
export type StaffAttendanceTransaction = Prisma.TransactionClient;

export type BranchAttendanceScope = {
  id: string;
  institutionId: string;
  timezone: string;
  status: string;
};

export type ProjectionPolicyContext = {
  policyId: string | null;
  scheduleId: string | null;
  duplicateCooldownSeconds: number;
  projection: StaffAttendanceProjectionPolicy;
};

export function hashStaffAttendanceCredential(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateStaffAttendanceCredentialSecret() {
  return randomBytes(32).toString("base64url");
}

export function deriveStaffAttendanceCredentialSecret(input: {
  credentialId: string;
  tenantId: string;
  staffId: string;
  credentialVersion: number;
  keyVersion: number;
}) {
  const domainKey = createHmac("sha256", env.PASSWORD_PEPPER)
    .update(STAFF_CREDENTIAL_DERIVATION_CONTEXT)
    .digest();
  return createHmac("sha256", domainKey)
    .update([
      input.credentialId,
      input.tenantId,
      input.staffId,
      input.credentialVersion,
      input.keyVersion
    ].join(":"))
    .digest("base64url");
}

export function recoverStaffAttendanceCredentialPayload(input: {
  id: string;
  tenantId: string;
  staffId: string;
  credentialVersion: number;
  keyVersion: number;
  tokenHash: string;
}) {
  const token = deriveStaffAttendanceCredentialSecret({
    credentialId: input.id,
    tenantId: input.tenantId,
    staffId: input.staffId,
    credentialVersion: input.credentialVersion,
    keyVersion: input.keyVersion
  });
  const derivedHash = hashStaffAttendanceCredential(token);
  const expected = Buffer.from(input.tokenHash, "hex");
  const actual = Buffer.from(derivedHash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return buildStaffAttendanceCredentialPayload(token);
}

export function buildStaffAttendanceCredentialPayload(token: string) {
  return JSON.stringify({
    type: STAFF_CREDENTIAL_PAYLOAD_TYPE,
    version: STAFF_CREDENTIAL_PAYLOAD_VERSION,
    token
  });
}

export function parseStaffAttendanceCredentialPayload(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw validationError("STAFF_ATTENDANCE_QR_INVALID");
  if (!trimmed.startsWith("{")) return trimmed;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      (parsed as Record<string, unknown>).type !== STAFF_CREDENTIAL_PAYLOAD_TYPE ||
      (parsed as Record<string, unknown>).version !== STAFF_CREDENTIAL_PAYLOAD_VERSION ||
      typeof (parsed as Record<string, unknown>).token !== "string"
    ) {
      throw validationError("STAFF_ATTENDANCE_QR_INVALID");
    }
    const token = ((parsed as Record<string, unknown>).token as string).trim();
    if (token.length < 32 || token.length > 512) {
      throw validationError("STAFF_ATTENDANCE_QR_INVALID");
    }
    return token;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw validationError("STAFF_ATTENDANCE_QR_INVALID");
  }
}

export function staffAttendanceDateString(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function staffAttendanceDisplayName(staff: {
  firstName: string;
  middleName: string | null;
  lastName: string | null;
}) {
  return [staff.firstName, staff.middleName, staff.lastName].filter(Boolean).join(" ");
}

export function resolveStaffAttendanceBranchId(ctx: TenantContext, requestedBranchId?: string) {
  const branchId = requestedBranchId ?? ctx.activeBranchId ?? (
    ctx.accessibleBranchIds.length === 1 ? ctx.accessibleBranchIds[0] : null
  );
  if (!branchId) throw validationError("STAFF_ATTENDANCE_BRANCH_REQUIRED");
  if (!ctx.accessibleBranchIds.includes(branchId)) {
    throw new AppError("FORBIDDEN_BRANCH_ACCESS", "FORBIDDEN_BRANCH_ACCESS", 403);
  }
  return branchId;
}

export async function requireStaffAttendanceFeature(
  ctx: TenantContext,
  branchId: string,
  featureKey: AttendanceEntitlementFeature,
  operation: "READ" | "WRITE" = "WRITE"
) {
  await requireAttendanceEntitlements(ctx, [
    { featureKey: ATTENDANCE_ENTITLEMENT_FEATURES.STAFF_ATTENDANCE, operation: "READ" },
    { featureKey, operation }
  ], { branchId });
}

export async function loadActiveStaffAttendanceBranch(
  client: typeof db | StaffAttendanceTransaction,
  ctx: TenantContext,
  branchId: string
): Promise<BranchAttendanceScope> {
  const branch = await client.branch.findFirst({
    where: {
      id: branchId,
      tenantId: ctx.tenantId,
      institutionId: ctx.institutionId ?? undefined,
      status: "ACTIVE"
    },
    select: { id: true, institutionId: true, timezone: true, status: true }
  });
  if (!branch) throw notFound("STAFF_ATTENDANCE_BRANCH_NOT_FOUND");
  return branch;
}

export function boundedStaffCredentialExpiry(input: {
  requested: Date | undefined;
  issuedAt: Date;
  validityDays: number | null | undefined;
}) {
  const maximum = input.validityDays
    ? new Date(input.issuedAt.getTime() + input.validityDays * 86_400_000)
    : null;
  if (input.requested && input.requested <= input.issuedAt) {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_EXPIRY_INVALID");
  }
  if (input.requested && maximum && input.requested > maximum) {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_EXPIRY_EXCEEDS_POLICY");
  }
  return input.requested ?? maximum;
}

export async function resolveStaffAttendanceProjectionPolicy(
  tx: StaffAttendanceTransaction,
  input: {
    tenantId: string;
    branchId: string;
    staffId: string;
    attendanceDate: Date;
    timeZone: string;
  }
): Promise<ProjectionPolicyContext> {
  const [policy, scheduleAssignment, setting] = await Promise.all([
    tx.staffAttendancePolicy.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        status: "PUBLISHED",
        effectiveFrom: { lte: input.attendanceDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.attendanceDate } }]
      },
      orderBy: { version: "desc" }
    }),
    tx.staffAttendanceScheduleAssignment.findFirst({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        staffId: input.staffId,
        effectiveFrom: { lte: input.attendanceDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.attendanceDate } }],
        schedule: {
          status: "PUBLISHED",
          effectiveFrom: { lte: input.attendanceDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: input.attendanceDate } }]
        }
      },
      include: { schedule: true },
      orderBy: { effectiveFrom: "desc" }
    }),
    tx.attendanceSetting.findFirst({
      where: { tenantId: input.tenantId, branchId: input.branchId },
      select: {
        staffLateAfterTime: true,
        staffHalfDayBeforeMinutes: true,
        staffMinimumWorkingMinutes: true
      }
    })
  ]);

  const schedule = scheduleAssignment?.schedule;
  return {
    policyId: policy?.id ?? null,
    scheduleId: schedule?.id ?? null,
    duplicateCooldownSeconds: policy?.duplicateCooldownSeconds ?? 30,
    projection: {
      timeZone: input.timeZone,
      shiftStartTime: schedule?.startTime ?? policy?.shiftStartTime ?? setting?.staffLateAfterTime ?? "08:00",
      expectedCheckOutTime: schedule?.expectedCheckOutTime ?? policy?.shiftEndTime ?? "16:00",
      graceMinutes: schedule?.graceMinutes ?? policy?.graceMinutes ?? 0,
      halfDayMinimumMinutes:
        schedule?.halfDayMinimumMinutes ?? policy?.halfDayMinimumMinutes ?? setting?.staffHalfDayBeforeMinutes ?? 240,
      fullDayMinimumMinutes:
        schedule?.fullDayMinimumMinutes ?? policy?.fullDayMinimumMinutes ?? setting?.staffMinimumWorkingMinutes ?? 360,
      earlyDepartureGraceMinutes:
        schedule?.earlyDepartureGraceMinutes ?? policy?.earlyDepartureGraceMinutes ?? 0,
      checkInOnly: policy?.checkInOnly ?? false
    }
  };
}

export async function acquireStaffAttendanceDayLock(
  tx: StaffAttendanceTransaction,
  tenantId: string,
  staffId: string,
  attendanceDate: Date
) {
  const lockKey = `${tenantId}:${staffId}:${staffAttendanceDateString(attendanceDate)}`;
  // This is the one justified raw query: a transaction-scoped lock prevents
  // concurrent scanner retries from creating conflicting daily projections.
  await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
}

export function staffAttendanceDateForBranch(now: Date, timeZone: string) {
  return dateOnlyInTimeZone(now, timeZone);
}

export function mergeStaffAttendanceFlags(...collections: StaffAttendanceFlag[][]) {
  return Array.from(new Set(collections.flat()));
}