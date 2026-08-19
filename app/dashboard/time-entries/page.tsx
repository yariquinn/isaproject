"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Matter, TimeEntry } from "@/lib/types";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function TimeEntriesPage() {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: m }] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .order("logged_at", { ascending: false }),
        supabase.from("matters").select("*"),
      ]);
      setEntries((e as TimeEntry[]) ?? []);
      setMatters((m as Matter[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const matterOf = (id: string | null) => matters.find((m) => m.id === id);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => {
      const hay = [
        matterOf(e.matter_id)?.name,
        e.activity,
        e.lawyer,
        e.note,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, matters, query]);

  const totalSeconds = rows.reduce((s, e) => s + e.duration_seconds, 0);

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Time Entries</h1>
        <input
          className="activity-search"
          type="search"
          placeholder="Search time entries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="stat-row" style={{ marginBottom: "1.5rem" }}>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{rows.length}</span>
          <span className="stat-label">Entries</span>
        </div>
        <div className="stat" style={{ cursor: "default" }}>
          <span className="stat-num">{(totalSeconds / 3600).toFixed(1)}</span>
          <span className="stat-label">Total Hours</span>
        </div>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : rows.length === 0 ? (
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
                <th>Lawyer</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => {
                const m = matterOf(e.matter_id);
                return (
                  <tr key={e.id}>
                    <td>{new Date(e.logged_at).toLocaleDateString()}</td>
                    <td className="strong-cell">
                      {m ? (
                        <Link
                          href={`/dashboard/matters/${m.id}`}
                          className="row-link"
                        >
                          {m.name}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
