"use client";

import { useEffect, useRef, useState } from "react";

// Print icon button that expands to offer "Print" or "Download CSV".
export default function ExportMenu({
  rows,
  headers,
  filename,
}: {
  rows: (string | number | null | undefined)[][];
  headers: string[];
  filename: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

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
    setOpen(false);
  };

  return (
    <div className="export-wrap" ref={wrapRef}>
      <button
        className="icon-btn print-btn"
        onClick={() => setOpen((o) => !o)}
        type="button"
        title="Print or export"
        aria-label="Print or export"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 6 2 18 2 18 9" />
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
          <rect x="6" y="14" width="12" height="8" />
        </svg>
      </button>
      {open && (
        <div className="export-menu">
          <button type="button" onClick={() => { setOpen(false); window.print(); }}>
            Print
          </button>
          <button type="button" onClick={downloadCsv}>
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
