import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { isIdentityCardSchemaAvailable } from "@/lib/schema-readiness/identity-cards";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { StudentIdentityCardManager } from "@/modules/academia/components/student-identity-card-manager";
import { getStudentProfileWithGuardians } from "@/modules/academia/queries";
import { getStudentIdentityCardWorkspace } from "@/modules/academia/services/student-identity-card.service";

function displayName(student: {
  fullName: string | null;
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
}) {
  return student.fullName ?? student.displayName ??
    [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");
}

function clampedIssueDate(start: string, end: string) {
  const today = new Date().toISOString().slice(0, 10);
  const startDate = start.slice(0, 10);
  const endDate = end.slice(0, 10);
  if (today < startDate) return startDate;
  if (today > endDate) return endDate;
  return today;
}

export default async function StudentIdentityCardPage({
  params
}: {
  params: Promise<{ studentId: string }>;
}) {
  const ctx = await requireAuth();
  const { studentId } = await params;
  const student = await getStudentProfileWithGuardians(ctx, studentId);
  if (!student) notFound();

  const permissions = await getEffectivePermissions({
    ctx,
    branchId: student.branchId,
    academicYearId: ctx.activeAcademicYearId
  });
  if (!permissions.has("academia.student.id_card.manage")) return <PermissionState />;

  if (!(await isIdentityCardSchemaAvailable())) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={"Student ID Card - " + displayName(student)}
          description={"Scholar / Admission No. " + student.admissionNumber}
        />
        <div className="no-print flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Link href={"/academia/students/" + student.id} className="premium-secondary-button min-h-11">
            Back to Student Profile
          </Link>
        </div>
        <ErrorState
          title="Student ID Cards are temporarily unavailable"
          description="The required identity-card setup is still being completed. Please contact the JinaCampus Administrator."
        />
      </div>
    );
  }

  const workspace = await getStudentIdentityCardWorkspace(ctx, student.id);
  const firstEnrollment = workspace.enrollments[0];
  const defaultValidFrom = firstEnrollment
    ? clampedIssueDate(
        firstEnrollment.academicYearStartDate,
        firstEnrollment.academicYearEndDate
      )
    : new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title={"Student ID Card - " + displayName(student)}
        description={"Scholar / Admission No. " + student.admissionNumber}
      />
      <div className="no-print flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link href={"/academia/students/" + student.id} className="premium-secondary-button min-h-11">
          Back to Student Profile
        </Link>
      </div>
      <StudentIdentityCardManager
        studentId={workspace.studentId}
        enrollments={workspace.enrollments}
        cards={workspace.cards}
        defaultValidFrom={defaultValidFrom}
      />
    </div>
  );
}
