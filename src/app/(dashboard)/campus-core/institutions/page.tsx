import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listInstitutions } from "@/modules/campus-core/queries";
import { EmptyState, PermissionState } from "@/components/ui/empty-state";
import { ResponsiveTable, StatusBadge, TableActionLink } from "@/components/ui/table-primitives";
import { MobileDataList, MobileDataRow } from "@/components/mobile/mobile-data-list";

export default async function InstitutionsPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx });
  if (!permissions.has("campuscore.institution.manage")) return <PermissionState />;

  const institutions = await listInstitutions(ctx);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">School Profile</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
          Review and update the institution profiles available through your assigned branches. New schools are provisioned only from the JinaCampus Administrator Portal.
        </p>
      </header>
      {institutions.length ? (
        <>
          <MobileDataList label="School profiles" className="motion-slide-up">
            {institutions.map((institution) => {
              const displayName = institution.displayName ?? institution.name;
              const identity = institution.logoUrl ? (
                <img src={institution.logoUrl} alt={`${displayName} logo`} className="h-11 w-11 rounded-lg border border-slate-200 object-cover" />
              ) : (
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
              );

              return (
                <MobileDataRow
                  key={institution.id}
                  title={displayName}
                  subtitle={`School code ${institution.code}`}
                  leading={identity}
                  status={<StatusBadge value={institution.status} />}
                  actions={(
                    <>
                      <TableActionLink href={`/campus-core/institutions/${institution.id}`} ariaLabel={`View ${institution.name}`}>
                        View profile
                      </TableActionLink>
                      <TableActionLink href={`/campus-core/institutions/${institution.id}/edit`} ariaLabel={`Edit ${institution.name}`}>
                        Edit profile
                      </TableActionLink>
                    </>
                  )}
                />
              );
            })}
          </MobileDataList>
          <div className="hidden md:block">
            <ResponsiveTable columns={["Institution", "Code", "Status", "Actions"]} caption="Institutions table">
              {institutions.map((institution) => {
                const displayName = institution.displayName ?? institution.name;
                return (
                  <tr key={institution.id}>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      <div className="flex items-center gap-3">
                        {institution.logoUrl ? (
                          <img src={institution.logoUrl} alt={`${displayName} logo`} className="h-8 w-8 rounded-lg border border-slate-200 object-cover" />
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700">
                            {displayName.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <span>{displayName}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{institution.code}</td>
                    <td className="whitespace-nowrap px-4 py-3"><StatusBadge value={institution.status} /></td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex gap-2">
                        <TableActionLink href={`/campus-core/institutions/${institution.id}`} ariaLabel={`View ${institution.name}`}>View</TableActionLink>
                        <TableActionLink href={`/campus-core/institutions/${institution.id}/edit`} ariaLabel={`Edit ${institution.name}`}>Edit</TableActionLink>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </ResponsiveTable>
          </div>
        </>
      ) : (
        <EmptyState title="No school profile available" description="Ask a JinaCampus administrator to provision the school and assign your branch access." />
      )}
    </div>
  );
}