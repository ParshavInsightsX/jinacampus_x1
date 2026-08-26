import { randomUUID } from "node:crypto";
import { writeAuditLog } from "@/lib/audit/audit-log";
import { db } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { requirePermission } from "@/lib/rbac/require-permission";
import { hasPrincipalRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { ATTENDANCE_ENTITLEMENT_FEATURES } from "@/modules/campus-core/entitlements/catalog";
import { STAFFBOARD_LITE_AUDIT_EVENTS } from "@/modules/staffboard-lite/audit-events";
import {
  issueStaffAttendanceCredentialSchema,
  revokeStaffAttendanceCredentialSchema
} from "@/modules/staffboard-lite/schemas";
import {
  boundedStaffCredentialExpiry,
  buildStaffAttendanceCredentialPayload,
  deriveStaffAttendanceCredentialSecret,
  hashStaffAttendanceCredential,
  loadActiveStaffAttendanceBranch,
  recoverStaffAttendanceCredentialPayload,
  requireStaffAttendanceFeature,
  STAFF_ATTENDANCE_TRANSACTION_OPTIONS,
  staffAttendanceDisplayName
} from "./staff-attendance-domain.shared";
import { validationError } from "./shared";

const credentialCardStaffSelect = {
  id: true,
  branchId: true,
  employeeCode: true,
  firstName: true,
  middleName: true,
  lastName: true,
  designation: true,
  department: true,
  staffType: true,
  profilePhoto: { select: { id: true } },
  branch: {
    select: {
      id: true,
      name: true,
      code: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      phone: true,
      email: true,
      institution: {
        select: {
          id: true,
          name: true,
          displayName: true,
          logoUrl: true
        }
      }
    }
  }
} as const;

type CredentialCardStaff = {
  id: string;
  branchId: string;
  employeeCode: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  designation: string | null;
  department: string | null;
  staffType: string;
  profilePhoto: { id: string } | null;
  branch: {
    id: string;
    name: string;
    code: string;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    phone: string | null;
    email: string | null;
    institution: {
      id: string;
      name: string;
      displayName: string | null;
      logoUrl: string | null;
    };
  };
};

type CredentialCardRecord = {
  id: string;
  tenantId: string;
  staffId: string;
  tokenHash: string;
  keyVersion: number;
  credentialVersion: number;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
  staff: CredentialCardStaff;
};

export type StaffAttendanceIdentityCard = {
  credentialId: string;
  staffId: string;
  staffName: string;
  employeeCode: string;
  designation: string | null;
  department: string | null;
  staffType: string;
  institutionName: string;
  institutionLogoUrl: string | null;
  branchName: string;
  branchCode: string;
  branchAddress: string | null;
  branchPhone: string | null;
  branchEmail: string | null;
  photoUrl: string | null;
  issuedAt: string;
  expiresAt: string | null;
  credentialVersion: number;
  status: string;
  qrPayload: string;
};

export type IssuedStaffAttendanceCredential = StaffAttendanceIdentityCard;

export type OwnStaffAttendanceCredentialState =
  | { state: "AVAILABLE"; card: StaffAttendanceIdentityCard }
  | { state: "NOT_ISSUED" | "EXPIRED" | "REISSUE_REQUIRED"; card: null };

function requireCredentialManagerRole(ctx: TenantContext) {
  if (!hasPrincipalRole(ctx.roleCodes ?? [])) {
    throw new AppError("FORBIDDEN_ROLE", "FORBIDDEN_ROLE", 403);
  }
}

function branchAddress(staff: CredentialCardStaff) {
  const value = [
    staff.branch.addressLine1,
    staff.branch.addressLine2,
    staff.branch.city,
    staff.branch.state,
    staff.branch.postalCode
  ].filter(Boolean).join(", ");
  return value || null;
}

function cardFromRecord(record: CredentialCardRecord, qrPayload: string): StaffAttendanceIdentityCard {
  return {
    credentialId: record.id,
    staffId: record.staffId,
    staffName: staffAttendanceDisplayName(record.staff),
    employeeCode: record.staff.employeeCode,
    designation: record.staff.designation,
    department: record.staff.department,
    staffType: record.staff.staffType,
    institutionName: record.staff.branch.institution.displayName ?? record.staff.branch.institution.name,
    institutionLogoUrl: record.staff.branch.institution.logoUrl,
    branchName: record.staff.branch.name,
    branchCode: record.staff.branch.code,
    branchAddress: branchAddress(record.staff),
    branchPhone: record.staff.branch.phone,
    branchEmail: record.staff.branch.email,
    photoUrl: record.staff.profilePhoto ? "/api/staffboard/staff/" + record.staff.id + "/photo" : null,
    issuedAt: record.issuedAt.toISOString(),
    expiresAt: record.expiresAt?.toISOString() ?? null,
    credentialVersion: record.credentialVersion,
    status: record.status,
    qrPayload
  };
}

async function loadCredentialStaff(ctx: TenantContext, staffId: string) {
  const staff = await db.staffProfile.findFirst({
    where: {
      id: staffId,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE",
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: credentialCardStaffSelect
  });
  if (!staff) throw notFound("STAFF_PROFILE_NOT_FOUND");
  return staff as CredentialCardStaff;
}

async function authorizeCredentialManager(ctx: TenantContext, branchId: string, operation: "READ" | "WRITE") {
  requireCredentialManagerRole(ctx);
  await requirePermission({
    ctx,
    permission: "staffboard.attendance.credential.manage",
    branchId
  });
  await requireStaffAttendanceFeature(
    ctx,
    branchId,
    ATTENDANCE_ENTITLEMENT_FEATURES.QR,
    operation
  );
}

async function loadCredentialCardRecord(ctx: TenantContext, credentialId: string) {
  const credential = await db.staffAttendanceCredential.findFirst({
    where: {
      id: credentialId,
      tenantId: ctx.tenantId,
      staff: {
        branchId: { in: ctx.accessibleBranchIds },
        branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
      }
    },
    select: {
      id: true,
      tenantId: true,
      staffId: true,
      tokenHash: true,
      keyVersion: true,
      credentialVersion: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      staff: { select: credentialCardStaffSelect }
    }
  });
  if (!credential) throw notFound("STAFF_ATTENDANCE_CREDENTIAL_NOT_FOUND");
  return credential as CredentialCardRecord;
}

function recoverActiveCard(record: CredentialCardRecord) {
  if (record.status !== "ACTIVE") {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_NOT_ACTIVE");
  }
  if (record.expiresAt && record.expiresAt.getTime() <= Date.now()) {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_EXPIRED");
  }
  const qrPayload = recoverStaffAttendanceCredentialPayload(record);
  if (!qrPayload) {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_REISSUE_REQUIRED");
  }
  return cardFromRecord(record, qrPayload);
}

export async function issueStaffAttendanceCredential(
  ctx: TenantContext,
  input: unknown
): Promise<IssuedStaffAttendanceCredential> {
  const data = issueStaffAttendanceCredentialSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const staff = await loadCredentialStaff(ctx, data.staffId);
  await authorizeCredentialManager(ctx, staff.branchId, "WRITE");
  await loadActiveStaffAttendanceBranch(db, ctx, staff.branchId);

  const issuedAt = new Date();

  const result = await db.$transaction(async (tx) => {
    const setting = await tx.attendanceSetting.findFirst({
      where: { tenantId: ctx.tenantId, branchId: staff.branchId },
      select: {
        staffQrAttendanceEnabled: true,
        staffAttendanceCaptureMode: true,
        staffCredentialValidityDays: true
      }
    });
    if (!setting?.staffQrAttendanceEnabled || setting.staffAttendanceCaptureMode === "MANUAL_ONLY") {
      throw validationError("STAFF_ATTENDANCE_QR_DISABLED");
    }

    const expiresAt = boundedStaffCredentialExpiry({
      requested: data.expiresAt,
      issuedAt,
      validityDays: setting.staffCredentialValidityDays
    });
    const previous = await tx.staffAttendanceCredential.findMany({
      where: {
        tenantId: ctx.tenantId,
        staffId: staff.id,
        credentialType: "STATIC_QR",
        status: "ACTIVE"
      },
      select: { id: true, credentialVersion: true }
    });
    if (previous.length > 0 && !data.replacementReason) {
      throw validationError("STAFF_ATTENDANCE_CREDENTIAL_REPLACEMENT_REASON_REQUIRED");
    }

    const latest = await tx.staffAttendanceCredential.aggregate({
      where: { tenantId: ctx.tenantId, staffId: staff.id },
      _max: { credentialVersion: true }
    });

    const credentialVersion = (latest._max.credentialVersion ?? 0) + 1;
    const credentialId = randomUUID();
    const keyVersion = 1;
    const token = deriveStaffAttendanceCredentialSecret({
      credentialId,
      tenantId: ctx.tenantId,
      staffId: staff.id,
      credentialVersion,
      keyVersion
    });
    const tokenHash = hashStaffAttendanceCredential(token);

    if (previous.length > 0) {
      await tx.staffAttendanceCredential.updateMany({
        where: { id: { in: previous.map((credential) => credential.id) }, tenantId: ctx.tenantId },
        data: {
          status: "SUPERSEDED",
          revokedAt: issuedAt,
          revokedById: ctx.userId,
          revocationReason: [
            data.replacementReason,
            data.reason ?? "Credential reissued"
          ].filter(Boolean).join(": ")
        }
      });
    }

    const credential = await tx.staffAttendanceCredential.create({
      data: {
        id: credentialId,
        tenantId: ctx.tenantId,
        institutionId: staff.branch.institution.id,
        staffId: staff.id,
        credentialType: "STATIC_QR",
        tokenHash,
        keyVersion,
        credentialVersion,
        status: "ACTIVE",
        issuedById: ctx.userId,
        issuedAt,
        expiresAt
      },
      select: {
        id: true,
        tenantId: true,
        staffId: true,
        tokenHash: true,
        keyVersion: true,
        credentialVersion: true,
        status: true,
        issuedAt: true,
        expiresAt: true
      }
    });

    await writeAuditLog({
      ctx,
      action: previous.length > 0
        ? STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_REISSUED
        : STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_ISSUED,
      entityType: "StaffAttendanceCredential",
      entityId: credential.id,
      branchId: staff.branchId,
      after: {
        credentialId: credential.id,
        staffId: staff.id,
        credentialVersion: credential.credentialVersion,
        status: "ACTIVE",
        issuedAt: credential.issuedAt,
        expiresAt: credential.expiresAt
      },
      metadata: {
        supersededCredentialCount: previous.length,
        replacementReason: data.replacementReason ?? null,
        reasonProvided: Boolean(data.reason)
      }
    }, tx);

    return {
      credential: { ...credential, staff },
      qrPayload: buildStaffAttendanceCredentialPayload(token)
    };
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);

  return cardFromRecord(result.credential as CredentialCardRecord, result.qrPayload);
}

export async function getStaffAttendanceCredentialCard(ctx: TenantContext, credentialId: string) {
  const credential = await loadCredentialCardRecord(ctx, credentialId);
  await authorizeCredentialManager(ctx, credential.staff.branchId, "READ");
  const card = recoverActiveCard(credential);

  await writeAuditLog({
    ctx,
    action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_VIEWED,
    entityType: "StaffAttendanceCredential",
    entityId: credential.id,
    branchId: credential.staff.branchId,
    metadata: {
      staffId: credential.staffId,
      credentialVersion: credential.credentialVersion,
      viewerScope: "MANAGER"
    }
  });
  return card;
}

export async function getMyStaffAttendanceCredentialCard(
  ctx: TenantContext
): Promise<OwnStaffAttendanceCredentialState> {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const staff = await db.staffProfile.findFirst({
    where: {
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      branchId: { in: ctx.accessibleBranchIds },
      employmentStatus: "ACTIVE",
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    select: credentialCardStaffSelect
  });
  if (!staff) return { state: "NOT_ISSUED", card: null };

  await requirePermission({
    ctx,
    permission: "staffboard.attendance.credential.self_view",
    branchId: staff.branchId
  });
  await requireStaffAttendanceFeature(
    ctx,
    staff.branchId,
    ATTENDANCE_ENTITLEMENT_FEATURES.QR,
    "READ"
  );

  const credential = await db.staffAttendanceCredential.findFirst({
    where: {
      tenantId: ctx.tenantId,
      staffId: staff.id,
      credentialType: "STATIC_QR",
      status: "ACTIVE"
    },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      tenantId: true,
      staffId: true,
      tokenHash: true,
      keyVersion: true,
      credentialVersion: true,
      status: true,
      issuedAt: true,
      expiresAt: true
    }
  });
  if (!credential) return { state: "NOT_ISSUED", card: null };
  if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
    return { state: "EXPIRED", card: null };
  }

  const qrPayload = recoverStaffAttendanceCredentialPayload(credential);
  if (!qrPayload) return { state: "REISSUE_REQUIRED", card: null };

  const card = cardFromRecord({ ...credential, staff } as CredentialCardRecord, qrPayload);
  await writeAuditLog({
    ctx,
    action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_VIEWED,
    entityType: "StaffAttendanceCredential",
    entityId: credential.id,
    branchId: staff.branchId,
    metadata: {
      staffId: staff.id,
      credentialVersion: credential.credentialVersion,
      viewerScope: "SELF"
    }
  });
  return { state: "AVAILABLE", card };
}

export async function recordStaffAttendanceCredentialPrint(ctx: TenantContext, credentialId: string) {
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");
  const credential = await loadCredentialCardRecord(ctx, credentialId);
  await authorizeCredentialManager(ctx, credential.staff.branchId, "READ");
  recoverActiveCard(credential);

  const printedAt = new Date();
  await writeAuditLog({
    ctx,
    action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_PRINTED,
    entityType: "StaffAttendanceCredential",
    entityId: credential.id,
    branchId: credential.staff.branchId,
    metadata: {
      staffId: credential.staffId,
      credentialVersion: credential.credentialVersion,
      printedAt
    }
  });
  return { credentialId: credential.id, printedAt: printedAt.toISOString() };
}

export async function revokeStaffAttendanceCredential(ctx: TenantContext, input: unknown) {
  const data = revokeStaffAttendanceCredentialSchema.parse(input);
  if (!ctx.userId) throw validationError("ACTOR_REQUIRED");

  const credential = await loadCredentialCardRecord(ctx, data.credentialId);
  await authorizeCredentialManager(ctx, credential.staff.branchId, "WRITE");
  if (credential.status !== "ACTIVE" && credential.status !== "SUSPENDED") {
    throw validationError("STAFF_ATTENDANCE_CREDENTIAL_NOT_ACTIVE");
  }

  const revokedAt = new Date();
  return db.$transaction(async (tx) => {
    const updated = await tx.staffAttendanceCredential.update({
      where: { id: credential.id },
      data: {
        status: "REVOKED",
        revokedAt,
        revokedById: ctx.userId,
        revocationReason: data.reason
      },
      select: { id: true, staffId: true, status: true, revokedAt: true }
    });
    await writeAuditLog({
      ctx,
      action: STAFFBOARD_LITE_AUDIT_EVENTS.STAFF_ATTENDANCE_CREDENTIAL_REVOKED,
      entityType: "StaffAttendanceCredential",
      entityId: updated.id,
      branchId: credential.staff.branchId,
      before: { status: credential.status },
      after: { status: updated.status, revokedAt: updated.revokedAt },
      metadata: { staffId: credential.staffId, reason: data.reason }
    }, tx);
    return updated;
  }, STAFF_ATTENDANCE_TRANSACTION_OPTIONS);
}

export async function listStaffAttendanceCredentials(ctx: TenantContext, staffId: string) {
  const staff = await loadCredentialStaff(ctx, staffId);
  await authorizeCredentialManager(ctx, staff.branchId, "READ");

  return db.staffAttendanceCredential.findMany({
    where: { tenantId: ctx.tenantId, staffId: staff.id },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      credentialType: true,
      credentialVersion: true,
      status: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      revocationReason: true,
      lastUsedAt: true
    }
  });
}

export async function listStaffAttendanceCredentialRoster(ctx: TenantContext) {
  requireCredentialManagerRole(ctx);
  const allowedBranchIds: string[] = [];
  for (const branchId of ctx.accessibleBranchIds) {
    try {
      await authorizeCredentialManager(ctx, branchId, "READ");
      allowedBranchIds.push(branchId);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("FORBIDDEN_")) continue;
      throw error;
    }
  }
  if (allowedBranchIds.length === 0) return [];

  return db.staffProfile.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: allowedBranchIds },
      employmentStatus: "ACTIVE",
      branch: ctx.institutionId ? { institutionId: ctx.institutionId } : undefined
    },
    orderBy: [{ branch: { name: "asc" } }, { firstName: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      branchId: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      designation: true,
      department: true,
      staffType: true,
      profilePhoto: { select: { id: true } },
      branch: {
        select: {
          name: true,
          code: true,
          institution: {
            select: { name: true, displayName: true, logoUrl: true }
          }
        }
      },
      attendanceCredentials: {
        where: { credentialType: "STATIC_QR" },
        orderBy: { issuedAt: "desc" },
        take: 5,
        select: {
          id: true,
          credentialVersion: true,
          issuedAt: true,
          expiresAt: true,
          lastUsedAt: true,
          revokedAt: true,
          revocationReason: true,
          status: true
        }
      }
    }
  });
}
