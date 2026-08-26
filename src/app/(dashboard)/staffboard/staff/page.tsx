import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listAccessibleBranches } from "@/modules/campus-core/queries";
import { listStaffProfiles } from "@/modules/staffboard-lite/queries";
import {
  formatDateTime,
  formatEnumLabel,
  PageHeader,
  resolveSearchParam,
  SearchToolbar,
  StatusPill,
  TableActionLink,
  TableShell,
  type RouteSearchParams
} from "@/modules/staffboard-lite/components/staffboard-page-shell";
import { staffProfileListConfig } from "@/modules/staffboard-lite/ui-config";
import { formatStaffName } from "@/modules/staffboard-lite/components/staff-profile-table";
import { StaffProfileCreateForm } from "@/modules/staffboard-lite/components/staff-profile-create-form";
import { EmptyState, NoResultsState, PermissionState, PrerequisiteState } from "@/components/ui/empty-state";
import { MobileDataList, MobileDataRow } from "@/components/mobile/mobile-data-list";

function staffInitials(value: string) {
  const initials = value.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("").toUpperCase();
  return initials || "ST";
}

export default async function StaffProfilesPage({ searchParams }: { searchParams?: RouteSearchParams }) {
  const ctx = await requireAuth();
  const search = await resolveSearchParam(searchParams);
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!permissions.has("staffboard.staff.view")) return <PermissionState />;
  const canCreateStaff = permissions.has("staffboard.staff.create");
  const canUpdateStaff = permissions.has("staffboard.staff.update");
  const [staffProfiles, branches] = await Promise.all([
    listStaffProfiles(ctx, { search }),
    canCreateStaff ? listAccessibleBranches(ctx) : Promise.resolve([])
  ]);
  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));
  const defaultBranchId = ctx.activeBranchId ?? branchOptions[0]?.id;
  const staffColumns = canUpdateStaff ? staffProfileListConfig.columns : staffProfileListConfig.columns.filter((column) => column !== "Actions");

  return (
    <div className="space-y-6">
      <PageHeader title={staffProfileListConfig.title} description={staffProfileListConfig.description} />
      {canCreateStaff ? <StaffProfileCreateForm branchOptions={branchOptions} defaultBranchId={defaultBranchId} /> : null}
      <SearchToolbar title={staffProfileListConfig.title} placeholder={staffProfileListConfig.searchPlaceholder} defaultValue={search} />
      {staffProfiles.length ? (
        <>
          <MobileDataList label="Staff profiles" className="motion-slide-up">
            {staffProfiles.map((staff) => {
              const staffName = formatStaffName(staff);
              const appAccess = staff.user?.status === "ACTIVE" ? "Enabled" : staff.user ? "Disabled" : "No app access";
              return (
                <MobileDataRow
                  key={staff.id}
                  title={staffName}
                  subtitle={`${staff.employeeCode} · ${formatEnumLabel(staff.staffType)}`}
                  leading={(
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                      {staffInitials(staffName)}
                    </span>
                  )}
                  status={<StatusPill value={staff.employmentStatus} />}
                  details={[
                    { label: "Designation", value: staff.designation ?? "Not added" },
                    { label: "Department", value: staff.department ?? "Not added" },
                    { label: "Branch", value: staff.branch?.name ?? "Not assigned" },
                    { label: "App access", value: appAccess },
                    { label: "Updated", value: formatDateTime(staff.updatedAt) }
                  ]}
                  actions={canUpdateStaff ? (
                    <TableActionLink href={`/staffboard/staff/${staff.id}/edit`} ariaLabel={`Edit staff profile ${staffName}`}>
                      Edit staff profile
                    </TableActionLink>
                  ) : null}
                />
              );
            })}
          </MobileDataList>
          <div className="hidden md:block">
            <TableShell columns={staffColumns}>
              {staffProfiles.map((staff) => (
                <tr key={staff.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{staff.employeeCode}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatStaffName(staff)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatEnumLabel(staff.staffType)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{staff.designation ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{staff.department ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3">{staff.branch?.name ?? "-"}</td>
                  <td className="whitespace-nowrap px-4 py-3"><StatusPill value={staff.employmentStatus} /></td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {staff.user?.status === "ACTIVE" ? (
                      <span className="premium-muted-chip border-emerald-200 bg-emerald-50 text-emerald-700">Enabled</span>
                    ) : staff.user ? (
                      <span className="premium-muted-chip border-amber-200 bg-amber-50 text-amber-700">Disabled</span>
                    ) : (
                      <span className="premium-muted-chip">No app access</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">{formatDateTime(staff.updatedAt)}</td>
                  {canUpdateStaff ? (
                    <td className="whitespace-nowrap px-4 py-3">
                      <TableActionLink href={`/staffboard/staff/${staff.id}/edit`} ariaLabel={`Edit staff profile ${formatStaffName(staff)}`}>
                        Edit
                      </TableActionLink>
                    </td>
                  ) : null}
                </tr>
              ))}
            </TableShell>
          </div>
        </>
      ) : search ? (
        <NoResultsState title="No staff profiles match your search" description="Try a different name, employee code, department, phone, or email, or clear the search to see all staff profiles." />
      ) : !branchOptions.length ? (
        <PrerequisiteState title="No branch access" description="Ask an administrator to assign branch access before adding or viewing staff profiles." />
      ) : (
        <EmptyState
          title={staffProfileListConfig.emptyTitle}
          description={canCreateStaff ? "Use the form above to create the first staff profile for an accessible branch." : "No staff profiles are available in your accessible branch scope."}
        />
      )}
    </div>
  );
}
