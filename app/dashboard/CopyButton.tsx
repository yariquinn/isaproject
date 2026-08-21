"use client";

import { useState } from "react";

/** Small clipboard button — copies `value` and briefly shows a check. */
export default function CopyButton({ value, label = "Copy" }: { value: string | null | undefined; label?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1200);
    } catch {
      /* ignore */
    }
  };
  return (
    <button
      type="button"
      className={`copy-btn${done ? " done" : ""}`}
      onClick={copy}
      title={done ? "Copied" : label}
      aria-label={label}
    >
      {done ? (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );
}
