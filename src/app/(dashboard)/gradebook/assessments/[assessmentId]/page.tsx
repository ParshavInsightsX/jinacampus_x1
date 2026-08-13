import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppError } from "@/lib/errors";
import { PrerequisiteState } from "@/components/ui/empty-state";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookMarksEditor } from "@/modules/gradebook/components/gradebook-marks-editor";
import { getGradebookAssessmentWorkspace } from "@/modules/gradebook/queries";

type PageParams = Promise<{ assessmentId: string }>;

function studentName(student: {
  displayName: string | null;
  fullName: string | null;
  firstName: string;
  lastName: string | null;
}) {
  return student.displayName ?? student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

export default async function GradebookAssessmentPage({ params }: { params: PageParams }) {
  const ctx = await requireAuth();
  const { assessmentId } = await params;
  let workspace: Awaited<ReturnType<typeof getGradebookAssessmentWorkspace>>;
  try {
    workspace = await getGradebookAssessmentWorkspace(ctx, assessmentId);
  } catch (error) {
    if (error instanceof AppError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  if (!workspace) {
    return (
      <div className="space-y-6">
        <PageHeader title="Assessment" description="Enter or review student results." />
        <PrerequisiteState title="GradeBook context unavailable" description="Select an authorised branch and active academic year." />
      </div>
    );
  }

  const { assessment } = workspace;
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader
          title={assessment.title}
          description={`${assessment.code} / ${assessment.classSection.displayName} / ${assessment.classSectionSubject.subject.name}`}
        />
        <Link href="/gradebook" className="premium-secondary-button w-full sm:w-auto">Back to GradeBook</Link>
      </div>
      <GradebookMarksEditor
        assessment={{
          id: assessment.id,
          code: assessment.code,
          title: assessment.title,
          status: assessment.status,
          maxMarks: assessment.maxMarks.toString(),
          passMarks: assessment.passMarks.toString(),
          classSectionName: assessment.classSection.displayName,
          subjectName: assessment.classSectionSubject.subject.name
        }}
        capabilities={workspace.capabilities}
        roster={workspace.roster.map((enrollment) => {
          const mark = enrollment.gradebookMarks[0] ?? null;
          return {
            enrollmentId: enrollment.id,
            studentName: studentName(enrollment.student),
            admissionNumber: enrollment.student.admissionNumber,
            rollNumber: enrollment.rollNumber,
            status: mark?.status ?? "GRADED",
            marksObtained: mark?.marksObtained?.toString() ?? "",
            remarks: mark?.remarks ?? "",
            enteredAt: mark?.enteredAt
              ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: ctx.timeZone }).format(mark.enteredAt)
              : null
          };
        })}
      />
    </div>
  );
}
