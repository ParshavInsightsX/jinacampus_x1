"use client";

import { AlertCircle, Bell, CheckCheck, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { NavbarPopover } from "@/components/app-shell/navbar-popover";

type BellNotification = {
  id: string;
  readAt: string | null;
  acknowledgedAt: string | null;
  notification: {
    id: string;
    title: string;
    bodyPreview: string;
    sourceModule: string;
    priority: string;
    requiresAcknowledgement: boolean;
    createdAt: string;
  };
};

type NotificationBellProps = {
  compact?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

const POLL_INTERVAL_MS = 45_000;
let unreadCountRequest: Promise<number> | null = null;

async function requestUnreadNotificationCount() {
  if (!unreadCountRequest) {
    unreadCountRequest = (async () => {
      const response = await fetch("/api/notifications/unread-count", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload: unknown = await response.json();
      if (!response.ok || typeof payload !== "object" || payload === null || !("count" in payload)) {
        throw new Error("COUNT_UNAVAILABLE");
      }
      return typeof payload.count === "number" ? payload.count : 0;
    })();
  }

  const request = unreadCountRequest;
  try {
    return await request;
  } finally {
    if (unreadCountRequest === request) unreadCountRequest = null;
  }
}

function relativeTime(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function priorityClasses(priority: string) {
  if (priority === "CRITICAL") return "bg-red-600 text-white";
  if (priority === "HIGH") return "bg-amber-500 text-white";
  return "bg-brand-600 text-white";
}

export function NotificationBell({ compact = false, onOpenChange }: NotificationBellProps) {
  const pathname = usePathname();
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<BellNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelLoading, setPanelLoading] = useState(false);
  const [error, setError] = useState(false);
  const mounted = useRef(true);

  const loadCount = useCallback(async () => {
    try {
      const unreadCount = await requestUnreadNotificationCount();
      if (mounted.current) {
        setCount(unreadCount);
        setError(false);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  const loadRecent = useCallback(async () => {
    setPanelLoading(true);
    try {
      const response = await fetch("/api/notifications?state=all&limit=8", {
        credentials: "same-origin",
        cache: "no-store"
      });
      const payload: unknown = await response.json();
      if (
        !response.ok ||
        typeof payload !== "object" ||
        payload === null ||
        !("items" in payload) ||
        !Array.isArray(payload.items)
      ) {
        throw new Error("NOTIFICATIONS_UNAVAILABLE");
      }
      if (mounted.current) {
        setItems(payload.items as BellNotification[]);
        setError(false);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      if (mounted.current) setPanelLoading(false);
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const response = await fetch("/api/notifications/mark-all-read", {
      method: "POST",
      credentials: "same-origin"
    });
    if (!response.ok) {
      setError(true);
      return;
    }
    setCount(0);
    setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })));
  }, []);

  useEffect(() => {
    mounted.current = true;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadCount();
    }, POLL_INTERVAL_MS);
    const refresh = () => {
      if (document.visibilityState === "visible") void loadCount();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("jc:notifications-changed", refresh);
    return () => {
      mounted.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("jc:notifications-changed", refresh);
    };
  }, [loadCount]);

  useEffect(() => {
    void loadCount();
  }, [pathname, loadCount]);

  const label = loading
    ? "Loading notifications"
    : `Notifications, ${count} unread`;

  return (
    <NavbarPopover
      accessibleLabel={label}
      dataAttribute="notifications"
      buttonClassName={compact
        ? "jc-motion-interactive relative grid min-h-11 min-w-11 place-items-center rounded-full text-brand-800 hover:bg-brand-50 premium-focus"
        : "jc-motion-interactive relative grid min-h-11 min-w-11 place-items-center rounded-full text-brand-800 hover:bg-white premium-focus"}
      panelClassName="jc-glass-elevated fixed inset-x-3 top-[4.5rem] z-[70] max-h-[min(32rem,calc(100dvh-6rem))] overflow-y-auto rounded-lg border p-3 sm:absolute sm:inset-x-auto sm:right-0 sm:top-[calc(100%+0.65rem)] sm:w-[23rem]"
      onOpenChange={(open) => {
        onOpenChange?.(open);
        if (open) {
          void Promise.all([loadCount(), loadRecent()]);
        }
      }}
      trigger={() => (
        <>
          {loading ? <LoaderCircle className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Bell className="h-5 w-5" aria-hidden="true" />}
          {!loading && count > 0 ? (
            <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-red-600 px-1 text-[9px] font-bold leading-none text-white" aria-hidden="true">
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </>
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-campus-border pb-3">
        <div>
          <p className="text-sm font-bold text-brand-950">Notifications</p>
          <p className="text-xs text-slate-500">{count} unread</p>
        </div>
        {count > 0 ? (
          <button type="button" onClick={() => void markAllRead()} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-xs font-bold text-brand-700 hover:bg-brand-50 premium-focus">
            <CheckCheck className="h-4 w-4" aria-hidden="true" />
            Mark all read
          </button>
        ) : null}
      </div>

      {panelLoading ? (
        <div className="space-y-2 py-3" aria-label="Loading recent notifications">
          {[0, 1, 2].map((item) => <div key={item} className="h-16 animate-pulse rounded-md bg-slate-100 motion-reduce:animate-none" />)}
        </div>
      ) : error ? (
        <div className="flex items-start gap-2 py-5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Notifications could not be refreshed. Open the centre to retry.</p>
        </div>
      ) : items.length === 0 ? (
        <p className="py-7 text-center text-sm text-slate-500">You are all caught up.</p>
      ) : (
        <div className="divide-y divide-slate-100">
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/notifications/${item.notification.id}`}
              className="flex min-h-16 gap-3 py-3 transition hover:bg-slate-50 premium-focus"
            >
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${priorityClasses(item.notification.priority)}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={`line-clamp-1 text-sm ${item.readAt ? "font-semibold text-slate-700" : "font-bold text-brand-950"}`}>{item.notification.title}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{relativeTime(item.notification.createdAt)}</span>
                </span>
                <span className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{item.notification.bodyPreview}</span>
                {item.notification.requiresAcknowledgement && !item.acknowledgedAt ? (
                  <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">Acknowledgement required</span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      )}

      <Link href="/notifications" className="mt-2 flex min-h-11 items-center justify-center rounded-md bg-brand-50 px-3 text-sm font-bold text-brand-800 transition hover:bg-brand-100 premium-focus">
        View notification centre
      </Link>
    </NavbarPopover>
  );
}
