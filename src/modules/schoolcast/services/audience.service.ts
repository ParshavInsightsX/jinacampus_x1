import type { Prisma } from "@prisma/client";
import type { z } from "zod";

import type { schoolCastAudienceRuleSchema } from "@/modules/schoolcast/schemas";

export type SchoolCastAudienceRuleInput = z.infer<typeof schoolCastAudienceRuleSchema>;

export type SchoolCastResolvedRecipient = {
  recipientType: "USER" | "STUDENT" | "GUARDIAN" | "STAFF";
  stableRecipientKey: string;
  userId: string | null;
  studentId: string | null;
  guardianId: string | null;
  staffId: string | null;
  relationship: string | null;
  displayName: string;
  email: string | null;
  phone: string | null;
  preferenceOwnerType: "USER" | "GUARDIAN" | "STAFF" | null;
  preferenceOwnerId: string | null;
};

type ResolveInput = {
  tenantId: string;
  branchId: string;
  academicYearId: string;
  rules: readonly SchoolCastAudienceRuleInput[];
};

function displayName(value: {
  displayName?: string | null;
  fullName?: string | null;
  firstName: string;
  middleName?: string | null;
  lastName?: string | null;
  email?: string | null;
}) {
  return value.displayName ?? value.fullName ?? ([value.firstName, value.middleName, value.lastName].filter(Boolean).join(" ") || value.email || "Recipient");
}

function userRecipient(user: {
  id: string;
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  email: string;
  phone: string | null;
  staffProfile: { id: string; email: string | null; phone: string | null } | null;
}): SchoolCastResolvedRecipient {
  if (user.staffProfile) {
    return {
      recipientType: "STAFF",
      stableRecipientKey: `staff:${user.staffProfile.id}`,
      userId: user.id,
      studentId: null,
      guardianId: null,
      staffId: user.staffProfile.id,
      relationship: null,
      displayName: displayName(user),
      email: user.staffProfile.email ?? user.email,
      phone: user.staffProfile.phone ?? user.phone,
      preferenceOwnerType: "STAFF",
      preferenceOwnerId: user.staffProfile.id
    };
  }
  return {
    recipientType: "USER",
    stableRecipientKey: `user:${user.id}`,
    userId: user.id,
    studentId: null,
    guardianId: null,
    staffId: null,
    relationship: null,
    displayName: displayName(user),
    email: user.email,
    phone: user.phone,
    preferenceOwnerType: "USER",
    preferenceOwnerId: user.id
  };
}

const userSelect = {
  id: true,
  displayName: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  phone: true,
  staffProfile: { select: { id: true, email: true, phone: true } }
} as const;

const studentInclude = {
  portalUser: { select: { id: true } },
  guardianLinks: {
    include: {
      guardian: {
        select: {
          id: true,
          userId: true,
          firstName: true,
          middleName: true,
          lastName: true,
          displayName: true,
          email: true,
          phone: true
        }
      }
    }
  }
} as const;

function addStudentRecipients(
  target: Map<string, SchoolCastResolvedRecipient>,
  student: {
    id: string;
    firstName: string;
    middleName: string | null;
    lastName: string | null;
    fullName: string | null;
    displayName: string | null;
    portalUser: { id: string } | null;
    guardianLinks: Array<{
      relation: string;
      guardian: {
        id: string;
        userId: string | null;
        firstName: string;
        middleName: string | null;
        lastName: string | null;
        displayName: string | null;
        email: string | null;
        phone: string | null;
      };
    }>;
  }
) {
  const studentKey = `student:${student.id}`;
  target.set(studentKey, {
    recipientType: "STUDENT",
    stableRecipientKey: studentKey,
    userId: student.portalUser?.id ?? null,
    studentId: student.id,
    guardianId: null,
    staffId: null,
    relationship: null,
    displayName: displayName(student),
    email: null,
    phone: null,
    preferenceOwnerType: student.portalUser ? "USER" : null,
    preferenceOwnerId: student.portalUser?.id ?? null
  });

  for (const link of student.guardianLinks) {
    const guardian = link.guardian;
    const key = `guardian:${guardian.id}:student:${student.id}`;
    target.set(key, {
      recipientType: "GUARDIAN",
      stableRecipientKey: key,
      userId: guardian.userId,
      studentId: student.id,
      guardianId: guardian.id,
      staffId: null,
      relationship: link.relation,
      displayName: displayName(guardian),
      email: guardian.email,
      phone: guardian.phone,
      preferenceOwnerType: "GUARDIAN",
      preferenceOwnerId: guardian.id
    });
  }
}

async function resolveRule(
  tx: Prisma.TransactionClient,
  input: Omit<ResolveInput, "rules">,
  rule: SchoolCastAudienceRuleInput
) {
  const recipients = new Map<string, SchoolCastResolvedRecipient>();

  if (rule.ruleType === "ALL_USERS" || rule.ruleType === "BRANCH" || rule.ruleType === "ROLE" || rule.ruleType === "CUSTOM") {
    if (rule.ruleType === "BRANCH" && !rule.targetIds.includes(input.branchId)) return recipients;
    const users = await tx.user.findMany({
      where: {
        tenantId: input.tenantId,
        status: "ACTIVE",
        branchAccesses: { some: { tenantId: input.tenantId, branchId: input.branchId, isActive: true } },
        ...(rule.ruleType === "ROLE" ? {
          roleAssignments: { some: { tenantId: input.tenantId, isActive: true, role: { tenantId: input.tenantId, code: { in: rule.roleCodes }, isActive: true } } }
        } : {}),
        ...(rule.ruleType === "CUSTOM" ? { id: { in: rule.targetIds } } : {})
      },
      select: userSelect
    });
    users.forEach((user) => {
      const recipient = userRecipient(user);
      recipients.set(recipient.stableRecipientKey, recipient);
    });
  }

  if (rule.ruleType === "CLASS_SECTION" || rule.ruleType === "STUDENT") {
    const enrollments = await tx.enrollment.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        academicYearId: input.academicYearId,
        status: "ACTIVE",
        ...(rule.ruleType === "CLASS_SECTION" ? { classSectionId: { in: rule.targetIds } } : { studentId: { in: rule.targetIds } }),
        classSection: { tenantId: input.tenantId, branchId: input.branchId, academicYearId: input.academicYearId, status: "ACTIVE" },
        student: { tenantId: input.tenantId, branchId: input.branchId, status: "ACTIVE" }
      },
      select: {
        student: {
          select: {
            id: true,
            firstName: true,
            middleName: true,
            lastName: true,
            fullName: true,
            displayName: true,
            ...studentInclude
          }
        }
      }
    });
    enrollments.forEach(({ student }) => addStudentRecipients(recipients, student));
  }

  if (rule.ruleType === "STAFF") {
    const staff = await tx.staffProfile.findMany({
      where: {
        tenantId: input.tenantId,
        branchId: input.branchId,
        id: { in: rule.targetIds },
        employmentStatus: "ACTIVE"
      },
      select: {
        id: true,
        userId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        phone: true
      }
    });
    staff.forEach((person) => {
      const key = `staff:${person.id}`;
      recipients.set(key, {
        recipientType: "STAFF",
        stableRecipientKey: key,
        userId: person.userId,
        studentId: null,
        guardianId: null,
        staffId: person.id,
        relationship: null,
        displayName: displayName(person),
        email: person.email,
        phone: person.phone,
        preferenceOwnerType: "STAFF",
        preferenceOwnerId: person.id
      });
    });
  }

  if (rule.recipientTypes.length > 0) {
    for (const [key, recipient] of recipients) {
      if (!rule.recipientTypes.includes(recipient.recipientType)) recipients.delete(key);
    }
  }
  return recipients;
}

export async function resolveSchoolCastAudience(tx: Prisma.TransactionClient, input: ResolveInput) {
  const included = new Map<string, SchoolCastResolvedRecipient>();
  const excluded = new Set<string>();

  for (const rule of input.rules) {
    const resolved = await resolveRule(tx, input, rule);
    if (rule.mode === "EXCLUDE") {
      resolved.forEach((_, key) => excluded.add(key));
    } else {
      resolved.forEach((recipient, key) => included.set(key, recipient));
    }
  }

  excluded.forEach((key) => included.delete(key));
  return Array.from(included.values());
}