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

const GOAL_TARGET = 50000; // revenue goal (placeholder — easy to make configurable later)
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

// Earnings over the last 7 days — a single-series bar chart.
function WeekBars({ data }: { data: { label: string; amount: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount));
  return (
    <div className="wb">
      {data.map((d, i) => (
        <div className="wb-col" key={i}>
          <div className="wb-track">
            <div className="wb-val">{money(d.amount)}</div>
            <div
              className="wb-bar"
              style={{ height: `${(d.amount / max) * 100}%` }}
              aria-label={`${d.label}: ${money(d.amount)}`}
            />
          </div>
          <span className="wb-day">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// Progress ring toward the revenue goal.
function GoalRing({ pct }: { pct: number }) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(100, pct) / 100);
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" className="fin-ring">
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--dash-border)" strokeWidth="10" />
      <circle
        cx="60"
        cy="60"
        r={r}
        fill="none"
        stroke="#4c9d6b"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        transform="rotate(-90 60 60)"
      />
      <text x="60" y="66" textAnchor="middle" className="fin-ring-num">{pct}%</text>
    </svg>
  );
}

// Invoice status split — a stacked bar with a labelled legend.
function InvoiceBar({ paid, open, overdue }: { paid: number; open: number; overdue: number }) {
  const total = paid + open + overdue;
  const rows = [
    { label: "Paid", val: paid, color: "#4c9d6b" },
    { label: "Open", val: open, color: "#d9a441" },
    { label: "Past due", val: overdue, color: "#c0392b" },
  ];
  return (
    <>
      <div className="inv-bar">
        {total === 0 ? (
          <span className="inv-seg empty" style={{ width: "100%" }} />
        ) : (
          rows.map(
            (r) =>
              r.val > 0 && (
                <span
                  key={r.label}
                  className="inv-seg"
                  style={{ width: `${(r.val / total) * 100}%`, background: r.color }}
                />
              ),
          )
        )}
      </div>
      <ul className="inv-legend">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="inv-dot" style={{ background: r.color }} />
            <span className="inv-label">{r.label}</span>
            <span className="inv-val">{money(r.val)}</span>
          </li>
        ))}
      </ul>
    </>
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

  const {
    hours,
    revenue,
    openedCount,
    closedCount,
    invPaid,
    invOpen,
    invOverdue,
    weekEarnings,
    revenueDelta,
    goalPct,
  } = useMemo(() => {
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
    // Invoice split by status group.
    let invPaid = 0, invOpen = 0, invOverdue = 0;
    for (const i of invoices) {
      const a = i.amount ?? 0;
      if (i.status === "paid") invPaid += a;
      else if (i.status === "overdue") invOverdue += a;
      else invOpen += a; // draft / sent / unpaid
    }

    // Earnings over the last 7 days (billable time × matter rate).
    const rateOf = (id: string | null) =>
      matters.find((m) => m.id === id)?.hourly_rate ?? 0;
    const weekEarnings: { label: string; amount: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const ds = d.getTime();
      const de = ds + 86400000;
      let amt = 0;
      for (const e of entries) {
        if (!e.billable) continue;
        const t = new Date(e.logged_at).getTime();
        if (t >= ds && t < de) amt += (e.duration_seconds / 3600) * (rateOf(e.matter_id) ?? 0);
      }
      weekEarnings.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), amount: amt });
    }

    // Revenue change vs the previous equal-length window.
    const span = Date.now() - start;
    const prevStart = start - span;
    let prevRev = 0;
    for (const i of invoices) {
      if (i.status !== "paid") continue;
      const when = new Date(i.issued_date ?? i.created_at).getTime();
      if (when >= prevStart && when < start) prevRev += i.amount ?? 0;
    }
    const revenueDelta = prevRev > 0 ? Math.round(((rev - prevRev) / prevRev) * 100) : null;
    const goalPct = Math.min(100, Math.round((rev / GOAL_TARGET) * 100));

    return {
      hours: secs / 3600,
      revenue: rev,
      openedCount: opened,
      closedCount: closed,
      invPaid,
      invOpen,
      invOverdue,
      weekEarnings,
      revenueDelta,
      goalPct,
    };
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

      <div className="fin-section">
        <h2 className="panel-title">Financials</h2>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : (
          <div className="fin-grid">
            <div className="fin-card fin-revenue">
              <span className="fin-card-label">Revenue</span>
              <span className="fin-hero">{money(revenue)}</span>
              {revenueDelta != null && (
                <span className={`fin-delta ${revenueDelta >= 0 ? "up" : "down"}`}>
                  {revenueDelta >= 0 ? "+" : ""}{revenueDelta}% vs prev
                </span>
              )}
            </div>

            <div className="fin-card fin-expenses">
              <span className="fin-card-label">Expenses</span>
              <span className="fin-hero">$0</span>
              <span className="fin-sub">Not tracked yet</span>
            </div>

            <div className="fin-card fin-goals">
              <span className="fin-card-label">Goal</span>
              <GoalRing pct={goalPct} />
              <span className="fin-sub">{money(revenue)} of {money(GOAL_TARGET)}</span>
            </div>

            <div className="fin-card fin-week">
              <div className="fin-card-head">
                <span className="fin-card-label">Earnings — last 7 days</span>
                <span className="fin-week-total">
                  {money(weekEarnings.reduce((s, d) => s + d.amount, 0))}
                </span>
              </div>
              <WeekBars data={weekEarnings} />
            </div>

            <div className="fin-card fin-invoices">
              <span className="fin-card-label">Invoices</span>
              <InvoiceBar paid={invPaid} open={invOpen} overdue={invOverdue} />
            </div>
          </div>
        )}
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
