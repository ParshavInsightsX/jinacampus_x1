"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SchoolCastSubnav({ items }: { items: readonly { title: string; href: string }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="SchoolCast sections" className="overflow-x-auto border-b border-slate-200/80 pb-3">
      <div className="flex min-w-max gap-2">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/schoolcast" && pathname.startsWith(`${item.href}/`));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={active
                ? "inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-semibold text-white shadow-sm"
                : "inline-flex min-h-11 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand/30 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"}
            >
              {item.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}