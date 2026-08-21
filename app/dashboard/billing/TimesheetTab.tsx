"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

type Period = "day" | "week" | "month" | "year" | "all";
type Compare = "none" | "prev" | "yoy";
const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];
function periodStart(p: Period): number {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "day") return d.getTime();
  if (p === "week") { const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (p === "year") return new Date(d.getFullYear(), 0, 1).getTime();
  return 0;
}
const yearBack = (t: number) => { const d = new Date(t); d.setFullYear(d.getFullYear() - 1); return d.getTime(); };

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
  const [entries, setEntries] = useState<{ duration_seconds: number; billable: boolean; logged_at: string }[]>([]);
  const [period, setPeriod] = useState<Period>("month");
  const [compare, setCompare] = useState<Compare>("none");

  const loadEntries = () => {
    supabase.from("time_entries").select("duration_seconds,billable,logged_at")
      .then(({ data }) => setEntries((data as { duration_seconds: number; billable: boolean; logged_at: string }[]) ?? []));
  };
  useEffect(() => {
    supabase
      .from("matters")
      .select("id,name,client_id")
      .eq("status", "open")
      .order("name")
      .then(({ data }) => setMatters((data as MatterLite[]) ?? []));
    loadEntries();
  }, []);

  // Logged time over the selected period (from saved entries), with comparison.
  const stats = useMemo(() => {
    const now = Date.now();
    const curStart = periodStart(period);
    const sum = (s: number, e: number) => {
      let total = 0, billable = 0, nCur = 0, nBill = 0;
      for (const x of entries) {
        const t = new Date(x.logged_at).getTime();
        if (t < s || t >= e) continue;
        const h = x.duration_seconds / 3600;
        total += h; nCur++;
        if (x.billable) { billable += h; nBill++; }
      }
      return { total, billable, nonbill: total - billable, nCur, nBill };
    };
    const cur = sum(curStart, now + 1);
    let prev: ReturnType<typeof sum> | null = null;
    if (compare === "prev" && period !== "all") {
      const span = now - curStart;
      prev = sum(curStart - span, curStart);
    } else if (compare === "yoy") {
      prev = sum(yearBack(curStart), yearBack(now));
    }
    return { cur, prev };
  }, [entries, period, compare]);
  const delta = (c: number, p: number | undefined) =>
    p == null ? null : p > 0 ? Math.round(((c - p) / p) * 100) : c > 0 ? 100 : null;

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
    loadEntries();
    setTimeout(() => setSavedMsg(""), 4000);
  }

  const deltaEl = (c: number, p: number | undefined) => {
    const d = delta(c, p);
    if (d == null) return null;
    return <span className={`te-stat-delta ${d >= 0 ? "up" : "down"}`}>{d >= 0 ? "+" : ""}{d}% {compare === "yoy" ? "vs last yr" : "vs prev"}</span>;
  };

  return (
    <>
      <div className="ts-summary-head">
        <select className="inline-select" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
          {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <select className="inline-select" value={compare} onChange={(e) => setCompare(e.target.value as Compare)} disabled={period === "all"}>
          <option value="none">No comparison</option>
          <option value="prev">vs previous period</option>
          <option value="yoy">vs last year</option>
        </select>
      </div>
      <div className="te-summary">
        <div className="te-stat">
          <span className="te-stat-label">Time logged</span>
          <span className="te-stat-amt">{fmtH(stats.cur.total)}</span>
          <span className="te-stat-hrs">{stats.cur.nCur} entr{stats.cur.nCur === 1 ? "y" : "ies"}</span>
          {compare !== "none" && deltaEl(stats.cur.total, stats.prev?.total)}
        </div>
        <div className="te-stat ok">
          <span className="te-stat-label">Billable</span>
          <span className="te-stat-amt">{fmtH(stats.cur.billable)}</span>
          <span className="te-stat-hrs">{stats.cur.nBill} entr{stats.cur.nBill === 1 ? "y" : "ies"}</span>
          {compare !== "none" && deltaEl(stats.cur.billable, stats.prev?.billable)}
        </div>
        <div className="te-stat warn">
          <span className="te-stat-label">Non-billable</span>
          <span className="te-stat-amt">{fmtH(stats.cur.nonbill)}</span>
          <span className="te-stat-hrs">{stats.cur.nCur - stats.cur.nBill} entr{(stats.cur.nCur - stats.cur.nBill) === 1 ? "y" : "ies"}</span>
          {compare !== "none" && deltaEl(stats.cur.nonbill, stats.prev?.nonbill)}
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
