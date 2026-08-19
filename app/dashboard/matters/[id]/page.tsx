"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ATTORNEYS,
  PRACTICE_AREAS,
  PRIORITIES,
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
import { usePortal } from "../../PortalProvider";

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function MatterDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
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

  async function changeStatus(status: string) {
    if (!matter) return;
    const changes: Partial<Matter> = { status };
    if (status === "closed" && matter.status !== "closed") {
      changes.closed_at = new Date().toISOString();
      changes.closed_by = userName;
    } else if (status !== "closed") {
      changes.closed_at = null;
      changes.closed_by = null;
    }
    const wasStatus = matter.status;
    await patch(changes);
    if (status !== wasStatus) {
      await supabase.from("activity_log").insert({
        kind: "matter_updated",
        matter_id: matter.id,
        client_id: matter.client_id,
        description:
          status === "closed"
            ? `${userName} closed matter ${matter.name}`
            : `${userName} reopened matter ${matter.name}`,
      });
    }
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

  const clientName =
    clients.find((c) => c.id === matter.client_id)?.name ?? null;
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
          onSave={(v) => changeStatus(v)}
        />
      </div>

      <div className="detail-grid grid-6">
        <div className="detail-item">
          <span className="detail-label">Priority</span>
          <InlineSelect
            value={matter.priority}
            className={`prio-${matter.priority}`}
            options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
            onSave={(v) => patch({ priority: v })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Client</span>
          {matter.client_id ? (
            <Link
              href={`/dashboard/clients/${matter.client_id}`}
              className="row-link"
            >
              {clientName}
            </Link>
          ) : (
            <span className="inline-placeholder">—</span>
          )}
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
        {matter.status === "closed" && (
          <div className="detail-item">
            <span className="detail-label">Closed</span>
            {matter.closed_at
              ? new Date(matter.closed_at).toLocaleDateString()
              : "—"}
            {matter.closed_by ? (
              <span className="muted-line" style={{ fontSize: "0.8rem" }}>
                by {matter.closed_by}
              </span>
            ) : null}
          </div>
        )}
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
