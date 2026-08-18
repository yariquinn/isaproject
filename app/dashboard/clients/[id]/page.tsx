"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client, Matter } from "@/lib/types";

export default function ClientDetail({ params }: { params: { id: string } }) {
  const [client, setClient] = useState<Client | null>(null);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
      setLoading(false);
    })();
  }, [params.id]);

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

  return (
    <div>
      <Link href="/dashboard/clients" className="back-link">
        ← Clients
      </Link>
      <div className="page-head">
        <h1 className="page-title">{client.name}</h1>
        <span className={`pill pill-${client.status}`}>{client.status}</span>
      </div>

      <div className="detail-grid">
        <div className="detail-item">
          <span className="detail-label">Primary Contact</span>
          {client.primary_contact || "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Email</span>
          {client.email || "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Phone</span>
          {client.phone || "—"}
        </div>
        <div className="detail-item">
          <span className="detail-label">Address</span>
          {client.address || "—"}
        </div>
      </div>

      {client.notes && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <h2 className="panel-title">Notes</h2>
          <p className="act-desc">{client.notes}</p>
        </div>
      )}

      <div className="panel">
        <h2 className="panel-title">Matters ({matters.length})</h2>
        {matters.length === 0 ? (
          <p className="muted-line">No matters for this client yet.</p>
        ) : (
          <ul className="link-list">
            {matters.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/matters/${m.id}`}>{m.name}</Link>
                <span className="muted-line">
                  {m.practice_area} · {m.assigned_to || "Unassigned"}
                </span>
                <span className={`pill pill-${m.status}`}>{m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
