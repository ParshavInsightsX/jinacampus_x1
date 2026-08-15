"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cancelSchoolCastHomeworkAction, resendSchoolCastHomeworkAction, submitSchoolCastHomeworkAction } from "@/modules/schoolcast/actions";

export function HomeworkActions({ homeworkItemId, status }: { homeworkItemId: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => { const result = await action(); setMessage(result.ok ? result.message ?? "Done." : result.error ?? "Action failed."); router.refresh(); });
  }
  return <div className="space-y-2">
    {message ? <p role="status" className="text-xs text-slate-600">{message}</p> : null}
    <div className="flex flex-wrap gap-2">
      {status === "DRAFT" ? <button type="button" disabled={pending} onClick={() => run(() => submitSchoolCastHomeworkAction({ homeworkItemId }))} className="premium-primary-button min-h-11 px-3">Submit</button> : null}
      {status === "PUBLISHED" ? <button type="button" disabled={pending} onClick={() => run(() => resendSchoolCastHomeworkAction({ homeworkItemId, reason: "Authorised resend from Homework workspace." }))} className="premium-secondary-button min-h-11 px-3">Resend</button> : null}
      {["DRAFT", "PENDING_APPROVAL", "APPROVED", "PUBLISHED"].includes(status) ? <button type="button" disabled={pending} onClick={() => run(() => cancelSchoolCastHomeworkAction({ homeworkItemId, reason: "Cancelled from Homework workspace." }))} className="premium-secondary-button min-h-11 px-3 text-rose-700">Cancel</button> : null}
    </div>
  </div>;
}