"use client";

import { useState } from "react";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function fmtStamp(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Entry = { header: string; time: string; who: string; initials: string; text: string };

function parseNotes(raw: string | null): Entry[] {
  if (!raw || !raw.trim()) return [];
  const re = /\[([^\]]+)\]\n([\s\S]*?)(?=\n\n\[|$)/g;
  const out: Entry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const header = m[1];
    const text = m[2].trim();
    const sep = header.lastIndexOf(" · ");
    const rawTime = sep === -1 ? header.trim() : header.slice(0, sep).trim();
    const who = sep === -1 ? "" : header.slice(sep + 3).trim();
    const d = new Date(rawTime);
    const valid = !isNaN(d.getTime());
    out.push({ header, time: valid ? fmtStamp(d) : rawTime, who, initials: who ? initialsOf(who) : "•", text });
  }
  if (out.length === 0) out.push({ header: "", time: "", who: "", initials: "•", text: raw.trim() });
  return out;
}

function serializeNotes(entries: Entry[]): string {
  return entries
    .map((e) => (e.header ? `[${e.header}]\n${e.text}` : e.text))
    .filter((s) => s.trim())
    .join("\n\n");
}

/** Timestamped running-log notes: avatar + time, edit/delete, send-arrow composer.
 * The shared layout used by the matter Notes panel, for reuse elsewhere. */
export default function NotesFeed({
  value,
  onSave,
  userName,
  placeholder = "Add a note…",
  wide = false,
}: {
  value: string | null;
  onSave: (next: string | null) => void | Promise<void>;
  userName: string;
  placeholder?: string;
  wide?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const entries = parseNotes(value);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    const stamp = new Date().toISOString();
    const who = userName ? ` · ${userName}` : "";
    const entry = `[${stamp}${who}]\n${text}`;
    setDraft("");
    await onSave(value ? `${entry}\n\n${value}` : entry);
  }
  async function saveEdit(i: number) {
    const text = editText.trim();
    const next = parseNotes(value)
      .map((e, idx) => (idx === i ? { ...e, text } : e))
      .filter((e) => e.text.trim());
    setEditIdx(null);
    setEditText("");
    await onSave(serializeNotes(next) || null);
  }
  async function del(i: number) {
    const next = parseNotes(value).filter((_, idx) => idx !== i);
    setEditIdx(null);
    setEditText("");
    await onSave(serializeNotes(next) || null);
  }

  return (
    <div className={`notes-feed-block${wide ? " wide" : ""}`}>
      <div className="notes-feed-log">
        {entries.length === 0 ? (
          <p className="muted-line">No notes yet.</p>
        ) : (
          <ul className="note-feed">
            {entries.map((n, i) => (
              <li className="note-item" key={i}>
                <span className="note-avatar" title={n.who || undefined}>
                  {n.initials}
                </span>
                <div className="note-main">
                  <div className="note-time">
                    {n.time}
                    <span className="feed-tag feed-tag-comment">Comment</span>
                  </div>
                  {editIdx === i ? (
                    <div className="note-edit">
                      <textarea
                        className="notes-input"
                        autoFocus
                        rows={2}
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit(i);
                          }
                          if (e.key === "Escape") {
                            setEditIdx(null);
                            setEditText("");
                          }
                        }}
                      />
                      <div className="note-edit-actions">
                        <button type="button" className="note-del" onClick={() => del(i)}>
                          Delete
                        </button>
                        <span className="note-edit-right">
                          <button
                            type="button"
                            className="ghost sm"
                            onClick={() => {
                              setEditIdx(null);
                              setEditText("");
                            }}
                          >
                            Cancel
                          </button>
                          <button type="button" className="btn" onClick={() => saveEdit(i)}>
                            Save
                          </button>
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="note-text">
                      {n.text}
                      <button
                        type="button"
                        className="note-edit-btn"
                        title="Edit note"
                        aria-label="Edit note"
                        onClick={() => {
                          setEditIdx(i);
                          setEditText(n.text);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </button>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="notes-add">
        <textarea
          className="notes-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          className="note-send"
          title="Add note"
          aria-label="Add note"
          disabled={!draft.trim()}
          onClick={add}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
