import Link from "next/link";
import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-app-background text-ink">
      <header className="border-b border-campus-border bg-white/95">
        <div className="mx-auto flex min-h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="JinaCampus sign in" className="premium-focus inline-flex min-h-11 items-center">
            <BrandLogo className="w-44 sm:w-52" priority />
          </Link>
          <Link href="/" className="premium-focus inline-flex min-h-11 items-center text-sm font-semibold text-brand-700 hover:text-brand-800">
            Sign in
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-campus-border bg-white">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <LegalLinks />
          <p className="mt-3 text-center text-xs leading-5 text-slate-500">
            JinaCampus - The Complete School OS, powered by Parshwa Insights
          </p>
        </div>
      </footer>
    </div>
  );
}
