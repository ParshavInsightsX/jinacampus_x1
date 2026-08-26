import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import type { NavbarRouteContext } from "@/config/navbar";

type NavbarPageContextProps = {
  routeContext: NavbarRouteContext;
  variant: "desktop" | "mobile";
  supporting?: ReactNode;
};

export function NavbarPageContext({ routeContext, variant, supporting }: NavbarPageContextProps) {
  const titleId = variant === "desktop" ? "desktop-navbar-page-title" : "mobile-navbar-page-title";

  return (
    <div className="flex min-w-0 items-center gap-2.5" aria-labelledby={titleId}>
      {routeContext.parentHref ? (
        <Link
          href={routeContext.parentHref}
          aria-label={`Back to ${routeContext.parentLabel ?? "previous page"}`}
          className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-ink premium-focus"
        >
          <ArrowLeft className="h-4.5 w-4.5" aria-hidden="true" />
        </Link>
      ) : null}
      <div className="min-w-0">
        {variant === "desktop" && routeContext.section ? (
          <p className="truncate text-xs font-medium text-slate-500">{routeContext.section}</p>
        ) : null}
        <p
          id={titleId}
          className={variant === "desktop" ? "truncate text-base font-semibold text-ink" : "truncate text-sm font-semibold text-ink"}
          title={routeContext.title}
        >
          {routeContext.title}
        </p>
        {variant === "mobile" && supporting ? supporting : null}
      </div>
    </div>
  );
}
