"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Client } from "@/lib/types";
import { usePortal } from "../PortalProvider";

const EMPTY = {
  name: "",
  primary_contact: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
};

type GuardField = "primary_contact" | "email" | "phone";
const NEW_FORM = { name: "", email: "", phone: "", address: "" };

export default function ClientsPage() {
  const { userName } = usePortal();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"open" | "archived" | "all">("open");
  const [activeMatters, setActiveMatters] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [expanded, setExpanded] = useState<string | null>(null);

  // Guarded editing (mirrors the client record)
  const [prompt, setPrompt] = useState<{
    client: Client;
    field: GuardField;
    label: string;
  } | null>(null);
  const [activeEdit, setActiveEdit] = useState<{
    clientId: string;
    field: GuardField;
  } | null>(null);
  const [draft, setDraft] = useState("");

  // Switch-contact modal
  const [contactFor, setContactFor] = useState<Client | null>(null);
  const [contactTab, setContactTab] = useState<"search" | "new">("search");
  const [contactQuery, setContactQuery] = useState("");
  const [newForm, setNewForm] = useState(NEW_FORM);

  async function load() {
    const [{ data }, { data: ms }] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("matters").select("id,name,client_id,status"),
    ]);
    setClients((data as Client[]) ?? []);
    const map: Record<string, { id: string; name: string }[]> = {};
    for (const m of (ms as { id: string; name: string; client_id: string | null; status: string }[]) ?? []) {
      if (m.client_id && m.status !== "closed") {
        (map[m.client_id] ??= []).push({ id: m.id, name: m.name });
      }
    }
    setActiveMatters(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = clients.filter((c) =>
      view === "archived" ? c.archived : view === "open" ? !c.archived : true,
    );
    if (q) {
      list = list.filter((c) =>
        [c.name, c.primary_contact, c.email, c.phone, c.address]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    if (sortAsc === null) return list;
    return [...list].sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [clients, sortAsc, query, view]);

  async function patch(id: string, changes: Partial<Client>) {
    setClients((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    );
    await supabase.from("clients").update(changes).eq("id", id);
  }

  async function logChange(clientId: string, description: string) {
    await supabase
      .from("activity_log")
      .insert({ kind: "client_updated", client_id: clientId, description });
  }

  // Path 1: keep the same contact, correct their info.
  async function saveField(client: Client, field: GuardField, label: string) {
    setActiveEdit(null);
    const oldVal = client[field];
    const newVal = draft.trim() || null;
    if (newVal === oldVal) return;
    await patch(client.id, { [field]: newVal } as Partial<Client>);
    await logChange(
      client.id,
      `${userName} updated ${client.primary_contact || "this contact"}'s ${label} from ${
        oldVal || "—"
      } to ${newVal || "—"}`,
    );
  }

  // Path 2a: switch the contact to an existing client's details.
  async function applyExisting(target: Client, source: Client) {
    await patch(target.id, {
      primary_contact: source.name,
      email: source.email,
      phone: source.phone,
      address: source.address,
    });
    await logChange(
      target.id,
      `${userName} changed the primary contact for ${target.name} to ${source.name} (existing client)`,
    );
    setContactFor(null);
  }

  // Path 2b: switch the contact by creating a new client.
  async function createAndApply(target: Client) {
    if (!newForm.name.trim()) return;
    const { data: created } = await supabase
      .from("clients")
      .insert({
        name: newForm.name.trim(),
        email: newForm.email.trim() || null,
        phone: newForm.phone.trim() || null,
        address: newForm.address.trim() || null,
      })
      .select("*")
      .single();
    if (created) {
      await supabase.from("activity_log").insert({
        kind: "client_added",
        client_id: (created as Client).id,
        description: `${userName} added client ${(created as Client).name}`,
      });
    }
    await patch(target.id, {
      primary_contact: newForm.name.trim(),
      email: newForm.email.trim() || null,
      phone: newForm.phone.trim() || null,
      address: newForm.address.trim() || null,
    });
    await logChange(
      target.id,
      `${userName} changed the primary contact for ${target.name} to ${newForm.name.trim()} (new client created)`,
    );
    setContactFor(null);
  }

  function openContactModal(client: Client) {
    setContactTab("search");
    setContactQuery("");
    setNewForm(NEW_FORM);
    setContactFor(client);
  }

  const contactResults = useMemo(() => {
    if (!contactFor) return [];
    const q = contactQuery.trim().toLowerCase();
    return clients
      .filter((c) => c.id !== contactFor.id)
      .filter((c) => (q ? c.name.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [clients, contactQuery, contactFor]);

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
    setAddOpen(false);
    setSaving(false);
    load();
  }

  // A guarded cell: value opens the prompt; when active it becomes an input.
  const Guarded = ({
    client,
    field,
    label,
    type = "text",
  }: {
    client: Client;
    field: GuardField;
    label: string;
    type?: string;
  }) =>
    activeEdit?.clientId === client.id && activeEdit.field === field ? (
      <input
        className="inline-input"
        type={type}
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => saveField(client, field, label)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setActiveEdit(null);
        }}
      />
    ) : (
      <span
        className="inline-view"
        onClick={() => setPrompt({ client, field, label })}
        title="Click to edit"
      >
        {client[field] || <span className="inline-placeholder">—</span>}
      </span>
    );

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Clients</h1>
        <div className="head-controls">
          <input
            className="activity-search"
            type="search"
            placeholder="Search clients…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={() => setAddOpen(true)} type="button">
            + Add Client
          </button>
        </div>
      </div>

      <div className="seg" style={{ marginBottom: "1.25rem" }}>
        {(["open", "archived", "all"] as const).map((v) => (
          <button
            key={v}
            type="button"
            className={view === v ? "active" : undefined}
            onClick={() => setView(v)}
          >
            {v === "open" ? "Open" : v === "archived" ? "Archived" : "All"}
          </button>
        ))}
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
                  Name {sortAsc === null ? "↕" : sortAsc ? "↑" : "↓"}
                </th>
                <th>Contact</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Active Matters</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <Fragment key={c.id}>
                <tr>
                  <td className="strong-cell">
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="row-link"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td>
                    <Guarded
                      client={c}
                      field="primary_contact"
                      label="primary contact"
                    />
                  </td>
                  <td>
                    <Guarded
                      client={c}
                      field="email"
                      label="email"
                      type="email"
                    />
                  </td>
                  <td>
                    <Guarded
                      client={c}
                      field="phone"
                      label="phone number"
                      type="tel"
                    />
                  </td>
                  <td>
                    {activeMatters[c.id]?.length ? (
                      <button
                        type="button"
                        className="pill pill-open active-pill"
                        onClick={() =>
                          setExpanded((e) => (e === c.id ? null : c.id))
                        }
                      >
                        {activeMatters[c.id].length} Active{" "}
                        {expanded === c.id ? "▾" : "▸"}
                      </button>
                    ) : (
                      <span className="inline-placeholder">—</span>
                    )}
                  </td>
                </tr>
                {expanded === c.id && activeMatters[c.id]?.length ? (
                  <tr className="expand-row">
                    <td colSpan={5}>
                      <div className="active-matter-links">
                        {activeMatters[c.id].map((m) => (
                          <Link
                            key={m.id}
                            href={`/dashboard/matters/${m.id}`}
                            className="active-matter-chip"
                          >
                            {m.name} →
                          </Link>
                        ))}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Prompt: update this contact, or switch to a different one */}
      {prompt && (
        <div className="modal-backdrop" onClick={() => setPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editing {prompt.label}</h3>
            <p className="modal-dur">
              Are we updating{" "}
              <strong>{prompt.client.primary_contact || "this contact"}</strong>
              &rsquo;s information, or is a different person the primary contact?
            </p>
            <div className="stack-actions">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setDraft(prompt.client[prompt.field] ?? "");
                  setActiveEdit({
                    clientId: prompt.client.id,
                    field: prompt.field,
                  });
                  setPrompt(null);
                }}
              >
                Update {prompt.client.primary_contact || "this contact"}
                &rsquo;s info
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  const client = prompt.client;
                  setPrompt(null);
                  openContactModal(client);
                }}
              >
                Switch to a different contact
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact search / create modal */}
      {contactFor && (
        <div className="modal-backdrop" onClick={() => setContactFor(null)}>
          <div
            className="modal contact-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Set primary contact — {contactFor.name}</h3>
            <div className="doc-tabs" style={{ marginBottom: "0.5rem" }}>
              <button
                type="button"
                className={contactTab === "search" ? "active" : undefined}
                onClick={() => setContactTab("search")}
              >
                Search existing
              </button>
              <button
                type="button"
                className={contactTab === "new" ? "active" : undefined}
                onClick={() => setContactTab("new")}
              >
                Add new client
              </button>
            </div>

            {contactTab === "search" ? (
              <>
                <input
                  className="activity-search"
                  type="search"
                  autoFocus
                  placeholder="Search clients…"
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  style={{ width: "100%" }}
                />
                <div className="matter-pick">
                  {contactResults.length === 0 ? (
                    <p className="muted-line">No matching clients.</p>
                  ) : (
                    contactResults.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="matter-pick-item"
                        onClick={() => applyExisting(contactFor, c)}
                      >
                        <span className="mp-name">{c.name}</span>
                        <span className="mp-sub">
                          {c.email || "no email"} · {c.phone || "no phone"}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              </>
            ) : (
              <>
                <label>
                  Name
                  <input
                    value={newForm.name}
                    onChange={(e) =>
                      setNewForm({ ...newForm, name: e.target.value })
                    }
                  />
                </label>
                <label>
                  Email
                  <input
                    value={newForm.email}
                    onChange={(e) =>
                      setNewForm({ ...newForm, email: e.target.value })
                    }
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={newForm.phone}
                    onChange={(e) =>
                      setNewForm({ ...newForm, phone: e.target.value })
                    }
                  />
                </label>
                <label>
                  Address
                  <input
                    value={newForm.address}
                    onChange={(e) =>
                      setNewForm({ ...newForm, address: e.target.value })
                    }
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setContactFor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => createAndApply(contactFor)}
                    disabled={!newForm.name.trim()}
                  >
                    Create &amp; set as contact
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Add client modal */}
      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
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
                onClick={() => setAddOpen(false)}
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
