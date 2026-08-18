"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Matter, TimeEntry } from "@/lib/types";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function MatterDetail({ params }: { params: { id: string } }) {
  const [matter, setMatter] = useState<Matter | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: m } = await supabase
        .from("matters")
        .select("*")
        .eq("id", params.id)
        .single();
      const matterRow = (m as Matter) ?? null;
      setMatter(matterRow);

      const [{ data: e }, clientRes] = await Promise.all([
        supabase
          .from("time_entries")
          .select("*")
          .eq("matter_id", params.id)
          .order("logged_at", { ascending: false }),
        matterRow?.client_id
          ? supabase
              .from("clients")
              .select("*")
              .eq("id", matterRow.client_id)
              .single()
          : Promise.resolve({ data: null }),
      ]);
      setEntries((e as TimeEntry[]) ?? []);
      setClient((clientRes.data as Client) ?? null);
      setLoading(false);
    })();
  }, [params.id]);

  if (loading) return <p className="muted-line">Loading…</p>;
  if (!matter)
    return (
      <div>
        <Link href="/dashboard/matters" className="back-link">
          ← Matters
        </Link>
        <p className="muted-line">Matter not found.</p>
      </div>
    );

  const totalSeconds = entries.reduce((s, e) => s + e.duration_seconds, 0);
  const billable = matter.hourly_rate
    ? (totalSeconds / 3600) * matter.hourly_rate
    : null;

  return (
    <div>
      <Link href="/dashboard/matters" className="back-link">
        ← Matters
      </Link>
      <div className="page-head">
        <h1 className="page-title">{matter.name}</h1>
        <span className={`pill pill-${matter.status}`}>{matter.status}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Client</span>
          {client ? (
            <Link href={`/dashboard/clients/${client.id}`}>{client.name}</Link>
          ) : (
            "—"
          )}
        </div>
        <div className="detail-item">
          <span className="detail-label">Practice Area</span>
          {matter.practice_area || "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Assigned To</span>
          {matter.assigned_to || "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Rate</span>
          {matter.hourly_rate ? `$${matter.hourly_rate}/hr` : "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Time Logged</span>
          {fmtHm(totalSeconds)}
        </div>
        <div className="detail-item">
          <span className="detail-label">Billable</span>
          {billable != null ? `$${billable.toFixed(2)}` : "—"}
        </div>
      </div>

      {matter.description && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 className="panel-title">Description</h2>
          <p className="act-desc">{matter.description}</p>
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">Time Entries ({entries.length})</h2>
        {entries.length === 0 ? (
          <p className="muted-line">No time logged to this matter yet.</p>
        ) : (
          <div className="table-wrap" style={{ border: "none" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Activity</th>
                  <th>Description</th>
                  <th>Lawyer</th>
                  <th>Duration</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.logged_at).toLocaleDateString()}</td>
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
      </div>
    </div>
  );
}
