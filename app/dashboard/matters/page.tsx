"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRACTICE_AREAS, type Client, type Matter } from "@/lib/types";

export default function MattersPage() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    client_id: "",
    practice_area: PRACTICE_AREAS[0] as string,
    description: "",
    hourly_rate: "",
  });

  async function load() {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase
        .from("matters")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
    ]);
    setMatters((m as Matter[]) ?? []);
    setClients((c as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const clientName = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "—";

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from("matters").insert({
      name: form.name.trim(),
      client_id: form.client_id || null,
      practice_area: form.practice_area,
      description: form.description.trim() || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
    });
    await supabase.from("activity_log").insert({
      kind: "matter_created",
      description: `Matter opened: ${form.name.trim()}`,
    });
    setForm({
      name: "",
      client_id: "",
      practice_area: PRACTICE_AREAS[0],
      description: "",
      hourly_rate: "",
    });
    setAdding(false);
    setSaving(false);
    load();
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Matters</h1>
        <button className="btn" onClick={() => setAdding(true)} type="button">
          + Add Matter
        </button>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : matters.length === 0 ? (
        <p className="muted-line">No matters yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Matter</th>
                <th>Client</th>
                <th>Practice Area</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => (
                <tr key={m.id}>
                  <td className="strong-cell">{m.name}</td>
                  <td>{clientName(m.client_id)}</td>
                  <td>{m.practice_area || "—"}</td>
                  <td>{m.hourly_rate ? `$${m.hourly_rate}/hr` : "—"}</td>
                  <td>
                    <span className={`pill pill-${m.status}`}>{m.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding && (
        <div className="modal-backdrop" onClick={() => setAdding(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add Matter</h3>
            <label>
              Matter Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Client
              <select
                value={form.client_id}
                onChange={(e) =>
                  setForm({ ...form, client_id: e.target.value })
                }
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Practice Area
              <select
                value={form.practice_area}
                onChange={(e) =>
                  setForm({ ...form, practice_area: e.target.value })
                }
              >
                {PRACTICE_AREAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Hourly Rate (USD)
              <input
                type="number"
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm({ ...form, hourly_rate: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={save}
                disabled={saving || !form.name.trim()}
              >
                {saving ? "Saving…" : "Save Matter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
