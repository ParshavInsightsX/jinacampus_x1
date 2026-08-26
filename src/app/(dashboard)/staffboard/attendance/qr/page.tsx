import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/require-auth";
import { getEffectivePermissions } from "@/lib/rbac/require-permission";

export default async function RetiredSharedStaffQrPage() {
  const ctx = await requireAuth();
  const permissions = await getEffectivePermissions({ ctx, branchId: ctx.activeBranchId });

  if (permissions.has("staffboard.attendance.credential.manage")) {
    redirect("/staffboard/attendance/credentials");
  }
  if (permissions.has("staffboard.attendance.credential.self_view")) {
    redirect("/staffboard/attendance/card");
  }
  redirect("/staffboard/attendance");
}
