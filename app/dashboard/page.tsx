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

const STATUS_META: Record<string, { label: string; color: string }> = {
  paid: { label: "Paid", color: "#4c9d6b" },
  sent: { label: "Sent", color: "#6f9bd8" },
  draft: { label: "Draft", color: "#9aa4b2" },
  overdue: { label: "Overdue", color: "#c0392b" },
  unpaid: { label: "Unpaid", color: "#d9a441" },
};

function Donut({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total <= 0) return <p className="muted-line">No invoice data yet.</p>;
  const r = 54;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="fin-chart">
      <svg width="140" height="140" viewBox="0 0 140 140" className="fin-donut">
        <g transform="rotate(-90 70 70)">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--dash-border)" strokeWidth="20" />
          {data.map((d, i) => {
            const frac = d.value / total;
            const dash = frac * circ;
            const el = (
              <circle
                key={i}
                cx="70"
                cy="70"
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth="20"
                strokeDasharray={`${dash} ${circ - dash}`}
                strokeDashoffset={-acc * circ}
              />
            );
            acc += frac;
            return el;
          })}
        </g>
        <text x="70" y="67" textAnchor="middle" className="fin-total-num">
          ${total.toFixed(0)}
        </text>
        <text x="70" y="83" textAnchor="middle" className="fin-total-label">
          TOTAL
        </text>
      </svg>
      <ul className="fin-legend">
        {data.map((d, i) => (
          <li key={i}>
            <span className="fin-dot" style={{ background: d.color }} />
            <span className="fin-legend-label">{d.label}</span>
            <span className="fin-val">${d.value.toFixed(0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Overview() {
  const { userName } = usePortal();
  const firstName = userName.split(" ")[0] || userName;

  const [clients, setClients] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<string>("month");

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [cRes, eRes, iRes, mRes, evRes, aRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("time_entries").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("matters").select("*"),
        supabase.from("events").select("*").gte("event_date", today).order("event_date").limit(6),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      setClients(cRes.count ?? 0);
      setEntries((eRes.data as TimeEntry[]) ?? []);
      setInvoices((iRes.data as Invoice[]) ?? []);
      setMatters((mRes.data as Matter[]) ?? []);
      setEvents((evRes.data as EventItem[]) ?? []);
      setActivity((aRes.data as ActivityItem[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const { hours, revenue, openedCount, closedCount, financials } = useMemo(() => {
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
    let opened = 0;
    let closed = 0;
    for (const m of matters) {
      const od = m.open_date || m.created_at;
      if (od && new Date(od).getTime() >= start) opened++;
      if (m.closed_at && new Date(m.closed_at).getTime() >= start) closed++;
    }
    const byStatus: Record<string, number> = {};
    for (const i of invoices) {
      byStatus[i.status] = (byStatus[i.status] ?? 0) + (i.amount ?? 0);
    }
    const financials = Object.entries(byStatus)
      .map(([status, value]) => ({
        status,
        value,
        label: STATUS_META[status]?.label ?? status,
        color: STATUS_META[status]?.color ?? "#9aa4b2",
      }))
      .filter((d) => d.value > 0);
    return { hours: secs / 3600, revenue: rev, openedCount: opened, closedCount: closed, financials };
  }, [entries, invoices, matters, period]);

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
    <div className="ov-layout">
      <div className="ov-main">
      <div className="greeting">
        <span className="greeting-date">{dateLine}</span>
        <h1 className="greeting-title">
          {greeting()}, <strong>{firstName}</strong>
        </h1>
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
          <span className="stat-num">{openedCount}</span>
          <span className="stat-label">Opened</span>
        </Link>
        <Link href="/dashboard/matters?status=closed" className="stat">
          <span className="stat-num">{closedCount}</span>
          <span className="stat-label">Closed</span>
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

      <div className="panel ov-fin-panel">
        <h2 className="panel-title">Financials</h2>
        {loading ? <p className="muted-line">Loading…</p> : <Donut data={financials} />}
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
      </div>
    </div>
  );
}
