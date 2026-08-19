"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_TYPES, ATTORNEYS, type TimeEntry } from "@/lib/types";

type MatterLite = { id: string; name: string };

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
const money = (n: number) => `$${n.toFixed(2)}`;

type EditCell = { id: string; field: keyof TimeEntry } | null;

const todayStr = () => new Date().toISOString().slice(0, 10);

const PERIODS = [
  { key: "all", label: "All time" },
  { key: "day", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
] as const;

function periodStart(key: string): number {
  const now = new Date();
  if (key === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (key === "week") return now.getTime() - 7 * 24 * 3600 * 1000;
  if (key === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (key === "year") return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
}

export default function TimeEntriesTab({
  entries,
  rate,
  onAddEntry,
  onChanged,
}: {
  entries: TimeEntry[];
  rate: number | null;
  onAddEntry: (f: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
    date: string;
  }) => void;
  onChanged: () => void;
}) {
  const [edit, setEdit] = useState<EditCell>(null);
  const [draft, setDraft] = useState<string>("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [matters, setMatters] = useState<MatterLite[]>([]);

  // Excel-style blank entry row at the top.
  const [nDate, setNDate] = useState<string>(todayStr());
  const [nActivity, setNActivity] = useState<string>(ACTIVITY_TYPES[0]);
  const [nNote, setNNote] = useState<string>("");
  const [nLawyer, setNLawyer] = useState<string>(ATTORNEYS[0]);
  const [nDur, setNDur] = useState<string>("");
  const [loggedPeriod, setLoggedPeriod] = useState<string>("all");

  function commitNew() {
    const hrs = parseFloat(nDur);
    if (isNaN(hrs) || hrs <= 0) return;
    onAddEntry({
      activity: nActivity,
      lawyer: nLawyer,
      note: nNote,
      seconds: Math.round(hrs * 3600),
      date: nDate,
    });
    setNNote("");
    setNDur("");
    setNDate(todayStr());
    setNActivity(ACTIVITY_TYPES[0]);
  }

  useEffect(() => {
    supabase
      .from("matters")
      .select("id,name")
      .order("name")
      .then(({ data }) => setMatters((data as MatterLite[]) ?? []));
  }, []);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function bulkUpdate(changes: Partial<TimeEntry>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    await supabase.from("time_entries").update(changes).in("id", ids);
    setSelected(new Set());
    onChanged();
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    await supabase.from("time_entries").delete().in("id", ids);
    setSelected(new Set());
    onChanged();
  }

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
      <div className="te-summary">
        {stat("Total", total)}
        {stat("Billable", billable, "ok")}
        {stat("Non-billable", nonBillable, "muted")}
        {stat("Invoiced", invoiced, "ok")}
        {stat("Un-invoiced", unInvoiced, "warn")}
      </div>
      <p className="te-total-hours">
        Total logged:{" "}
        <strong>
          {(
            entries
              .filter(
                (e) => new Date(e.logged_at).getTime() >= periodStart(loggedPeriod),
              )
              .reduce((s, e) => s + e.duration_seconds, 0) / 3600
          ).toFixed(2)}
        </strong>{" "}
        hour(s)
        <select
          className="inline-select te-period"
          value={loggedPeriod}
          onChange={(e) => setLoggedPeriod(e.target.value)}
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </p>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <label>
            Date
            <input
              type="date"
              onChange={(e) => {
                if (e.target.value)
                  bulkUpdate({
                    logged_at: new Date(e.target.value + "T12:00:00").toISOString(),
                  });
              }}
            />
          </label>
          <label>
            Move to matter
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) bulkUpdate({ matter_id: e.target.value });
                e.target.value = "";
              }}
            >
              <option value="">Select…</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="ghost sm" onClick={() => bulkUpdate({ billable: true })}>Billable</button>
          <button type="button" className="ghost sm" onClick={() => bulkUpdate({ billable: false })}>Non-billable</button>
          <button type="button" className="ghost sm" onClick={() => bulkUpdate({ invoiced: true })}>Invoiced</button>
          <button type="button" className="ghost sm danger" onClick={bulkDelete}>Delete</button>
          <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      <div className="table-wrap" style={{ border: "none" }}>
          <table className="data-table te-table">
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={entries.length > 0 && entries.every((e) => selected.has(e.id))}
                    onChange={(ev) =>
                      setSelected(ev.target.checked ? new Set(entries.map((e) => e.id)) : new Set())
                    }
                    aria-label="Select all"
                  />
                </th>
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
              {/* Excel-style blank row: fill it in and press Enter to add */}
              <tr className="te-new-row" onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) commitNew(); }}>
                <td className="check-col" aria-hidden="true"></td>
                <td>
                  <input type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} aria-label="New entry date" />
                </td>
                <td>
                  <select value={nActivity} onChange={(e) => setNActivity(e.target.value)} aria-label="New entry activity">
                    {ACTIVITY_TYPES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <textarea
                    className="te-grow"
                    rows={1}
                    value={nNote}
                    placeholder="Description…"
                    aria-label="New entry description"
                    onChange={(e) => {
                      setNNote(e.target.value);
                      e.target.style.height = "auto";
                      e.target.style.height = e.target.scrollHeight + "px";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) e.preventDefault();
                    }}
                  />
                </td>
                <td>
                  <select value={nLawyer} onChange={(e) => setNLawyer(e.target.value)} aria-label="New entry lawyer">
                    {ATTORNEYS.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" step="0.25" min={0} value={nDur} placeholder="hrs" onChange={(e) => setNDur(e.target.value)} onBlur={commitNew} aria-label="New entry hours" />
                </td>
                <td colSpan={2} className="te-new-hint">press Enter to add</td>
              </tr>
              {entries.map((e) => (
                <tr key={e.id} className={selected.has(e.id) ? "row-selected" : undefined}>
                  <td className="check-col">
                    <input
                      type="checkbox"
                      checked={selected.has(e.id)}
                      onChange={() => toggleRow(e.id)}
                      aria-label="Select entry"
                    />
                  </td>
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
    </>
  );
}
