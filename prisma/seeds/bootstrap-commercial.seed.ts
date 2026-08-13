import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

import { validateSchoolId } from "../../src/modules/campus-core/tenant-login-policy";
import { seedDefaultRolesForTenant } from "./roles.seed";

const optionalText = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional()
);

const environmentSchema = z.object({
  COMMERCIAL_BOOTSTRAP_ENABLED: z.string().optional(),
  RESET_SEED_ADMIN_PASSWORD: z.string().optional(),
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
  SEED_ACADEMIC_YEAR_END_DATE: optionalText
}).passthrough();

const strongTemporaryPassword = z.string()
  .min(10, "SEED_ADMIN_TEMP_PASSWORD must be at least 10 characters.")
  .regex(/[A-Z]/, "SEED_ADMIN_TEMP_PASSWORD must include an uppercase letter.")
  .regex(/[a-z]/, "SEED_ADMIN_TEMP_PASSWORD must include a lowercase letter.")
  .regex(/\d/, "SEED_ADMIN_TEMP_PASSWORD must include a number.")
  .regex(/[^A-Za-z0-9]/, "SEED_ADMIN_TEMP_PASSWORD must include a symbol.");

export type CommercialBootstrapConfig = {
  tenantName: string;
  tenantSlug: string;
  adminEmail: string;
  adminPhone: string | null;
  adminTemporaryPassword: string;
  resetAdminPassword: boolean;
  institution: { name: string; code: string } | null;
  branch: { name: string; code: string } | null;
  academicYear: { name: string; startDate: Date; endDate: Date } | null;
};

type SeedEnvironment = Readonly<Record<string, string | undefined>>;

function requiredValue(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required when COMMERCIAL_BOOTSTRAP_ENABLED=true.`);
  return value;
}

function pairedValues(first: string | undefined, firstName: string, second: string | undefined, secondName: string) {
  if (Boolean(first) !== Boolean(second)) {
    throw new Error(`${firstName} and ${secondName} must be provided together.`);
  }
  return first && second ? { first, second } : null;
}

function parseDate(value: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must use YYYY-MM-DD format.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${name} must be a valid calendar date.`);
  }
  return date;
}

function normalizeSeedPhone(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  if (trimmed.startsWith("+") && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

export function getCommercialBootstrapConfig(
  environment: SeedEnvironment = process.env
): CommercialBootstrapConfig | null {
  const env = environmentSchema.parse(environment);
  if (env.COMMERCIAL_BOOTSTRAP_ENABLED !== "true") return null;

  const tenantName = requiredValue(env.SEED_TENANT_NAME, "SEED_TENANT_NAME");
  const rawTenantSlug = requiredValue(env.SEED_TENANT_SLUG, "SEED_TENANT_SLUG");
  const schoolId = validateSchoolId(rawTenantSlug);
  if (!schoolId.ok) throw new Error("SEED_TENANT_SLUG must be a valid lowercase School ID.");

  const adminEmail = z.string().email("SEED_ADMIN_EMAIL must be valid.")
    .parse(requiredValue(env.SEED_ADMIN_EMAIL, "SEED_ADMIN_EMAIL")).toLowerCase();
  const adminTemporaryPassword = strongTemporaryPassword.parse(
    requiredValue(env.SEED_ADMIN_TEMP_PASSWORD, "SEED_ADMIN_TEMP_PASSWORD")
  );
  const adminPhone = env.SEED_ADMIN_PHONE ? normalizeSeedPhone(env.SEED_ADMIN_PHONE) : null;
  if (env.SEED_ADMIN_PHONE && !adminPhone) throw new Error("SEED_ADMIN_PHONE must be a valid phone number.");

  const institutionPair = pairedValues(
    env.SEED_INSTITUTION_NAME,
    "SEED_INSTITUTION_NAME",
    env.SEED_INSTITUTION_CODE,
    "SEED_INSTITUTION_CODE"
  );
  const branchPair = pairedValues(
    env.SEED_BRANCH_NAME,
    "SEED_BRANCH_NAME",
    env.SEED_BRANCH_CODE,
    "SEED_BRANCH_CODE"
  );
  if (branchPair && !institutionPair) {
    throw new Error("Institution values are required when branch values are provided.");
  }

  const academicValues = [
    env.SEED_ACADEMIC_YEAR_NAME,
    env.SEED_ACADEMIC_YEAR_START_DATE,
    env.SEED_ACADEMIC_YEAR_END_DATE
  ];
  const hasAnyAcademicValue = academicValues.some(Boolean);
  const hasAllAcademicValues = academicValues.every(Boolean);
  if (hasAnyAcademicValue && !hasAllAcademicValues) {
    throw new Error("Academic year name, start date, and end date must be provided together.");
  }
  if (hasAllAcademicValues && !institutionPair) {
    throw new Error("Institution values are required when academic year values are provided.");
  }

  const academicYear = hasAllAcademicValues ? {
    name: env.SEED_ACADEMIC_YEAR_NAME!,
    startDate: parseDate(env.SEED_ACADEMIC_YEAR_START_DATE!, "SEED_ACADEMIC_YEAR_START_DATE"),
    endDate: parseDate(env.SEED_ACADEMIC_YEAR_END_DATE!, "SEED_ACADEMIC_YEAR_END_DATE")
  } : null;
  if (academicYear && academicYear.endDate <= academicYear.startDate) {
    throw new Error("SEED_ACADEMIC_YEAR_END_DATE must be after the start date.");
  }

  return {
    tenantName,
    tenantSlug: schoolId.schoolId,
    adminEmail,
    adminPhone,
    adminTemporaryPassword,
    resetAdminPassword: env.RESET_SEED_ADMIN_PASSWORD === "true",
    institution: institutionPair ? {
      name: institutionPair.first,
      code: institutionPair.second.toUpperCase()
    } : null,
    branch: branchPair ? {
      name: branchPair.first,
      code: branchPair.second.toUpperCase()
    } : null,
    academicYear
  };
}

async function upsertCommercialBootstrap(
  tx: Prisma.TransactionClient,
  config: CommercialBootstrapConfig,
  passwordHasher: (password: string) => Promise<string>
) {
  const now = new Date();
  const tenant = await tx.tenant.upsert({
    where: { slug: config.tenantSlug },
    create: { name: config.tenantName, slug: config.tenantSlug, status: "ACTIVE", plan: "TRIAL" },
    update: { name: config.tenantName, status: "ACTIVE" }
  });

  await tx.tenantSettings.upsert({
    where: { tenantId: tenant.id },
    create: { tenantId: tenant.id },
    update: {}
  });
  await seedDefaultRolesForTenant(tx, tenant.id);

  let institution: { id: string } | null = null;
  if (config.institution) {
    institution = await tx.institution.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: config.institution.code } },
      create: {
        tenantId: tenant.id,
        name: config.institution.name,
        displayName: config.institution.name,
        code: config.institution.code,
        status: "ACTIVE"
      },
      update: { name: config.institution.name, displayName: config.institution.name, status: "ACTIVE" },
      select: { id: true }
    });
  }

  let branch: { id: string } | null = null;
  if (config.branch && institution) {
    branch = await tx.branch.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: config.branch.code } },
      create: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: config.branch.name,
        code: config.branch.code,
        status: "ACTIVE"
      },
      update: { institutionId: institution.id, name: config.branch.name, status: "ACTIVE" },
      select: { id: true }
    });
    await tx.attendanceSetting.upsert({
      where: { branchId: branch.id },
      create: { tenantId: tenant.id, branchId: branch.id },
      update: { tenantId: tenant.id }
    });
  }

  if (config.academicYear && institution) {
    await tx.academicYear.upsert({
      where: {
        tenantId_institutionId_name: {
          tenantId: tenant.id,
          institutionId: institution.id,
          name: config.academicYear.name
        }
      },
      create: {
        tenantId: tenant.id,
        institutionId: institution.id,
        name: config.academicYear.name,
        startDate: config.academicYear.startDate,
        endDate: config.academicYear.endDate,
        status: "ACTIVE",
        isActive: true
      },
      update: {
        startDate: config.academicYear.startDate,
        endDate: config.academicYear.endDate,
        status: "ACTIVE",
        isActive: true
      }
    });
  }

  const user = await tx.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: config.adminEmail } },
    create: {
      tenantId: tenant.id,
      principalId: "PRINCIPAL-001",
      email: config.adminEmail,
      phone: config.adminPhone ?? undefined,
      firstName: "Admin",
      displayName: "Admin account",
      userType: "STAFF",
      status: "ACTIVE",
      activatedAt: now
    },
    update: {
      ...(config.adminPhone ? { phone: config.adminPhone } : {}),
      status: "ACTIVE",
      deactivatedAt: null,
      activatedAt: now
    },
    select: { id: true }
  });

  const existingCredential = await tx.passwordCredential.findUnique({
    where: { userId: user.id },
    select: { id: true }
  });
  if (!existingCredential || config.resetAdminPassword) {
    const passwordHash = await passwordHasher(config.adminTemporaryPassword);
    await tx.passwordCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash, mustChange: true },
      update: { passwordHash, passwordUpdatedAt: now, mustChange: true }
    });
  }

  const principalRole = await tx.role.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: "PRINCIPAL" } },
    select: { id: true }
  });
  if (!principalRole) throw new Error("PRINCIPAL role could not be initialized.");
  await tx.userRoleAssignment.upsert({
    where: {
      tenantId_userId_roleId_scopeType_scopeId: {
        tenantId: tenant.id,
        userId: user.id,
        roleId: principalRole.id,
        scopeType: "TENANT",
        scopeId: "TENANT"
      }
    },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      roleId: principalRole.id,
      scopeType: "TENANT",
      scopeId: "TENANT"
    },
    update: { isActive: true, endsAt: null }
  });

  if (branch) {
    await tx.userBranchAccess.upsert({
      where: { tenantId_userId_branchId: { tenantId: tenant.id, userId: user.id, branchId: branch.id } },
      create: { tenantId: tenant.id, userId: user.id, branchId: branch.id, isPrimary: true },
      update: { isActive: true, isPrimary: true }
    });
  }

  await tx.auditLog.create({
    data: {
      tenantId: tenant.id,
      branchId: branch?.id ?? null,
      actorUserId: null,
      action: "tenant.commercial_bootstrap",
      entityType: "Tenant",
      entityId: tenant.id,
      metadataJson: {
        source: "commercial_bootstrap",
        administratorConfigured: true,
        passwordInitialized: !existingCredential || config.resetAdminPassword
      }
    }
  });
}

export async function seedCommercialBootstrap(
  db: PrismaClient,
  environment: SeedEnvironment = process.env,
  passwordHasher?: (password: string) => Promise<string>
) {
  const config = getCommercialBootstrapConfig(environment);
  if (!config) return { enabled: false as const };

  const resolvedPasswordHasher = passwordHasher ?? (await import("../../src/lib/auth/password")).hashPassword;
  await db.$transaction((tx) => upsertCommercialBootstrap(tx, config, resolvedPasswordHasher));
  return { enabled: true as const, tenantSlug: config.tenantSlug };
}
