import Link from "next/link";
import type { ReactNode } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

type ResponsiveTableProps = {
  columns: readonly string[];
  children: ReactNode;
  caption?: string;
  minWidthClass?: string;
};

type TableToolbarProps = {
  id?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  action?: ReactNode;
};

const statusToneClassNames: Record<StatusTone, string> = {
  neutral: "border-campus-border bg-white text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700"
};

const statusDotClassNames: Record<StatusTone, string> = {
  neutral: "bg-slate-400",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  info: "bg-blue-500"
};

function statusTone(value?: string | null): StatusTone {
  if (!value) return "neutral";
  if (["ACTIVE", "PRESENT", "MARKED"].includes(value)) return "success";
  if (["ABSENT", "WITHDRAWN", "TERMINATED"].includes(value)) return "danger";
  if (["LATE", "HALF_DAY", "PARTIALLY_MARKED", "TRANSFERRED", "RESIGNED", "NOT_MARKED"].includes(value)) return "warning";
  if (["ON_LEAVE", "EXCUSED", "WEEK_OFF", "HOLIDAY"].includes(value)) return "info";
  return "neutral";
}

export function formatEnumLabel(value?: string | null) {
  if (!value) return "Not set";
  return value
    .toLowerCase()
    .split("_")
    .map((part) => {
      if (part === "qr") return "QR";
      if (part === "id") return "ID";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

export function StatusBadge({ value, label }: { value?: string | null; label?: string }) {
  const tone = statusTone(value);

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold ${statusToneClassNames[tone]}`}>
      <span className={`mr-1.5 mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${statusDotClassNames[tone]}`} aria-hidden="true" />
      {label ?? formatEnumLabel(value)}
    </span>
  );
}

export function TableToolbar({ id, title, description, children, action }: TableToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 id={id} className="text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
        {children ? <div className="mt-2">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ResponsiveTable({
  columns,
  children,
  caption,
  minWidthClass = "min-w-[760px]"
}: ResponsiveTableProps) {
  return (
    <div className="premium-card motion-slide-up min-w-0 overflow-hidden">

      <div className="max-w-full overflow-x-auto overscroll-x-contain" data-mobile-table-shell="true" data-responsive-table="true" tabIndex={0}>
        <table className={`w-full ${minWidthClass} text-left text-sm`}>
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <thead className="bg-surface-muted text-xs uppercase text-slate-600">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="whitespace-nowrap px-4 py-3 font-semibold">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-700 [&_tr]:align-top [&_tr]:transition [&_tr:hover]:bg-brand-50">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function TableActionLink({
  href,
  children,
  ariaLabel
}: {
  href: string;
  children: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="motion-soft-hover inline-flex min-h-11 items-center justify-center rounded-lg border border-brand-100 bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 shadow-sm transition hover:border-brand-200 hover:bg-brand-100 premium-focus"
    >
      {children}
    </Link>
  );
}

export function PaginationSummary({
  page,
  pageSize,
  totalRows,
  itemLabel = "rows"
}: {
  page: number;
  pageSize: number;
  totalRows: number;
  itemLabel?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const firstRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastRow = totalRows === 0 ? 0 : Math.min(firstRow + pageSize - 1, totalRows);

  return (
    <p className="text-sm text-slate-500">
      Showing {firstRow}-{lastRow} of {totalRows} {itemLabel}. Page {page} of {totalPages}.
    </p>
  );
}

export function PaginationControls({
  page,
  pageSize,
  totalRows,
  itemLabel = "rows",
  hrefForPage
}: {
  page: number;
  pageSize: number;
  totalRows: number;
  itemLabel?: string;
  hrefForPage: (page: number) => string;
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  const buttonClassName = "inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-4 py-2 text-sm font-semibold sm:w-auto";
  const enabledClassName = "border-slate-200 bg-white/90 text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-700 premium-focus";
  const disabledClassName = "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400";

  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <PaginationSummary page={page} pageSize={pageSize} totalRows={totalRows} itemLabel={itemLabel} />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {hasPrevious ? (
          <Link href={hrefForPage(page - 1)} className={`${buttonClassName} ${enabledClassName}`}>
            Previous
          </Link>
        ) : (
          <span aria-disabled="true" className={`${buttonClassName} ${disabledClassName}`}>
            Previous
          </span>
        )}
        {hasNext ? (
          <Link href={hrefForPage(page + 1)} className={`${buttonClassName} ${enabledClassName}`}>
            Next
          </Link>
        ) : (
          <span aria-disabled="true" className={`${buttonClassName} ${disabledClassName}`}>
            Next
          </span>
        )}
      </div>
    </nav>
  );
}
