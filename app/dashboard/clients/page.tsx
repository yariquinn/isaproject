"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";

const EMPTY = {
  name: "",
  primary_contact: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    setClients((data as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from("clients").insert({
      name: form.name.trim(),
      primary_contact: form.primary_contact.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    });
    await supabase.from("activity_log").insert({
      kind: "client_added",
      description: `Client added: ${form.name.trim()}`,
    });
    setForm(EMPTY);
    setAdding(false);
    setSaving(false);
    load();
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Clients</h1>
        <button className="btn" onClick={() => setAdding(true)} type="button">
          + Add Client
        </button>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="muted-line">No clients yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="strong-cell">{c.name}</td>
                  <td>{c.primary_contact || "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>
                    <span className={`pill pill-${c.status}`}>{c.status}</span>
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
            <h3>Add Client</h3>
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Primary Contact
              <input
                value={form.primary_contact}
                onChange={(e) =>
                  setForm({ ...form, primary_contact: e.target.value })
                }
              />
            </label>
            <label>
              Email
              <input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label>
              Phone
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label>
              Address
              <input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </label>
            <label>
              Notes
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
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
                {saving ? "Saving…" : "Save Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
