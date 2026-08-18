"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { InlineSelect, InlineText } from "../Inline";
import { usePortal } from "../PortalProvider";

const EMPTY = {
  name: "",
  primary_contact: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

export default function ClientsPage() {
  const { userName } = usePortal();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);

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

  const rows = useMemo(() => {
    if (sortAsc === null) return clients;
    return [...clients].sort((a, b) =>
      sortAsc
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
  }, [clients, sortAsc]);

  async function patch(id: string, changes: Partial<Client>) {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    );
    await supabase.from("clients").update(changes).eq("id", id);
  }

  // Update a contact field and record the old → new change in the activity feed.
  async function updateContact(
    client: Client,
    field: "email" | "phone" | "primary_contact",
    label: string,
    rawValue: string,
  ) {
    const oldVal = client[field];
    const newVal = rawValue.trim() || null;
    if (newVal === oldVal) return;
    await patch(client.id, { [field]: newVal } as Partial<Client>);
    await supabase.from("activity_log").insert({
      kind: "client_updated",
      client_id: client.id,
      description: `${userName} updated ${client.name}'s ${label} from ${
        oldVal || "—"
      } to ${newVal || "—"}`,
    });
  }

  async function addClient() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: created } = await supabase
      .from("clients")
      .insert({
        name: form.name.trim(),
        primary_contact: form.primary_contact.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
      })
      .select("id")
      .single();
    await supabase.from("activity_log").insert({
      kind: "client_added",
      client_id: created?.id ?? null,
      description: `${userName} added client ${form.name.trim()}`,
    });
    setForm(EMPTY);
    setOpen(false);
    setSaving(false);
    load();
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Clients</h1>
        <button className="btn" onClick={() => setOpen(true)} type="button">
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
                <th
                  className="sortable"
                  onClick={() => setSortAsc((s) => (s === true ? false : true))}
                >
                  Name{" "}
                  {sortAsc === null ? "↕" : sortAsc ? "↑" : "↓"}
                </th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="strong-cell">
                    <InlineText
                      value={c.name}
                      onSave={(v) => {
                        if (v) patch(c.id, { name: v });
                      }}
                    />
                  </td>
                  <td>
                    <InlineText
                      value={c.primary_contact}
                      onSave={(v) =>
                        updateContact(c, "primary_contact", "primary contact", v)
                      }
                    />
                  </td>
                  <td>
                    <InlineText
                      value={c.email}
                      type="email"
                      onSave={(v) => updateContact(c, "email", "email", v)}
                    />
                  </td>
                  <td>
                    <InlineText
                      value={c.phone}
                      type="tel"
                      onSave={(v) => updateContact(c, "phone", "phone number", v)}
                    />
                  </td>
                  <td>
                    <InlineSelect
                      value={c.status}
                      className={`pill-${c.status}`}
                      options={[
                        { value: "active", label: "active" },
                        { value: "inactive", label: "inactive" },
                      ]}
                      onSave={(v) => patch(c.id, { status: v })}
                    />
                  </td>
                  <td className="actions-cell">
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="link-btn"
                    >
                      Open ›
                    </Link>
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={addClient}
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
