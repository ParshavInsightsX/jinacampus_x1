import { cache } from "react";
import { redirect } from "next/navigation";
import {
  getTenantContext,
  isPasswordChangeRequiredError
} from "@/lib/tenant/context";

const getRequiredTenantContext = cache(() => getTenantContext());
const getPasswordChangeTenantContext = cache(() =>
  getTenantContext({ allowPasswordChangeRequired: true })
);

export async function requireAuth() {
  try {
    return await getRequiredTenantContext();
  } catch (error) {
    if (isPasswordChangeRequiredError(error)) {
      redirect("/account/change-password?required=1");
    }
    redirect("/");
  }
}

export async function requireAuthForPasswordChange() {
  try {
    return await getPasswordChangeTenantContext();
  } catch {
    redirect("/");
  }
}
