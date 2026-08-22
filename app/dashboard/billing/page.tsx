"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Client, Invoice, Matter, TimeEntry, InvoiceBucket } from "@/lib/types";
import { ATTORNEYS, ACTIVITY_TYPES, invoiceBucket, personColor } from "@/lib/types";
import InvoiceEditor from "../InvoiceEditor";
import TimesheetTab from "./TimesheetTab";
import { useUndo } from "../UndoProvider";
import { useConfirm } from "../ConfirmProvider";
import { usePortal } from "../PortalProvider";

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
const initialsOf = (n: string | null | undefined) =>
  (n || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";

const EMPTY_TIME = {
  matter_id: "",
  lawyer: ATTORNEYS[0] as string,
  activity: ACTIVITY_TYPES[0] as string,
  note: "",
  logged_at: new Date().toISOString().slice(0, 10),
  hours: "",
  billable: true,
};

function BillingInner() {
  const { pushUndo } = useUndo();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const { canManageBilling } = usePortal();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"dashboard" | "invoices" | "time">("dashboard");
  const [invFilter, setInvFilter] = useState<InvoiceBucket | "all">("all");
  const [invView, setInvView] = useState<"preview" | "list">("list");
  const [invQuery, setInvQuery] = useState("");
  type InvSortKey = "date" | "number" | "client" | "matter" | "amount" | "due" | "status";
  const [invSort, setInvSort] = useState<{ key: InvSortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const toggleInvSort = (key: InvSortKey) =>
    setInvSort((s) => (s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  const invSortArrow = (key: InvSortKey) => (invSort.key !== key ? "↕" : invSort.dir === 1 ? "↑" : "↓");
  const [selInvoiceId, setSelInvoiceId] = useState<string | null>(null);
  const [selEntries, setSelEntries] = useState<Set<string>>(new Set());
  const [addTimeOpen, setAddTimeOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMsg, setBatchMsg] = useState("");
  const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
  const [batchStart, setBatchStart] = useState(firstOfMonth());
  const [batchEnd, setBatchEnd] = useState(new Date().toISOString().slice(0, 10));
  const [timeForm, setTimeForm] = useState(EMPTY_TIME);
  const [matterQuery, setMatterQuery] = useState("");
  const [matterMenuOpen, setMatterMenuOpen] = useState(false);
  const [savingTime, setSavingTime] = useState(false);
  const openAddTime = () => { setTimeForm(EMPTY_TIME); setMatterQuery(""); setAddTimeOpen(true); };

  useEffect(() => {
    try {
      const v = localStorage.getItem("invView");
      if (v === "list" || v === "preview") setInvView(v);
    } catch { /* ignore */ }
  }, []);
  const changeInvView = (v: "preview" | "list") => {
    setInvView(v);
    try { localStorage.setItem("invView", v); } catch { /* ignore */ }
  };

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
  }, []);

  // React to sidebar navigation between ?tab=invoices / ?tab=time / (none):
  // these links share this route, so the tab must follow the query string.
  useEffect(() => {
    const t = searchParams.get("tab");
    setTab(t === "time" || t === "invoices" ? t : "dashboard");
  }, [searchParams]);

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
  const [timeMatterQuery, setTimeMatterQuery] = useState("");
  const [timeMatterOpen, setTimeMatterOpen] = useState(false);
  const [timeUser, setTimeUser] = useState<string>("all");
  const [timeQuery, setTimeQuery] = useState("");
  const [timeInvoiced, setTimeInvoiced] = useState<"all" | "invoiced" | "uninvoiced">("all");
  const [timeSort, setTimeSort] = useState<{ key: "date" | "invoiced"; dir: 1 | -1 } | null>(null);
  const toggleTimeSort = (key: "date" | "invoiced") =>
    setTimeSort((s) => (s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const timeSortArrow = (key: "date" | "invoiced") =>
    timeSort?.key !== key ? "↕" : timeSort.dir === 1 ? "↑" : "↓";
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
    const q = timeQuery.trim().toLowerCase();
    const list = entries.filter((e) => {
      if (timeMatter !== "all" && e.matter_id !== timeMatter) return false;
      if (timeUser !== "all" && e.lawyer !== timeUser) return false;
      if (timeInvoiced === "invoiced" && !e.invoiced) return false;
      if (timeInvoiced === "uninvoiced" && e.invoiced) return false;
      if (timePeriod !== "all" && new Date(e.logged_at) < cutoff) return false;
      if (q) {
        const hay = [e.note, e.activity, e.lawyer, matters.find((m) => m.id === e.matter_id)?.name]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (timeSort) {
      list.sort((a, b) => {
        let cmp = 0;
        if (timeSort.key === "date") cmp = new Date(a.logged_at).getTime() - new Date(b.logged_at).getTime();
        else if (timeSort.key === "invoiced") cmp = (a.invoiced ? 1 : 0) - (b.invoiced ? 1 : 0);
        return cmp * timeSort.dir;
      });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, matters, timePeriod, timeMatter, timeUser, timeQuery, timeInvoiced, timeSort]);
  const totalSeconds = useMemo(
    () => shownEntries.reduce((s, e) => s + e.duration_seconds, 0),
    [shownEntries],
  );
  const billableSeconds = useMemo(
    () => shownEntries.filter((e) => e.billable).reduce((s, e) => s + e.duration_seconds, 0),
    [shownEntries],
  );
  const nonBillableSeconds = totalSeconds - billableSeconds;

  const bucketCounts = useMemo(() => {
    const c: Record<InvoiceBucket, number> = {
      created: 0, sent: 0, viewed: 0, overdue: 0, paid: 0,
    };
    for (const i of invoices) c[invoiceBucket(i)]++;
    return c;
  }, [invoices]);

  const shownInvoices = useMemo(() => {
    const q = invQuery.trim().toLowerCase();
    return invoices.filter((i) => {
      if (invFilter !== "all" && invoiceBucket(i) !== invFilter) return false;
      if (q) {
        const hay = [i.number, clientName(i.client_id), matterName(i.matter_id)].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, invFilter, invQuery, clients, matters]);

  const sortedInvoices = useMemo(() => {
    const dir = invSort.dir;
    const val = (i: Invoice): string | number => {
      switch (invSort.key) {
        case "date": return i.created_at ? new Date(i.created_at).getTime() : 0;
        case "number": return (i.number || "").toLowerCase();
        case "client": return clientName(i.client_id).toLowerCase();
        case "matter": return matterName(i.matter_id).toLowerCase();
        case "amount": return i.amount ?? 0;
        case "due": return i.due_date ? new Date(i.due_date).getTime() : 0;
        case "status": return invoiceBucket(i);
      }
    };
    return [...shownInvoices].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownInvoices, invSort, clients, matters]);

  // Summary figures for the list view's three panels.
  const invSummary = useMemo(() => {
    let openAmt = 0, openN = 0, overdueAmt = 0, overdueN = 0, paidAmt = 0, paidN = 0;
    for (const i of invoices) {
      const amt = i.amount ?? 0;
      const b = invoiceBucket(i);
      if (b === "paid") { paidAmt += amt; paidN++; }
      else { openAmt += amt; openN++; }
      if (b === "overdue") { overdueAmt += amt; overdueN++; }
    }
    return { openAmt, openN, overdueAmt, overdueN, paidAmt, paidN };
  }, [invoices]);

  // Matter picker (searchable) for the Add Time Entry modal.
  const matterHits = useMemo(() => {
    const q = matterQuery.trim().toLowerCase();
    const list = q === "" ? matters : matters.filter((m) => m.name.toLowerCase().includes(q));
    return list.slice(0, 10);
  }, [matters, matterQuery]);
  // Searchable matter filter for the Time Entries list.
  const timeMatterHits = useMemo(() => {
    const q = timeMatterQuery.trim().toLowerCase();
    const list = q === "" ? matters : matters.filter((m) => m.name.toLowerCase().includes(q));
    return list.slice(0, 12);
  }, [matters, timeMatterQuery]);

  // Keep a valid selection whenever the visible invoice list changes.
  useEffect(() => {
    if (tab !== "invoices") return;
    if (shownInvoices.length === 0) { setSelInvoiceId(null); return; }
    if (!selInvoiceId || !shownInvoices.some((i) => i.id === selInvoiceId)) {
      setSelInvoiceId(shownInvoices[0].id);
    }
  }, [tab, shownInvoices, selInvoiceId]);

  async function saveTimeEntry() {
    const hrs = parseFloat(timeForm.hours);
    if (!timeForm.matter_id || !hrs || hrs <= 0) return;
    setSavingTime(true);
    await supabase.from("time_entries").insert({
      matter_id: timeForm.matter_id,
      lawyer: timeForm.lawyer,
      activity: timeForm.activity,
      note: timeForm.note || null,
      duration_seconds: Math.round(hrs * 3600),
      billable: timeForm.billable,
      logged_at: new Date(timeForm.logged_at + "T12:00:00").toISOString(),
    });
    setSavingTime(false);
    setAddTimeOpen(false);
    setTimeForm(EMPTY_TIME);
    setMatterQuery("");
    load();
  }

  // Batch billing: for every matter with un-invoiced billable time in the chosen
  // date range, generate one draft invoice (line items + mark those entries invoiced).
  async function runBatchBilling() {
    setBatchBusy(true);
    setBatchMsg("");
    const { data: teData } = await supabase
      .from("time_entries")
      .select("*")
      .eq("invoiced", false)
      .eq("billable", true)
      .gte("logged_at", batchStart + "T00:00:00")
      .lte("logged_at", batchEnd + "T23:59:59");
    const te = (teData as TimeEntry[]) ?? [];
    // Group un-invoiced entries by matter.
    const byMatter = new Map<string, TimeEntry[]>();
    for (const e of te) {
      if (!e.matter_id) continue;
      if (!byMatter.has(e.matter_id)) byMatter.set(e.matter_id, []);
      byMatter.get(e.matter_id)!.push(e);
    }
    if (byMatter.size === 0) {
      setBatchMsg("No un-invoiced billable time in that range.");
      setBatchBusy(false);
      return;
    }
    // Next invoice number.
    const { data: allInv } = await supabase.from("invoices").select("number");
    let maxNum = 1000;
    for (const r of (allInv as { number: string | null }[] | null) ?? []) {
      const mm = /(\d+)/.exec(r.number || "");
      if (mm) maxNum = Math.max(maxNum, parseInt(mm[1], 10));
    }
    const due = new Date();
    due.setDate(due.getDate() + 30);
    const dueStr = due.toISOString().slice(0, 10);
    let created = 0;
    for (const [matterId, entries] of byMatter) {
      const m = matters.find((x) => x.id === matterId);
      const isFlat = m?.rate_type === "flat";
      const hourly = isFlat ? 0 : (m?.hourly_rate ?? 0);
      const rows = entries.map((e) => {
        const hrs = Number((e.duration_seconds / 3600).toFixed(2));
        const r = isFlat ? 0 : (e.rate ?? hourly);
        return {
          item_date: e.logged_at.slice(0, 10),
          description: [e.activity, e.note].filter(Boolean).join(" — "),
          quantity: hrs,
          rate: r,
          amount: Number((hrs * r).toFixed(2)),
        };
      });
      // Flat-fee matters bill the fee once, separate from the time entries.
      if (isFlat && (m?.hourly_rate ?? 0) > 0) {
        rows.push({ item_date: batchEnd, description: "Flat fee", quantity: 1, rate: m!.hourly_rate!, amount: Number((m!.hourly_rate!).toFixed(2)) });
      }
      const amount = Number(rows.reduce((s, r) => s + r.amount, 0).toFixed(2));
      maxNum += 1;
      const { data: invRow } = await supabase.from("invoices").insert({
        matter_id: matterId,
        client_id: m?.client_id ?? null,
        number: `INV-${maxNum}`,
        status: "created",
        due_date: dueStr,
        amount,
      }).select("id").single();
      const invId = (invRow as { id: string } | null)?.id;
      if (!invId) continue;
      await supabase.from("invoice_items").insert(rows.map((r, idx) => ({ ...r, invoice_id: invId, sort_order: idx })));
      await supabase.from("time_entries").update({ invoiced: true }).in("id", entries.map((e) => e.id));
      created += 1;
    }
    setBatchBusy(false);
    setBatchMsg(`Created ${created} draft invoice${created === 1 ? "" : "s"}.`);
    load();
  }

  const toggleSelEntry = (id: string) =>
    setSelEntries((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  // Invoiced entries are locked and never selectable for bulk actions.
  const selectableEntries = shownEntries.filter((e) => !e.invoiced);
  const allEntriesSelected = selectableEntries.length > 0 && selectableEntries.every((e) => selEntries.has(e.id));
  const toggleAllEntries = () =>
    setSelEntries(() => {
      if (allEntriesSelected) return new Set();
      return new Set(selectableEntries.map((e) => e.id));
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
    if (!(await confirm({ title: `Delete ${ids.length} time ${ids.length === 1 ? "entry" : "entries"}?`, message: "This cannot be undone." }))) return;
    await supabase.from("time_entries").delete().in("id", ids);
    setSelEntries(new Set());
    load();
  }

  async function deleteInvoice(id: string, number: string | null) {
    if (!(await confirm({ title: `Delete invoice ${number || ""}?`.trim(), message: "This cannot be undone." }))) return;
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
    // Invoiced entries are locked until removed from their invoice.
    if (entries.find((e) => e.id === id)?.invoiced) return;
    if (!(await confirm({ title: "Delete this time entry?", message: "This cannot be undone." }))) return;
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
      {tab === "dashboard" && (
        <>
          <h1 className="page-title">Billing Dashboard</h1>
          <div className="stat-row" style={{ marginTop: "1.25rem" }}>
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
        </>
      )}

      {tab === "invoices" && !canManageBilling && (
        <>
          <h1 className="page-title">Invoices</h1>
          <p className="muted-line">You don&apos;t have permission to view invoices. Contact an administrator to enable billing access.</p>
        </>
      )}

      {tab === "invoices" && canManageBilling && (
        <>
          <div className="page-head inv-page-head">
            <h1 className="page-title">Invoices</h1>
            <div className="head-controls inv-head-controls">
              <div className="inv-head-controls-row">
                <div className="seg seg-view" role="tablist" aria-label="Invoice view">
                  <button type="button" className={invView === "list" ? "active" : undefined} onClick={() => changeInvView("list")} title="List view" aria-label="List view">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
                  </button>
                  <button type="button" className={invView === "preview" ? "active" : undefined} onClick={() => changeInvView("preview")} title="Preview view" aria-label="Preview view">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="18" rx="1" /><rect x="13" y="3" width="8" height="18" rx="1" /></svg>
                  </button>
                </div>
                <select
                  className="inline-select inv-filter-select"
                  value={invFilter}
                  onChange={(e) => setInvFilter(e.target.value as InvoiceBucket | "all")}
                >
                  <option value="all">All invoices ({invoices.length})</option>
                  {INVOICE_BUCKETS.map((b) => (
                    <option key={b.key} value={b.key}>{b.label} ({bucketCounts[b.key]})</option>
                  ))}
                </select>
                <button type="button" className="ghost sm" onClick={() => { setBatchMsg(""); setBatchOpen(true); }} title="Generate draft invoices from un-invoiced time in a date range">
                  Batch bill
                </button>
              </div>
              <input
                className="activity-search inv-search-below"
                type="search"
                placeholder="Search invoices…"
                value={invQuery}
                onChange={(e) => setInvQuery(e.target.value)}
              />
            </div>
          </div>

          {invView === "list" && (
            <div className="inv-panels">
              <div className="inv-panel">
                <span className="inv-panel-label">Total Open</span>
                <span className="inv-panel-amt">{usd(invSummary.openAmt, 0)}</span>
                <span className="inv-panel-sub">{invSummary.openN} invoice{invSummary.openN === 1 ? "" : "s"}</span>
              </div>
              <div className="inv-panel">
                <span className="inv-panel-label">Overdue</span>
                <span className="inv-panel-amt">{usd(invSummary.overdueAmt, 0)}</span>
                <span className="inv-panel-sub">{invSummary.overdueN} invoice{invSummary.overdueN === 1 ? "" : "s"}</span>
              </div>
              <div className="inv-panel">
                <span className="inv-panel-label">Paid</span>
                <span className="inv-panel-amt">{usd(invSummary.paidAmt, 0)}</span>
                <span className="inv-panel-sub">{invSummary.paidN} invoice{invSummary.paidN === 1 ? "" : "s"}</span>
              </div>
            </div>
          )}

          {loading ? (
            <p className="muted-line">Loading…</p>
          ) : shownInvoices.length === 0 ? (
            <p className="muted-line">{invoices.length === 0 ? "No invoices yet." : "No invoices match this view."}</p>
          ) : invView === "list" ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => toggleInvSort("date")}>Date <span className="sort-arrow">{invSortArrow("date")}</span></th>
                    <th className="sortable nowrap" onClick={() => toggleInvSort("number")}>Invoice #&nbsp;<span className="sort-arrow">{invSortArrow("number")}</span></th>
                    <th className="sortable" onClick={() => toggleInvSort("client")}>Client <span className="sort-arrow">{invSortArrow("client")}</span></th>
                    <th className="sortable" onClick={() => toggleInvSort("matter")}>Matter <span className="sort-arrow">{invSortArrow("matter")}</span></th>
                    <th className="sortable" onClick={() => toggleInvSort("amount")}>Amount <span className="sort-arrow">{invSortArrow("amount")}</span></th>
                    <th className="sortable" onClick={() => toggleInvSort("due")}>Due <span className="sort-arrow">{invSortArrow("due")}</span></th>
                    <th className="sortable" onClick={() => toggleInvSort("status")}>Status <span className="sort-arrow">{invSortArrow("status")}</span></th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((i) => {
                    const bucket = invoiceBucket(i);
                    return (
                      <tr key={i.id}>
                        <td>{i.created_at ? new Date(i.created_at).toLocaleDateString() : "—"}</td>
                        <td>
                          <Link href={`/dashboard/invoices/${i.id}`} className="row-link">{i.number || "—"}</Link>
                        </td>
                        <td className="strong-cell">{clientName(i.client_id)}</td>
                        <td>{i.matter_id ? matterName(i.matter_id) : "—"}</td>
                        <td>{i.amount != null ? usd(i.amount) : "—"}</td>
                        <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</td>
                        <td><span className={`pill inv-${bucket}`}>{bucket}</span></td>
                        <td className="ct-actions">
                          <button type="button" className="ct-del" title="Delete invoice" aria-label="Delete invoice" onClick={() => deleteInvoice(i.id, i.number)}>✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="inv-split">
              <div className="inv-list">
                {shownInvoices.map((i) => {
                  const bucket = invoiceBucket(i);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      className={`inv-li${selInvoiceId === i.id ? " active" : ""}`}
                      onClick={() => setSelInvoiceId(i.id)}
                    >
                      <div className="inv-li-main">
                        <span className="inv-li-name">{clientName(i.client_id)}</span>
                        <span className="inv-li-sub">
                          {i.number || "—"}
                          {i.issued_date || i.due_date ? " · " : ""}
                          {i.due_date ? new Date(i.due_date).toLocaleDateString() : i.issued_date ? new Date(i.issued_date).toLocaleDateString() : ""}
                        </span>
                      </div>
                      <div className="inv-li-right">
                        <span className="inv-li-amt">{i.amount != null ? usd(i.amount) : "—"}</span>
                        <span className={`pill inv-${bucket}`}>{bucket}</span>
                      </div>
                      <span
                        className="ct-del inv-li-del"
                        role="button"
                        tabIndex={0}
                        title="Delete invoice"
                        aria-label="Delete invoice"
                        onClick={(ev) => { ev.stopPropagation(); deleteInvoice(i.id, i.number); }}
                        onKeyDown={(ev) => { if (ev.key === "Enter") { ev.stopPropagation(); deleteInvoice(i.id, i.number); } }}
                      >✕</span>
                    </button>
                  );
                })}
              </div>
              <div className="inv-preview">
                {selInvoiceId ? (
                  <InvoiceEditor key={selInvoiceId} invoiceId={selInvoiceId} preview />
                ) : (
                  <p className="muted-line" style={{ padding: "2rem" }}>Select an invoice to preview.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "time" && (
        <>
          <div className="page-head inv-page-head">
            <h1 className="page-title">Time Entries</h1>
            <div className="head-controls inv-head-controls">
              <div className="inv-head-controls-row">
                <button className="btn icon-plus-btn" onClick={openAddTime} type="button" title="Add time" aria-label="Add time">
                  +
                </button>
              </div>
              <input
                className="activity-search inv-search-below"
                type="search"
                placeholder="Search time entries…"
                value={timeQuery}
                onChange={(e) => setTimeQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Same big summary cards as the Invoices tab, for visual consistency. */}
          <div className="inv-panels inv-panels-4">
            <div className="inv-panel">
              <span className="inv-panel-label">Entries</span>
              <span className="inv-panel-amt">{shownEntries.length}</span>
              <span className="inv-panel-sub">in view</span>
            </div>
            <div className="inv-panel">
              <span className="inv-panel-label">Time Logged</span>
              <span className="inv-panel-amt">{(totalSeconds / 3600).toFixed(1)}h</span>
              <span className="inv-panel-sub">total hours</span>
            </div>
            <div className="inv-panel">
              <span className="inv-panel-label">Billable</span>
              <span className="inv-panel-amt">{(billableSeconds / 3600).toFixed(1)}h</span>
              <span className="inv-panel-sub">billed hours</span>
            </div>
            <div className="inv-panel">
              <span className="inv-panel-label">Non-billable</span>
              <span className="inv-panel-amt">{(nonBillableSeconds / 3600).toFixed(1)}h</span>
              <span className="inv-panel-sub">unbilled hours</span>
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
              <select className="inline-select" value={timeInvoiced} onChange={(e) => setTimeInvoiced(e.target.value as "all" | "invoiced" | "uninvoiced")}>
                <option value="all">All entries</option>
                <option value="uninvoiced">Un-invoiced</option>
                <option value="invoiced">Invoiced</option>
              </select>
              <div className="ts-matter te-matter-pick">
                <input
                  value={timeMatterQuery}
                  placeholder="All matters"
                  onFocus={() => setTimeMatterOpen(true)}
                  onBlur={() => setTimeout(() => setTimeMatterOpen(false), 150)}
                  onChange={(e) => { setTimeMatterQuery(e.target.value); setTimeMatter("all"); setTimeMatterOpen(true); }}
                />
                {timeMatterOpen && (
                  <div className="ts-matter-menu">
                    <button type="button" className="ts-matter-hit" onClick={() => { setTimeMatter("all"); setTimeMatterQuery(""); setTimeMatterOpen(false); }}>
                      All matters
                    </button>
                    {timeMatterHits.map((m) => (
                      <button key={m.id} type="button" className="ts-matter-hit" onClick={() => { setTimeMatter(m.id); setTimeMatterQuery(m.name); setTimeMatterOpen(false); }}>
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
                    <th className="sortable" onClick={() => toggleTimeSort("date")}>Date <span className="sort-arrow">{timeSortArrow("date")}</span></th>
                    <th>Matter</th>
                    <th>Activity</th>
                    <th>Description</th>
                    <th style={{ textAlign: "center" }}>User</th>
                    <th>Duration</th>
                    <th className="sortable" onClick={() => toggleTimeSort("invoiced")}>Status <span className="sort-arrow">{timeSortArrow("invoiced")}</span></th>
                    <th aria-label="Delete"></th>
                  </tr>
                </thead>
                <tbody>
                  {shownEntries.map((e) => (
                    <tr key={e.id} className={`${selEntries.has(e.id) ? "row-selected" : ""}${e.invoiced ? " te-row-invoiced" : ""}`.trim() || undefined}>
                      <td className="check-col">
                        <input
                          type="checkbox"
                          checked={selEntries.has(e.id)}
                          onChange={() => toggleSelEntry(e.id)}
                          disabled={e.invoiced}
                          title={e.invoiced ? "Invoiced entries are locked — remove from the invoice first" : undefined}
                          aria-label="Select entry"
                        />
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
                      <td style={{ textAlign: "center" }}>
                        <span
                          className="te-user-badge"
                          title={e.lawyer}
                          style={{ background: personColor(e.lawyer), color: "#fff" }}
                        >
                          {initialsOf(e.lawyer)}
                        </span>
                      </td>
                      <td>{fmtHm(e.duration_seconds)}</td>
                      <td>
                        {e.invoiced
                          ? <span className="pill inv-paid">Invoiced</span>
                          : <span className="pill inv-created">Un-invoiced</span>}
                      </td>
                      <td className="ct-actions">
                        {e.invoiced ? (
                          <span className="te-lock" title="Invoiced — remove from the invoice before editing or deleting" aria-label="Locked (invoiced)">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                            </svg>
                          </span>
                        ) : (
                          <button type="button" className="ct-del" title="Delete entry" aria-label="Delete entry" onClick={() => deleteEntry(e.id)}>✕</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {addTimeOpen && (
            <div className="modal-backdrop" onClick={() => setAddTimeOpen(false)}>
              <div className="modal ts-add-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Add Time</h3>
                {/* Same multi-row quick-entry grid as the header timesheet shortcut. */}
                <TimesheetTab onSaved={() => { setAddTimeOpen(false); load(); }} />
              </div>
            </div>
          )}

          {batchOpen && (
            <div className="modal-backdrop" onClick={() => setBatchOpen(false)}>
              <div className="modal" onClick={(e) => e.stopPropagation()}>
                <h3>Batch billing</h3>
                <p className="modal-dur">
                  Generate a draft invoice for every matter with un-invoiced billable
                  time in this range. Pulled entries are marked invoiced so they won’t
                  bill twice.
                </p>
                <div className="field-pair">
                  <label>From<input type="date" value={batchStart} onChange={(e) => setBatchStart(e.target.value)} /></label>
                  <label>To<input type="date" value={batchEnd} onChange={(e) => setBatchEnd(e.target.value)} /></label>
                </div>
                {batchMsg && <p className="field-note" style={{ marginTop: "0.6rem" }}>{batchMsg}</p>}
                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={() => setBatchOpen(false)}>Close</button>
                  <button type="button" className="btn" disabled={batchBusy || !batchStart || !batchEnd || batchStart > batchEnd} onClick={runBatchBilling}>
                    {batchBusy ? "Generating…" : "Generate invoices"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="muted-line">Loading…</p>}>
      <BillingInner />
    </Suspense>
  );
}
