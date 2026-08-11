import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { EmptyState, PermissionState } from "@/components/ui/empty-state";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import {
  getStudentProfileWithGuardians,
  listStudentRegistrationClassSectionOptions
} from "@/modules/academia/queries";
import {
  PageHeader,
  ProfileReadinessPill,
  StatusPill,
  formatDateTime,
  formatEnumLabel
} from "@/modules/academia/components/academia-page-shell";
import { AssignStudentClassForm } from "@/modules/academia/components/assign-student-class-form";
import { env } from "@/lib/env";
import { listStudentDocuments } from "@/modules/academia/services/student-document.service";
import { StudentDocumentsPanel } from "@/modules/academia/components/student-documents-panel";
import {
  getStudentProfileStatus,
  missingStudentProfileFields
} from "@/modules/academia/student-profile-completeness";

function displayName(student: {
  fullName: string | null;
  displayName: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
}) {
  return (
    student.fullName ??
    student.displayName ??
    [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 min-h-6 text-sm font-semibold text-slate-900">{value || "-"}</dd>
    </div>
  );
}

function ProfileSection({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="premium-card p-4">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <dl className="grid gap-3 md:grid-cols-3">{children}</dl>
    </section>
  );
}

export default async function StudentProfilePage({ params }: { params: Promise<{ studentId: string }> }) {
  const ctx = await requireAuth();
  const { studentId } = await params;
  const student = await getStudentProfileWithGuardians(ctx, studentId);
  if (!student) notFound();

  const permissions = await getEffectivePermissions({ ctx, branchId: student.branchId });
  if (!permissions.has("academia.student.view")) return <PermissionState />;
  const canUpdate = permissions.has("academia.student.update");
  const canManageEnrollment = permissions.has("academia.enrollment.manage");
  const name = displayName(student);
  const profileStatus = getStudentProfileStatus(student);
  const missingProfileFields = missingStudentProfileFields(student);
  const primaryGuardian = student.guardianLinks[0]?.guardian;
  const currentYearEnrollment = student.enrollments.find(
    (enrollment) => enrollment.academicYear.isActive
  );
  const classSections = canManageEnrollment && !currentYearEnrollment
    ? await listStudentRegistrationClassSectionOptions(ctx, student.branchId)
    : [];
  const documents = canUpdate ? await listStudentDocuments(ctx, student.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        description={`Scholar / Admission No. ${student.admissionNumber}`}
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Link href="/academia/students" className="premium-secondary-button">
          Back to students
        </Link>
        {canUpdate ? (
          <Link href={`/academia/students/${student.id}/edit`} className="premium-primary-button">
            Edit Registration
          </Link>
        ) : null}
      </div>

      {profileStatus === "INCOMPLETE" ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-semibold">Additional information required</p>
          <p className="mt-1">
            Complete the admission profile when details become available. Missing: {missingProfileFields.join(", ")}.
          </p>
        </div>
      ) : null}

      <ProfileSection title="Admission Details" description="School identifiers and current lifecycle state.">
        <InfoRow label="Scholar / Admission No." value={student.admissionNumber} />
        <InfoRow label="Admission Date" value={formatDateTime(student.admissionDate)} />
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
          <dd className="mt-2"><StatusPill value={student.status} /></dd>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white/80 p-3">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profile readiness</dt>
          <dd className="mt-2"><ProfileReadinessPill value={profileStatus} /></dd>
        </div>
      </ProfileSection>

      <ProfileSection title="Student Personal Details" description="Basic student information used by attendance and class records.">
        <InfoRow label="Full Name" value={name} />
        <InfoRow label="Date of Birth" value={formatDateTime(student.dateOfBirth)} />
        <InfoRow label="Gender" value={formatEnumLabel(student.gender)} />
        <InfoRow label="Blood Group" value={student.bloodGroup ? formatEnumLabel(student.bloodGroup) : "-"} />
      </ProfileSection>

      <ProfileSection title="Parent / Guardian Details" description="Admission-sheet parent names and linked guardian summary.">
        <InfoRow label="Father Name" value={student.fatherName} />
        <InfoRow label="Father Occupation" value={student.fatherOccupation} />
        <InfoRow label="Mother Name" value={student.motherName} />
        <InfoRow label="Guardian Name" value={student.guardianName} />
        <InfoRow label="Linked Guardian" value={primaryGuardian?.displayName ?? primaryGuardian?.firstName ?? null} />
      </ProfileSection>

      <ProfileSection title="Identity Documents" description="Only masked sensitive references are displayed. Full values are not stored.">
        <InfoRow label="Aadhaar" value={student.aadhaarMasked} />
        <InfoRow label="Family ID" value={student.familyIdNumber} />
        <InfoRow label="SSSM ID" value={student.sssmIdNumber} />
        <InfoRow label="APAAR ID" value={student.apaarIdNumber} />
      </ProfileSection>

      {canUpdate ? (
        <StudentDocumentsPanel
          studentId={student.id}
          maxBytes={env.STUDENT_DOCUMENT_MAX_BYTES}
          documents={documents.map((document) => ({
            ...document,
            createdAt: document.createdAt.toISOString()
          }))}
        />
      ) : null}

      <ProfileSection title="Social / Demographic" description="School admission demographics.">
        <InfoRow label="Religion" value={student.religion} />
        <InfoRow label="Caste" value={student.caste} />
        <InfoRow label="Category" value={student.category} />
        <InfoRow label="Nationality" value={student.nationality} />
      </ProfileSection>

      <ProfileSection title="Address Details" description="Student address context.">
        <InfoRow label="Current Address" value={student.currentAddress} />
        <InfoRow label="Permanent Address" value={student.permanentAddress} />
        <InfoRow label="City" value={student.city} />
        <InfoRow label="State" value={student.state} />
        <InfoRow label="Pincode" value={student.pincode} />
      </ProfileSection>

      <ProfileSection title="Bank Details" description="Optional bank information with masked account references.">
        <InfoRow label="Bank Account" value={student.bankAccountMasked} />
        <InfoRow label="Bank Branch" value={student.bankBranchName} />
        <InfoRow label="IFSC" value={student.ifscCode} />
      </ProfileSection>

      {canManageEnrollment && !currentYearEnrollment ? (
        <AssignStudentClassForm
          studentId={student.id}
          classSections={classSections}
          defaultEnrollmentDate={new Date().toISOString().slice(0, 10)}
        />
      ) : null}

      {student.enrollments.length ? (
        <ProfileSection title="Current Academic Records" description="Recent enrollments for this student.">
          {student.enrollments.slice(0, 3).map((enrollment) => (
            <InfoRow
              key={enrollment.id}
              label={enrollment.academicYear.name}
              value={`${enrollment.classSection.displayName} - ${formatEnumLabel(enrollment.status)}`}
            />
          ))}
        </ProfileSection>
      ) : (
        <EmptyState
          title="No enrollment history"
          description="Create an active enrollment to include this student in class-wise attendance."
        />
      )}
    </div>
  );
}
