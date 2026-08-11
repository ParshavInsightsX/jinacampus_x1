import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/rbac/require-permission";
import { hasPlatformAdminRole, hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { listStudentsSchema } from "@/modules/academia/schemas";
import { idSchema } from "@/modules/academia/schemas/shared";
import {
  getStudentProfileStatus,
  type StudentProfileStatus
} from "@/modules/academia/student-profile-completeness";
import { pagination, resolveAcademicYearId } from "./shared";

export type StudentClassSectionOption = {
  id: string;
  displayName: string;
  className: string;
  sectionName: string;
};

export type StudentRegistrationClassSectionOption = StudentClassSectionOption & {
  branchId: string;
  branchName: string;
  academicYearName: string;
};

export type StudentListRow = {
  id: string;
  admissionNumber: string;
  firstName: string;
  lastName: string | null;
  displayName: string;
  gender: string;
  status: string;
  profileStatus: StudentProfileStatus;
  fatherName: string | null;
  guardianName: string | null;
  category: string | null;
  currentClassSection: string;
  className: string;
  sectionName: string;
  rollNumber: string | null;
  guardianContact: string | null;
};

function resolveBranchId(ctx: TenantContext, branchId?: string) {
  return branchId ?? ctx.activeBranchId ?? ctx.accessibleBranchIds[0] ?? undefined;
}

function isAssignedTeacherScope(ctx: TenantContext) {
  const roleCodes = ctx.roleCodes ?? [];
  return hasTeacherRole(roleCodes) &&
    !hasPrincipalRole(roleCodes) &&
    !hasPlatformAdminRole(roleCodes);
}

function assignedClassSectionFilter(ctx: TenantContext): Prisma.ClassSectionWhereInput {
  return isAssignedTeacherScope(ctx) ? { classTeacherUserId: ctx.userId } : {};
}

function studentName(student: { displayName: string | null; firstName: string; lastName: string | null }) {
  return student.displayName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

function guardianContact(
  link:
    | {
        guardian: {
          displayName: string | null;
          firstName: string;
          lastName: string | null;
          phone: string | null;
          email: string | null;
        };
      }
    | undefined
) {
  if (!link) return null;
  const guardian = link.guardian;
  const name = guardian.displayName ?? [guardian.firstName, guardian.lastName].filter(Boolean).join(" ");
  const contact = guardian.phone ?? guardian.email;
  return contact ? `${name} - ${contact}` : name;
}

function studentGuardianContact(student: {
  guardianName: string | null;
  fatherName: string | null;
  guardianLinks: Parameters<typeof guardianContact>[0][];
}) {
  return student.guardianName ?? student.fatherName ?? guardianContact(student.guardianLinks[0]);
}

export async function listStudents(ctx: TenantContext, input: unknown = {}) {
  const params = listStudentsSchema.parse(input);
  const branchId = resolveBranchId(ctx, params.branchId);
  if (!branchId) return [];
  const academicYearId = resolveAcademicYearId(ctx);
  if (isAssignedTeacherScope(ctx) && !academicYearId) return [];
  await requirePermission({ ctx, permission: "academia.student.view", branchId });

  const where: Prisma.StudentWhereInput = {
    tenantId: ctx.tenantId,
    branchId,
    status: params.status ?? { not: "WITHDRAWN" },
    gender: params.gender,
    bloodGroup: params.bloodGroup,
    ...(isAssignedTeacherScope(ctx)
      ? {
        enrollments: {
          some: {
            tenantId: ctx.tenantId,
            branchId,
            academicYearId,
            status: "ACTIVE",
            classSection: assignedClassSectionFilter(ctx)
          }
        }
      }
      : {})
  };
  if (params.search) {
    where.OR = [
      { admissionNumber: { contains: params.search, mode: "insensitive" } },
      { firstName: { contains: params.search, mode: "insensitive" } },
      { middleName: { contains: params.search, mode: "insensitive" } },
      { lastName: { contains: params.search, mode: "insensitive" } },
      { displayName: { contains: params.search, mode: "insensitive" } },
      { fullName: { contains: params.search, mode: "insensitive" } },
      { fatherName: { contains: params.search, mode: "insensitive" } },
      { motherName: { contains: params.search, mode: "insensitive" } }
    ];
  }

  return db.student.findMany({
    where,
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      displayName: true,
      gender: true,
      status: true,
      fatherName: true,
      guardianName: true,
      category: true
    },
    orderBy: [{ displayName: "asc" }, { admissionNumber: "asc" }],
    ...pagination(params)
  });
}

export async function listStudentClassSectionOptions(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StudentClassSectionOption[]> {
  const params = listStudentsSchema.pick({ branchId: true }).parse(input);
  const branchId = resolveBranchId(ctx, params.branchId);
  const academicYearId = resolveAcademicYearId(ctx);
  if (!branchId || !academicYearId) return [];

  await requirePermission({ ctx, permission: "academia.student.view", branchId, academicYearId });

  const classSections = await db.classSection.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      ...assignedClassSectionFilter(ctx),
      status: "ACTIVE"
    },
    select: {
      id: true,
      displayName: true,
      academicClass: { select: { name: true, sortOrder: true } },
      section: { select: { name: true, sortOrder: true } }
    },
    orderBy: [{ academicClass: { sortOrder: "asc" } }, { section: { sortOrder: "asc" } }]
  });

  return classSections.map((classSection) => ({
    id: classSection.id,
    displayName: classSection.displayName,
    className: classSection.academicClass.name,
    sectionName: classSection.section.name
  }));
}

export async function listStudentRegistrationClassSectionOptions(
  ctx: TenantContext,
  branchId?: string
): Promise<StudentRegistrationClassSectionOption[]> {
  const accessibleBranchIds = branchId
    ? ctx.accessibleBranchIds.filter((id) => id === branchId)
    : ctx.accessibleBranchIds;
  if (!accessibleBranchIds.length) return [];
  await requirePermission({
    ctx,
    permission: "academia.enrollment.manage",
    branchId: branchId ?? ctx.activeBranchId ?? accessibleBranchIds[0]
  });

  const classSections = await db.classSection.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId: { in: accessibleBranchIds },
      status: "ACTIVE",
      academicYear: {
        tenantId: ctx.tenantId,
        isActive: true,
        status: "ACTIVE"
      }
    },
    select: {
      id: true,
      branchId: true,
      displayName: true,
      branch: { select: { name: true } },
      academicYear: { select: { name: true } },
      academicClass: { select: { name: true, sortOrder: true } },
      section: { select: { name: true, sortOrder: true } }
    },
    orderBy: [
      { branch: { name: "asc" } },
      { academicClass: { sortOrder: "asc" } },
      { section: { sortOrder: "asc" } }
    ]
  });

  return classSections.map((classSection) => ({
    id: classSection.id,
    branchId: classSection.branchId,
    displayName: classSection.displayName,
    className: classSection.academicClass.name,
    sectionName: classSection.section.name,
    branchName: classSection.branch.name,
    academicYearName: classSection.academicYear.name
  }));
}

export async function listStudentsWithCurrentEnrollment(
  ctx: TenantContext,
  input: unknown = {}
): Promise<StudentListRow[]> {
  const params = listStudentsSchema.parse(input);
  const branchId = resolveBranchId(ctx, params.branchId);
  const academicYearId = resolveAcademicYearId(ctx);
  if (!branchId || !academicYearId) return [];

  await requirePermission({ ctx, permission: "academia.student.view", branchId, academicYearId });

  let classSectionId = params.classSectionId;
  if (classSectionId) {
    const classSection = await db.classSection.findFirst({
      where: {
        id: classSectionId,
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        ...assignedClassSectionFilter(ctx),
        status: "ACTIVE"
      },
      select: { id: true }
    });
    if (!classSection) return [];
    classSectionId = classSection.id;
  }

  const studentWhere: Prisma.StudentWhereInput = {
    tenantId: ctx.tenantId,
    branchId,
    status: params.status ?? "ACTIVE",
    gender: params.gender,
    bloodGroup: params.bloodGroup,
    category: params.category
  };
  if (isAssignedTeacherScope(ctx)) {
    studentWhere.enrollments = {
      some: {
        tenantId: ctx.tenantId,
        branchId,
        academicYearId,
        status: "ACTIVE",
        classSection: assignedClassSectionFilter(ctx)
      }
    };
  }
  if (params.search) {
    studentWhere.OR = [
      { admissionNumber: { contains: params.search, mode: "insensitive" } },
      { firstName: { contains: params.search, mode: "insensitive" } },
      { middleName: { contains: params.search, mode: "insensitive" } },
      { lastName: { contains: params.search, mode: "insensitive" } },
      { displayName: { contains: params.search, mode: "insensitive" } },
      { fullName: { contains: params.search, mode: "insensitive" } },
      { fatherName: { contains: params.search, mode: "insensitive" } },
      { motherName: { contains: params.search, mode: "insensitive" } }
    ];
  }

  if (!classSectionId) {
    const students = await db.student.findMany({
      where: studentWhere,
      select: {
        id: true,
        admissionNumber: true,
        admissionDate: true,
        fullName: true,
        firstName: true,
        lastName: true,
        displayName: true,
        dateOfBirth: true,
        gender: true,
        status: true,
        fatherName: true,
        motherName: true,
        guardianName: true,
        aadhaarMasked: true,
        religion: true,
        caste: true,
        category: true,
        nationality: true,
        city: true,
        state: true,
        guardianLinks: {
          where: { tenantId: ctx.tenantId, isPrimary: true },
          select: {
            guardian: {
              select: {
                displayName: true,
                firstName: true,
                lastName: true,
                phone: true,
                email: true
              }
            }
          },
          orderBy: [{ isPrimary: "desc" }, { relation: "asc" }],
          take: 1
        },
        enrollments: {
          where: {
            tenantId: ctx.tenantId,
            branchId,
            academicYearId,
            status: "ACTIVE",
            classSection: assignedClassSectionFilter(ctx)
          },
          select: {
            rollNumber: true,
            classSection: {
              select: {
                displayName: true,
                academicClass: { select: { name: true } },
                section: { select: { name: true } }
              }
            }
          },
          orderBy: { enrolledOn: "desc" },
          take: 1
        }
      },
      orderBy: [{ displayName: "asc" }, { firstName: "asc" }, { admissionNumber: "asc" }],
      ...pagination(params)
    });

    return students.map((student) => {
      const currentEnrollment = student.enrollments[0];
      return {
        id: student.id,
        admissionNumber: student.admissionNumber,
        firstName: student.firstName,
        lastName: student.lastName,
        displayName: studentName(student),
        gender: student.gender,
        status: student.status,
        profileStatus: getStudentProfileStatus(student),
        fatherName: student.fatherName,
        guardianName: student.guardianName,
        category: student.category,
        currentClassSection: currentEnrollment?.classSection.displayName ?? "Not enrolled",
        className: currentEnrollment?.classSection.academicClass.name ?? "-",
        sectionName: currentEnrollment?.classSection.section.name ?? "-",
        rollNumber: currentEnrollment?.rollNumber ?? null,
        guardianContact: studentGuardianContact(student)
      };
    });
  }

  const enrollments = await db.enrollment.findMany({
    where: {
      tenantId: ctx.tenantId,
      branchId,
      academicYearId,
      classSectionId,
      status: "ACTIVE",
      classSection: assignedClassSectionFilter(ctx),
      student: studentWhere
    },
    select: {
      id: true,
      rollNumber: true,
      student: {
        select: {
          id: true,
          admissionNumber: true,
          admissionDate: true,
          fullName: true,
          firstName: true,
          lastName: true,
          displayName: true,
          dateOfBirth: true,
          gender: true,
          status: true,
          fatherName: true,
          motherName: true,
          guardianName: true,
          aadhaarMasked: true,
          religion: true,
          caste: true,
          category: true,
          nationality: true,
          city: true,
          state: true,
          guardianLinks: {
            where: { tenantId: ctx.tenantId, isPrimary: true },
            select: {
              guardian: {
                select: {
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  phone: true,
                  email: true
                }
              }
            },
            orderBy: [{ isPrimary: "desc" }, { relation: "asc" }],
            take: 1
          }
        }
      },
      classSection: {
        select: {
          displayName: true,
          academicClass: { select: { name: true } },
          section: { select: { name: true } }
        }
      }
    },
    orderBy: [
      { classSection: { displayName: "asc" } },
      { rollNumber: "asc" },
      { student: { displayName: "asc" } },
      { student: { firstName: "asc" } },
      { student: { admissionNumber: "asc" } }
    ],
    ...pagination(params)
  });

  return enrollments.map((enrollment) => ({
    id: enrollment.student.id,
    admissionNumber: enrollment.student.admissionNumber,
    firstName: enrollment.student.firstName,
    lastName: enrollment.student.lastName,
    displayName: studentName(enrollment.student),
    gender: enrollment.student.gender,
    status: enrollment.student.status,
    profileStatus: getStudentProfileStatus(enrollment.student),
    fatherName: enrollment.student.fatherName,
    guardianName: enrollment.student.guardianName,
    category: enrollment.student.category,
    currentClassSection: enrollment.classSection.displayName,
    className: enrollment.classSection.academicClass.name,
    sectionName: enrollment.classSection.section.name,
    rollNumber: enrollment.rollNumber,
    guardianContact: studentGuardianContact(enrollment.student)
  }));
}

export async function getStudentById(ctx: TenantContext, studentId: string) {
  const id = idSchema.parse(studentId);
  const academicYearId = resolveAcademicYearId(ctx);
  if (isAssignedTeacherScope(ctx) && !academicYearId) return null;
  const student = await db.student.findFirst({
    where: {
      id,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      ...(isAssignedTeacherScope(ctx)
        ? {
          enrollments: {
            some: {
              tenantId: ctx.tenantId,
              academicYearId,
              status: "ACTIVE",
              classSection: assignedClassSectionFilter(ctx)
            }
          }
        }
        : {})
    }
  });
  if (!student) return null;

  await requirePermission({ ctx, permission: "academia.student.view", branchId: student.branchId });
  return student;
}

export async function getStudentProfileWithGuardians(ctx: TenantContext, studentId: string) {
  const id = idSchema.parse(studentId);
  const academicYearId = resolveAcademicYearId(ctx);
  if (isAssignedTeacherScope(ctx) && !academicYearId) return null;
  const student = await db.student.findFirst({
    where: {
      id,
      tenantId: ctx.tenantId,
      branchId: { in: ctx.accessibleBranchIds },
      ...(isAssignedTeacherScope(ctx)
        ? {
          enrollments: {
            some: {
              tenantId: ctx.tenantId,
              academicYearId,
              status: "ACTIVE",
              classSection: assignedClassSectionFilter(ctx)
            }
          }
        }
        : {})
    },
    include: {
      guardianLinks: {
        where: { tenantId: ctx.tenantId },
        include: { guardian: true },
        orderBy: [{ isPrimary: "desc" }, { relation: "asc" }]
      },
      enrollments: {
        where: {
          tenantId: ctx.tenantId,
          ...(isAssignedTeacherScope(ctx)
            ? {
              academicYearId,
              status: "ACTIVE",
              classSection: assignedClassSectionFilter(ctx)
            }
            : {})
        },
        include: { classSection: { include: { academicClass: true, section: true } }, academicYear: true },
        orderBy: { enrolledOn: "desc" }
      }
    }
  });
  if (!student) return null;

  await requirePermission({ ctx, permission: "academia.student.view", branchId: student.branchId });
  return student;
}

export async function listStudentsByClassSection(ctx: TenantContext, classSectionId: string) {
  return listStudentsWithCurrentEnrollment(ctx, { classSectionId: idSchema.parse(classSectionId) });
}
