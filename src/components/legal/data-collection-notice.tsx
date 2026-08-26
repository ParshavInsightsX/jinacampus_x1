import Link from "next/link";

const COPY = {
  student: {
    title: "Student data notice",
    text: "Enter only information that the institution is authorised to collect for a stated school purpose. Aadhaar is optional and must not be required for admission. Confirm parent or lawful-guardian authority before adding child records or documents."
  },
  staff: {
    title: "Staff data notice",
    text: "Enter only employment and account information the institution is authorised to use. Inform the staff member about the purpose, access, retention, and correction process before creating the record."
  }
} as const;

export function DataCollectionNotice({ audience }: { audience: keyof typeof COPY }) {
  const copy = COPY[audience];

  return (
    <aside
      className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950"
      aria-label={copy.title}
    >
      <p className="font-semibold">{copy.title}</p>
      <p className="mt-1">
        {copy.text}{" "}
        <Link href="/legal/privacy" className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-800">
          Read the privacy notice
        </Link>
        .
      </p>
    </aside>
  );
}
