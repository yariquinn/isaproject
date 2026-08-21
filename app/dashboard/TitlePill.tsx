"use client";

import { useEffect, useRef, useState } from "react";
import { CONTACT_TITLES } from "@/lib/types";

// A compact title pill next to a contact name. Displays the title (wrapping
// multi-word titles like "Managing / Member"); one click opens the picker.
export default function TitlePill({
  value,
  onSave,
  guard,
}: {
  value: string | null;
  onSave: (v: string) => void;
  // Return false to block opening (e.g. to show a confirm prompt first).
  guard?: () => boolean;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.(); } catch { /* older browsers */ }
  }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref}
        className="title-pill"
        value={value ?? ""}
        onChange={(e) => { onSave(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        aria-label="Title"
      >
        <option value="">— Title</option>
        {CONTACT_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
        {value && !(CONTACT_TITLES as readonly string[]).includes(value) && (
          <option value={value}>{value}</option>
        )}
      </select>
    );
  }
  return (
    <button type="button" className="title-pill title-pill-btn" onClick={() => { if (guard && !guard()) return; setEditing(true); }}>
      {value || "+ Title"}
    </button>
  );
}
