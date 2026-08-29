import type { ReactNode } from "react";

type MobileEmptyStateProps = {
  title: string;
  description?: string;
  action?: ReactNode;
};

export function MobileEmptyState({ title, description, action }: MobileEmptyStateProps) {
  return (
    <div
      className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center shadow-sm shadow-slate-950/5"
      data-mobile-empty-state="true"
    >
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
