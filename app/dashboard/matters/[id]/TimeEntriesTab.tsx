"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_TYPES, ATTORNEYS, type TimeEntry } from "@/lib/types";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
const money = (n: number) => `$${n.toFixed(2)}`;

type EditCell = { id: string; field: keyof TimeEntry } | null;

export default function TimeEntriesTab({
  entries,
  rate,
  onAdd,
  onChanged,
}: {
  entries: TimeEntry[];
  rate: number | null;
  onAdd: () => void;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<EditCell>(null);
  const [draft, setDraft] = useState<string>("");

  const rateVal = rate ?? 0;
  const amt = (e: TimeEntry) => (e.duration_seconds / 3600) * rateVal;

  const sum = (pred: (e: TimeEntry) => boolean) => {
    let dollars = 0;
    let secs = 0;
    for (const e of entries) {
      if (!pred(e)) continue;
      dollars += amt(e);
      secs += e.duration_seconds;
    }
    return { dollars, hours: secs / 3600 };
  };

  const total = sum(() => true);
  const billable = sum((e) => e.billable);
  const nonBillable = sum((e) => !e.billable);
  const invoiced = sum((e) => e.invoiced);
  const unInvoiced = sum((e) => e.billable && !e.invoiced);

  async function save(e: TimeEntry, field: keyof TimeEntry, value: unknown) {
    setEdit(null);
    await supabase.from("time_entries").update({ [field]: value }).eq("id", e.id);
    onChanged();
  }

  async function toggle(e: TimeEntry, field: "billable" | "invoiced") {
    await supabase.from("time_entries").update({ [field]: !e[field] }).eq("id", e.id);
    onChanged();
  }

  const stat = (
    label: string,
    v: { dollars: number; hours: number },
    cls?: string,
  ) => (
    <div className={`te-stat${cls ? " " + cls : ""}`}>
      <span className="te-stat-label">{label}</span>
      <span className="te-stat-amt">{money(v.dollars)}</span>
      <span className="te-stat-hrs">{v.hours.toFixed(2)} hour(s)</span>
    </div>
  );

  const startEdit = (e: TimeEntry, field: keyof TimeEntry, initial: string) => {
    setDraft(initial);
    setEdit({ id: e.id, field });
  };
  const isEditing = (e: TimeEntry, field: keyof TimeEntry) =>
    edit?.id === e.id && edit.field === field;

  return (
    <>
      <div className="panel-head">
        <h2 className="panel-title">Time Entries ({entries.length})</h2>
        <button
          className="icon-add"
          type="button"
          onClick={onAdd}
          title="Log time"
          aria-label="Log time"
        >
          +
        </button>
      </div>

      <div className="te-summary">
        {stat("Total", total)}
        {stat("Billable", billable, "ok")}
        {stat("Non-billable", nonBillable, "muted")}
        {stat("Invoiced", invoiced, "ok")}
        {stat("Un-invoiced", unInvoiced, "warn")}
      </div>

      {entries.length === 0 ? (
        <p className="muted-line">No time logged to this matter yet.</p>
      ) : (
        <div className="table-wrap" style={{ border: "none" }}>
          <table className="data-table te-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Activity</th>
                <th>Description</th>
                <th>Lawyer</th>
                <th>Duration</th>
                <th>Billable</th>
                <th>Invoiced</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  {/* Date */}
                  <td>
                    {isEditing(e, "logged_at") ? (
                      <input
                        type="date"
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() =>
                          save(
                            e,
                            "logged_at",
                            draft ? new Date(draft + "T12:00:00").toISOString() : e.logged_at,
                          )
                        }
                      />
                    ) : (
                      <span
                        className="te-cell"
                        onClick={() =>
                          startEdit(e, "logged_at", new Date(e.logged_at).toISOString().slice(0, 10))
                        }
                      >
                        {new Date(e.logged_at).toLocaleDateString()}
                      </span>
                    )}
                  </td>
                  {/* Activity */}
                  <td>
                    {isEditing(e, "activity") ? (
                      <select
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => save(e, "activity", draft)}
                      >
                        {ACTIVITY_TYPES.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="te-cell" onClick={() => startEdit(e, "activity", e.activity || ACTIVITY_TYPES[0])}>
                        {e.activity || "—"}
                      </span>
                    )}
                  </td>
                  {/* Description */}
                  <td>
                    {isEditing(e, "note") ? (
                      <input
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => save(e, "note", draft.trim() || null)}
                        onKeyDown={(ev) => {
                          if (ev.key === "Enter") ev.currentTarget.blur();
                        }}
                      />
                    ) : (
                      <span className="te-cell" onClick={() => startEdit(e, "note", e.note || "")}>
                        {e.note || "—"}
                      </span>
                    )}
                  </td>
                  {/* Lawyer */}
                  <td>
                    {isEditing(e, "lawyer") ? (
                      <select
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => save(e, "lawyer", draft)}
                      >
                        {(ATTORNEYS as readonly string[]).includes(e.lawyer) ? null : (
                          <option value={e.lawyer}>{e.lawyer}</option>
                        )}
                        {ATTORNEYS.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="te-cell" onClick={() => startEdit(e, "lawyer", e.lawyer)}>
                        {e.lawyer}
                      </span>
                    )}
                  </td>
                  {/* Duration */}
                  <td>
                    {isEditing(e, "duration_seconds") ? (
                      <input
                        type="number"
                        step="0.25"
                        min={0}
                        autoFocus
                        value={draft}
                        onChange={(ev) => setDraft(ev.target.value)}
                        onBlur={() => {
                          const hrs = parseFloat(draft);
                          save(
                            e,
                            "duration_seconds",
                            isNaN(hrs) ? e.duration_seconds : Math.round(hrs * 3600),
                          );
                        }}
                      />
                    ) : (
                      <span
                        className="te-cell"
                        onClick={() =>
                          startEdit(e, "duration_seconds", (e.duration_seconds / 3600).toFixed(2))
                        }
                      >
                        {fmtHm(e.duration_seconds)}
                      </span>
                    )}
                  </td>
                  {/* Billable toggle */}
                  <td>
                    <button
                      type="button"
                      className={`te-toggle${e.billable ? " on" : ""}`}
                      onClick={() => toggle(e, "billable")}
                    >
                      {e.billable ? "Billable" : "Non-bill"}
                    </button>
                  </td>
                  {/* Invoiced toggle */}
                  <td>
                    <button
                      type="button"
                      className={`te-toggle${e.invoiced ? " on" : ""}`}
                      onClick={() => toggle(e, "invoiced")}
                    >
                      {e.invoiced ? "Invoiced" : "Un-inv"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
