"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem, EventItem, Matter, TimeEntry } from "@/lib/types";
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

export default function Overview() {
  const { userName } = usePortal();
  const firstName = userName.split(" ")[0] || userName;

  const [clients, setClients] = useState(0);
  const [openM, setOpenM] = useState(0);
  const [closedM, setClosedM] = useState(0);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
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
      const [cRes, oRes, clRes, eRes, mRes, evRes, aRes] = await Promise.all([
        supabase.from("clients").select("id", { count: "exact", head: true }),
        supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("matters").select("id", { count: "exact", head: true }).eq("status", "closed"),
        supabase.from("time_entries").select("*"),
        supabase.from("matters").select("*"),
        supabase.from("events").select("*").gte("event_date", today).order("event_date").limit(6),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(100),
      ]);
      setClients(cRes.count ?? 0);
      setOpenM(oRes.count ?? 0);
      setClosedM(clRes.count ?? 0);
      setEntries((eRes.data as TimeEntry[]) ?? []);
      setMatters((mRes.data as Matter[]) ?? []);
      setEvents((evRes.data as EventItem[]) ?? []);
      setActivity((aRes.data as ActivityItem[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const rateOf = (id: string | null) => matters.find((m) => m.id === id);
  const matterName = (id: string | null) => matters.find((m) => m.id === id)?.name ?? "—";

  const { hours, revenue } = useMemo(() => {
    const start = periodStart(period);
    let secs = 0;
    let rev = 0;
    for (const e of entries) {
      if (new Date(e.logged_at).getTime() < start) continue;
      secs += e.duration_seconds;
      const m = rateOf(e.matter_id);
      if (m && m.rate_type !== "flat" && m.hourly_rate) {
        rev += (e.duration_seconds / 3600) * m.hourly_rate;
      }
    }
    return { hours: secs / 3600, revenue: rev };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, matters, period]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activity.filter((a) => {
      const group = KIND_META[a.kind]?.group ?? "time";
      if (filter !== "all" && group !== filter) return false;
      if (q && !a.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activity, filter, query]);

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

      <div className="stat-row">
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
      </div>

      <div className="overview-cols" style={{ marginTop: "1.5rem" }}>
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Hours &amp; Revenue</h2>
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
          <div className="mini-stats">
            <div>
              <span className="stat-num">{hours.toFixed(1)}</span>
              <span className="stat-label">Hours Logged</span>
            </div>
            <div>
              <span className="stat-num">${revenue.toFixed(0)}</span>
              <span className="stat-label">Revenue</span>
            </div>
          </div>
          <p className="muted-line" style={{ fontSize: "0.78rem", marginTop: "0.75rem" }}>
            Revenue is estimated from logged time on hourly matters (demo).
          </p>
        </div>

        <div className="panel">
          <h2 className="panel-title">Upcoming Events</h2>
          <div className="panel-scroll">
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
                    {ev.matter_id ? (
                      <Link href={`/dashboard/matters/${ev.matter_id}`} className="event-title">
                        {ev.title}
                      </Link>
                    ) : (
                      <span className="event-title">{ev.title}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: "1.5rem" }}>
        <div className="panel-head">
          <h2 className="panel-title">Recent Activity</h2>
          <input
            className="activity-search"
            type="search"
            placeholder="Search activity…"
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

        <div className="panel-scroll">
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
  );
}
