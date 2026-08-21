"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Invoice, Matter, TimeEntry, InvoiceBucket } from "@/lib/types";
import { invoiceBucket } from "@/lib/types";
import Disclaimer from "../Disclaimer";
import TimesheetTab from "./TimesheetTab";
import { useUndo } from "../UndoProvider";

const INVOICE_BUCKETS: { key: InvoiceBucket; label: string }[] = [
  { key: "created", label: "Created" },
  { key: "sent", label: "Sent" },
  { key: "viewed", label: "Viewed" },
  { key: "overdue", label: "Overdue" },
  { key: "paid", label: "Paid" },
];

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}
const usd = (n: number, dp = 2) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp })}`;

export default function BillingPage() {
  const { pushUndo } = useUndo();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"invoices" | "time" | "timesheet">("invoices");
  const [invFilter, setInvFilter] = useState<InvoiceBucket | "all">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selEntries, setSelEntries] = useState<Set<string>>(new Set());

  async function load() {
    const [{ data: inv }, { data: e }, { data: m }, { data: c }] =
      await Promise.all([
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("time_entries").select("*").order("logged_at", { ascending: false }),
        supabase.from("matters").select("*"),
        supabase.from("clients").select("*"),
      ]);
    setInvoices((inv as Invoice[]) ?? []);
    setEntries((e as TimeEntry[]) ?? []);
    setMatters((m as Matter[]) ?? []);
    setClients((c as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "timesheet" || t === "time" || t === "invoices") setTab(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matterName = (id: string | null) =>
    matters.find((m) => m.id === id)?.name ?? "—";
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "—";

  const total = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + (i.amount ?? 0), 0);
  // Time-entries filters: period + matter + user (shows everyone by default).
  const [timePeriod, setTimePeriod] = useState<"all" | "day" | "week" | "month">("all");
  const [timeMatter, setTimeMatter] = useState<string>("all");
  const [timeUser, setTimeUser] = useState<string>("all");
  const timeUsers = useMemo(
    () => Array.from(new Set(entries.map((e) => e.lawyer).filter(Boolean))).sort() as string[],
    [entries],
  );
  const shownEntries = useMemo(() => {
    const now = new Date();
    const cutoff = new Date(now);
    if (timePeriod === "day") cutoff.setDate(now.getDate() - 1);
    else if (timePeriod === "week") cutoff.setDate(now.getDate() - 7);
    else if (timePeriod === "month") cutoff.setMonth(now.getMonth() - 1);
    return entries.filter((e) => {
      if (timeMatter !== "all" && e.matter_id !== timeMatter) return false;
      if (timeUser !== "all" && e.lawyer !== timeUser) return false;
      if (timePeriod !== "all" && new Date(e.logged_at) < cutoff) return false;
      return true;
    });
  }, [entries, timePeriod, timeMatter, timeUser]);
  const totalSeconds = useMemo(
    () => shownEntries.reduce((s, e) => s + e.duration_seconds, 0),
    [shownEntries],
  );

  const bucketCounts = useMemo(() => {
    const c: Record<InvoiceBucket, number> = {
      created: 0, sent: 0, viewed: 0, overdue: 0, paid: 0,
    };
    for (const i of invoices) c[invoiceBucket(i)]++;
    return c;
  }, [invoices]);

  const shownInvoices = useMemo(
    () => (invFilter === "all" ? invoices : invoices.filter((i) => invoiceBucket(i) === invFilter)),
    [invoices, invFilter],
  );

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allShownSelected = shownInvoices.length > 0 && shownInvoices.every((i) => selected.has(i.id));
  const toggleAllShown = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownInvoices.forEach((i) => next.delete(i.id));
      else shownInvoices.forEach((i) => next.add(i.id));
      return next;
    });
  async function bulkSetStatus(status: string) {
    const ids = [...selected];
    if (ids.length === 0) return;
    const patch: Record<string, unknown> = { status };
    const nowIso = new Date().toISOString();
    if (status === "sent") patch.sent_at = nowIso;
    if (status === "viewed") patch.viewed_at = nowIso;
    await supabase.from("invoices").update(patch).in("id", ids);
    setSelected(new Set());
    load();
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} invoice${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    await supabase.from("invoice_items").delete().in("invoice_id", ids);
    await supabase.from("invoices").delete().in("id", ids);
    setSelected(new Set());
    load();
  }

  const toggleSelEntry = (id: string) =>
    setSelEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  const allEntriesSelected = shownEntries.length > 0 && shownEntries.every((e) => selEntries.has(e.id));
  const toggleAllEntries = () =>
    setSelEntries(() => {
      if (allEntriesSelected) return new Set();
      return new Set(shownEntries.map((e) => e.id));
    });
  async function bulkEntries(patch: Record<string, unknown>) {
    const ids = [...selEntries];
    if (ids.length === 0) return;
    await supabase.from("time_entries").update(patch).in("id", ids);
    setSelEntries(new Set());
    load();
  }
  async function bulkDeleteEntries() {
    const ids = [...selEntries];
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} time ${ids.length === 1 ? "entry" : "entries"}? This cannot be undone.`)) return;
    await supabase.from("time_entries").delete().in("id", ids);
    setSelEntries(new Set());
    load();
  }

  async function deleteInvoice(id: string, number: string | null) {
    if (!window.confirm(`Delete invoice ${number || ""}?`)) return;
    const { data: inv } = await supabase.from("invoices").select("*").eq("id", id).single();
    const { data: its } = await supabase.from("invoice_items").select("*").eq("invoice_id", id);
    await supabase.from("invoice_items").delete().eq("invoice_id", id);
    await supabase.from("invoices").delete().eq("id", id);
    if (inv) {
      pushUndo(`Deleted invoice ${number || ""}`.trim(), async () => {
        await supabase.from("invoices").insert(inv);
        if (its && (its as unknown[]).length) await supabase.from("invoice_items").insert(its);
        load();
      });
    }
    load();
  }
  async function deleteEntry(id: string) {
    if (!window.confirm("Delete this time entry?")) return;
    const row = entries.find((e) => e.id === id);
    await supabase.from("time_entries").delete().eq("id", id);
    if (row) {
      pushUndo("Deleted time entry", async () => {
        await supabase.from("time_entries").insert(row);
        load();
      });
    }
    load();
  }

  return (
    <div>
      <h1 className="page-title">Billing Dashboard</h1>

      <div className="doc-tabs" style={{ margin: "1.1rem 0" }}>
        <button
          type="button"
          className={tab === "invoices" ? "active" : undefined}
          onClick={() => setTab("invoices")}
        >
          Invoices <span className="count-badge">{invoices.length}</span>
        </button>
        <button
          type="button"
          className={tab === "time" ? "active" : undefined}
          onClick={() => setTab("time")}
        >
          Time Entries <span className="count-badge">{entries.length}</span>
        </button>
        <button
          type="button"
          className={tab === "timesheet" ? "active" : undefined}
          onClick={() => setTab("timesheet")}
        >
          Timesheet
        </button>
      </div>

      {tab === "timesheet" ? (
        <TimesheetTab onSaved={load} />
      ) : tab === "invoices" ? (
        <>
          <div className="stat-row" style={{ marginBottom: "1.25rem" }}>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{usd(total, 0)}</span>
              <span className="stat-label">Invoiced</span>
            </div>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{usd(outstanding, 0)}</span>
              <span className="stat-label">Outstanding</span>
            </div>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{invoices.length}</span>
              <span className="stat-label">Invoices</span>
            </div>
          </div>

          <div className="inv-filter-row">
            <button
              type="button"
              className={`inv-chip${invFilter === "all" ? " on" : ""}`}
              onClick={() => setInvFilter("all")}
            >
              All <span className="inv-chip-count">{invoices.length}</span>
            </button>
            {INVOICE_BUCKETS.map((b) => (
              <button
                key={b.key}
                type="button"
                className={`inv-chip inv-chip-${b.key}${invFilter === b.key ? " on" : ""}`}
                onClick={() => setInvFilter(b.key)}
              >
                {b.label} <span className="inv-chip-count">{bucketCounts[b.key]}</span>
              </button>
            ))}
          </div>

          {selected.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{selected.size} selected</span>
              <button type="button" className="ghost sm" onClick={() => bulkSetStatus("sent")}>Mark sent</button>
              <button type="button" className="ghost sm" onClick={() => bulkSetStatus("viewed")}>Mark viewed</button>
              <button type="button" className="ghost sm" onClick={() => bulkSetStatus("paid")}>Mark paid</button>
              <button type="button" className="ghost sm" onClick={() => bulkSetStatus("created")}>Mark created</button>
              <button type="button" className="ghost sm bulk-danger" onClick={bulkDelete}>Delete</button>
              <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {loading ? (
            <p className="muted-line">Loading…</p>
          ) : shownInvoices.length === 0 ? (
            <p className="muted-line">{invoices.length === 0 ? "No invoices yet." : "No invoices in this status."}</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="check-col">
                      <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all" />
                    </th>
                    <th>Invoice</th>
                    <th>Client</th>
                    <th>Matter</th>
                    <th>Amount</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {shownInvoices.map((i) => {
                    const bucket = invoiceBucket(i);
                    return (
                    <tr key={i.id} className={selected.has(i.id) ? "row-selected" : undefined}>
                      <td className="check-col">
                        <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggleSel(i.id)} aria-label={`Select ${i.number || "invoice"}`} />
                      </td>
                      <td className="strong-cell">
                        <Link href={`/dashboard/invoices/${i.id}`} className="row-link">
                          {i.number || "—"}
                        </Link>
                      </td>
                      <td>{clientName(i.client_id)}</td>
                      <td>
                        {i.matter_id ? (
                          <Link
                            href={`/dashboard/matters/${i.matter_id}`}
                            className="row-link"
                          >
                            {matterName(i.matter_id)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{i.amount != null ? usd(i.amount) : "—"}</td>
                      <td>
                        {i.due_date
                          ? new Date(i.due_date).toLocaleDateString()
                          : "—"}
                      </td>
                      <td>
                        <span className={`pill inv-${bucket}`}>{bucket}</span>
                      </td>
                      <td className="ct-actions">
                        <button type="button" className="ct-del" title="Delete invoice" aria-label="Delete invoice" onClick={() => deleteInvoice(i.id, i.number)}>✕</button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: "1.25rem" }}>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{shownEntries.length}</span>
              <span className="stat-label">Entries</span>
            </div>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{(totalSeconds / 3600).toFixed(1)}</span>
              <span className="stat-label">Total Hours</span>
            </div>
          </div>

          <div className="ts-summary-head" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "0.6rem" }}>
            <div className="filter-row" style={{ margin: 0 }}>
              {([["all", "All time"], ["day", "Today"], ["week", "This week"], ["month", "This month"]] as const).map(([v, l]) => (
                <button key={v} type="button" className={`filter-chip${timePeriod === v ? " active" : ""}`} onClick={() => setTimePeriod(v)}>{l}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <select className="inline-select" value={timeUser} onChange={(e) => setTimeUser(e.target.value)}>
                <option value="all">All users</option>
                {timeUsers.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
              <select className="inline-select" value={timeMatter} onChange={(e) => setTimeMatter(e.target.value)}>
                <option value="all">All matters</option>
                {matters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          {selEntries.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{selEntries.size} selected</span>
              <button type="button" className="ghost sm" onClick={() => bulkEntries({ billable: true })}>Mark billable</button>
              <button type="button" className="ghost sm" onClick={() => bulkEntries({ billable: false })}>Mark non-billable</button>
              <button type="button" className="ghost sm bulk-danger" onClick={bulkDeleteEntries}>Delete</button>
              <button type="button" className="ghost sm" onClick={() => setSelEntries(new Set())}>Clear</button>
            </div>
          )}

          {loading ? (
            <p className="muted-line">Loading…</p>
          ) : shownEntries.length === 0 ? (
            <p className="muted-line">No time entries match these filters.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="check-col">
                      <input type="checkbox" checked={allEntriesSelected} onChange={toggleAllEntries} aria-label="Select all" />
                    </th>
                    <th>Date</th>
                    <th>Matter</th>
                    <th>Activity</th>
                    <th>Description</th>
                    <th>User</th>
                    <th>Duration</th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {shownEntries.map((e) => (
                    <tr key={e.id} className={selEntries.has(e.id) ? "row-selected" : undefined}>
                      <td className="check-col">
                        <input type="checkbox" checked={selEntries.has(e.id)} onChange={() => toggleSelEntry(e.id)} aria-label="Select entry" />
                      </td>
                      <td>{new Date(e.logged_at).toLocaleDateString()}</td>
                      <td className="strong-cell">
                        {e.matter_id ? (
                          <Link
                            href={`/dashboard/matters/${e.matter_id}`}
                            className="row-link"
                          >
                            {matterName(e.matter_id)}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>{e.activity || "—"}</td>
                      <td>{e.note || "—"}</td>
                      <td>{e.lawyer}</td>
                      <td>{fmtHm(e.duration_seconds)}</td>
                      <td className="ct-actions">
                        <button type="button" className="ct-del" title="Delete entry" aria-label="Delete entry" onClick={() => deleteEntry(e.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
