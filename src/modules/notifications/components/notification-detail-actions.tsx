"use client";

import { Archive, Check, ExternalLink, LoaderCircle, MailOpen, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  notificationId: string;
  deepLink: string | null;
  mandatory: boolean;
  requiresAcknowledgement: boolean;
  initiallyRead: boolean;
  initiallyAcknowledged: boolean;
  initiallyArchived: boolean;
};

type Action = "read" | "unread" | "archive" | "dismiss" | "acknowledge";

export function NotificationDetailActions(props: Props) {
  const router = useRouter();
  const markedOnOpen = useRef(false);
  const [read, setRead] = useState(props.initiallyRead);
  const [acknowledged, setAcknowledged] = useState(props.initiallyAcknowledged);
  const [archived, setArchived] = useState(props.initiallyArchived);
  const [busy, setBusy] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = useCallback(async (action: Action, silent = false) => {
    if (!silent) setBusy(action);
    setError(null);
    try {
      const response = await fetch(`/api/notifications/${props.notificationId}/${action}`, {
        method: action === "acknowledge" ? "POST" : "PATCH",
        credentials: "same-origin"
      });
      const data = await response.json() as { success?: boolean; error?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "Notification could not be updated.");
      if (action === "read") setRead(true);
      if (action === "unread") setRead(false);
      if (action === "acknowledge") { setAcknowledged(true); setRead(true); }
      if (action === "archive") { setArchived(true); setRead(true); }
      window.dispatchEvent(new CustomEvent("jc:notifications-changed"));
      if (action === "dismiss") router.replace("/notifications");
    } catch (caught) {
      if (!silent) setError(caught instanceof Error ? caught.message : "Notification could not be updated.");
    } finally {
      if (!silent) setBusy(null);
    }
  }, [props.notificationId, router]);

  useEffect(() => {
    if (!markedOnOpen.current && !props.initiallyRead) {
      markedOnOpen.current = true;
      void update("read", true);
    }
  }, [props.initiallyRead, update]);

  return <div className="space-y-3">
    {error ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
    <div className="flex flex-wrap gap-2">
      {props.requiresAcknowledgement && !acknowledged ? <button type="button" disabled={Boolean(busy)} onClick={() => void update("acknowledge")} className="premium-primary-button inline-flex min-h-11 items-center gap-2"><Check className="h-4 w-4" aria-hidden="true" />Acknowledge</button> : null}
      <button type="button" disabled={Boolean(busy)} onClick={() => void update(read ? "unread" : "read")} className="premium-secondary-button inline-flex min-h-11 items-center gap-2"><MailOpen className="h-4 w-4" aria-hidden="true" />{read ? "Mark unread" : "Mark read"}</button>
      {!archived && (!props.requiresAcknowledgement || acknowledged) ? <button type="button" disabled={Boolean(busy)} onClick={() => void update("archive")} className="premium-secondary-button inline-flex min-h-11 items-center gap-2"><Archive className="h-4 w-4" aria-hidden="true" />Archive</button> : null}
      {!props.mandatory && (!props.requiresAcknowledgement || acknowledged) ? <button type="button" disabled={Boolean(busy)} onClick={() => void update("dismiss")} className="premium-secondary-button inline-flex min-h-11 items-center gap-2"><X className="h-4 w-4" aria-hidden="true" />Dismiss</button> : null}
      {props.deepLink ? <Link href={props.deepLink} className="premium-primary-button inline-flex min-h-11 items-center gap-2">Open related page<ExternalLink className="h-4 w-4" aria-hidden="true" /></Link> : null}
      {busy ? <LoaderCircle className="my-auto h-5 w-5 animate-spin text-brand-600 motion-reduce:animate-none" aria-label="Updating notification" /> : null}
    </div>
  </div>;
}