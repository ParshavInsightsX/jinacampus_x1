"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/server";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AuthFeedback, type AuthFeedbackTone } from "@/components/auth/auth-feedback";
import { PasswordInput } from "@/components/forms/password-input";
import { FormField } from "@/components/ui/form-primitives";

type LoginFormProps = {
  schoolId: string | null;
  schoolIdLocked: boolean;
  schoolName: string | null;
  logoUrl: string | null;
  intent?: "standard" | "attendance";
  successRedirect?: string;
  initialStatus?: "session-expired" | null;
};

type PendingAction = "passkey" | "password" | "redirect" | null;
type SignInMethod = "passkey" | "password";
type FeedbackState = {
  tone: AuthFeedbackTone;
  title: string;
  message: string;
};

const LOGIN_ERROR_MESSAGE = "Login failed. Please check your credentials.";
const PASSKEY_ERROR_MESSAGE = "Passkey sign-in failed. Use your employee code and password.";

function normalizeSchoolCodeInput(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+/g, "");
}

function normalizeSchoolCodeForSubmit(value: string) {
  return normalizeSchoolCodeInput(value.trim()).replace(/-+$/g, "");
}

function normalizeIdentifier(value: string) {
  const trimmed = value.trim();
  return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed.toUpperCase();
}

function safeRedirect(value: unknown) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/dashboard";
}

function resolvedLoginRedirect(serverRedirect: unknown, successRedirect?: string) {
  const redirectTo = safeRedirect(serverRedirect);
  if (
    redirectTo.startsWith("/account/change-password") ||
    redirectTo.startsWith("/administrator")
  ) {
    return redirectTo;
  }
  return successRedirect ? safeRedirect(successRedirect) : redirectTo;
}

function passwordFailure(status: number): FeedbackState {
  if (status === 429) {
    return {
      tone: "warning",
      title: "Too many sign-in attempts",
      message: "Please wait a few minutes before trying again."
    };
  }
  if (status >= 500) {
    return {
      tone: "error",
      title: "Sign in is temporarily unavailable",
      message: "JinaCampus could not complete the request. Please try again shortly."
    };
  }
  return {
    tone: "error",
    title: "Sign-in details not accepted",
    message: `${LOGIN_ERROR_MESSAGE} If your account is inactive, contact your school administrator.`
  };
}

function LoadingSpinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5 animate-spin"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M12 3a9 9 0 1 1-8.2 5.3" opacity="0.28" />
      <path d="M12 3a9 9 0 0 1 8.2 5.3" />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="8.5" cy="8.5" r="4.5" />
      <path d="m12 12 8 8m-3-3 2-2m-5-1 2-2" />
    </svg>
  );
}

function PasswordIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function LoginForm({
  schoolId,
  schoolIdLocked,
  schoolName,
  logoUrl,
  intent = "standard",
  successRedirect,
  initialStatus = null
}: LoginFormProps) {
  const attendanceIntent = intent === "attendance";
  const [method, setMethod] = useState<SignInMethod>(attendanceIntent ? "passkey" : "password");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(
    initialStatus === "session-expired"
      ? {
          tone: "info",
          title: "Your session ended",
          message: "Sign in again to continue securely."
        }
      : null
  );
  const [schoolIdValue, setSchoolIdValue] = useState(schoolId ?? "");
  const [identifier, setIdentifier] = useState("");
  const isPending = pendingAction !== null;
  const displayName = schoolName ?? "Your school";
  const recoveryHref = schoolId ? `/forgot-password?schoolId=${encodeURIComponent(schoolId)}` : "/forgot-password";
  const attendanceLoginHref = schoolId
    ? `/attendance-login?schoolId=${encodeURIComponent(schoolId)}`
    : "/attendance-login";
  const standardLoginHref = schoolId ? `/?schoolId=${encodeURIComponent(schoolId)}` : "/";

  function normalizedSchoolId() {
    const normalized = normalizeSchoolCodeForSubmit(schoolIdValue);
    if (!schoolIdLocked) setSchoolIdValue(normalized);
    return normalized;
  }

  function normalizedIdentity() {
    const normalized = normalizeIdentifier(identifier);
    setIdentifier(normalized);
    return normalized;
  }

  function changeMethod(nextMethod: SignInMethod) {
    if (isPending) return;
    setMethod(nextMethod);
    setFeedback(null);
  }

  async function onPasswordSubmit(form: HTMLFormElement) {
    setPendingAction("password");
    setFeedback(null);
    const formData = new FormData(form);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantSlug: normalizedSchoolId(),
          identifier: normalizedIdentity(),
          password: formData.get("password")
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFeedback(passwordFailure(response.status));
        setPendingAction(null);
        return;
      }
      setPendingAction("redirect");
      setFeedback({
        tone: "success",
        title: "Sign in successful",
        message: "Opening your authorised workspace..."
      });
      window.location.assign(resolvedLoginRedirect(result.redirectTo, successRedirect));
    } catch {
      setFeedback({
        tone: "error",
        title: "Unable to reach JinaCampus",
        message: "Check your internet connection, then try again."
      });
      setPendingAction(null);
    }
  }

  async function onPasskeySignIn() {
    if (isPending) return;
    const tenantSlug = normalizedSchoolId();
    const normalizedIdentifier = normalizedIdentity();
    if (!tenantSlug || !normalizedIdentifier) {
      setFeedback({
        tone: "warning",
        title: "Account details required",
        message: "Enter your School ID and employee code or email."
      });
      return;
    }
    if (!window.PublicKeyCredential || !navigator.credentials) {
      setFeedback({
        tone: "warning",
        title: "Passkey not available",
        message: "This browser cannot use passkeys. Choose Password to continue."
      });
      return;
    }

    setPendingAction("passkey");
    setFeedback(null);
    try {
      const optionsResponse = await fetch("/api/auth/passkey/authentication/options", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantSlug, identifier: normalizedIdentifier })
      });
      const optionsResult = await optionsResponse.json().catch(() => ({}));
      if (!optionsResponse.ok || !optionsResult.options) throw new Error("PASSKEY_OPTIONS_FAILED");

      const options = optionsResult.options as PublicKeyCredentialRequestOptionsJSON;
      const credential = await startAuthentication({ optionsJSON: options });
      const verifyResponse = await fetch("/api/auth/passkey/authentication/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tenantSlug,
          challenge: options.challenge,
          response: credential
        })
      });
      const verifyResult = await verifyResponse.json().catch(() => ({}));
      if (!verifyResponse.ok) throw new Error("PASSKEY_VERIFY_FAILED");
      setPendingAction("redirect");
      setFeedback({
        tone: "success",
        title: "Passkey verified",
        message: "Opening your authorised workspace..."
      });
      window.location.assign(resolvedLoginRedirect(verifyResult.redirectTo, successRedirect));
    } catch {
      setFeedback({
        tone: "error",
        title: "Passkey sign-in did not complete",
        message: PASSKEY_ERROR_MESSAGE
      });
      setPendingAction(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return;
    if (method === "passkey") {
      await onPasskeySignIn();
      return;
    }
    await onPasswordSubmit(event.currentTarget);
  }

  const showSchoolContext = Boolean(schoolIdLocked || logoUrl || schoolName);

  return (
    <section
      className="auth-form-panel auth-panel-padding"
      data-mobile-login-form="true"
      data-auth-pending={isPending ? "true" : "false"}
      data-sign-in-method={method}
      aria-busy={isPending}
    >
      <div className="auth-form-header text-left">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-700">Secure school access</p>
          {attendanceIntent ? (
            <p className="auth-portal-badge border-teal-200 bg-teal-50 text-teal-800">
              Attendance
            </p>
          ) : null}
        </div>
        <h1 className="auth-form-title">Welcome back</h1>
        <p className="auth-form-description">Use the account details provided by your institution.</p>

        {showSchoolContext ? (
          <div className="auth-context-row mt-3 flex min-h-12 items-center gap-3 px-3 py-2">
            {logoUrl ? <img src={logoUrl} alt={`${displayName} logo`} className="h-10 w-10 shrink-0 rounded-lg border border-white object-cover shadow-sm" /> : null}
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-slate-500">School workspace</p>
              <p className="truncate text-sm font-semibold text-ink">{displayName}</p>
            </div>
            {schoolId ? <span className="ml-auto shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-brand-700">{schoolId}</span> : null}
          </div>
        ) : null}
      </div>

      <form method="post" onSubmit={onSubmit} className="auth-form-stack" aria-label="JinaCampus sign in">
        <fieldset>
          <legend className="sr-only">Choose sign-in method</legend>
          <div className="auth-method-switch grid grid-cols-2 gap-1 p-1">
            {([
              ["password", "Password", <PasswordIcon key="password-icon" />],
              ["passkey", "Passkey", <PasskeyIcon key="passkey-icon" />]
            ] as const).map(([value, label, icon]) => (
              <label key={value} className="cursor-pointer">
                <input
                  type="radio"
                  name="signInMethod"
                  value={value}
                  checked={method === value}
                  onChange={() => changeMethod(value)}
                  className="sr-only"
                  disabled={isPending}
                />
                <span className={`auth-method-option ${method === value ? "auth-method-option-active" : ""}`}>
                  {icon}
                  {label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {feedback ? (
          <AuthFeedback tone={feedback.tone} title={feedback.title}>{feedback.message}</AuthFeedback>
        ) : null}

        {schoolIdLocked ? <input type="hidden" name="schoolId" value={schoolId ?? ""} /> : null}
        <div className={`auth-identity-grid ${schoolIdLocked ? "auth-identity-grid-single" : ""}`}>
          {!schoolIdLocked ? (
            <FormField id="schoolId" label="School ID">
              <input
                id="schoolId"
                name="schoolId"
                className="auth-field-input w-full outline-none disabled:bg-slate-50"
                autoComplete="organization"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                inputMode="text"
                enterKeyHint="next"
                placeholder="your-school-id"
                disabled={isPending}
                required
                value={schoolIdValue}
                onChange={(event) => setSchoolIdValue(normalizeSchoolCodeInput(event.target.value))}
                onBlur={() => setSchoolIdValue((current) => normalizeSchoolCodeForSubmit(current))}
              />
            </FormField>
          ) : null}

          <FormField id="identifier" label="Employee code or email">
            <input
              id="identifier"
              className="auth-field-input w-full outline-none disabled:bg-slate-50"
              name="identifier"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="text"
              enterKeyHint={method === "passkey" ? "go" : "next"}
              disabled={isPending}
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              onBlur={() => setIdentifier((current) => normalizeIdentifier(current))}
            />
          </FormField>
        </div>

        {method === "password" ? (
          <>
            <FormField id="password" label="Password">
              <PasswordInput
                id="password"
                className="auth-field-input w-full outline-none disabled:bg-slate-50"
                name="password"
                autoComplete="current-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="go"
                aria-describedby="password-case-help"
                disabled={isPending}
                required
              />
              <div className="flex flex-wrap items-center justify-between gap-x-3">
                <p id="password-case-help" className="auth-password-helper text-xs leading-5">Password is case-sensitive. A and a are different.</p>
                <Link href={recoveryHref} className="auth-inline-link text-brand-700 hover:text-brand-800 premium-focus">
                  Forgot password?
                </Link>
              </div>
            </FormField>
            <button type="submit" disabled={isPending} className="auth-action-button auth-action-primary premium-focus" aria-live="polite">
              {pendingAction === "password" || pendingAction === "redirect"
                ? <><LoadingSpinner />{pendingAction === "redirect" ? "Opening workspace..." : "Signing in..."}</>
                : attendanceIntent ? "Continue to attendance" : "Sign in with password"}
            </button>
          </>
        ) : (
          <>
            <p className="auth-method-help">Use the passkey registered on this device for password-free access.</p>
            <button type="submit" disabled={isPending} className="auth-action-button auth-action-primary premium-focus" aria-live="polite">
              {pendingAction === "passkey" || pendingAction === "redirect"
                ? <><LoadingSpinner />{pendingAction === "redirect" ? "Opening workspace..." : "Checking passkey..."}</>
                : <><PasskeyIcon />{attendanceIntent ? "Open attendance with passkey" : "Sign in with passkey"}</>}
            </button>
          </>
        )}

        <div className="auth-secondary-navigation flex justify-center">
          {attendanceIntent ? (
            <Link href={standardLoginHref} className="auth-inline-link text-slate-600 hover:text-brand-700 premium-focus">
              Back to standard sign in
            </Link>
          ) : (
            <Link href={attendanceLoginHref} className="auth-inline-link text-teal-700 hover:text-teal-800 premium-focus">
              Quick attendance sign in
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}
