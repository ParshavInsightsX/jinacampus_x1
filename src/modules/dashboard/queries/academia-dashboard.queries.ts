import { db } from "@/lib/db";
import { hasPlatformAdminRole, hasPrincipalRole, hasTeacherRole } from "@/lib/rbac/roles";
import type { TenantContext } from "@/lib/tenant/context";
import { activeBranchFilter, resolveDashboardScope } from "./shared";

export type AcademiaDashboardMetrics = {
  totalActiveStudents: number;
  totalActiveEnrollments: number;
  totalClasses: number;
  totalClassSections: number;
  totalGuardians: number;
};

function isAssignedTeacherScope(ctx: TenantContext) {
  const roleCodes = ctx.roleCodes ?? [];
  return hasTeacherRole(roleCodes) &&
    !hasPrincipalRole(roleCodes) &&
    !hasPlatformAdminRole(roleCodes);
}

export async function getAcademiaDashboardMetrics(
  ctx: TenantContext,
  input: unknown = {}
): Promise<AcademiaDashboardMetrics> {
  const scope = await resolveDashboardScope(ctx, input);
  const branchFilter = activeBranchFilter(scope);
  const teacherScope = isAssignedTeacherScope(ctx);
  const academicYearId = scope.activeAcademicYearId;
  if (teacherScope && !academicYearId) {
    return {
      totalActiveStudents: 0,
      totalActiveEnrollments: 0,
      totalClasses: 0,
      totalClassSections: 0,
      totalGuardians: 0
    };
  }
  const assignedClassSection = teacherScope ? { classTeacherUserId: ctx.userId } : {};
  const assignedEnrollment = teacherScope ? {
    enrollments: {
      some: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        academicYearId: academicYearId!,
        status: "ACTIVE" as const,
        classSection: assignedClassSection
      }
    }
  } : {};

  const [totalActiveStudents, totalActiveEnrollments] = await Promise.all([
    db.student.count({
      where: {
        tenantId: ctx.tenantId,
        branchId: branchFilter,
        status: "ACTIVE",
        ...assignedEnrollment
      }
    }),
    scope.activeAcademicYearId
      ? db.enrollment.count({
          where: {
            tenantId: ctx.tenantId,
            branchId: branchFilter,
            academicYearId: scope.activeAcademicYearId,
            status: "ACTIVE",
            ...(teacherScope ? { classSection: assignedClassSection } : {})
          }
        })
      : Promise.resolve(0)
  ]);
  const [totalClasses, totalClassSections] = await Promise.all([
    db.class.count({
      where: {
        tenantId: ctx.tenantId,
        status: "ACTIVE",
        ...(teacherScope ? {
          classSections: {
            some: {
              tenantId: ctx.tenantId,
              branchId: branchFilter,
              academicYearId: academicYearId!,
              status: "ACTIVE",
              ...assignedClassSection
            }
          }
        } : {})
      }
    }),
    scope.activeAcademicYearId
      ? db.classSection.count({
          where: {
            tenantId: ctx.tenantId,
            branchId: branchFilter,
            academicYearId: scope.activeAcademicYearId,
            status: "ACTIVE",
            ...assignedClassSection
          }
        })
      : Promise.resolve(0)
  ]);
  const totalGuardians = await db.guardian.count({
    where: {
      tenantId: ctx.tenantId,
      studentLinks: {
        some: {
          student: {
            tenantId: ctx.tenantId,
            branchId: branchFilter,
            status: "ACTIVE",
            ...assignedEnrollment
          }
        }
      }
    }
  });

  return {
    totalActiveStudents,
    totalActiveEnrollments,
    totalClasses,
    totalClassSections,
    totalGuardians
  };
}
