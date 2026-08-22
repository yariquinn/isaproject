"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Client, Invoice, Matter } from "@/lib/types";

const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const daysBetween = (iso: string) => {
  const due = new Date(iso.slice(0, 10) + "T00:00:00").getTime();
  const now = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00").getTime();
  return Math.round((now - due) / 86400000);
};

type AgingRow = {
  clientId: string;
  client: string;
  current: number;
  d1: number;
  d31: number;
  d61: number;
  d90: number;
  total: number;
};

type ReportKey = "aging" | "statement" | "practice";
const REPORTS: { key: ReportKey; name: string; desc: string }[] = [
  { key: "aging", name: "Aging Invoices", desc: "Outstanding balances bucketed by days past due." },
  { key: "statement", name: "Statement of Account", desc: "All invoices and balance due for a single client." },
  { key: "practice", name: "Payments by Practice Area", desc: "Collected revenue broken down by practice area." },
];

export default function ReportsClient() {
  const [selected, setSelected] = useState<ReportKey | "">("");
  const [ran, setRan] = useState(false);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [stmtClient, setStmtClient] = useState<string>("");

  useEffect(() => {
    Promise.all([
      supabase.from("invoices").select("*").order("issued_date", { ascending: true }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("matters").select("*"),
    ]).then(([{ data: inv }, { data: c }, { data: m }]) => {
      setInvoices((inv as Invoice[]) ?? []);
      setClients((c as Client[]) ?? []);
      setMatters((m as Matter[]) ?? []);
      setLoading(false);
    });
  }, []);

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? "—";
  const matterName = (id: string | null) => matters.find((m) => m.id === id)?.name ?? "—";

  function pick(k: ReportKey) {
    setSelected(k);
    setRan(false);
  }

  // ---- Aging report: unpaid invoices bucketed by days past due ----
  const aging = useMemo(() => {
    const map = new Map<string, AgingRow>();
    for (const i of invoices) {
      if (i.status === "paid") continue;
      const amt = i.amount ?? 0;
      const key = i.client_id ?? "none";
      if (!map.has(key)) {
        map.set(key, { clientId: key, client: clientName(i.client_id), current: 0, d1: 0, d31: 0, d61: 0, d90: 0, total: 0 });
      }
      const row = map.get(key)!;
      const past = i.due_date ? daysBetween(i.due_date) : 0;
      if (past <= 0) row.current += amt;
      else if (past <= 30) row.d1 += amt;
      else if (past <= 60) row.d31 += amt;
      else if (past <= 90) row.d61 += amt;
      else row.d90 += amt;
      row.total += amt;
    }
    return [...map.values()].sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, clients]);

  const agingTotals = useMemo(() => aging.reduce(
    (t, r) => ({
      current: t.current + r.current, d1: t.d1 + r.d1, d31: t.d31 + r.d31,
      d61: t.d61 + r.d61, d90: t.d90 + r.d90, total: t.total + r.total,
    }),
    { current: 0, d1: 0, d31: 0, d61: 0, d90: 0, total: 0 },
  ), [aging]);

  // ---- Statement of account for one client ----
  const stmtInvoices = useMemo(
    () => invoices.filter((i) => i.client_id === stmtClient),
    [invoices, stmtClient],
  );
  const stmtInvoiced = stmtInvoices.reduce((s, i) => s + (i.amount ?? 0), 0);
  const stmtPaid = stmtInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + (i.amount ?? 0), 0);
  const stmtOutstanding = stmtInvoiced - stmtPaid;

  // ---- Payments by practice area (paid invoices, grouped by the matter's area) ----
  const PIE_COLORS = ["#a67c52", "#2f6bff", "#3fa373", "#e0699a", "#e6884f", "#7c5cbf", "#d9a441"];
  const byArea = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of invoices) {
      if (i.status !== "paid") continue;
      const m = matters.find((x) => x.id === i.matter_id);
      const area = m?.practice_area || "Unassigned";
      map.set(area, (map.get(area) ?? 0) + (i.amount ?? 0));
    }
    const rows = [...map.entries()].map(([area, amount], idx) => ({ area, amount, color: PIE_COLORS[idx % PIE_COLORS.length] }));
    rows.sort((a, b) => b.amount - a.amount);
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, matters]);
  const areaTotal = byArea.reduce((s, r) => s + r.amount, 0);

  // Build donut stroke-dasharray segments (circumference-based).
  const R = 60, C = 2 * Math.PI * 60;
  let acc = 0;
  const segments = byArea.map((r) => {
    const frac = areaTotal > 0 ? r.amount / areaTotal : 0;
    const seg = { ...r, dash: frac * C, offset: -acc * C };
    acc += frac;
    return seg;
  });

  if (loading) return <p className="muted-line">Loading…</p>;

  const meta = REPORTS.find((r) => r.key === selected);
  // Statement needs a client chosen before it can be run.
  const runDisabled = selected === "statement" && stmtClient === "";

  return (
    <div className="reports-layout">
      <aside className="reports-list">
        <h2 className="reports-list-title">Reports</h2>
        {REPORTS.map((r) => (
          <button
            key={r.key}
            type="button"
            className={`report-item${selected === r.key ? " active" : ""}`}
            onClick={() => pick(r.key)}
          >
            <span className="report-item-name">{r.name}</span>
            <span className="report-item-desc">{r.desc}</span>
          </button>
        ))}
      </aside>

      <section className="reports-result">
        {!meta ? (
          <div className="reports-empty">
            <p className="muted-line">Select a report on the left, then run it to see results here.</p>
          </div>
        ) : (
          <>
            <div className="reports-run-head">
              <div>
                <h2 className="reports-result-title">{meta.name}</h2>
                <p className="muted-line" style={{ margin: "0.15rem 0 0" }}>{meta.desc}</p>
              </div>
              <button type="button" className="btn" disabled={runDisabled} onClick={() => setRan(true)}>
                Run report
              </button>
            </div>

            {selected === "statement" && (
              <div className="filter-search-row" style={{ marginBottom: "0.4rem" }}>
                <label className="report-client-pick">
                  Client
                  <select value={stmtClient} onChange={(e) => { setStmtClient(e.target.value); setRan(false); }}>
                    <option value="">Select a client…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
            )}

            {!ran ? (
              <div className="reports-empty">
                <p className="muted-line">
                  {runDisabled ? "Choose a client, then run the report." : "Press “Run report” to generate results."}
                </p>
              </div>
            ) : selected === "aging" ? (
              <>
                <div className="stat-row" style={{ marginBottom: "1.25rem" }}>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(agingTotals.total)}</span><span className="stat-label">Total Outstanding</span></div>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(agingTotals.current)}</span><span className="stat-label">Not Yet Due</span></div>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(agingTotals.d31 + agingTotals.d61 + agingTotals.d90)}</span><span className="stat-label">Over 30 Days</span></div>
                </div>
                {aging.length === 0 ? (
                  <p className="muted-line">No outstanding invoices — everything is paid.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Client</th>
                          <th style={{ textAlign: "right" }}>Current</th>
                          <th style={{ textAlign: "right" }}>1–30</th>
                          <th style={{ textAlign: "right" }}>31–60</th>
                          <th style={{ textAlign: "right" }}>61–90</th>
                          <th style={{ textAlign: "right" }}>90+</th>
                          <th style={{ textAlign: "right" }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aging.map((r) => (
                          <tr key={r.clientId}>
                            <td className="strong-cell">{r.client}</td>
                            <td style={{ textAlign: "right" }}>{money(r.current)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.d1)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.d31)}</td>
                            <td style={{ textAlign: "right" }}>{money(r.d61)}</td>
                            <td style={{ textAlign: "right", color: r.d90 > 0 ? "#c0392b" : undefined }}>{money(r.d90)}</td>
                            <td style={{ textAlign: "right", fontWeight: 700 }}>{money(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="report-total-row">
                          <td className="strong-cell">All clients</td>
                          <td style={{ textAlign: "right" }}>{money(agingTotals.current)}</td>
                          <td style={{ textAlign: "right" }}>{money(agingTotals.d1)}</td>
                          <td style={{ textAlign: "right" }}>{money(agingTotals.d31)}</td>
                          <td style={{ textAlign: "right" }}>{money(agingTotals.d61)}</td>
                          <td style={{ textAlign: "right" }}>{money(agingTotals.d90)}</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{money(agingTotals.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            ) : selected === "statement" ? (
              <>
                <div className="stat-row" style={{ marginBottom: "1.25rem" }}>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(stmtInvoiced)}</span><span className="stat-label">Invoiced</span></div>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(stmtPaid)}</span><span className="stat-label">Paid</span></div>
                  <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{money(stmtOutstanding)}</span><span className="stat-label">Balance Due</span></div>
                </div>
                {stmtInvoices.length === 0 ? (
                  <p className="muted-line">No invoices for this client.</p>
                ) : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Invoice</th>
                          <th>Matter</th>
                          <th>Issued</th>
                          <th>Due</th>
                          <th>Status</th>
                          <th style={{ textAlign: "right" }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stmtInvoices.map((i) => (
                          <tr key={i.id}>
                            <td className="strong-cell">
                              <Link href={`/dashboard/invoices/${i.id}`} className="row-link">{i.number || "—"}</Link>
                            </td>
                            <td>{matterName(i.matter_id)}</td>
                            <td>{i.issued_date ? new Date(i.issued_date).toLocaleDateString() : "—"}</td>
                            <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</td>
                            <td><span className={`pill inv-${i.status}`}>{i.status}</span></td>
                            <td style={{ textAlign: "right" }}>{money(i.amount ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="report-total-row">
                          <td colSpan={5} className="strong-cell">Balance due</td>
                          <td style={{ textAlign: "right", fontWeight: 700 }}>{money(stmtOutstanding)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                <button type="button" className="ghost sm" style={{ marginTop: "1rem" }} onClick={() => window.print()}>Print / PDF statement</button>
              </>
            ) : (
              <>
                {areaTotal === 0 ? (
                  <p className="muted-line">No paid invoices yet — collected revenue will break down here by practice area.</p>
                ) : (
                  <div className="pie-report">
                    <svg viewBox="0 0 160 160" className="pie-svg" role="img" aria-label="Payments by practice area">
                      <g transform="rotate(-90 80 80)">
                        {segments.map((s) => (
                          <circle
                            key={s.area}
                            cx="80" cy="80" r={R}
                            fill="none"
                            stroke={s.color}
                            strokeWidth="28"
                            strokeDasharray={`${s.dash} ${C - s.dash}`}
                            strokeDashoffset={s.offset}
                          />
                        ))}
                      </g>
                      <text x="80" y="76" textAnchor="middle" className="pie-center-num">{money(areaTotal)}</text>
                      <text x="80" y="92" textAnchor="middle" className="pie-center-label">Collected</text>
                    </svg>
                    <div className="pie-legend">
                      {byArea.map((r) => (
                        <div className="pie-legend-row" key={r.area}>
                          <span className="pie-swatch" style={{ background: r.color }} />
                          <span className="pie-legend-name">{r.area}</span>
                          <span className="pie-legend-val">{money(r.amount)}</span>
                          <span className="pie-legend-pct">{areaTotal > 0 ? Math.round((r.amount / areaTotal) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </section>
    </div>
  );
}
