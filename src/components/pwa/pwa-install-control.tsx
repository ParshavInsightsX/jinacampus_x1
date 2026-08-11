"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";
import { CheckCircle2, Download, Share2, Smartphone, X } from "lucide-react";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
};

type InstallMode = "checking" | "prompt" | "ios" | "manual" | "in-app" | "installed";
type InstallResult = "installed" | "dismissed" | "guidance";

type PwaInstallContextValue = {
  mode: InstallMode;
  requestInstall: () => Promise<InstallResult>;
};

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

function detectInstallMode(): InstallMode {
  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (standalone) return "installed";

  const userAgent = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/i.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|; wv\)|WebView/i.test(userAgent);
  if (inAppBrowser) return "in-app";
  if (ios) return "ios";
  return "manual";
}

export function PwaInstallProvider({ children }: { children: ReactNode }) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [mode, setMode] = useState<InstallMode>("checking");

  useEffect(() => {
    setMode(detectInstallMode());

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setMode("prompt");
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setMode("installed");
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function requestInstall(): Promise<InstallResult> {
    if (mode === "installed") return "installed";
    if (!installPrompt) return "guidance";

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") {
      setMode("installed");
      return "installed";
    }

    setMode(detectInstallMode());
    return "dismissed";
  }

  return (
    <PwaInstallContext.Provider value={{ mode, requestInstall }}>
      {children}
    </PwaInstallContext.Provider>
  );
}

function usePwaInstall() {
  const value = useContext(PwaInstallContext);
  if (!value) throw new Error("PwaInstallControl must be rendered inside PwaInstallProvider.");
  return value;
}

export function PwaInstallControl() {
  const { mode, requestInstall } = usePwaInstall();
  const [showGuidance, setShowGuidance] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleInstall() {
    setFeedback(null);
    const result = await requestInstall();
    if (result === "guidance") {
      setShowGuidance((current) => !current);
      return;
    }
    if (result === "installed") {
      setShowGuidance(false);
      setFeedback("JinaCampus was added to this device.");
      return;
    }
    setFeedback("Installation was not completed. You can try again from the browser menu.");
  }

  const guidance = mode === "ios"
    ? {
        icon: Share2,
        title: "Install from Safari",
        description: "Tap Share, choose Add to Home Screen, turn on Open as Web App, then tap Add."
      }
    : mode === "in-app"
      ? {
          icon: Smartphone,
          title: "Open in Safari or Chrome",
          description: "In-app browsers cannot reliably install JinaCampus. Open the approved HTTPS link in Safari or Chrome, then use Add to Home Screen."
        }
      : {
          icon: Smartphone,
          title: "Use the browser install menu",
          description: "Open the browser menu and choose Install app or Add to Home screen. Use the approved HTTPS link in a supported browser."
        };
  const GuidanceIcon = guidance.icon;

  return (
    <div className="my-1 border-t border-campus-border pt-1" data-pwa-install-control="true">
      <button
        type="button"
        onClick={() => void handleInstall()}
        disabled={mode === "checking" || mode === "installed"}
        aria-expanded={showGuidance}
        aria-controls="pwa-install-guidance"
        className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-semibold text-slate-700 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-default disabled:text-emerald-700 premium-focus"
      >
        {mode === "installed" ? (
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4" aria-hidden="true" />
        )}
        {mode === "installed" ? "JinaCampus installed" : mode === "checking" ? "Checking install support..." : "Install JinaCampus"}
      </button>

      {showGuidance && mode !== "installed" ? (
        <div id="pwa-install-guidance" className="mx-1 mb-2 rounded-lg border border-brand-100 bg-brand-50 p-3" role="region" aria-label="JinaCampus installation guidance">
          <div className="flex items-start gap-2.5">
            <GuidanceIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink">{guidance.title}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{guidance.description}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuidance(false)}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-white hover:text-ink premium-focus"
              aria-label="Close installation guidance"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : null}

      {feedback ? <p className="px-3 pb-2 text-xs leading-5 text-slate-600" role="status">{feedback}</p> : null}
    </div>
  );
}
