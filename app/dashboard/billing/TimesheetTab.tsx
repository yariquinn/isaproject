"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_TYPES, ATTORNEYS } from "@/lib/types";
import { usePortal } from "../PortalProvider";

type MatterLite = { id: string; name: string; client_id: string | null };
type Draft = {
  matter_id: string;
  matterQuery: string;
  date: string;
  activity: string;
  note: string;
  lawyer: string;
  hours: string;
  billable: boolean;
};

const ROW_COUNT = 9;
const todayStr = () => new Date().toISOString().slice(0, 10);
const blank = (lawyer: string): Draft => ({
  matter_id: "",
  matterQuery: "",
  date: todayStr(),
  activity: ACTIVITY_TYPES[0],
  note: "",
  lawyer,
  hours: "",
  billable: true,
});

// Searchable matter picker (no dropdown-select).
function MatterSearch({
  value,
  query,
  matters,
  onPick,
  onQuery,
}: {
  value: string;
  query: string;
  matters: MatterLite[];
  onPick: (id: string, name: string) => void;
  onQuery: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const q = query.trim().toLowerCase();
  const hits = q === ""
    ? matters.slice(0, 12)
    : matters.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 12);
  return (
    <div className="ts-matter" ref={ref}>
      <input
        value={query}
        placeholder="Search matter…"
        onFocus={() => setOpen(true)}
        onChange={(e) => { onQuery(e.target.value); if (value) onPick("", e.target.value); setOpen(true); }}
      />
      {open && hits.length > 0 && (
        <div className="ts-matter-menu">
          {hits.map((m) => (
            <button
              key={m.id}
              type="button"
              className="ts-matter-hit"
              onClick={() => { onPick(m.id, m.name); setOpen(false); }}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimesheetTab({ onSaved }: { onSaved: () => void }) {
  const { userName } = usePortal();
  const defaultLawyer = (ATTORNEYS as readonly string[]).includes(userName)
    ? userName
    : ATTORNEYS[0];
  const [matters, setMatters] = useState<MatterLite[]>([]);
  const [rows, setRows] = useState<Draft[]>(() =>
    Array.from({ length: ROW_COUNT }, () => blank(defaultLawyer)),
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  useEffect(() => {
    supabase
      .from("matters")
      .select("id,name,client_id")
      .eq("status", "open")
      .order("name")
      .then(({ data }) => setMatters((data as MatterLite[]) ?? []));
  }, []);

  const update = (i: number, patch: Partial<Draft>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, blank(defaultLawyer)]);

  const validRows = rows.filter((r) => r.matter_id && parseFloat(r.hours) > 0);

  // Running totals reflect what's typed in the grid right now.
  const totalHours = validRows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
  const billableHours = validRows.filter((r) => r.billable).reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
  const nonbillableHours = totalHours - billableHours;
  const fmtH = (h: number) => `${h.toFixed(2)}h`;

  async function saveAll() {
    if (validRows.length === 0) return;
    setSaving(true);
    for (const r of validRows) {
      const secs = Math.round(parseFloat(r.hours) * 3600);
      const m = matters.find((x) => x.id === r.matter_id);
      await supabase.from("time_entries").insert({
        matter_id: r.matter_id,
        activity: r.activity,
        lawyer: r.lawyer || ATTORNEYS[0],
        duration_seconds: secs,
        note: r.note.trim() || null,
        billable: r.billable,
        invoiced: false,
        logged_at: new Date(r.date + "T12:00:00").toISOString(),
      });
      await supabase.from("activity_log").insert({
        kind: "time_logged",
        matter_id: r.matter_id,
        client_id: m?.client_id ?? null,
        description: `${userName} logged ${r.hours}h to ${m?.name ?? "a matter"} (${r.activity})`,
      });
    }
    setSaving(false);
    setSavedMsg(
      `Saved ${validRows.length} ${validRows.length === 1 ? "entry" : "entries"}.`,
    );
    setRows(Array.from({ length: ROW_COUNT }, () => blank(defaultLawyer)));
    onSaved();
    setTimeout(() => setSavedMsg(""), 4000);
  }

  return (
    <>
      <div className="te-summary">
        <div className="te-stat">
          <span className="te-stat-label">Time logged</span>
          <span className="te-stat-amt">{fmtH(totalHours)}</span>
          <span className="te-stat-hrs">{validRows.length} entr{validRows.length === 1 ? "y" : "ies"}</span>
        </div>
        <div className="te-stat ok">
          <span className="te-stat-label">Billable</span>
          <span className="te-stat-amt">{fmtH(billableHours)}</span>
          <span className="te-stat-hrs">{validRows.filter((r) => r.billable).length} entr{validRows.filter((r) => r.billable).length === 1 ? "y" : "ies"}</span>
        </div>
        <div className="te-stat warn">
          <span className="te-stat-label">Non-billable</span>
          <span className="te-stat-amt">{fmtH(nonbillableHours)}</span>
          <span className="te-stat-hrs">{validRows.filter((r) => !r.billable).length} entr{validRows.filter((r) => !r.billable).length === 1 ? "y" : "ies"}</span>
        </div>
      </div>

      <div className="ts-head">
        <p className="muted-line">
          Enter time across matters, then save it all at once.
        </p>
        <div className="ts-actions">
          {savedMsg && <span className="ts-saved">{savedMsg}</span>}
          <button className="ghost sm" type="button" onClick={addRow}>
            + Add row
          </button>
          <button
            className="btn"
            type="button"
            onClick={saveAll}
            disabled={saving || validRows.length === 0}
          >
            {saving
              ? "Saving…"
              : `Save${validRows.length ? " " + validRows.length : ""} ${
                  validRows.length === 1 ? "entry" : "entries"
                }`}
          </button>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table ts-table">
          <thead>
            <tr>
              <th>Matter</th>
              <th>Date</th>
              <th>Activity</th>
              <th>Description</th>
              <th>User</th>
              <th>Hours</th>
              <th>Billable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <MatterSearch
                    value={r.matter_id}
                    query={r.matterQuery}
                    matters={matters}
                    onPick={(id, name) => update(i, { matter_id: id, matterQuery: name })}
                    onQuery={(qq) => update(i, { matterQuery: qq })}
                  />
                </td>
                <td>
                  <input
                    type="date"
                    value={r.date}
                    onChange={(e) => update(i, { date: e.target.value })}
                  />
                </td>
                <td>
                  <select
                    value={r.activity}
                    onChange={(e) => update(i, { activity: e.target.value })}
                  >
                    {ACTIVITY_TYPES.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    value={r.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    placeholder="Description…"
                  />
                </td>
                <td>
                  <select
                    value={r.lawyer}
                    onChange={(e) => update(i, { lawyer: e.target.value })}
                  >
                    {ATTORNEYS.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    step="0.25"
                    min={0}
                    value={r.hours}
                    onChange={(e) => update(i, { hours: e.target.value })}
                    placeholder="0.0"
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={r.billable}
                    onChange={(e) => update(i, { billable: e.target.checked })}
                    aria-label="Billable"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
