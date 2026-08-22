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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return expenses;
    return expenses.filter((x) => {
      const hay = [x.description, x.user_name, matterOf(x.matter_id)?.name, clientName(x.matter_id)]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, matters, clients, query]);

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

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted-line">No expenses yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Client</th>
                <th>Matter</th>
                <th>User</th>
                <th style={{ textAlign: "right" }}>Amount</th>
                <th>Status</th>
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
                    <td>
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
