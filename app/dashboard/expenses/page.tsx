"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Matter } from "@/lib/types";
import { personColor } from "@/lib/types";
import { useConfirm } from "../ConfirmProvider";

type Expense = {
  id: string;
  matter_id: string | null;
  expense_date: string | null;
  description: string | null;
  user_name: string | null;
  amount: number | null;
  invoiced: boolean;
  billable: boolean;
  created_at: string;
};

const usd = (n: number) =>
  `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const usd0 = (n: number) =>
  `$${Math.round(Number(n || 0)).toLocaleString("en-US")}`;
const initialsOf = (n: string | null | undefined) =>
  (n || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";

export default function ExpensesPage() {
  const confirm = useConfirm();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "invoiced" | "uninvoiced" | "nonbillable">("all");
  type SortKey = "date" | "client" | "matter" | "amount" | "status";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "date", dir: -1 });
  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }));
  const sortArrow = (key: SortKey) => (sort.key !== key ? "↕" : sort.dir === 1 ? "↑" : "↓");

  async function load() {
    const [{ data: e }, { data: m }, { data: c }] = await Promise.all([
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("matters").select("*"),
      supabase.from("clients").select("*").order("name"),
    ]);
    setExpenses((e as Expense[]) ?? []);
    setMatters((m as Matter[]) ?? []);
    setClients((c as Client[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const matterOf = (id: string | null) => matters.find((m) => m.id === id);
  const clientName = (matterId: string | null) => {
    const cid = matterOf(matterId)?.client_id ?? null;
    return clients.find((c) => c.id === cid)?.name ?? "—";
  };

  // Derived status: non-billable · invoiced · un-invoiced (billable, not yet billed).
  const statusOf = (x: Expense) => (!x.billable ? "nonbillable" : x.invoiced ? "invoiced" : "uninvoiced");
  const statusRank: Record<string, number> = { uninvoiced: 0, invoiced: 1, nonbillable: 2 };

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = expenses.filter((x) => {
      if (statusFilter !== "all" && statusOf(x) !== statusFilter) return false;
      if (q) {
        const hay = [x.description, x.user_name, matterOf(x.matter_id)?.name, clientName(x.matter_id)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const sorted = [...list].sort((a, b) => {
      let cmp = 0;
      if (sort.key === "date") cmp = (a.expense_date || "").localeCompare(b.expense_date || "");
      else if (sort.key === "client") cmp = clientName(a.matter_id).localeCompare(clientName(b.matter_id));
      else if (sort.key === "matter") cmp = (matterOf(a.matter_id)?.name ?? "").localeCompare(matterOf(b.matter_id)?.name ?? "");
      else if (sort.key === "amount") cmp = (a.amount ?? 0) - (b.amount ?? 0);
      else if (sort.key === "status") cmp = statusRank[statusOf(a)] - statusRank[statusOf(b)];
      return cmp * sort.dir;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, matters, clients, query, statusFilter, sort]);

  const total = rows.reduce((s, x) => s + (x.amount ?? 0), 0);
  const billable = rows.filter((x) => x.billable).reduce((s, x) => s + (x.amount ?? 0), 0);
  const uninvoiced = rows.filter((x) => x.billable && !x.invoiced).reduce((s, x) => s + (x.amount ?? 0), 0);

  async function deleteExpense(id: string, desc: string | null) {
    if (!(await confirm({ title: `Delete expense${desc ? ` “${desc}”` : ""}?`, message: "This cannot be undone." }))) return;
    setExpenses((prev) => prev.filter((x) => x.id !== id));
    await supabase.from("expenses").delete().eq("id", id);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Expenses</h1>
        <input
          className="activity-search"
          type="search"
          placeholder="Search expenses…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stat-row" style={{ marginBottom: "1.5rem" }}>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{usd0(total)}</span>
          <span className="stat-label">Total · {rows.length} expense{rows.length === 1 ? "" : "s"}</span>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{usd0(billable)}</span>
          <span className="stat-label">Billable</span>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{usd0(uninvoiced)}</span>
          <span className="stat-label">Un-invoiced</span>
        </div>
      </div>

      <div className="filter-search-row" style={{ justifyContent: "flex-end", marginBottom: "0.6rem" }}>
        <select className="inline-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
          <option value="all">All statuses</option>
          <option value="uninvoiced">Un-invoiced</option>
          <option value="invoiced">Invoiced</option>
          <option value="nonbillable">Non-billable</option>
        </select>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted-line">No expenses match this filter.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("date")}>Date <span className="sort-arrow">{sortArrow("date")}</span></th>
                <th>Description</th>
                <th className="sortable" onClick={() => toggleSort("client")}>Client <span className="sort-arrow">{sortArrow("client")}</span></th>
                <th className="sortable" onClick={() => toggleSort("matter")}>Matter <span className="sort-arrow">{sortArrow("matter")}</span></th>
                <th style={{ textAlign: "center" }}>User</th>
                <th className="sortable" style={{ textAlign: "right" }} onClick={() => toggleSort("amount")}>Amount <span className="sort-arrow">{sortArrow("amount")}</span></th>
                <th className="sortable" onClick={() => toggleSort("status")}>Status <span className="sort-arrow">{sortArrow("status")}</span></th>
                <th aria-label="Delete"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const m = matterOf(x.matter_id);
                return (
                  <tr key={x.id}>
                    <td>{x.expense_date ? new Date(x.expense_date + "T00:00:00").toLocaleDateString() : "—"}</td>
                    <td className="strong-cell">{x.description || "—"}</td>
                    <td>{clientName(x.matter_id)}</td>
                    <td>
                      {m ? (
                        <Link href={`/dashboard/matters/${m.id}`} className="row-link">{m.name}</Link>
                      ) : "—"}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      <span className="te-user-badge" title={x.user_name ?? undefined} style={{ background: personColor(x.user_name), color: "#fff" }}>
                        {initialsOf(x.user_name)}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>{usd(x.amount ?? 0)}</td>
                    <td>
                      {!x.billable ? (
                        <span className="pill inv-created">Non-billable</span>
                      ) : x.invoiced ? (
                        <span className="pill inv-paid">Invoiced</span>
                      ) : (
                        <span className="pill inv-sent">Un-invoiced</span>
                      )}
                    </td>
                    <td className="ct-actions">
                      <button type="button" className="ct-del" title="Delete expense" aria-label="Delete expense" onClick={() => deleteExpense(x.id, x.description)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
