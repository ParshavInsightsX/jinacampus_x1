"use client";

import { useMemo, useState, useTransition } from "react";
import { Eye, IdCard, Loader2, Printer, RefreshCw, XCircle } from "lucide-react";
import {
  deactivateStudentIdentityCardAction,
  issueStudentIdentityCardAction,
  previewStudentIdentityCardAction,
  recordStudentIdentityCardPrintAction
} from "@/modules/academia/actions/student-identity-card.actions";
import { StudentIdentityCard } from "@/modules/academia/components/student-identity-card";
import type { StudentIdentityCardData } from "@/modules/academia/services/student-identity-card.service";

type EnrollmentOption = {
  id: string;
  academicYearId: string;
  academicYearName: string;
  academicYearStartDate: string;
  academicYearEndDate: string;
  branchId: string;
  classSectionName: string;
  status: string;
};

type CardHistory = {
  id: string;
  enrollmentId: string;
  cardVersion: number;
  status: string;
  issuedAt: string;
  validFrom: string;
  validUntil: string | null;
  printCount: number;
  lastPrintedAt: string | null;
  deactivatedAt: string | null;
  deactivationReason: string | null;
};

type StudentIdentityCardManagerProps = {
  studentId: string;
  enrollments: EnrollmentOption[];
  cards: CardHistory[];
  defaultValidFrom: string;
};

function dateInput(value: string) {
  return value.slice(0, 10);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata"
  }).format(new Date(value));
}

export function StudentIdentityCardManager({
  studentId,
  enrollments,
  cards,
  defaultValidFrom
}: StudentIdentityCardManagerProps) {
  const [enrollmentId, setEnrollmentId] = useState(enrollments[0]?.id ?? "");
  const selectedEnrollment = useMemo(
    () => enrollments.find((item) => item.id === enrollmentId) ?? null,
    [enrollments, enrollmentId]
  );
  const currentCard = useMemo(
    () => cards.find((item) => item.enrollmentId === enrollmentId && item.status === "ACTIVE") ?? null,
    [cards, enrollmentId]
  );
  const [validFrom, setValidFrom] = useState(defaultValidFrom);
  const [validUntil, setValidUntil] = useState(
    selectedEnrollment ? dateInput(selectedEnrollment.academicYearEndDate) : ""
  );
  const [reason, setReason] = useState("");
  const [card, setCard] = useState<StudentIdentityCardData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resetFeedback() {
    setMessage(null);
    setError(null);
  }

  function changeEnrollment(nextId: string) {
    setEnrollmentId(nextId);
    setCard(null);
    setReason("");
    const next = enrollments.find((item) => item.id === nextId);
    setValidUntil(next ? dateInput(next.academicYearEndDate) : "");
  }

  function issueCard() {
    if (!selectedEnrollment || isPending) return;
    if (currentCard && reason.trim().length < 5) {
      setError("Enter a short reason before replacing the active card.");
      return;
    }
    if (currentCard && !window.confirm("Issue a replacement Student ID card? The active card will be deactivated.")) {
      return;
    }

    resetFeedback();
    setCard(null);
    startTransition(async () => {
      const response = await issueStudentIdentityCardAction({
        studentId,
        enrollmentId: selectedEnrollment.id,
        validFrom,
        ...(validUntil ? { validUntil } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {})
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCard(response.data);
      setMessage(response.message);
      setReason("");
    });
  }

  function previewCard(cardId: string) {
    resetFeedback();
    setCard(null);
    startTransition(async () => {
      const response = await previewStudentIdentityCardAction({ cardId });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCard(response.data);
      setMessage(response.message);
    });
  }

  function printCard() {
    if (!card || isPending) return;
    resetFeedback();
    startTransition(async () => {
      const response = await recordStudentIdentityCardPrintAction({ cardId: card.cardId });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setMessage(response.message);
      window.print();
    });
  }

  function deactivateCard(cardId: string) {
    const deactivationReason = window.prompt("Why is this Student ID card being deactivated?");
    if (!deactivationReason || deactivationReason.trim().length < 5) return;
    resetFeedback();
    startTransition(async () => {
      const response = await deactivateStudentIdentityCardAction({
        cardId,
        reason: deactivationReason.trim()
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCard(null);
      setMessage(response.message);
      window.location.reload();
    });
  }

  if (enrollments.length === 0) {
    return (
      <section className="premium-card p-6 text-center">
        <IdCard className="mx-auto h-8 w-8 text-slate-400" aria-hidden="true" />
        <h2 className="mt-3 font-semibold text-slate-950">Active enrollment required</h2>
        <p className="mt-2 text-sm text-slate-600">
          Assign this student to a class and academic year before issuing an ID card.
        </p>
      </section>
    );
  }

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,390px)_minmax(0,1fr)]">
      <section className="premium-card no-print p-4 sm:p-5">
        <h2 className="font-semibold text-slate-950">Issue Student ID Card</h2>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          The card is tied to the selected enrollment, branch, and academic year.
        </p>

        <div className="mt-5 space-y-4">
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Enrollment
            <select
              value={enrollmentId}
              onChange={(event) => changeEnrollment(event.target.value)}
              disabled={isPending}
              className="min-h-12"
            >
              {enrollments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.classSectionName} - {item.academicYearName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Valid from
            <input
              type="date"
              value={validFrom}
              min={selectedEnrollment ? dateInput(selectedEnrollment.academicYearStartDate) : undefined}
              max={selectedEnrollment ? dateInput(selectedEnrollment.academicYearEndDate) : undefined}
              onChange={(event) => setValidFrom(event.target.value)}
              disabled={isPending}
              className="min-h-12"
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-slate-800">
            Valid until
            <input
              type="date"
              value={validUntil}
              min={validFrom}
              max={selectedEnrollment ? dateInput(selectedEnrollment.academicYearEndDate) : undefined}
              onChange={(event) => setValidUntil(event.target.value)}
              disabled={isPending}
              className="min-h-12"
            />
          </label>
          {currentCard ? (
            <label className="grid gap-2 text-sm font-medium text-slate-800">
              Replacement reason
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={250}
                disabled={isPending}
                placeholder="For example: card damaged or details updated"
                required
              />
            </label>
          ) : null}
        </div>

        <button
          type="button"
          onClick={issueCard}
          disabled={isPending || !enrollmentId || !validFrom}
          className="premium-primary-button mt-5 min-h-12 w-full gap-2 premium-focus"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : currentCard ? (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          ) : (
            <IdCard className="h-4 w-4" aria-hidden="true" />
          )}
          {isPending ? "Working..." : currentCard ? "Issue Replacement Card" : "Issue ID Card"}
        </button>

        {message ? (
          <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
            {error}
          </p>
        ) : null}
      </section>

      <div className="space-y-5">
        {card ? (
          <section className="premium-card p-4 sm:p-6">
            <div className="no-print">
              <h2 className="font-semibold text-slate-950">Student ID Card Preview</h2>
              <p className="mt-1 text-sm text-slate-600">
                Printing is restricted to authorised users and recorded in the audit log.
              </p>
            </div>
            <div className="identity-card-print-area mt-5">
              <StudentIdentityCard card={card} />
            </div>
            <button
              type="button"
              onClick={printCard}
              disabled={isPending}
              className="premium-primary-button no-print mt-5 min-h-12 w-full gap-2 premium-focus sm:w-auto"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Printer className="h-4 w-4" aria-hidden="true" />}
              Print Front and Back
            </button>
          </section>
        ) : null}

        <section className="premium-card no-print overflow-hidden">
          <div className="border-b border-slate-200 p-4 sm:p-5">
            <h2 className="font-semibold text-slate-950">Card History</h2>
            <p className="mt-1 text-sm text-slate-600">Review issued, replaced, and deactivated cards.</p>
          </div>
          {cards.length === 0 ? (
            <p className="p-5 text-sm text-slate-600">No Student ID card has been issued.</p>
          ) : (
            <div className="divide-y divide-slate-200">
              {cards.map((item) => (
                <article key={item.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-950">
                      Version {item.cardVersion} - {item.status.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Issued {formatDate(item.issuedAt)} - Printed {item.printCount} time{item.printCount === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Valid {formatDate(item.validFrom)} to {formatDate(item.validUntil)}
                    </p>
                  </div>
                  {item.status === "ACTIVE" ? (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => previewCard(item.id)}
                        disabled={isPending}
                        className="premium-secondary-button min-h-11 gap-2 premium-focus"
                      >
                        <Eye className="h-4 w-4" aria-hidden="true" />
                        Preview
                      </button>
                      <button
                        type="button"
                        onClick={() => deactivateCard(item.id)}
                        disabled={isPending}
                        className="premium-danger-button min-h-11 gap-2 premium-focus"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        Deactivate
                      </button>
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
