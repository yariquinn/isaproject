"use client";

import { useState } from "react";
import { CONTACT_TITLES } from "@/lib/types";

// A compact title pill next to a contact name. Displays the title (wrapping
// multi-word titles like "Managing / Member"); click to pick a new one.
export default function TitlePill({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        className="title-pill"
        autoFocus
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
    <button type="button" className="title-pill title-pill-btn" onClick={() => setEditing(true)}>
      {value || "+ Title"}
    </button>
  );
}
