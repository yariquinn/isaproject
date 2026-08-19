"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem, EventItem, Invoice, Matter, TimeEntry } from "@/lib/types";
import { usePortal } from "./PortalProvider";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const KIND_META: Record<string, { group: string; label: string }> = {
  client_added: { group: "client", label: "Client" },
  client_updated: { group: "client", label: "Client" },
  matter_created: { group: "matter", label: "Matter" },
  matter_updated: { group: "matter", label: "Matter" },
  time_logged: { group: "time", label: "Time" },
  login: { group: "login", label: "Login" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "client", label: "Clients" },
  { key: "matter", label: "Matters" },
  { key: "time", label: "Time" },
  { key: "login", label: "Logins" },
] as const;

const PERIODS = [
  { key: "day", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year", label: "This Year" },
] as const;

function periodStart(key: string): number {
  const now = new Date();
  if (key === "day") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (key === "week") return now.getTime() - 7 * 24 * 3600 * 1000;
  if (key === "month") return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

// Quick actions that are demo-only (open an explainer modal).
const DEMO_ACTIONS: Record<string, { label: string; note: string }> = {
  invoice: { label: "Create invoice", note: "Invoice creation would open here. Invoicing is a demo in this mockup." },
  payment: { label: "Record payment", note: "Recording a payment would mark an invoice paid. This is a demo action." },
  expense: { label: "Add expense", note: "Expense entry would open here. Expenses are a demo in this mockup." },
  document: { label: "Upload document", note: "Document upload would open here. Storage is a demo in this mockup." },
};

function Ic({ name }: { name: string }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "invoice":
      return (
        <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
      );
    case "payment":
      return (
        <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
      );
    case "expense":
      return (
        <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
      );
    case "document":
      return (
        <svg {...p}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
      );
    case "matter":
      return (
        <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
      );
    case "client":
      return (
        <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      );
    default:
      return null;
  }
}

export default function Overview() {
  const { userName } = usePortal();
  const firstName = userName.split(" ")[0] || userName;

  const [clients, setClients] = useState(0);
  const [openM, setOpenM] = useState(0);
  const [closedM, setClosedM] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<string>("month");
  const [qa, setQa] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [cRes, oRes, clRes, eRes, iRes, mRes, evRes, aRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "closed"),
        supabase.from("time_entries").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("matters").select("*"),
        supabase.from("events").select("*").gte("event_date", today).order("event_date").limit(6),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      setClients(cRes.count ?? 0);
      setOpenM(oRes.count ?? 0);
      setClosedM(clRes.count ?? 0);
      setEntries((eRes.data as TimeEntry[]) ?? []);
      setInvoices((iRes.data as Invoice[]) ?? []);
      setMatters((mRes.data as Matter[]) ?? []);
      setEvents((evRes.data as EventItem[]) ?? []);
      setActivity((aRes.data as ActivityItem[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const { hours, revenue } = useMemo(() => {
    const start = periodStart(period);
    let secs = 0;
    for (const e of entries) {
      if (new Date(e.logged_at).getTime() < start) continue;
      secs += e.duration_seconds;
    }
    let rev = 0;
    for (const i of invoices) {
      if (i.status !== "paid") continue;
      const when = i.issued_date ?? i.created_at;
      if (new Date(when).getTime() < start) continue;
      rev += i.amount ?? 0;
    }
    return { hours: secs / 3600, revenue: rev };
  }, [entries, invoices, period]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activity.filter((a) => {
      const group = KIND_META[a.kind]?.group ?? "time";
      if (filter !== "all" && group !== filter) return false;
      if (q && !a.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activity, filter, query]);

  const matterName = (id: string | null) =>
    id ? matters.find((m) => m.id === id)?.name ?? null : null;

  const dateLine = new Date()
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();

  return (
    <div>
      <div className="greeting">
        <span className="greeting-date">{dateLine}</span>
        <h1 className="greeting-title">
          {greeting()}, <strong>{firstName}</strong>
        </h1>
      </div>

      <div className="quick-actions">
        <button type="button" className="qa-btn" onClick={() => setQa("invoice")}>
          <span className="qa-icon"><Ic name="invoice" /></span>Create invoice
        </button>
        <button type="button" className="qa-btn" onClick={() => setQa("payment")}>
          <span className="qa-icon"><Ic name="payment" /></span>Record payment
        </button>
        <button type="button" className="qa-btn" onClick={() => setQa("expense")}>
          <span className="qa-icon"><Ic name="expense" /></span>Add expense
        </button>
        <button type="button" className="qa-btn" onClick={() => setQa("document")}>
          <span className="qa-icon"><Ic name="document" /></span>Upload document
        </button>
        <Link href="/dashboard/matters" className="qa-btn">
          <span className="qa-icon"><Ic name="matter" /></span>Add Matter
        </Link>
        <Link href="/dashboard/clients" className="qa-btn">
          <span className="qa-icon"><Ic name="client" /></span>Add Client
        </Link>
      </div>

      <div className="ov-stats-head">
        <span className="ov-stats-title">Snapshot</span>
        <select
          className="inline-select"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div className="stat-row ov-stats">
        <Link href="/dashboard/clients" className="stat">
          <span className="stat-num">{clients}</span>
          <span className="stat-label">Clients</span>
        </Link>
        <Link href="/dashboard/matters?status=active" className="stat">
          <span className="stat-num">{openM}</span>
          <span className="stat-label">Open Matters</span>
        </Link>
        <Link href="/dashboard/matters?status=closed" className="stat">
          <span className="stat-num">{closedM}</span>
          <span className="stat-label">Closed Matters</span>
        </Link>
        <Link href="/dashboard/billing" className="stat">
          <span className="stat-num">{hours.toFixed(1)}</span>
          <span className="stat-label">Hours Logged</span>
        </Link>
        <Link href="/dashboard/billing" className="stat">
          <span className="stat-num">${revenue.toFixed(0)}</span>
          <span className="stat-label">Revenue</span>
        </Link>
      </div>

      <div className="overview-cols equal">
        <div className="panel ov-box">
          <h2 className="panel-title">Upcoming Events</h2>
          <div className="ov-scroll">
            {loading ? (
              <p className="muted-line">Loading…</p>
            ) : events.length === 0 ? (
              <p className="muted-line">No upcoming events.</p>
            ) : (
              <ul className="event-list">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span className="event-date">
                      {new Date(ev.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                    <span className="event-body">
                      {ev.matter_id ? (
                        <Link href={`/dashboard/matters/${ev.matter_id}`} className="event-title">
                          {ev.title}
                        </Link>
                      ) : (
                        <span className="event-title">{ev.title}</span>
                      )}
                      {matterName(ev.matter_id) && (
                        <span className="event-matter">{matterName(ev.matter_id)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="panel ov-box">
          <div className="panel-head">
            <h2 className="panel-title">Recent Activity</h2>
            <input
              className="activity-search"
              type="search"
              placeholder="Search…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filter-row">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-chip${filter === f.key ? " active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="ov-scroll">
            {loading ? (
              <p className="muted-line">Loading…</p>
            ) : filtered.length === 0 ? (
              <p className="muted-line">No matching activity.</p>
            ) : (
              <ul className="activity-list">
                {filtered.map((a) => {
                  const meta = KIND_META[a.kind] ?? { group: "time", label: "Activity" };
                  const href =
                    meta.group === "client"
                      ? a.client_id
                        ? `/dashboard/clients/${a.client_id}`
                        : null
                      : meta.group === "matter" || meta.group === "time"
                        ? a.matter_id
                          ? `/dashboard/matters/${a.matter_id}`
                          : null
                        : null;
                  const inner = (
                    <>
                      <span className={`act-tag tag-${meta.group}`}>{meta.label}</span>
                      <span className="act-desc">{a.description}</span>
                      <span className="act-time">{timeAgo(a.created_at)}</span>
                    </>
                  );
                  return (
                    <li key={a.id}>
                      {href ? (
                        <Link href={href} className="activity-row">
                          {inner}
                        </Link>
                      ) : (
                        <span className="activity-row static">{inner}</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      {qa && DEMO_ACTIONS[qa] && (
        <div className="modal-backdrop" onClick={() => setQa(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{DEMO_ACTIONS[qa].label}</h3>
            <p className="modal-dur">{DEMO_ACTIONS[qa].note}</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setQa(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
