import Link from "next/link";

import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookExamDetailManager } from "@/modules/gradebook/components/gradebook-exam-detail-manager";
import { getGradebookExamDetail } from "@/modules/gradebook/queries";
import { getExamReadiness } from "@/modules/gradebook/services";

function userName(user: { displayName: string | null; firstName: string; lastName: string | null; email: string }) {
  return user.displayName ?? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email);
}

function dateTime(value: Date | null) {
  return value?.toISOString() ?? null;
}

export default async function GradebookExamDetailPage({ params }: { params: Promise<{ examId: string }> }) {
  const ctx = await requireAuth();
  const { examId } = await params;
  const workspace = await getGradebookExamDetail(ctx, examId);
  const readiness = workspace.capabilities.canActivate ? await getExamReadiness(ctx, { examId }) : null;
  const exam = workspace.exam;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title={exam.name} description={`${exam.code} / ${exam.term.name} / ${exam.examType.name}`} />
        <Link href="/gradebook/exams" className="premium-secondary-button w-full sm:w-auto">Back to examinations</Link>
      </div>
      <GradebookExamDetailManager
        exam={{ id: exam.id, code: exam.code, name: exam.name, status: exam.status, termName: exam.term.name, examTypeName: exam.examType.name, marksEntryOpensAt: dateTime(exam.marksEntryOpensAt), marksEntryClosesAt: dateTime(exam.marksEntryClosesAt) }}
        readiness={readiness}
        capabilities={workspace.capabilities}
        classSections={exam.classSections.map((item) => ({ id: item.id, name: item.classSection.displayName }))}
        subjects={exam.subjects.map((item) => ({ id: item.id, name: item.displayName ?? item.subject.name, code: item.subject.code, components: item.components.map((component) => ({ id: component.id, name: component.componentName, code: component.componentCode })) }))}
        teachers={workspace.teachers.map((teacher) => ({ id: teacher.id, name: userName(teacher), email: teacher.email }))}
        assignments={exam.teacherAssignments.map((assignment) => ({ id: assignment.id, status: assignment.status, teacherName: userName(assignment.teacherUser), classSectionName: assignment.examClassSection.classSection.displayName, subjectName: assignment.examSubject.displayName ?? assignment.examSubject.subject.name, componentName: exam.subjects.flatMap((subject) => subject.components).find((component) => component.id === assignment.examSubjectComponentId)?.componentName ?? null }))}
        schedules={exam.schedules.map((schedule) => ({ id: schedule.id, status: schedule.status, classSectionName: schedule.examClassSection.classSection.displayName, subjectName: schedule.examSubject.displayName ?? schedule.examSubject.subject.name, examDate: schedule.examDate.toISOString().slice(0, 10), startTime: schedule.startTime, endTime: schedule.endTime, roomName: schedule.roomName }))}
        batches={exam.GradebookMarkEntryBatch}
        resultRuns={exam.GradebookResultRun.map((run) => ({ ...run, createdAt: run.createdAt.toISOString() }))}
      />
    </div>
  );
}
