import Link from "next/link";

export function LegalLinks({
  tone = "light",
  className = ""
}: {
  tone?: "light" | "dark";
  className?: string;
}) {
  const linkClass = tone === "dark"
    ? "text-blue-100 hover:text-white"
    : "text-slate-600 hover:text-brand-700";

  return (
    <nav
      aria-label="Legal and privacy"
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs font-semibold ${className}`}
    >
      <Link href="/legal/privacy" className={`min-h-11 content-center transition ${linkClass}`}>Privacy</Link>
      <Link href="/legal/terms" className={`min-h-11 content-center transition ${linkClass}`}>Terms</Link>
      <Link href="/legal/cookies" className={`min-h-11 content-center transition ${linkClass}`}>Cookies</Link>
      <Link href="/legal/data-rights" className={`min-h-11 content-center transition ${linkClass}`}>Data rights</Link>
      <Link href="/legal/security" className={`min-h-11 content-center transition ${linkClass}`}>Security</Link>
    </nav>
  );
}
