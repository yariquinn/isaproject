"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem } from "@/lib/types";

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

const KIND_LABEL: Record<string, string> = {
  client_added: "Client",
  matter_created: "Matter",
  timer_started: "Timer",
  timer_paused: "Timer",
  time_logged: "Time",
  document_added: "Document",
};

export default function Overview() {
  const [clients, setClients] = useState(0);
  const [matters, setMatters] = useState(0);
  const [loggedSeconds, setLoggedSeconds] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [clientsRes, mattersRes, entriesRes, activityRes] =
        await Promise.all([
          supabase.from("clients").select("id", { count: "exact", head: true }),
          supabase
            .from("matters")
            .select("id", { count: "exact", head: true })
            .eq("status", "open"),
          supabase.from("time_entries").select("duration_seconds"),
          supabase
            .from("activity_log")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(12),
        ]);
      setClients(clientsRes.count ?? 0);
      setMatters(mattersRes.count ?? 0);
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

  const hours = (loggedSeconds / 3600).toFixed(1);

  return (
    <div>
      <h1 className="page-title">Overview</h1>

      <div className="stat-row">
        <div className="stat">
          <span className="stat-num">{clients}</span>
          <span className="stat-label">Clients</span>
        </div>
        <div className="stat">
          <span className="stat-num">{matters}</span>
          <span className="stat-label">Open Matters</span>
        </div>
        <div className="stat">
          <span className="stat-num">{hours}</span>
          <span className="stat-label">Hours Logged</span>
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Recent Activity</h2>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : activity.length === 0 ? (
          <p className="muted-line">No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((a) => (
              <li key={a.id}>
                <span className={`act-tag act-${a.kind}`}>
                  {KIND_LABEL[a.kind] || "Activity"}
                </span>
                <span className="act-desc">{a.description}</span>
                <span className="act-time">{timeAgo(a.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
