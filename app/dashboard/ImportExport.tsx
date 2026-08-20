"use client";

import { useEffect, useRef, useState } from "react";

// Minimal CSV parser (handles quoted fields, commas, newlines).
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => {
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
      return obj;
    });
}

export default function ImportExport({
  filename,
  headers,
  rows,
  onImport,
}: {
  filename: string;
  headers: string[];
  rows: (string | number | null | undefined)[][];
  onImport?: (records: Record<string, string>[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const downloadCsv = () => {
    const lines = [headers, ...rows].map((r) => r.map(esc).join(","));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };
  // Print/PDF the actual data table (all rows), not the current page view.
  const printTable = () => {
    setMenuOpen(false);
    const title = filename.replace(/\.csv$/i, "");
    const escHtml = (v: string | number | null | undefined) =>
      (v == null ? "" : String(v)).replace(/[&<>]/g, (c) =>
        c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;",
      );
    const thead = `<tr>${headers.map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr>`;
    const tbody = rows
      .map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escHtml(title)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 24px; color: #1a1a1a; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        .meta { color: #666; font-size: 12px; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid #ddd; vertical-align: top; }
        th { background: #f3f4f6; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
        tr:nth-child(even) td { background: #fafafa; }
        @media print { body { margin: 0; } }
      </style></head><body>
      <h1>${escHtml(title)}</h1>
      <div class="meta">${rows.length} record${rows.length === 1 ? "" : "s"} · ${new Date().toLocaleDateString()}</div>
      <table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
      <script>window.onload = function(){ window.focus(); window.print(); };</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  };
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !onImport) return;
    const text = await f.text();
    onImport(parseCsv(text));
  };

  return (
    <>
      <button className="icon-btn print-btn" type="button" title="Print" aria-label="Print" onClick={printTable}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      </button>

      {onImport && (
        <>
          <button className="icon-btn print-btn" type="button" title="Import CSV" aria-label="Import CSV" onClick={() => fileRef.current?.click()}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="8 8 12 4 16 8" /><line x1="12" y1="4" x2="12" y2="16" />
            </svg>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} style={{ display: "none" }} />
        </>
      )}

      <div className="export-wrap" ref={wrapRef}>
        <button className="icon-btn print-btn" type="button" title="Export" aria-label="Export" onClick={() => setMenuOpen((o) => !o)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="8 12 12 16 16 12" /><line x1="12" y1="4" x2="12" y2="16" />
          </svg>
        </button>
        {menuOpen && (
          <div className="export-menu">
            <button type="button" onClick={downloadCsv}>Download CSV</button>
            <button type="button" onClick={printTable}>Download PDF</button>
          </div>
        )}
      </div>
    </>
  );
}
