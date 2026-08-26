"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";

export function ConnectivityBanner() {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 lg:hidden"
      data-connectivity-banner="offline"
    >
      <div className="mx-auto flex max-w-xl items-center gap-2 text-xs font-semibold">
        <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>You are offline. Server-verified actions are unavailable until the connection returns.</span>
      </div>
    </div>
  );
}
