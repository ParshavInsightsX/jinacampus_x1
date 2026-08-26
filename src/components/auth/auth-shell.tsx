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
      className="relative min-h-dvh overflow-x-hidden bg-[#06112d] text-white"
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
      <div className="absolute inset-0 bg-[#06112d]/70" aria-hidden="true" />

      <div className="relative mx-auto grid min-h-dvh w-full max-w-[100rem] grid-cols-1 gap-6 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_minmax(30rem,0.78fr)] lg:items-center lg:gap-12 lg:px-10 lg:py-10 xl:gap-20 xl:px-16">
        <section className="auth-hero-enter flex min-w-0 flex-col justify-end pt-4 lg:min-h-[38rem] lg:justify-between lg:py-8" aria-label="JinaCampus">
          <BrandLogo
            variant="inverse"
            className="w-[15rem] sm:w-[19rem] lg:w-[26rem]"
            priority
          />

          <div className="mt-10 hidden max-w-2xl sm:block lg:mt-auto">
            <p className="inline-flex min-h-9 items-center rounded-full border border-white/20 bg-white/10 px-4 text-xs font-semibold text-white backdrop-blur-xl">
              {copy.eyebrow}
            </p>
            <h1 className="mt-5 max-w-xl text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
              {copy.title}
            </h1>
            <p className="mt-4 max-w-xl text-base leading-7 text-blue-100 lg:text-lg">
              {copy.description}
            </p>
          </div>

          <p className="mt-5 hidden text-sm font-medium text-blue-100/90 lg:block">
            Secure access. School-scoped context. Permission-aware workflows.
          </p>
        </section>

        <div className="auth-panel-enter flex min-w-0 flex-col items-center justify-center lg:justify-end">
          {children}
          <LegalLinks tone="dark" className="mt-4" />
        </div>
      </div>
    </main>
  );
}
