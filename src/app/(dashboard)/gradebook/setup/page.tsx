import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookConfigurationManager } from "@/modules/gradebook/components/gradebook-configuration-manager";
import { getGradebookConfigurationWorkspace } from "@/modules/gradebook/queries";

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export default async function GradebookSetupPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookConfigurationWorkspace(ctx);
  return (
    <div className="space-y-6">
      <PageHeader title="GradeBook Configuration" description="Versioned schemes, terms, exam types, grade scales, and calculation policy for the active academic context." />
      <GradebookConfigurationManager
        capabilities={workspace.capabilities}
        schemes={workspace.schemes.map((scheme) => ({ ...scheme, versions: scheme.versions.map(({ id, versionNumber, status }) => ({ id, versionNumber, status })) }))}
        terms={workspace.terms.map((term) => ({ ...term, startDate: dateOnly(term.startDate), endDate: dateOnly(term.endDate), examCount: term._count.exams }))}
        examTypes={workspace.examTypes.map((type) => ({ id: type.id, code: type.code, name: type.name, category: type.category, maximumMarks: type.defaultMaximumMarks?.toString() ?? null, passingMarks: type.defaultPassingMarks?.toString() ?? null, status: type.status, version: type.version }))}
        gradeScales={workspace.gradeScales.map((scale) => ({ id: scale.id, code: scale.code, name: scale.name, status: scale.status, versions: scale.versions.map((version) => ({ id: version.id, versionNumber: version.versionNumber, status: version.status, ruleCount: version._count.rules })) }))}
        calculationRuleSets={workspace.calculationRuleSets.map((ruleSet) => ({ id: ruleSet.id, code: ruleSet.code, name: ruleSet.name, status: ruleSet.status, versions: ruleSet.versions.map(({ id, versionNumber, strategy, status }) => ({ id, versionNumber, strategy, status })) }))}
      />
    </div>
  );
}
