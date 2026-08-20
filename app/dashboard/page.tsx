"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem, EventItem, Invoice, Matter, TimeEntry, Todo } from "@/lib/types";
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

// Round a value up to a clean axis maximum (1/2/2.5/5/10 × 10ⁿ).
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * pow;
}

// Earnings over the last 7 days — a single-series bar chart with a light track,
// y-axis ticks and gridlines, and a value on hover.
function WeekBars({ data }: { data: { label: string; amount: number }[] }) {
  const max = niceCeil(Math.max(1, ...data.map((d) => d.amount)));
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => Math.round(max * f));
  return (
    <div className="wb-wrap">
      <div className="wb-yaxis">
        {ticks.map((t, i) => (
          <span className="wb-tick" key={i}>{money(t)}</span>
        ))}
      </div>
      <div className="wb-plot">
        <div className="wb-grid">
          {ticks.map((_, i) => (
            <div className="wb-gridline" key={i} />
          ))}
        </div>
        <div className="wb">
          {data.map((d, i) => (
            <div className="wb-col" key={i}>
              <div className="wb-track">
                <div className="wb-rail" />
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
      </div>
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

// Small revenue line graph for the Revenue card.
function Sparkline({ data }: { data: number[] }) {
  const w = 240, h = 60, pad = 4;
  const max = Math.max(1, ...data);
  const step = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
  const pts = data.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = pts.join(" ");
  const area = `${pad},${h - pad} ${line} ${pad + (data.length - 1) * step},${h - pad}`;
  return (
    <svg className="fin-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Revenue trend">
      <polygon points={area} fill="color-mix(in srgb, #4c9d6b 14%, transparent)" />
      <polyline points={line} fill="none" stroke="#4c9d6b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<string>("month");
  const [finRange, setFinRange] = useState<"7d" | "year">("7d");
  const [revLine, setRevLine] = useState(false);
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  // Which overview panels the user wants to see (persisted per browser).
  const [prefs, setPrefs] = useState({ fin: true, mytasks: true, events: true, activity: true });
  useEffect(() => {
    try {
      const raw = localStorage.getItem("overviewPrefs");
      if (raw) setPrefs((p) => ({ ...p, ...JSON.parse(raw) }));
      else {
        // migrate the old single financials flag
        const v = localStorage.getItem("showFinancials");
        if (v !== null) setPrefs((p) => ({ ...p, fin: v === "1" }));
      }
    } catch {
      /* ignore */
    }
  }, []);
  const setPref = (key: "fin" | "mytasks" | "events" | "activity", v: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: v };
      try {
        localStorage.setItem("overviewPrefs", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  const showFin = prefs.fin;
  const toggleFin = (v: boolean) => setPref("fin", v);

  useEffect(() => {
    if (!gearOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) setGearOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [gearOpen]);

  useEffect(() => {
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const [cRes, eRes, iRes, mRes, evRes, aRes, tRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("time_entries").select("*"),
        supabase.from("invoices").select("*"),
        supabase.from("matters").select("*"),
        supabase.from("events").select("*").gte("event_date", today).order("event_date").limit(6),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("todos").select("*").eq("done", false),
      ]);
      setClients(cRes.count ?? 0);
      setEntries((eRes.data as TimeEntry[]) ?? []);
      setInvoices((iRes.data as Invoice[]) ?? []);
      setMatters((mRes.data as Matter[]) ?? []);
      setEvents((evRes.data as EventItem[]) ?? []);
      setActivity((aRes.data as ActivityItem[]) ?? []);
      setTodos((tRes.data as Todo[]) ?? []);
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

  // Last 12 months of earnings + revenue, for the chart's "This Year" view
  // and the Revenue sparkline.
  const monthly = useMemo(() => {
    const rateOf = (id: string | null) => matters.find((m) => m.id === id)?.hourly_rate ?? 0;
    const now = new Date();
    const out: { label: string; earn: number; rev: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const start = d.getTime();
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1).getTime();
      let earn = 0, rev = 0;
      for (const e of entries) {
        if (!e.billable) continue;
        const t = new Date(e.logged_at).getTime();
        if (t >= start && t < end) earn += (e.duration_seconds / 3600) * (rateOf(e.matter_id) ?? 0);
      }
      for (const inv of invoices) {
        if (inv.status !== "paid") continue;
        const t = new Date(inv.issued_date ?? inv.created_at).getTime();
        if (t >= start && t < end) rev += inv.amount ?? 0;
      }
      out.push({ label: d.toLocaleDateString(undefined, { month: "short" }), earn, rev });
    }
    return out;
  }, [entries, invoices, matters]);

  const chartData = finRange === "year"
    ? monthly.map((m) => ({ label: m.label, amount: m.earn }))
    : weekEarnings;

  // My Tasks: the current user's open tasks + upcoming firm events (closings, etc.)
  const myItems = useMemo(() => {
    const mine = todos
      .filter((t) => t.assignee === userName && !t.done)
      .map((t) => ({
        id: `t-${t.id}`,
        kind: "task" as const,
        title: t.title,
        date: t.due_date,
        href: t.matter_id ? `/dashboard/matters/${t.matter_id}` : "/dashboard/todo",
      }));
    const evs = events.map((e) => ({
      id: `e-${e.id}`,
      kind: e.kind || "event",
      title: e.title,
      date: e.event_date.slice(0, 10),
      href: e.matter_id ? `/dashboard/matters/${e.matter_id}` : "/dashboard/deadlines",
    }));
    return [...mine, ...evs]
      .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))
      .slice(0, 8);
  }, [todos, events, userName]);

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

  const now1 = new Date();
  const todayLocal = `${now1.getFullYear()}-${String(now1.getMonth() + 1).padStart(2, "0")}-${String(now1.getDate()).padStart(2, "0")}`;
  const dateLine = new Date()
    .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();

  return (
    <div className="ov-layout">
      <div className="ov-main">
      <div className="greeting">
        <div className="greeting-text">
          <span className="greeting-date">{dateLine}</span>
          <h1 className="greeting-title">
            {greeting()}, <strong>{firstName}</strong>
          </h1>
        </div>
        <div className="ov-gear-wrap" ref={gearRef}>
          <button
            type="button"
            className="ov-gear"
            onClick={() => setGearOpen((o) => !o)}
            title="Customize dashboard"
            aria-label="Customize dashboard"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          {gearOpen && (
            <div className="ov-gear-menu">
              <div className="ov-gear-head">Show on dashboard</div>
              {([
                ["fin", "Financials"],
                ["mytasks", "My Tasks"],
                ["events", "Upcoming Events"],
                ["activity", "Recent Activity"],
              ] as const).map(([key, label]) => (
                <label key={key} className="ov-gear-item">
                  <span>{label}</span>
                  <span className="switch">
                    <input type="checkbox" checked={prefs[key]} onChange={(e) => setPref(key, e.target.checked)} />
                    <span className="switch-track" />
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
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
      </div>

      {prefs.fin && (
      <div className="fin-section">
        <div className="fin-section-head">
          <h2 className="panel-title">Financials</h2>
        </div>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : (
          <div className="fin-grid">
            <div className="fin-card fin-revenue">
              <div className="fin-card-head">
                <span className="fin-card-label">Revenue</span>
                <button
                  type="button"
                  className={`fin-graph-toggle${revLine ? " on" : ""}`}
                  onClick={() => setRevLine((v) => !v)}
                  title={revLine ? "Show amount" : "Show trend"}
                  aria-label="Toggle revenue graph"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 17 9 11 13 15 21 7" /><polyline points="15 7 21 7 21 13" />
                  </svg>
                </button>
              </div>
              {revLine ? (
                <>
                  <span className="fin-hero">{money(revenue)}</span>
                  <Sparkline data={monthly.map((m) => m.rev)} />
                </>
              ) : (
                <>
                  <span className="fin-hero">{money(revenue)}</span>
                  {revenueDelta != null && (
                    <span className={`fin-delta ${revenueDelta >= 0 ? "up" : "down"}`}>
                      {revenueDelta >= 0 ? "+" : ""}{revenueDelta}% vs prev
                    </span>
                  )}
                </>
              )}
            </div>

            <div className="fin-card fin-expenses">
              <span className="fin-card-label">Expenses</span>
              <span className="fin-hero">$0</span>
              <span className="fin-sub">Not tracked yet</span>
            </div>

            <div className="fin-card fin-invoices">
              <span className="fin-card-label">Invoices</span>
              <InvoiceBar paid={invPaid} open={invOpen} overdue={invOverdue} />
            </div>

            <div className="fin-card fin-goals">
              <span className="fin-card-label">Goal</span>
              <GoalRing pct={goalPct} />
              <span className="fin-sub">{money(revenue)} of {money(GOAL_TARGET)}</span>
            </div>

            <div className="fin-card fin-week">
              <div className="fin-week-top">
                <div className="fin-week-headline">
                  <span className="fin-card-label">Earnings</span>
                  <span className="fin-week-hero">
                    {money(chartData.reduce((s, d) => s + d.amount, 0))}
                  </span>
                </div>
                <div className="fin-week-controls">
                  <span className="fin-legend"><span className="fin-legend-dot" />Earnings</span>
                  <select className="inline-select" value={finRange} onChange={(e) => setFinRange(e.target.value as "7d" | "year")}>
                    <option value="7d">This Week</option>
                    <option value="year">This Year</option>
                  </select>
                </div>
              </div>
              <WeekBars data={chartData} />
            </div>
          </div>
        )}
      </div>
      )}

      {prefs.mytasks && (
      <div className="panel ov-mytasks">
        <h2 className="panel-title">My Tasks</h2>
        <div className="ov-scroll">
          {loading ? (
            <p className="muted-line">Loading…</p>
          ) : myItems.length === 0 ? (
            <p className="muted-line">Nothing on your plate — you&rsquo;re all caught up.</p>
          ) : (
            <ul className="mytasks-list">
              {myItems.map((it) => {
                const overdue = !!it.date && it.date < todayLocal;
                const kindLabel = it.kind === "task" ? "Task" : it.kind.charAt(0).toUpperCase() + it.kind.slice(1);
                return (
                  <li key={it.id}>
                    <Link href={it.href} className="mytasks-row">
                      <span className={`mytasks-tag tag-${it.kind === "task" ? "task" : "event"}`}>{kindLabel}</span>
                      <span className="mytasks-title">{it.title}</span>
                      <span className={`mytasks-date${overdue ? " overdue" : ""}`}>
                        {overdue ? "Overdue · " : ""}
                        {it.date
                          ? new Date(it.date + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })
                          : "No date"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      )}

      <div className="overview-cols equal">
        {prefs.events && (
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
        )}

        {prefs.activity && (
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
        )}
      </div>
      </div>
    </div>
  );
}
