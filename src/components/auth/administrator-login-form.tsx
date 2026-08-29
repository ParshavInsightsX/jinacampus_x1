"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthFeedback, type AuthFeedbackTone } from "@/components/auth/auth-feedback";
import { PasswordInput } from "@/components/forms/password-input";
import { FormField } from "@/components/ui/form-primitives";
import { ADMINISTRATOR_LOGIN_ERROR_MESSAGE } from "@/modules/campus-core/tenant-login-policy";

const PASSWORD_FORMAT_ERROR_MESSAGE = "Remove spaces or invisible characters before or after the password, then try again.";

function hasPasswordFormattingIssue(value: string) {
  return value !== value.trim() || /[\u200B-\u200D\uFEFF\r\n]/u.test(value);
}

type AdministratorFeedback = {
  tone: AuthFeedbackTone;
  title: string;
  message: string;
};

function LoadingSpinner() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M12 3a9 9 0 1 1-8.2 5.3" opacity="0.28" />
      <path d="M12 3a9 9 0 0 1 8.2 5.3" />
    </svg>
  );
}

export function AdministratorLoginForm({
  initialStatus = null
}: {
  initialStatus?: "session-expired" | null;
}) {
  const [feedback, setFeedback] = useState<AdministratorFeedback | null>(
    initialStatus === "session-expired"
      ? { tone: "info", title: "Your session ended", message: "Sign in again to continue securely." }
      : null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const formData = new FormData(event.currentTarget);
    const submittedEmail = String(formData.get("email") ?? "");
    const submittedPassword = String(formData.get("password") ?? "");
    const normalizedEmail = submittedEmail.trim().toLowerCase();
    if (hasPasswordFormattingIssue(submittedPassword)) {
      setFeedback({ tone: "warning", title: "Check the password", message: PASSWORD_FORMAT_ERROR_MESSAGE });
      return;
    }

    setFeedback(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/administrator-login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          password: submittedPassword
        })
      });

      if (!response.ok) {
        setFeedback(response.status === 429
          ? { tone: "warning", title: "Too many sign-in attempts", message: "Please wait a few minutes before trying again." }
          : response.status >= 500
            ? { tone: "error", title: "Portal temporarily unavailable", message: "JinaCampus could not complete the request. Please try again shortly." }
            : { tone: "error", title: "Sign-in details not accepted", message: ADMINISTRATOR_LOGIN_ERROR_MESSAGE });
        setIsSubmitting(false);
        return;
      }

      const result = await response.json().catch(() => ({}));
      const redirectTo =
        typeof result.redirectTo === "string" && result.redirectTo.startsWith("/") && !result.redirectTo.startsWith("//")
          ? result.redirectTo
          : "/administrator";
      setFeedback({ tone: "success", title: "Sign in successful", message: "Opening Platform Administration..." });
      window.location.assign(redirectTo);
    } catch {
      setFeedback({ tone: "error", title: "Unable to reach JinaCampus", message: "Check your internet connection, then try again." });
      setIsSubmitting(false);
    }
  }

  return (
    <form
      method="post"
      onSubmit={onSubmit}
      className="auth-form-panel auth-panel-padding min-w-0"
      aria-busy={isSubmitting}
      data-auth-pending={isSubmitting ? "true" : "false"}
    >
      <div className="auth-form-header">
        <span className="auth-portal-badge border-amber-200 bg-amber-50 text-amber-800">
          Platform Portal
        </span>
        <h1 className="auth-form-title">JinaCampus Administrator</h1>
        <p className="auth-form-description">For authorised platform operators. Institution accounts use School Login.</p>
      </div>

      <div className="auth-form-stack">
        {feedback ? <AuthFeedback tone={feedback.tone} title={feedback.title}>{feedback.message}</AuthFeedback> : null}
        <FormField id="administrator-email" label="Email">
          <input
            id="administrator-email"
            className="auth-field-input w-full outline-none transition"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={emailValue}
            onChange={(event) => setEmailValue(event.target.value.toLowerCase())}
            disabled={isSubmitting}
            required
          />
        </FormField>
        <FormField id="administrator-password" label="Password">
          <PasswordInput
            id="administrator-password"
            className="auth-field-input w-full outline-none transition"
            name="password"
            autoComplete="current-password"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            value={passwordValue}
            onChange={(event) => setPasswordValue(event.target.value)}
            disabled={isSubmitting}
            required
          />
        </FormField>
        <p className="auth-password-helper text-xs leading-5">Password is case-sensitive. A and a are different.</p>
        <button type="submit" disabled={isSubmitting} className="auth-action-button auth-action-primary premium-focus" aria-live="polite">
          {isSubmitting ? <><LoadingSpinner /> Signing in...</> : "Sign in to Administrator Portal"}
        </button>
        <div className="auth-secondary-navigation flex justify-center">
          <Link href="/" className="auth-inline-link text-slate-600 hover:text-brand-700 premium-focus">
            Back to School Login
          </Link>
        </div>
      </div>
    </form>
  );
}
