"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem } from "@/lib/types";
import { usePortal } from "./PortalProvider";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Map each activity kind to a filter category + label + color class.
const KIND_META: Record<
  string,
  { group: "client" | "matter" | "time"; label: string }
> = {
  client_added: { group: "client", label: "Client" },
  client_updated: { group: "client", label: "Client" },
  matter_created: { group: "matter", label: "Matter" },
  time_logged: { group: "time", label: "Time" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "client", label: "Clients" },
  { key: "matter", label: "Matters" },
  { key: "time", label: "Time" },
] as const;

export default function Overview() {
  const { userName } = usePortal();
  const firstName = userName.split(" ")[0] || userName;

  const [clients, setClients] = useState(0);
  const [matters, setMatters] = useState(0);
  const [closedMatters, setClosedMatters] = useState(0);
  const [loggedSeconds, setLoggedSeconds] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const [clientsRes, mattersRes, closedRes, entriesRes, activityRes] =
        await Promise.all([
          supabase.from("clients").select("id", { count: "exact", head: true }),
          supabase
            .from("matters")
            .select("id", { count: "exact", head: true })
            .eq("status", "open"),
          supabase
            .from("matters")
            .select("id", { count: "exact", head: true })
            .eq("status", "closed"),
          supabase.from("time_entries").select("duration_seconds"),
          supabase
            .from("activity_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
      setClients(clientsRes.count ?? 0);
      setMatters(mattersRes.count ?? 0);
      setClosedMatters(closedRes.count ?? 0);
      setLoggedSeconds(
        (entriesRes.data ?? []).reduce(
          (sum, r: { duration_seconds: number }) => sum + r.duration_seconds,
          0,
        ),
      );
      setActivity((activityRes.data as ActivityItem[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activity.filter((a) => {
      const meta = KIND_META[a.kind];
      const group = meta?.group ?? "time";
      if (filter !== "all" && group !== filter) return false;
      if (q && !a.description.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [activity, filter, query]);

  const hours = (loggedSeconds / 3600).toFixed(1);
  const dateLine = new Date()
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    })
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
          <span className="stat-num">{matters}</span>
          <span className="stat-label">Open Matters</span>
        </Link>
        <Link href="/dashboard/matters?status=closed" className="stat">
          <span className="stat-num">{closedMatters}</span>
          <span className="stat-label">Closed Matters</span>
        </Link>
        <Link href="/dashboard/time-entries" className="stat">
          <span className="stat-num">{hours}</span>
          <span className="stat-label">Hours Logged</span>
        </Link>
      </div>

      <div className="panel">
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

        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="muted-line">No matching activity.</p>
        ) : (
          <ul className="activity-list">
            {filtered.map((a) => {
              const meta = KIND_META[a.kind] ?? { group: "time", label: "Time" };
              return (
                <li key={a.id}>
                  <span className={`act-tag tag-${meta.group}`}>
                    {meta.label}
                  </span>
                  <span className="act-desc">{a.description}</span>
                  <span className="act-time">{timeAgo(a.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
