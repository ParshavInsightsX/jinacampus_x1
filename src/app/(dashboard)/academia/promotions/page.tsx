import type { Prisma } from "@prisma/client";
import { requireAuth } from "@/lib/auth/require-auth";
import { PrerequisiteState } from "@/components/ui/empty-state";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import {
  StudentPromotionManager,
  type PromotionBatchSummary,
  type PromotionClassSectionOption
} from "@/modules/academia/components/student-promotion-manager";
import { getStudentPromotionWorkspace } from "@/modules/academia/queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function stringParam(value: string | string[] | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function outcomeSummary(value: Prisma.JsonValue): Record<string, number> {
  if (!value || Array.isArray(value) || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => (
    typeof entry[1] === "number"
  )));
}

function userName(user: { displayName: string | null; firstName: string; lastName: string | null; email: string } | null) {
  if (!user) return null;
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");
  return user.displayName ?? (fullName || user.email);
}

function classSectionOption(classSection: {
  id: string;
  academicYearId: string;
  classId: string;
  sectionId: string;
  displayName: string;
  capacity: number | null;
  academicClass: { name: string };
  section: { name: string };
}): PromotionClassSectionOption {
  return {
    id: classSection.id,
    academicYearId: classSection.academicYearId,
    classId: classSection.classId,
    sectionId: classSection.sectionId,
    displayName: classSection.displayName,
    className: classSection.academicClass.name,
    sectionName: classSection.section.name,
    capacity: classSection.capacity
  };
}

export default async function StudentPromotionsPage({ searchParams }: { searchParams?: SearchParams }) {
  const ctx = await requireAuth();
  const params = searchParams ? await searchParams : {};
  const workspace = await getStudentPromotionWorkspace(ctx, {
    sourceAcademicYearId: stringParam(params.sourceAcademicYearId),
    sourceClassSectionId: stringParam(params.sourceClassSectionId),
    targetAcademicYearId: stringParam(params.targetAcademicYearId)
  });

  if (!workspace) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Student Promotion"
          description="Promote selected students into the next academic year while preserving complete enrollment history."
        />
        <PrerequisiteState
          title="Select an active branch"
          description="An authorised active branch is required before student promotion can be managed."
        />
      </div>
    );
  }

  const recentBatches: PromotionBatchSummary[] = workspace.recentBatches.map((batch) => ({
    id: batch.id,
    status: batch.status,
    effectiveDate: batch.effectiveDate.toISOString(),
    selectedCount: batch.selectedCount,
    excludedCount: batch.excludedCount,
    outcomeSummary: outcomeSummary(batch.outcomeSummary),
    createdAt: batch.createdAt.toISOString(),
    reversedAt: batch.reversedAt?.toISOString() ?? null,
    sourceAcademicYearName: batch.sourceAcademicYear.name,
    targetAcademicYearName: batch.targetAcademicYear.name,
    sourceClassSectionName: batch.sourceClassSection.displayName,
    targetClassSectionName: batch.defaultTargetClassSection.displayName,
    createdByName: userName(batch.createdBy) ?? "Authorised user",
    reversedByName: userName(batch.reversedBy)
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Student Promotion"
        description="Review a class roster, record individual outcomes, and create next-year enrollments without altering historical records."
      />
      <StudentPromotionManager
        branchName={workspace.branch.name}
        academicYears={workspace.academicYears.map((year) => ({
          ...year,
          startDate: year.startDate.toISOString(),
          endDate: year.endDate.toISOString()
        }))}
        sourceAcademicYearId={workspace.sourceAcademicYearId}
        targetAcademicYearId={workspace.targetAcademicYearId}
        sourceClassSectionId={workspace.sourceClassSection?.id ?? null}
        allClassSections={workspace.allClassSections.map(classSectionOption)}
        sourceClassSection={workspace.sourceClassSection ? classSectionOption(workspace.sourceClassSection) : null}
        roster={workspace.roster.map((enrollment) => ({
          id: enrollment.id,
          studentId: enrollment.studentId,
          rollNumber: enrollment.rollNumber,
          admissionNumber: enrollment.student.admissionNumber,
          studentName: enrollment.studentName,
          processedOutcome: enrollment.processedOutcome
        }))}
        recentBatches={recentBatches}
      />
    </div>
  );
}
