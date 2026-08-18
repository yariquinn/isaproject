"use client";

import Link from "next/link";
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
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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

  function openAdd() {
    setForm(EMPTY);
    setEditingId(null);
    setOpen(true);
  }

  function openEdit(c: Client) {
    setForm({
      name: c.name,
      primary_contact: c.primary_contact ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
    });
    setEditingId(c.id);
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      primary_contact: form.primary_contact.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };
    if (editingId) {
      await supabase.from("clients").update(payload).eq("id", editingId);
    } else {
      await supabase.from("clients").insert(payload);
      await supabase.from("activity_log").insert({
        kind: "client_added",
        description: `Client added: ${payload.name}`,
      });
    }
    setForm(EMPTY);
    setEditingId(null);
    setOpen(false);
    setSaving(false);
    load();
  }

  async function updateStatus(c: Client, status: string) {
    setClients((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status } : x)),
    );
    await supabase.from("clients").update({ status }).eq("id", c.id);
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Clients</h1>
        <button className="btn" onClick={openAdd} type="button">
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td className="strong-cell">
                    <Link href={`/dashboard/clients/${c.id}`} className="row-link">
                      {c.name}
                    </Link>
                  </td>
                  <td>{c.primary_contact || "—"}</td>
                  <td>{c.email || "—"}</td>
                  <td>{c.phone || "—"}</td>
                  <td>
                    <select
                      className={`inline-status pill-${c.status}`}
                      value={c.status}
                      onChange={(e) => updateStatus(c, e.target.value)}
                    >
                      <option value="active">active</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </td>
                  <td className="actions-cell">
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => openEdit(c)}
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
            <h3>{editingId ? "Edit Client" : "Add Client"}</h3>
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
                {saving ? "Saving…" : editingId ? "Save Changes" : "Save Client"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
