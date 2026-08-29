import type { Metadata } from "next";

import { AdministratorLoginForm } from "@/components/auth/administrator-login-form";
import { AuthShell } from "@/components/auth/auth-shell";

export const metadata: Metadata = {
  title: "Administrator Sign In",
  robots: { index: false, follow: false }
};

type AdministratorLoginSearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdministratorLoginPage({
  searchParams
}: {
  searchParams?: AdministratorLoginSearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status;

  return (
    <AuthShell variant="administrator">
      <AdministratorLoginForm initialStatus={rawStatus === "session-expired" ? "session-expired" : null} />
    </AuthShell>
  );
}
