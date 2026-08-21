"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, personColor } from "@/lib/types";

type Expense = {
  id: string;
  matter_id: string | null;
  expense_date: string | null;
  description: string | null;
  user_name: string | null;
  duration_seconds: number | null;
  quantity: number | null;
  cost: number | null;
  amount: number | null;
  invoiced: boolean;
  billable: boolean;
};

const money = (n: number) => `$${(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const todayStr = () => new Date().toISOString().slice(0, 10);
const initialsOf = (name: string) =>
  (name || "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";
const fmtHm = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return `${h}h ${m}m`;
};

type EditCell = { id: string; field: keyof Expense } | null;

type Period = "day" | "week" | "month" | "year" | "all";
const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All time" },
];
function periodStart(p: Period): number {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "day") return d.getTime();
  if (p === "week") { const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
  if (p === "month") return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  if (p === "year") return new Date(d.getFullYear(), 0, 1).getTime();
  return 0;
}

export default function ExpensesTab({ matterId }: { matterId: string }) {
  const [rows, setRows] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditCell>(null);
  const [draft, setDraft] = useState("");
  const [period, setPeriod] = useState<Period>("all");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function bulkExpenses(changes: Record<string, unknown>) {
    const ids = [...sel]; if (!ids.length) return;
    await supabase.from("expenses").update(changes).in("id", ids);
    setSel(new Set()); load();
  }
  async function bulkDeleteExpenses() {
    const ids = [...sel]; if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} expense${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setRows((prev) => prev.filter((x) => !sel.has(x.id)));
    await supabase.from("expenses").delete().in("id", ids);
    setSel(new Set());
  }

  const [nDate, setNDate] = useState(todayStr());
  const [nDesc, setNDesc] = useState("");
  const [nUser, setNUser] = useState<string>(ATTORNEYS[0]);
  const [nDur, setNDur] = useState("");
  const [nQty, setNQty] = useState("");
  const [nCost, setNCost] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase.from("expenses").select("*").eq("matter_id", matterId).order("expense_date", { ascending: false });
    setRows((data as Expense[]) ?? []);
    setLoading(false);
  }, [matterId]);
  useEffect(() => { load(); }, [load]);

  function commitNew() {
    const qty = parseFloat(nQty) || 0;
    const cost = parseFloat(nCost) || 0;
    if (qty <= 0 && cost <= 0 && !nDesc.trim()) return;
    const hrs = parseFloat(nDur);
    supabase.from("expenses").insert({
      matter_id: matterId,
      expense_date: nDate,
      description: nDesc.trim() || null,
      user_name: nUser,
      duration_seconds: isNaN(hrs) ? null : Math.round(hrs * 3600),
      quantity: qty,
      cost: cost,
      amount: Number((qty * cost).toFixed(2)),
      invoiced: false,
      billable: true,
    }).then(() => {
      setNDesc(""); setNDur(""); setNQty(""); setNCost(""); setNDate(todayStr());
      load();
    });
  }

  async function save(e: Expense, field: keyof Expense, value: unknown) {
    setEdit(null);
    const changes: Record<string, unknown> = { [field]: value };
    if (field === "quantity" || field === "cost") {
      const q = field === "quantity" ? Number(value) : Number(e.quantity) || 0;
      const c = field === "cost" ? Number(value) : Number(e.cost) || 0;
      changes.amount = Number((q * c).toFixed(2));
    }
    await supabase.from("expenses").update(changes).eq("id", e.id);
    load();
  }
  async function toggleInvoiced(e: Expense) {
    await supabase.from("expenses").update({ invoiced: !e.invoiced }).eq("id", e.id);
    load();
  }
  async function remove(e: Expense) {
    setRows((prev) => prev.filter((x) => x.id !== e.id));
    await supabase.from("expenses").delete().eq("id", e.id);
  }

  const startEdit = (e: Expense, field: keyof Expense, initial: string) => { setDraft(initial); setEdit({ id: e.id, field }); };
  const isEditing = (e: Expense, field: keyof Expense) => edit?.id === e.id && edit.field === field;

  const inPeriod = (d: string | null) => {
    if (period === "all") return true;
    if (!d) return false;
    return new Date(d.slice(0, 10) + "T00:00:00").getTime() >= periodStart(period);
  };
  const visibleRows = rows.filter((e) => inPeriod(e.expense_date));
  const total = visibleRows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const invoiced = visibleRows.filter((e) => e.invoiced).reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const unInvoiced = total - invoiced;
  const billableRows = visibleRows.filter((e) => e.billable);
  const nonbillableRows = visibleRows.filter((e) => !e.billable);
  const billable = billableRows.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const nonBillable = total - billable;

  async function toggleBillable(e: Expense) {
    await supabase.from("expenses").update({ billable: !e.billable }).eq("id", e.id);
    load();
  }

  const stat = (label: string, v: number, count: number, cls?: string) => (
    <div className={`te-stat${cls ? " " + cls : ""}`}>
      <span className="te-stat-label">{label}</span>
      <span className="te-stat-amt">{money(v)}</span>
      <span className="te-stat-hrs">{count} item(s)</span>
    </div>
  );

  if (loading) return <p className="muted-line">Loading…</p>;

  return (
    <>
      <div className="te-summary-head">
        <span />
        <div className="te-summary-head-right">
          <select className="inline-select te-period" value={period} onChange={(e) => setPeriod(e.target.value as Period)}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </div>
      </div>
      <div className="te-summary">
        {stat("Total", total, visibleRows.length)}
        {stat("Billable", billable, billableRows.length, "ok")}
        {stat("Non-billable", nonBillable, nonbillableRows.length, "warn")}
        {stat("Invoiced", invoiced, visibleRows.filter((e) => e.invoiced).length)}
        {stat("Un-invoiced", unInvoiced, visibleRows.filter((e) => !e.invoiced).length)}
      </div>

      {sel.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{sel.size} selected</span>
          <button type="button" className="ghost sm" onClick={() => bulkExpenses({ billable: true })}>Mark billable</button>
          <button type="button" className="ghost sm" onClick={() => bulkExpenses({ billable: false })}>Mark non-billable</button>
          <button type="button" className="ghost sm" onClick={() => bulkExpenses({ invoiced: true })}>Mark invoiced</button>
          <button type="button" className="ghost sm" onClick={() => bulkExpenses({ invoiced: false })}>Mark un-invoiced</button>
          <button type="button" className="ghost sm bulk-danger" onClick={bulkDeleteExpenses}>Delete</button>
          <button type="button" className="ghost sm" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      <div className="table-wrap" style={{ border: "none" }}>
        <table className="data-table te-table">
          <thead>
            <tr>
              <th className="check-col">
                <input type="checkbox" aria-label="Select all"
                  checked={visibleRows.length > 0 && visibleRows.every((e) => sel.has(e.id))}
                  onChange={(ev) => setSel(ev.target.checked ? new Set(visibleRows.map((e) => e.id)) : new Set())} />
              </th>
              <th>Date</th>
              <th>Description</th>
              <th>User</th>
              <th>Duration</th>
              <th>Qty</th>
              <th>Cost</th>
              <th>Amount</th>
              <th>Billable</th>
              <th>Invoiced</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            <tr className="te-new-row" onKeyDown={(ev) => { if (ev.key === "Enter" && !ev.shiftKey) commitNew(); }}>
              <td className="check-col" aria-hidden="true" />
              <td><input type="date" value={nDate} onChange={(e) => setNDate(e.target.value)} aria-label="New expense date" /></td>
              <td><input value={nDesc} placeholder="Description…" onChange={(e) => setNDesc(e.target.value)} aria-label="New expense description" /></td>
              <td>
                <select value={nUser} onChange={(e) => setNUser(e.target.value)} aria-label="New expense user">
                  {ATTORNEYS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
              <td><input type="number" step="0.25" value={nDur} placeholder="hrs" onChange={(e) => setNDur(e.target.value)} aria-label="New expense duration" /></td>
              <td><input type="number" step="1" value={nQty} placeholder="qty" onChange={(e) => setNQty(e.target.value)} aria-label="New expense qty" /></td>
              <td><input type="number" step="0.01" value={nCost} placeholder="$" onChange={(e) => setNCost(e.target.value)} onBlur={commitNew} aria-label="New expense cost" /></td>
              <td className="ii-amt-cell">{money((parseFloat(nQty) || 0) * (parseFloat(nCost) || 0))}</td>
              <td colSpan={3} className="te-new-hint">press Enter to add</td>
            </tr>
            {visibleRows.map((e) => (
              <tr key={e.id} className={sel.has(e.id) ? "row-selected" : undefined}>
                <td className="check-col">
                  <input type="checkbox" checked={sel.has(e.id)} onChange={() => toggleSel(e.id)} aria-label="Select expense" />
                </td>
                <td>
                  {isEditing(e, "expense_date") ? (
                    <input type="date" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => save(e, "expense_date", draft || null)} />
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "expense_date", e.expense_date?.slice(0, 10) ?? "")}>
                      {e.expense_date ? new Date(e.expense_date.slice(0, 10) + "T00:00:00").toLocaleDateString() : "—"}
                    </span>
                  )}
                </td>
                <td>
                  {isEditing(e, "description") ? (
                    <input autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => save(e, "description", draft.trim() || null)} onKeyDown={(ev) => { if (ev.key === "Enter") ev.currentTarget.blur(); }} />
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "description", e.description ?? "")}>{e.description || "—"}</span>
                  )}
                </td>
                <td>
                  {isEditing(e, "user_name") ? (
                    <select autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => save(e, "user_name", draft)}>
                      {ATTORNEYS.map((a) => <option key={a} value={a}>{a}</option>)}
                    </select>
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "user_name", e.user_name ?? ATTORNEYS[0])} title={e.user_name ?? undefined}>
                      <span className="te-initials" style={{ background: personColor(e.user_name) }}>{initialsOf(e.user_name ?? "")}</span>
                    </span>
                  )}
                </td>
                <td>
                  {isEditing(e, "duration_seconds") ? (
                    <input type="number" step="0.25" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => { const h = parseFloat(draft); save(e, "duration_seconds", isNaN(h) ? null : Math.round(h * 3600)); }} />
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "duration_seconds", e.duration_seconds ? (e.duration_seconds / 3600).toFixed(2) : "")}>{e.duration_seconds ? fmtHm(e.duration_seconds) : "—"}</span>
                  )}
                </td>
                <td>
                  {isEditing(e, "quantity") ? (
                    <input type="number" step="1" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => save(e, "quantity", Number(draft) || 0)} />
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "quantity", String(e.quantity ?? ""))}>{e.quantity ?? "—"}</span>
                  )}
                </td>
                <td>
                  {isEditing(e, "cost") ? (
                    <input type="number" step="0.01" autoFocus value={draft} onChange={(ev) => setDraft(ev.target.value)} onBlur={() => save(e, "cost", Number(draft) || 0)} />
                  ) : (
                    <span className="te-cell" onClick={() => startEdit(e, "cost", String(e.cost ?? ""))}>{e.cost != null ? money(e.cost) : "—"}</span>
                  )}
                </td>
                <td className="ii-amt-cell">{money(Number(e.amount) || 0)}</td>
                <td>
                  <button type="button" className={`te-toggle${e.billable ? " on" : ""}`} onClick={() => toggleBillable(e)}>{e.billable ? "Billable" : "Non-bill"}</button>
                </td>
                <td>
                  <span className={`te-status-pill${e.invoiced ? " on" : ""}`} title={e.invoiced ? "On an invoice" : "Not yet invoiced"}>{e.invoiced ? "Invoiced" : "Un-inv"}</span>
                </td>
                <td className="ct-actions"><button type="button" className="ct-del" aria-label="Delete expense" onClick={() => remove(e)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
