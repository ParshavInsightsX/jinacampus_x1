"use client";

import { useState } from "react";

type BranchOption = { id: string; name: string };
type PreviewError = { row: number; field: string; message: string };
type PreviewResult = {
  success: boolean;
  error?: string;
  summary?: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    canImport: boolean;
    importedRows?: number;
    incompleteProfiles?: number;
  };
  errors?: PreviewError[];
  truncatedErrors?: boolean;
};

export function StudentBulkManager({
  branches,
  defaultBranchId,
  canImport
}: {
  branches: BranchOption[];
  defaultBranchId?: string;
  canImport: boolean;
}) {
  const [branchId, setBranchId] = useState(defaultBranchId ?? branches[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [pending, setPending] = useState<"preview" | "import" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const query = new URLSearchParams({ branchId });

  async function sendFile(endpoint: string, operation: "preview" | "import") {
    if (!file || !branchId) {
      setMessage("Select a branch and student spreadsheet first.");
      return;
    }
    setPending(operation);
    setMessage(null);
    try {
      const body = new FormData();
      body.set("branchId", branchId);
      body.set("file", file);
      const response = await fetch(endpoint, { method: "POST", body });
      const result = await response.json() as PreviewResult & { message?: string };
      if (operation === "preview") {
        setPreview(result);
      }
      if (!response.ok || !result.success) {
        setMessage(result.error ?? "Unable to process this spreadsheet.");
        return;
      }
      if (operation === "import") {
        setMessage(result.message ?? "Student records imported successfully.");
        setPreview(result);
        setFile(null);
      }
    } catch {
      setMessage("The upload could not be completed. Check your connection and try again.");
    } finally {
      setPending(null);
    }
  }

  function selectFile(nextFile: File | null) {
    setFile(nextFile);
    setPreview(null);
    setMessage(null);
  }

  return (
    <div className="space-y-5">
      <section className="premium-card p-4">
        <h2 className="text-base font-semibold text-slate-950">1. Download a template or current records</h2>
        <p className="mt-1 text-sm text-slate-500">
          Download a seven-column template. Excel includes active class references; CSV opens directly in Google Sheets.
        </p>
        <label className="mt-4 block max-w-md text-sm font-medium text-slate-700">
          Branch
          <select
            value={branchId}
            onChange={(event) => { setBranchId(event.target.value); setPreview(null); }}
            className="mt-2 min-h-11 w-full"
          >
            {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
          </select>
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          {canImport ? (
            <>
              <a href={`/api/academia/students/template?${query.toString()}&format=xlsx`} className="premium-secondary-button min-h-11">Simple Excel template</a>
              <a href={`/api/academia/students/template?${query.toString()}&format=csv`} className="premium-secondary-button min-h-11">Simple CSV template</a>
            </>
          ) : null}
          <a href={`/api/academia/students/export?${query.toString()}&format=xlsx`} className="premium-secondary-button min-h-11">Export Excel</a>
          <a href={`/api/academia/students/export?${query.toString()}&format=csv`} className="premium-secondary-button min-h-11">Export CSV</a>
        </div>
      </section>

      {canImport ? (
        <section className="premium-card p-4">
          <h2 className="text-base font-semibold text-slate-950">2. Preview and import students</h2>
          <p className="mt-1 text-sm text-slate-500">
            Up to 5,000 rows per file. Valid rows can be imported even when other rows need correction.
          </p>
          <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 md:grid-cols-2">
            <div>
              <p className="font-semibold text-slate-900">Mandatory import fields</p>
              <p className="mt-1">Scholar Number, Student Name, Date of Birth, Current Class, Contact Number, Father&apos;s Name, and Mother&apos;s Name.</p>
            </div>
            <div>
              <p className="font-semibold text-slate-900">Optional profile fields</p>
              <p className="mt-1">Leave unavailable cells blank. They are stored as empty values and can be completed later from the student profile.</p>
            </div>
          </div>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Student spreadsheet
            <input
              type="file"
              accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
              onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
              disabled={Boolean(pending)}
              className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm"
            />
          </label>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => sendFile("/api/academia/students/import/preview", "preview")}
              disabled={!file || !branchId || Boolean(pending)}
              className="premium-secondary-button min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "preview" ? "Checking rows..." : "Preview import"}
            </button>
            <button
              type="button"
              onClick={() => sendFile("/api/academia/students/import/commit", "import")}
              disabled={!preview?.summary?.canImport || Boolean(pending)}
              className="premium-primary-button min-h-11 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pending === "import" ? "Importing students..." : "Import validated rows"}
            </button>
          </div>
        </section>
      ) : null}

      {message ? (
        <div role="status" className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">
          {message}
        </div>
      ) : null}

      {preview?.summary ? (
        <section className="premium-card p-4">
          <h2 className="text-base font-semibold text-slate-950">
            {preview.summary.importedRows !== undefined ? "Import result" : "Preview result"}
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-200 p-3"><p className="text-xs text-slate-500">Rows</p><p className="mt-1 text-xl font-semibold tabular-nums">{preview.summary.totalRows}</p></div>
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs text-emerald-700">{preview.summary.importedRows !== undefined ? "Imported" : "Valid"}</p><p className="mt-1 text-xl font-semibold tabular-nums text-emerald-900">{preview.summary.importedRows ?? preview.summary.validRows}</p></div>
            <div className="rounded-lg border border-red-200 bg-red-50 p-3"><p className="text-xs text-red-700">Invalid</p><p className="mt-1 text-xl font-semibold tabular-nums text-red-900">{preview.summary.invalidRows}</p></div>
          </div>
          {preview.errors?.length ? (
            <>
              <p className="mt-4 text-sm text-slate-600">
                {preview.summary.importedRows !== undefined
                  ? "These rows were not imported. Correct them in the spreadsheet and upload them again."
                  : "These rows will be skipped. You can import the valid rows now, then correct and re-upload these rows."}
              </p>
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Field</th><th className="px-3 py-2">Issue</th></tr></thead>
                  <tbody className="divide-y divide-slate-200">
                    {preview.errors.map((error, index) => (
                      <tr key={`${error.row}-${error.field}-${index}`}><td className="px-3 py-2 tabular-nums">{error.row}</td><td className="px-3 py-2 font-medium">{error.field}</td><td className="px-3 py-2">{error.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              {preview.summary.importedRows !== undefined
                ? "All validated rows were imported successfully."
                : "Every row passed validation. You can import the file."}
            </p>
          )}
          {preview.summary.importedRows !== undefined && preview.summary.incompleteProfiles ? (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              {preview.summary.incompleteProfiles} imported student profiles need additional admission information.
            </p>
          ) : null}
          {preview.truncatedErrors ? <p className="mt-2 text-xs text-slate-500">Only the first 250 issues are shown.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
