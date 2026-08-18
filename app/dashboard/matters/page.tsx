"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRACTICE_AREAS, type Client, type Matter } from "@/lib/types";

const EMPTY = {
  name: "",
  client_id: "",
  practice_area: PRACTICE_AREAS[0] as string,
  assigned_to: ATTORNEYS[0] as string,
  description: "",
  hourly_rate: "",
};

export default function MattersPage() {
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);

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

  function openAdd() {
    setForm(EMPTY);
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(m: Matter) {
    setForm({
      name: m.name,
      client_id: m.client_id ?? "",
      practice_area: m.practice_area ?? PRACTICE_AREAS[0],
      assigned_to: m.assigned_to ?? ATTORNEYS[0],
      description: m.description ?? "",
      hourly_rate: m.hourly_rate != null ? String(m.hourly_rate) : "",
    });
    setEditingId(m.id);
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      client_id: form.client_id || null,
      practice_area: form.practice_area,
      assigned_to: form.assigned_to || null,
      description: form.description.trim() || null,
      hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
    };
    if (editingId) {
      await supabase.from("matters").update(payload).eq("id", editingId);
    } else {
      await supabase.from("matters").insert(payload);
      await supabase.from("activity_log").insert({
        kind: "matter_created",
        description: `Matter opened: ${payload.name}`,
      });
    }
    setForm(EMPTY);
    setEditingId(null);
    setOpen(false);
    setSaving(false);
    load();
  }

  async function updateStatus(m: Matter, status: string) {
    setMatters((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, status } : x)),
    );
    await supabase.from("matters").update({ status }).eq("id", m.id);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Matters</h1>
        <button className="btn" onClick={openAdd} type="button">
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
                <th>Assigned To</th>
                <th>Rate</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {matters.map((m) => (
                <tr key={m.id}>
                  <td className="strong-cell">
                    <Link href={`/dashboard/matters/${m.id}`} className="row-link">
                      {m.name}
                    </Link>
                  </td>
                  <td>{clientName(m.client_id)}</td>
                  <td>{m.practice_area || "—"}</td>
                  <td>{m.assigned_to || "—"}</td>
                  <td>{m.hourly_rate ? `$${m.hourly_rate}/hr` : "—"}</td>
                  <td>
                    <select
                      className={`inline-status pill-${m.status}`}
                      value={m.status}
                      onChange={(e) => updateStatus(m, e.target.value)}
                    >
                      <option value="open">open</option>
                      <option value="closed">closed</option>
                    </select>
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => openEdit(m)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? "Edit Matter" : "Add Matter"}</h3>
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
              Assigned To
              <input
                list="attorney-list"
                value={form.assigned_to}
                onChange={(e) =>
                  setForm({ ...form, assigned_to: e.target.value })
                }
              />
              <datalist id="attorney-list">
                {ATTORNEYS.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={save}
                disabled={saving || !form.name.trim()}
              >
                {saving ? "Saving…" : editingId ? "Save Changes" : "Save Matter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
