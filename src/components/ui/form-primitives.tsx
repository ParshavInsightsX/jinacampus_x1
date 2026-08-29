import type { ReactNode } from "react";

type FieldErrors = Record<string, string[]>;

type FormMessageState = {
  ok: boolean;
  message?: string;
  error?: string;
};

export function getFieldError(fieldErrors: FieldErrors | undefined, name: string) {
  return fieldErrors?.[name]?.[0];
}

export function RequiredMark() {
  return (
    <span className="ml-2 rounded-full border border-brand-100 bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
      Required
    </span>
  );
}

export function FieldErrorMessage({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;

  return (
    <p id={id} className="mt-1 text-xs font-medium leading-5 text-red-600">
      {message}
    </p>
  );
}

export function FieldHelp({ id, children }: { id?: string; children?: ReactNode }) {
  if (!children) return null;

  return (
    <p id={id} className="mt-1 text-xs leading-5 text-slate-500">
      {children}
    </p>
  );
}

export function FormField({
  id,
  label,
  required,
  helpText,
  error,
  className,
  children
}: {
  id: string;
  label: string;
  required?: boolean;
  helpText?: ReactNode;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required ? <RequiredMark /> : null}
      </label>
      <div className="mt-2">{children}</div>
      <FieldHelp id={`${id}-help`}>{helpText}</FieldHelp>
      <FieldErrorMessage id={`${id}-error`} message={error} />
    </div>
  );
}

export function FormMessage({ state }: { state: FormMessageState }) {
  if (state.ok) {
    return (
      <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 shadow-sm">
        {state.message}
      </p>
    );
  }

  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 shadow-sm">
        {state.error}
      </p>
    );
  }

  return null;
}
