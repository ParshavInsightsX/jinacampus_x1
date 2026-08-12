import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookExamManager } from "@/modules/gradebook/components/gradebook-exam-manager";
import { getGradebookExamsWorkspace } from "@/modules/gradebook/queries";

export default async function GradebookExamsPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookExamsWorkspace(ctx);

  return (
    <div className="space-y-6">
      <PageHeader title="GradeBook Examinations" description="Configure examination scope, teacher ownership, schedules, entry windows, and activation readiness." />
      <GradebookExamManager
        canCreate={workspace.capabilities.canCreate}
        exams={workspace.exams.map((exam) => ({
          id: exam.id,
          code: exam.code,
          name: exam.name,
          status: exam.status,
          termName: exam.term.name,
          examTypeName: exam.examType.name,
          classSectionCount: exam._count.classSections,
          subjectCount: exam._count.subjects,
          assignmentCount: exam._count.teacherAssignments,
          batchCount: exam._count.GradebookMarkEntryBatch
        }))}
        terms={workspace.terms.map((term) => ({ id: term.id, label: `${term.code} - ${term.name}` }))}
        examTypes={workspace.examTypes.map((type) => ({ id: type.id, label: `${type.code} - ${type.name}`, maximumMarks: type.defaultMaximumMarks?.toString() ?? null, passingMarks: type.defaultPassingMarks?.toString() ?? null }))}
        classSections={workspace.classSections.map((item) => ({ id: item.id, label: item.displayName }))}
        subjects={workspace.subjects.map((item) => ({ id: item.id, code: item.code, label: item.name }))}
        schemeVersions={workspace.schemeVersions.map((item) => ({ id: item.id, label: `${item.scheme.name} v${item.versionNumber}` }))}
        gradeScaleVersions={workspace.gradeScaleVersions.map((item) => ({ id: item.id, label: `${item.gradeScale.name} v${item.versionNumber}` }))}
        calculationRuleVersions={workspace.calculationRuleSetVersions.map((item) => ({ id: item.id, label: `${item.ruleSet.name} v${item.versionNumber}` }))}
      />
    </div>
  );
}
