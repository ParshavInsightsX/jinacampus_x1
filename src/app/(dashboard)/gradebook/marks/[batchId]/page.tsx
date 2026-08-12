import Link from "next/link";

import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { PageHeader } from "@/modules/academia/components/academia-page-shell";
import { GradebookMvpMarksEditor } from "@/modules/gradebook/components/gradebook-mvp-marks-editor";
import { getTeacherMarksBatch } from "@/modules/gradebook/services";

export default async function GradebookMarksBatchPage({ params }: { params: Promise<{ batchId: string }> }) {
  const ctx = await requireAuth();
  const { batchId } = await params;
  const batch = await getTeacherMarksBatch(ctx, { batchId });
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId, academicYearId: ctx.activeAcademicYearId });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Marks Batch" description={`${batch.subject.code} - ${batch.subject.name} / optimistic version ${batch.version}`} />
        <Link href="/gradebook/marks" className="premium-secondary-button w-full sm:w-auto">Back to marks</Link>
      </div>
      <GradebookMvpMarksEditor
        batch={{ id: batch.id, status: batch.status, version: batch.version, subjectName: batch.subject.name, subjectCode: batch.subject.code, returnReason: batch.returnReason }}
        capabilities={{
          canSave: permissions.has("gradebook.marks.save_draft"),
          canSubmit: permissions.has("gradebook.marks.submit"),
          canVerify: permissions.has("gradebook.marks.verify"),
          canApprove: permissions.has("gradebook.marks.approve"),
          canLock: permissions.has("gradebook.marks.lock"),
          canReturn: permissions.has("gradebook.marks.return"),
          canImport: permissions.has("gradebook.import.create")
        }}
        roster={batch.roster.map((student) => ({ enrollmentId: student.enrollmentId, studentId: student.studentId, scholarNumber: student.scholarNumber ?? null, rollNumber: student.rollNumber ?? null, displayName: student.displayName ?? student.scholarNumber ?? "Student" }))}
        components={batch.components}
        marks={batch.marks.map((mark) => ({ enrollmentId: mark.enrollmentId, componentId: mark.examSubjectComponentId, marksObtained: mark.marksObtained, specialStatus: mark.specialStatus, statusReason: mark.statusReason, publicRemark: mark.publicRemark, teacherRemark: mark.teacherRemark }))}
      />
    </div>
  );
}
