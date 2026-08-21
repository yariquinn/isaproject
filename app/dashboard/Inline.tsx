"use client";

import { useState, type ReactNode } from "react";

/** Click-to-edit text field. Saves on Enter or blur; Esc cancels.
 * `format` styles the read-only display only — editing always uses the raw value. */
export function InlineText({
  value,
  onSave,
  placeholder = "—",
  type = "text",
  format,
}: {
  value: string | null;
  onSave: (v: string) => void | Promise<void>;
  placeholder?: string;
  type?: string;
  format?: (v: string) => ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  function begin() {
    setVal(value ?? "");
    setEditing(true);
  }
  async function commit() {
    setEditing(false);
    if (val !== (value ?? "")) await onSave(val.trim());
  }

  if (editing) {
    return (
      <input
        className="inline-input"
        type={type}
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setVal(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span className="inline-view" onClick={begin} title="Click to edit">
      {value ? (
        format ? format(value) : value
      ) : (
        <span className="inline-placeholder">{placeholder}</span>
      )}
    </span>
  );
}

/** Click-to-edit numbers only. Empty clears the value (null). */
export function InlineNumber({
  value,
  onSave,
  prefix = "",
  suffix = "",
  placeholder = "—",
}: {
  value: number | null;
  onSave: (v: number | null) => void | Promise<void>;
  prefix?: string;
  suffix?: string;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value != null ? String(value) : "");

  function begin() {
    setVal(value != null ? String(value) : "");
    setEditing(true);
  }
  async function commit() {
    setEditing(false);
    const next = val.trim() === "" ? null : Number(val);
    if (next !== value) await onSave(next);
  }

  if (editing) {
    return (
      <input
        className="inline-input"
        type="number"
        inputMode="decimal"
        autoFocus
        value={val}
        onChange={(e) => setVal(e.target.value.replace(/[^0-9.]/g, ""))}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span className="inline-view" onClick={begin} title="Click to edit">
      {value != null ? (
        `${prefix}${typeof value === "number" ? value.toLocaleString("en-US") : value}${suffix}`
      ) : (
        <span className="inline-placeholder">{placeholder}</span>
      )}
    </span>
  );
}

/** Dropdown that saves immediately on change. */
export function InlineSelect({
  value,
  options,
  onSave,
  className = "",
}: {
  value: string | null;
  options: { value: string; label: string }[];
  onSave: (v: string) => void | Promise<void>;
  className?: string;
}) {
  return (
    <select
      className={`inline-select ${className}`}
      value={value ?? ""}
      onChange={(e) => onSave(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Click-to-edit multi-line text. Saves on blur; Esc cancels. */
export function InlineTextarea({
  value,
  onSave,
  placeholder = "Click to add…",
}: {
  value: string | null;
  onSave: (v: string) => void | Promise<void>;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");

  function begin() {
    setVal(value ?? "");
    setEditing(true);
  }
  async function commit() {
    setEditing(false);
    if (val !== (value ?? "")) await onSave(val.trim());
  }

  if (editing) {
    return (
      <textarea
        className="inline-textarea"
        autoFocus
        rows={4}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setVal(value ?? "");
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <p className="inline-view block" onClick={begin} title="Click to edit">
      {value || <span className="inline-placeholder">{placeholder}</span>}
    </p>
  );
}
