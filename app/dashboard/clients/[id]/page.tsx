"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem, Client, Matter } from "@/lib/types";
import { InlineText, InlineTextarea } from "../../Inline";
import { usePortal } from "../../PortalProvider";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function ClientDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const [client, setClient] = useState<Client | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadActivity() {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("client_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setActivity((data as ActivityItem[]) ?? []);
  }

  async function loadAll() {
    const [{ data: c }, { data: m }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", params.id).single(),
      supabase
        .from("matters")
        .select("*")
        .eq("client_id", params.id)
        .order("created_at", { ascending: false }),
    ]);
    setClient((c as Client) ?? null);
    setMatters((m as Matter[]) ?? []);
    await loadActivity();
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function patch(changes: Partial<Client>) {
    if (!client) return;
    setClient({ ...client, ...changes });
    await supabase.from("clients").update(changes).eq("id", client.id);
  }

  // Update a contact field and log the change (actor first) to this client's feed.
  async function updateContact(
    field: "email" | "phone" | "primary_contact",
    label: string,
    rawValue: string,
  ) {
    if (!client) return;
    const oldVal = client[field];
    const newVal = rawValue.trim() || null;
    if (newVal === oldVal) return;
    await patch({ [field]: newVal } as Partial<Client>);
    await supabase.from("activity_log").insert({
      kind: "client_updated",
      client_id: client.id,
      description: `${userName} updated ${client.name}'s ${label} from ${
        oldVal || "—"
      } to ${newVal || "—"}`,
    });
    loadActivity();
  }

  if (loading) return <p className="muted-line">Loading…</p>;
  if (!client)
    return (
      <div>
        <Link href="/dashboard/clients" className="back-link">
          ← Clients
        </Link>
        <p className="muted-line">Client not found.</p>
      </div>
    );

  const openMatters = matters.filter((m) => m.status !== "closed");
  const closedMatters = matters.filter((m) => m.status === "closed");

  const MatterRow = ({ m }: { m: Matter }) => (
    <li>
      <Link href={`/dashboard/matters/${m.id}`}>{m.name}</Link>
      <span className="muted-line">
        {m.practice_area} · {m.assigned_to || "Unassigned"}
      </span>
      <span className={`pill pill-${m.status}`}>{m.status}</span>
    </li>
  );

  return (
    <div>
      <Link href="/dashboard/clients" className="back-link">
        ← Clients
      </Link>
      <div className="page-head">
        <h1 className="page-title editable-title">
          <InlineText
            value={client.name}
            onSave={(v) => {
              if (v) patch({ name: v });
            }}
          />
        </h1>
        <span className={`pill pill-${client.status}`}>{client.status}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Primary Contact</span>
          <InlineText
            value={client.primary_contact}
            onSave={(v) => updateContact("primary_contact", "primary contact", v)}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Email</span>
          <InlineText
            value={client.email}
            type="email"
            onSave={(v) => updateContact("email", "email", v)}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Phone</span>
          <InlineText
            value={client.phone}
            type="tel"
            onSave={(v) => updateContact("phone", "phone number", v)}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Address</span>
          <InlineText
            value={client.address}
            onSave={(v) => patch({ address: v || null })}
          />
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Notes</h2>
        <InlineTextarea
          value={client.notes}
          onSave={(v) => patch({ notes: v || null })}
          placeholder="Click to add notes…"
        />
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Matters ({matters.length})</h2>
        {matters.length === 0 ? (
          <p className="muted-line">No matters for this client yet.</p>
        ) : (
          <>
            <h3 className="subsection">Open ({openMatters.length})</h3>
            {openMatters.length === 0 ? (
              <p className="muted-line">No open matters.</p>
            ) : (
              <ul className="link-list">
                {openMatters.map((m) => (
                  <MatterRow key={m.id} m={m} />
                ))}
              </ul>
            )}

            {closedMatters.length > 0 && (
              <>
                <h3 className="subsection muted">
                  Closed ({closedMatters.length})
                </h3>
                <ul className="link-list dim">
                  {closedMatters.map((m) => (
                    <MatterRow key={m.id} m={m} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>

      <div className="panel">
        <h2 className="panel-title">Activity</h2>
        {activity.length === 0 ? (
          <p className="muted-line">No activity for this client yet.</p>
        ) : (
          <ul className="activity-list">
            {activity.map((a) => (
              <li key={a.id}>
                <span className="act-tag tag-client">Client</span>
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
