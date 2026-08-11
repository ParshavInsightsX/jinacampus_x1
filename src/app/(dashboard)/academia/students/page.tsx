import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listAccessibleBranches } from "@/modules/campus-core/queries";
import {
  listStudentClassSectionOptions,
  listStudentsWithCurrentEnrollment,
  type StudentClassSectionOption
} from "@/modules/academia/queries";
import { academiaListPageConfigs } from "@/modules/academia/ui-config";
import {
  PageHeader,
  ProfileReadinessPill,
  StatusPill,
  TableActionLink,
  TableShell,
  type RouteSearchParams
} from "@/modules/academia/components/academia-page-shell";
import { EmptyState, ErrorState, NoResultsState, PermissionState, PrerequisiteState } from "@/components/ui/empty-state";

type BranchOption = {
  id: string;
  name: string;
};

type StudentFilters = {
  search?: string;
  branchId?: string;
  classSectionId?: string;
  status?: string;
};

const studentStatusOptions = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "TRANSFERRED", label: "Transferred" },
  { value: "WITHDRAWN", label: "Withdrawn" },
  { value: "ALUMNI", label: "Alumni" }
] as const;

function searchParamValue(params: Record<string, string | string[] | undefined>, key: string) {
  const value = params[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

async function resolveStudentFilters(searchParams?: RouteSearchParams): Promise<StudentFilters> {
  const params = searchParams ? await searchParams : {};
  return {
    search: searchParamValue(params, "search"),
    branchId: searchParamValue(params, "branchId"),
    classSectionId: searchParamValue(params, "classSectionId"),
    status: searchParamValue(params, "status")
  };
}

function StudentsFilterBar({
  branchOptions,
  classSectionOptions,
  filters,
  selectedBranchId
}: {
  branchOptions: BranchOption[];
  classSectionOptions: StudentClassSectionOption[];
  filters: StudentFilters;
  selectedBranchId?: string;
}) {
  const searchId = "students-search";
  const branchId = selectedBranchId ?? "";
  const selectedStatus = filters.status ?? "ACTIVE";

  return (
    <form method="get" role="search" aria-label="Filter students" className="premium-card p-3">
      <div className="grid gap-3 md:grid-cols-4 md:items-end">
        <div>
          <label htmlFor="students-branch-filter" className="text-sm font-medium text-slate-700">
            Branch
          </label>
          <select id="students-branch-filter" name="branchId" defaultValue={branchId} disabled={!branchOptions.length} className="mt-2 min-h-11 w-full min-w-0">
            {!branchOptions.length ? <option value="">No branch access</option> : null}
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="students-class-section-filter" className="text-sm font-medium text-slate-700">
            Class Section
          </label>
          <select id="students-class-section-filter" name="classSectionId" defaultValue={filters.classSectionId ?? ""} disabled={!classSectionOptions.length} className="mt-2 min-h-11 w-full min-w-0">
            <option value="">{classSectionOptions.length ? "All active class sections" : "No class sections available"}</option>
            {classSectionOptions.map((classSection) => (
              <option key={classSection.id} value={classSection.id}>{classSection.displayName}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="students-status-filter" className="text-sm font-medium text-slate-700">
            Status
          </label>
          <select id="students-status-filter" name="status" defaultValue={selectedStatus} className="mt-2 min-h-11 w-full min-w-0">
            {studentStatusOptions.map((status) => (
              <option key={status.value} value={status.value}>{status.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={searchId} className="text-sm font-medium text-slate-700">
            Search Students
          </label>
          <input
            id={searchId}
            name="search"
            type="search"
            defaultValue={filters.search}
            placeholder="Search by name or admission no."
            className="mt-2 min-h-11 w-full min-w-0"
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
        <button type="submit" className="premium-primary-button">
          Apply Filters
        </button>
        <Link href="/academia/students" className="premium-secondary-button">
          Clear filters
        </Link>
      </div>
    </form>
  );
}

export default async function StudentsPage({ searchParams }: { searchParams?: RouteSearchParams }) {
  const ctx = await requireAuth();
  const config = academiaListPageConfigs.students;
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("academia.student.view")) return <PermissionState />;
  const canCreateStudents = permissions.has("academia.student.create");
  const canUpdateStudents = permissions.has("academia.student.update");
  const filters = await resolveStudentFilters(searchParams);

  let branchOptions: BranchOption[];
  let selectedBranchId: string | undefined;
  let classSectionOptions: StudentClassSectionOption[];
  let students: Awaited<ReturnType<typeof listStudentsWithCurrentEnrollment>>;

  try {
    const branches = await listAccessibleBranches(ctx);
    branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));
    selectedBranchId = filters.branchId ?? ctx.activeBranchId ?? branchOptions[0]?.id;
    [classSectionOptions, students] = await Promise.all([
      listStudentClassSectionOptions(ctx, { branchId: selectedBranchId }),
      listStudentsWithCurrentEnrollment(ctx, {
        branchId: selectedBranchId,
        classSectionId: filters.classSectionId,
        search: filters.search,
        status: filters.status
      })
    ]);
  } catch {
    return (
      <div className="space-y-6">
        <PageHeader title={config.title} description={config.description} />
        <ErrorState title="Unable to load students" description="Unable to load students. Please try again." />
      </div>
    );
  }

  const studentColumns = config.columns;
  const selectedClassSectionExists =
    !filters.classSectionId || classSectionOptions.some((classSection) => classSection.id === filters.classSectionId);

  return (
    <div className="space-y-6">
      <PageHeader title={config.title} description={config.description} />
      <div className="flex flex-col justify-end gap-2 sm:flex-row">
          <Link href="/academia/students/bulk" className="premium-secondary-button w-full sm:w-auto">
            Import / Export
          </Link>
        {canCreateStudents ? (
          <Link href="/academia/students/create" className="premium-primary-button w-full sm:w-auto">
            Register Student
          </Link>
        ) : null}
      </div>
      <StudentsFilterBar
        branchOptions={branchOptions}
        classSectionOptions={classSectionOptions}
        filters={filters}
        selectedBranchId={selectedBranchId}
      />
      {students.length ? (
        <TableShell columns={studentColumns}>
          {students.map((student) => (
            <tr key={student.id}>
              <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{student.admissionNumber}</td>
              <td className="whitespace-nowrap px-4 py-3">{student.displayName}</td>
              <td className="whitespace-nowrap px-4 py-3">{student.currentClassSection}</td>
              <td className="whitespace-nowrap px-4 py-3">{student.guardianContact ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3">{student.category ?? "-"}</td>
              <td className="whitespace-nowrap px-4 py-3"><ProfileReadinessPill value={student.profileStatus} /></td>
              <td className="whitespace-nowrap px-4 py-3"><StatusPill value={student.status} /></td>
              <td className="whitespace-nowrap px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <TableActionLink
                    href={`/academia/students/${student.id}`}
                    ariaLabel={`View student ${student.displayName ?? student.admissionNumber}`}
                  >
                    View
                  </TableActionLink>
                  {canUpdateStudents ? (
                  <TableActionLink
                    href={`/academia/students/${student.id}/edit`}
                    ariaLabel={`Edit student ${student.displayName ?? student.admissionNumber}`}
                  >
                    Edit
                  </TableActionLink>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </TableShell>
      ) : !branchOptions.length ? (
        <PrerequisiteState
          title="No branch access"
          description="Ask an administrator to assign branch access before viewing class-wise student details."
        />
      ) : !ctx.activeAcademicYearId ? (
        <PrerequisiteState
          title="No active academic year"
          description="Set an active academic year before viewing class-wise student details."
        />
      ) : !classSectionOptions.length ? (
        <PrerequisiteState
          title="No class sections available"
          description="Create class sections for the active academic year before viewing class-wise student details."
        />
      ) : !selectedClassSectionExists ? (
        <PrerequisiteState
          title="Selected class-section is not available"
          description="Choose an active class-section from the filter list."
        />
      ) : filters.search ? (
        <NoResultsState
          title="No students match your filters"
          description="Try a different name, admission number, status, or class-section."
        />
      ) : filters.classSectionId ? (
        <NoResultsState
          title="No students are enrolled in this class-section yet"
          description="Enroll active students in this class-section for the active academic year, then return to this page."
        />
      ) : (
        <EmptyState
          title="No active student enrollments found"
          description="Create student profiles and active enrollments before viewing class-wise student details."
        />
      )}
    </div>
  );
}
