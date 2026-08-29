import type { Metadata } from "next";

import { AuthShell } from "@/components/auth/auth-shell";
import { PrincipalPasswordResetForm } from "@/components/auth/principal-password-reset-form";

export const metadata: Metadata = {
  title: "Principal Password Reset",
  robots: { index: false, follow: false }
};

export default function PrincipalPasswordResetPage() {
  return (
    <AuthShell variant="recovery">
      <PrincipalPasswordResetForm />
    </AuthShell>
  );
}
