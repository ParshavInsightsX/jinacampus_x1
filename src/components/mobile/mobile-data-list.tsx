import type { ReactNode } from "react";

type MobileDataDetail = {
  label: string;
  value: ReactNode;
};

type MobileDataListProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

type MobileDataRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  status?: ReactNode;
  details?: readonly MobileDataDetail[];
  actions?: ReactNode;
};

export function MobileDataList({ label, children, className }: MobileDataListProps) {
  return (
    <div
      role="list"
      aria-label={label}
      className={`grid gap-3 md:hidden ${className ?? ""}`}
      data-mobile-data-list="true"
    >
      {children}
    </div>
  );
}

export function MobileDataRow({
  title,
  subtitle,
  leading,
  status,
  details = [],
  actions
}: MobileDataRowProps) {
  return (
    <article role="listitem" className="mobile-content-surface min-w-0 p-4" data-mobile-data-row="true">
      <div className="flex min-w-0 items-start gap-3">
        {leading ? <div className="shrink-0">{leading}</div> : null}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold leading-5 text-ink">{title}</h2>
          {subtitle ? <p className="mt-1 break-words text-xs leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
        {status ? <div className="shrink-0">{status}</div> : null}
      </div>

      {details.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-campus-border pt-3">
          {details.map((detail) => (
            <div key={detail.label} className="min-w-0">
              <dt className="text-[11px] font-medium text-slate-500">{detail.label}</dt>
              <dd className="mt-0.5 break-words text-xs font-semibold leading-5 text-slate-800">{detail.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {actions ? <div className="mt-4 grid grid-cols-2 gap-2 border-t border-campus-border pt-3 [&>:only-child]:col-span-2">{actions}</div> : null}
    </article>
  );
}
