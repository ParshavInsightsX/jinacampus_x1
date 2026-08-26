import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";
import { listPermissions, listRoles } from "@/modules/campus-core/queries";
import { createRoleAction } from "@/modules/campus-core/actions";
import { EmptyState, PermissionState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-primitives";
import { ResponsiveTable, formatEnumLabel } from "@/components/ui/table-primitives";
import { MobileDataList, MobileDataRow } from "@/components/mobile/mobile-data-list";

export default async function RolesPage() {
  const ctx = await requireAuth();
  const effectivePermissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });
  if (!effectivePermissions.has("campuscore.role.view")) return <PermissionState />;
  const canCreateRoles = effectivePermissions.has("campuscore.role.manage");
  const [roles, permissions] = await Promise.all([
    listRoles(ctx),
    canCreateRoles ? listPermissions(ctx) : Promise.resolve([])
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-slate-950">Roles &amp; Permissions</h1>
        <p className="mt-1 text-sm leading-6 text-slate-500">Manage tenant-scoped roles and the work each role is allowed to perform.</p>
      </header>
      {canCreateRoles ? (
        <form action={createRoleAction} className="premium-card grid gap-4 p-4 md:grid-cols-2 md:p-5 xl:grid-cols-5">
          <FormField id="role-code" label="Role code" required helpText="Use uppercase letters and underscores.">
            <input id="role-code" name="code" placeholder="ACADEMIC_COORDINATOR" required autoCapitalize="characters" className="min-h-11 w-full" />
          </FormField>
          <FormField id="role-name" label="Role name" required>
            <input id="role-name" name="name" placeholder="Academic Coordinator" required className="min-h-11 w-full" />
          </FormField>
          <FormField id="role-scope" label="Access scope" required>
            <select id="role-scope" name="scope" className="min-h-11 w-full">
              <option value="TENANT">Whole school</option>
              <option value="BRANCH">Assigned branch</option>
            </select>
          </FormField>
          <FormField id="role-permissions" label="Permissions" required helpText="Select one or more permissions.">
            <select id="role-permissions" name="permissionCodes" multiple className="min-h-36 w-full">
              {permissions.map((permission) => <option key={permission.id} value={permission.code}>{permission.code}</option>)}
            </select>
          </FormField>
          <div className="flex items-end">
            <button type="submit" className="premium-primary-button w-full">Create role</button>
          </div>
        </form>
      ) : null}
      {roles.length ? (
        <>
          <MobileDataList label="Roles" className="motion-slide-up">
            {roles.map((role) => (
              <MobileDataRow
                key={role.id}
                title={role.name}
                subtitle={role.code}
                details={[
                  { label: "Access scope", value: formatEnumLabel(role.scope) },
                  { label: "Permissions", value: `${role.rolePermissions.length} assigned` }
                ]}
              />
            ))}
          </MobileDataList>
          <div className="hidden md:block">
            <ResponsiveTable columns={["Role Code", "Name", "Scope", "Permissions"]} caption="Roles table">
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{role.code}</td>
                  <td className="whitespace-nowrap px-4 py-3">{role.name}</td>
                  <td className="whitespace-nowrap px-4 py-3">{formatEnumLabel(role.scope)}</td>
                  <td className="whitespace-nowrap px-4 py-3">{role.rolePermissions.length}</td>
                </tr>
              ))}
            </ResponsiveTable>
          </div>
        </>
      ) : (
        <EmptyState title="No roles found" description="Seed or create a tenant-scoped role." />
      )}
    </div>
  );
}