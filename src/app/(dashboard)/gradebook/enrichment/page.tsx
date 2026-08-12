import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookEnrichmentManager } from "@/modules/gradebook/components/gradebook-enrichment-manager";
import { getGradebookEnrichmentWorkspace } from "@/modules/gradebook/queries";

function name(student: { displayName: string | null; fullName: string | null; firstName: string; lastName: string | null }) {
  return student.displayName ?? student.fullName ?? [student.firstName, student.lastName].filter(Boolean).join(" ");
}

function ratingScale(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => typeof item === "object" && item !== null && typeof (item as { code?: unknown }).code === "string" && typeof (item as { label?: unknown }).label === "string" ? [{ code: (item as { code: string }).code, label: (item as { label: string }).label }] : []);
}

export default async function GradebookEnrichmentPage() {
  const ctx = await requireAuth();
  const workspace = await getGradebookEnrichmentWorkspace(ctx);
  return <div className="space-y-6"><PageHeader title="Co-scholastic and Remarks" description="Versioned student evaluation areas plus assignment-scoped teacher, class-teacher, and principal remarks." /><GradebookEnrichmentManager capabilities={workspace.capabilities} schemes={workspace.schemes.map((scheme) => ({ id: scheme.id, code: scheme.code, name: scheme.name, version: scheme.versionNumber, status: scheme.status, ratingScale: ratingScale(scheme.ratingScaleJson), indicators: scheme.areas.flatMap((area) => area.indicators.map((indicator) => ({ id: indicator.id, areaName: area.name, name: indicator.name, remarkRequired: indicator.remarkRequired }))) }))} terms={workspace.terms} enrollments={workspace.enrollments.map((item) => ({ id: item.id, label: `${item.classSection.displayName} / ${item.rollNumber ? `Roll ${item.rollNumber} / ` : ""}${name(item.student)} / ${item.student.admissionNumber}` }))} exams={workspace.exams.map((exam) => ({ id: exam.id, name: exam.name, subjects: exam.subjects.map((subject) => ({ id: subject.id, label: `${subject.subject.code} - ${subject.displayName ?? subject.subject.name}` })) }))} entries={workspace.entries.map((entry) => ({ id: entry.id, studentName: name(entry.enrollment.student), indicatorName: entry.indicator.name, ratingCode: entry.ratingCode, status: entry.status }))} remarks={workspace.remarks.map((remark) => ({ id: remark.id, studentName: name(remark.enrollment.student), examName: remark.exam.name, type: remark.remarkType, text: remark.remarkText, status: remark.status }))} /></div>;
}
