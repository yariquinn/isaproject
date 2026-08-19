"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Invoice, Matter } from "@/lib/types";
import Disclaimer from "../Disclaimer";

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: inv }, { data: m }, { data: c }] = await Promise.all([
        supabase.from("invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("matters").select("*"),
        supabase.from("clients").select("*"),
      ]);
      setInvoices((inv as Invoice[]) ?? []);
      setMatters((m as Matter[]) ?? []);
      setClients((c as Client[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const matterName = (id: string | null) =>
    matters.find((m) => m.id === id)?.name ?? "—";
  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "—";

  const total = invoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + (i.amount ?? 0), 0);

  return (
    <div>
      <h1 className="page-title">Billing</h1>
      <Disclaimer>
        Invoices are demo data. Payment processing and accounting sync are
        non-functional in this mock-up.
      </Disclaimer>

      <div className="stat-row" style={{ margin: "1.25rem 0" }}>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">${total.toFixed(0)}</span>
          <span className="stat-label">Invoiced</span>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">${outstanding.toFixed(0)}</span>
          <span className="stat-label">Outstanding</span>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{invoices.length}</span>
          <span className="stat-label">Invoices</span>
        </div>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : invoices.length === 0 ? (
        <p className="muted-line">No invoices yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Client</th>
                <th>Matter</th>
                <th>Amount</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id}>
                  <td className="strong-cell">{i.number || "—"}</td>
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
                  <td>{i.amount != null ? `$${i.amount.toFixed(2)}` : "—"}</td>
                  <td>
                    {i.due_date
                      ? new Date(i.due_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td>
                    <span className={`pill inv-${i.status}`}>{i.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
