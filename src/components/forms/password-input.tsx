"use client";

import { useState, type InputHTMLAttributes } from "react";

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export function passwordInputType(isVisible: boolean) {
  return isVisible ? "text" : "password";
}

export function passwordToggleLabel(isVisible: boolean) {
  return isVisible ? "Hide password" : "Show password";
}

export function PasswordInput({ className = "", disabled, ...props }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);
  const label = passwordToggleLabel(isVisible);

  return (
    <div className="relative min-w-0 max-w-full">
      <input
        {...props}
        disabled={disabled}
        type={passwordInputType(isVisible)}
        className={`${className} pr-14`}
      />
      <button
        type="button"
        aria-label={label}
        aria-pressed={isVisible}
        title={label}
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        className="auth-password-toggle absolute right-0.5 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center border border-transparent bg-transparent text-slate-600 transition hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-60 premium-focus"
      >
        {isVisible ? (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l18 18" />
            <path d="M10.7 5.2A9.8 9.8 0 0 1 12 5c5.2 0 8.5 4.5 9.5 6.2a1.6 1.6 0 0 1 0 1.6 17 17 0 0 1-3.1 3.8" />
            <path d="M6.2 6.8a17.2 17.2 0 0 0-3.7 4.4 1.6 1.6 0 0 0 0 1.6C3.5 14.5 6.8 19 12 19c1.8 0 3.3-.5 4.6-1.2" />
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 11.2a1.6 1.6 0 0 0 0 1.6C3.5 14.5 6.8 19 12 19s8.5-4.5 9.5-6.2a1.6 1.6 0 0 0 0-1.6C20.5 9.5 17.2 5 12 5S3.5 9.5 2.5 11.2Z" />
            <circle cx="12" cy="12" r="3.2" />
          </svg>
        )}
        <span className="sr-only">{label}</span>
      </button>
    </div>
  );
}
