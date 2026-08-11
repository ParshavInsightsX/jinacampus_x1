import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { PrerequisiteState } from "@/components/ui/empty-state";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookWorkspace } from "@/modules/gradebook/components/gradebook-workspace";
import { getGradebookWorkspace } from "@/modules/gradebook/queries";

function userName(user: { displayName: string | null; firstName: string; lastName: string | null; email: string } | null) {
  if (!user) return null;
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

export default async function GradebookPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookWorkspace(ctx);

  if (!workspace) {
    return (
      <div className="space-y-6">
        <PageHeader title="GradeBook" description="Manage class subjects, assessments, marks, and published results." />
        <PrerequisiteState
          title="Select an active branch and academic year"
          description="GradeBook requires an authorised active branch and academic year before records can be opened."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title="GradeBook"
          description="Create assessments and maintain a controlled marks ledger using existing Academia rosters and subject records."
        />
        {workspace.capabilities.canViewReports ? (
          <Link href="/gradebook/reports" className="premium-secondary-button w-full sm:w-auto">Published results</Link>
        ) : null}
      </div>
      <GradebookWorkspace
        branchName={workspace.branch.name}
        academicYearName={workspace.academicYear.name}
        capabilities={workspace.capabilities}
        classSections={workspace.classSections.map(({ id, displayName }) => ({ id, displayName }))}
        subjects={workspace.subjects}
        teachers={workspace.teachers.map((teacher) => ({
          id: teacher.id,
          name: userName(teacher) ?? teacher.email,
          email: teacher.email
        }))}
        assignments={workspace.assignments.map((assignment) => ({
          id: assignment.id,
          classSectionId: assignment.classSectionId,
          classSectionName: assignment.classSection.displayName,
          subjectCode: assignment.subject.code,
          subjectName: assignment.subject.name,
          teacherUserId: assignment.teacherUserId,
          teacherName: userName(assignment.teacherUser),
          status: assignment.status,
          assessmentCount: assignment._count.assessments
        }))}
        assessments={workspace.assessments.map((assessment) => ({
          id: assessment.id,
          code: assessment.code,
          title: assessment.title,
          type: assessment.type,
          assessmentDate: new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: ctx.timeZone }).format(assessment.assessmentDate),
          maxMarks: assessment.maxMarks.toString(),
          passMarks: assessment.passMarks.toString(),
          status: assessment.status,
          publishedAt: assessment.publishedAt?.toISOString() ?? null,
          classSectionName: assessment.classSection.displayName,
          subjectCode: assessment.classSectionSubject.subject.code,
          subjectName: assessment.classSectionSubject.subject.name,
          markCount: assessment._count.marks
        }))}
      />
    </div>
  );
}
