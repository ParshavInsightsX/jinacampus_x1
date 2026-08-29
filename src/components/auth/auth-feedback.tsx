import type { ReactNode } from "react";

export type AuthFeedbackTone = "error" | "info" | "success" | "warning";

const toneClasses: Record<AuthFeedbackTone, string> = {
  error: "border-red-200 bg-red-50/95 text-red-800",
  info: "border-blue-200 bg-blue-50/95 text-blue-900",
  success: "border-emerald-200 bg-emerald-50/95 text-emerald-800",
  warning: "border-amber-200 bg-amber-50/95 text-amber-900"
};

function FeedbackIcon({ tone }: { tone: AuthFeedbackTone }) {
  if (tone === "success") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12 2.5 2.5L16.5 9" />
      </svg>
    );
  }

  if (tone === "error") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v6" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7h.01" />
    </svg>
  );
}

export function AuthFeedback({
  tone,
  title,
  children,
  className = ""
}: {
  tone: AuthFeedbackTone;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={`auth-feedback flex gap-3 rounded-lg border px-3.5 py-3 shadow-sm ${toneClasses[tone]} ${className}`}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true"><FeedbackIcon tone={tone} /></span>
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-5">{title}</p>
        {children ? <div className="mt-0.5 text-xs font-medium leading-5 opacity-90">{children}</div> : null}
      </div>
    </section>
  );
}
