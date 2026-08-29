type BranchAccessContextRecord = {
  tenantId: string;
  branch: {
    tenantId: string;
    status: string;
    institution: {
      status: string;
    };
  };
};

export function isUsableTenantBranchAccess(
  access: BranchAccessContextRecord,
  tenantId: string
) {
  return access.tenantId === tenantId
    && access.branch.tenantId === tenantId
    && access.branch.status === "ACTIVE"
    && access.branch.institution.status === "ACTIVE";
}
