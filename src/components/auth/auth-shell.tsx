import Image from "next/image";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { JINACAMPUS_BRAND } from "@/config/brand";

export type AuthShellVariant = "school" | "attendance" | "administrator" | "recovery";

const AUTH_SHELL_COPY: Record<AuthShellVariant, {
  eyebrow: string;
  title: string;
  description: string;
}> = {
  school: {
    eyebrow: "School operations",
    title: "A clearer start to every school day.",
    description: "Secure access to attendance, academics, and staff operations."
  },
  attendance: {
    eyebrow: "Attendance access",
    title: "Sign in. Scan. Keep the day moving.",
    description: "Passkey-first access for fast, verified staff attendance."
  },
  administrator: {
    eyebrow: "Administrator portal",
    title: "Platform control, with school boundaries intact.",
    description: "Secure tenant lifecycle and platform governance for authorized operators."
  },
  recovery: {
    eyebrow: "Account recovery",
    title: "Return to your school workspace safely.",
    description: "Private, school-scoped recovery without exposing account details."
  }
};

export function AuthShell({
  children,
  variant = "school"
}: {
  children: ReactNode;
  variant?: AuthShellVariant;
}) {
  const copy = AUTH_SHELL_COPY[variant];

  return (
    <main
      className="auth-shell-root relative min-h-dvh bg-[#06112d] text-white"
      data-auth-shell="true"
      data-auth-variant={variant}
    >
      <Image
        src={JINACAMPUS_BRAND.assets.authBackground}
        alt=""
        aria-hidden="true"
        fill
        priority
        quality={88}
        sizes="100vw"
        className="auth-background-media object-cover object-[38%_center] lg:object-center"
      />
      <div className="auth-shell-overlay absolute inset-0" aria-hidden="true" />
      <div className="auth-light-sweep absolute inset-0" aria-hidden="true" />

      <div className="auth-shell-layout relative mx-auto w-full max-w-[100rem]">
        <section className="auth-shell-hero auth-hero-enter min-w-0" aria-label="JinaCampus">
          <div className="auth-brand-glass">
            <BrandLogo
              variant="primary"
              className="auth-shell-brand"
              priority
            />
          </div>

          <div className="auth-shell-story max-w-2xl" data-auth-story="true">
            <p className="inline-flex min-h-9 items-center rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-xl">
              {copy.eyebrow}
            </p>
            <h2 className="mt-5 max-w-xl text-4xl font-semibold leading-tight text-white xl:text-5xl">
              {copy.title}
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-blue-100 lg:text-lg">
              {copy.description}
            </p>
            <p className="mt-6 text-sm font-medium text-blue-100/90">
              Secure access. School-scoped context. Permission-aware workflows.
            </p>
          </div>
        </section>

        <div className="auth-shell-form-column auth-panel-enter min-w-0">
          <div className="auth-panel-stage">{children}</div>
          <LegalLinks tone="dark" compact className="auth-shell-legal" />
        </div>
      </div>
    </main>
  );
}
