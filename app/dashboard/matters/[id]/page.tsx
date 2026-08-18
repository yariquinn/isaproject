"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ATTORNEYS,
  PRACTICE_AREAS,
  type Client,
  type Matter,
  type TimeEntry,
} from "@/lib/types";
import {
  InlineNumber,
  InlineSelect,
  InlineText,
  InlineTextarea,
} from "../../Inline";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function MatterDetail({ params }: { params: { id: string } }) {
  const [matter, setMatter] = useState<Matter | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    const [{ data: m }, { data: cs }, { data: e }] = await Promise.all([
      supabase.from("matters").select("*").eq("id", params.id).single(),
      supabase.from("clients").select("*").order("name"),
      supabase
        .from("time_entries")
        .select("*")
        .eq("matter_id", params.id)
        .order("logged_at", { ascending: false }),
    ]);
    setMatter((m as Matter) ?? null);
    setClients((cs as Client[]) ?? []);
    setEntries((e as TimeEntry[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function patch(changes: Partial<Matter>) {
    if (!matter) return;
    setMatter({ ...matter, ...changes });
    await supabase.from("matters").update(changes).eq("id", matter.id);
  }

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

  const clientOptions = [
    { value: "", label: "— none —" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const attorneyOptions: { value: string; label: string }[] = ATTORNEYS.map(
    (a) => ({ value: a, label: a }),
  );
  if (
    matter.assigned_to &&
    !ATTORNEYS.includes(matter.assigned_to as (typeof ATTORNEYS)[number])
  ) {
    attorneyOptions.push({
      value: matter.assigned_to,
      label: matter.assigned_to,
    });
  }

  return (
    <div>
      <Link href="/dashboard/matters" className="back-link">
        ← Matters
      </Link>
      <div className="page-head">
        <h1 className="page-title editable-title">
          <InlineText
            value={matter.name}
            onSave={(v) => {
              if (v) patch({ name: v });
            }}
          />
        </h1>
        <InlineSelect
          value={matter.status}
          className={`pill-${matter.status}`}
          options={[
            { value: "open", label: "open" },
            { value: "closed", label: "closed" },
          ]}
          onSave={(v) => patch({ status: v })}
        />
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Client</span>
          <InlineSelect
            value={matter.client_id ?? ""}
            options={clientOptions}
            onSave={(v) => patch({ client_id: v || null })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Practice Area</span>
          <InlineSelect
            value={matter.practice_area ?? PRACTICE_AREAS[0]}
            options={PRACTICE_AREAS.map((p) => ({ value: p, label: p }))}
            onSave={(v) => patch({ practice_area: v })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Assigned To</span>
          <InlineSelect
            value={matter.assigned_to ?? ATTORNEYS[0]}
            options={attorneyOptions}
            onSave={(v) => patch({ assigned_to: v })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Rate</span>
          <InlineNumber
            value={matter.hourly_rate}
            prefix="$"
            suffix="/hr"
            onSave={(v) => patch({ hourly_rate: v })}
          />
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

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Description</h2>
        <InlineTextarea
          value={matter.description}
          onSave={(v) => patch({ description: v || null })}
          placeholder="Click to add a description…"
        />
      </div>

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
