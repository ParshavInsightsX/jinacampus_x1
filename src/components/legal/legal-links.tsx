import Link from "next/link";

export function LegalLinks({
  tone = "light",
  className = "",
  compact = false
}: {
  tone?: "light" | "dark";
  className?: string;
  compact?: boolean;
}) {
  const linkClass = tone === "dark"
    ? "text-blue-100 hover:text-white"
    : "text-slate-600 hover:text-brand-700";

  const links = compact
    ? [
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/terms", label: "Terms" },
        { href: "/legal", label: "Legal centre" }
      ]
    : [
        { href: "/legal/privacy", label: "Privacy" },
        { href: "/legal/terms", label: "Terms" },
        { href: "/legal/cookies", label: "Cookies" },
        { href: "/legal/data-rights", label: "Data rights" },
        { href: "/legal/security", label: "Security" }
      ];

  return (
    <nav
      aria-label="Legal and privacy"
      className={`flex flex-wrap items-center justify-center gap-x-4 text-xs font-semibold ${className}`}
    >
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={`inline-flex min-h-11 items-center transition ${linkClass}`}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
