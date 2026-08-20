"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Invoice, Matter, TimeEntry } from "@/lib/types";
import Disclaimer from "../Disclaimer";
import TimesheetTab from "./TimesheetTab";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function BillingPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"invoices" | "time" | "timesheet">("invoices");

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
  const totalSeconds = useMemo(
    () => entries.reduce((s, e) => s + e.duration_seconds, 0),
    [entries],
  );

  return (
    <div>
      <h1 className="page-title">Billing</h1>
      <Disclaimer>
        Invoices are demo data. Payment processing and accounting sync are
        non-functional in this mock-up.
      </Disclaimer>

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
        </>
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: "1.25rem" }}>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{entries.length}</span>
              <span className="stat-label">Entries</span>
            </div>
            <div className="stat" style={{ cursor: "default" }}>
              <span className="stat-num">{(totalSeconds / 3600).toFixed(1)}</span>
              <span className="stat-label">Total Hours</span>
            </div>
          </div>

          {loading ? (
            <p className="muted-line">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="muted-line">No time entries yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Matter</th>
                    <th>Activity</th>
                    <th>Description</th>
                    <th>User</th>
                    <th>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
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
