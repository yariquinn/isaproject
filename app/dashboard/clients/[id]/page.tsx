"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  ActivityItem,
  Client,
  Invoice,
  Matter,
  TimeEntry,
  Todo,
} from "@/lib/types";
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
function fmtHm(s: number) {
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

type GuardField = "email" | "phone" | "address" | "primary_contact";
type Tab = "overview" | "contacts" | "time" | "tasks" | "invoices" | "billing" | "activity";
const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "contacts", label: "Contacts" },
  { key: "time", label: "Time Entries" },
  { key: "tasks", label: "Tasks" },
  { key: "invoices", label: "Invoices" },
  { key: "billing", label: "Billing" },
  { key: "activity", label: "Activity" },
];
const NEW_FORM = { name: "", email: "", phone: "", address: "" };

export default function ClientDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const [prompt, setPrompt] = useState<{ field: GuardField; label: string } | null>(null);
  const [activeEdit, setActiveEdit] = useState<GuardField | null>(null);
  const [draft, setDraft] = useState("");
  const [contactModal, setContactModal] = useState(false);
  const [contactTab, setContactTab] = useState<"search" | "new">("search");
  const [contactQuery, setContactQuery] = useState("");
  const [newForm, setNewForm] = useState(NEW_FORM);

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
    const [{ data: c }, { data: all }, { data: m }, { data: inv }] =
      await Promise.all([
        supabase.from("clients").select("*").eq("id", params.id).single(),
        supabase.from("clients").select("*").order("name"),
        supabase.from("matters").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
        supabase.from("invoices").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
      ]);
    setClient((c as Client) ?? null);
    setAllClients((all as Client[]) ?? []);
    const ms = (m as Matter[]) ?? [];
    setMatters(ms);
    setInvoices((inv as Invoice[]) ?? []);
    const ids = ms.map((x) => x.id);
    if (ids.length) {
      const [{ data: te }, { data: td }] = await Promise.all([
        supabase.from("time_entries").select("*").in("matter_id", ids).order("logged_at", { ascending: false }),
        supabase.from("todos").select("*").in("matter_id", ids).order("created_at", { ascending: false }),
      ]);
      setEntries((te as TimeEntry[]) ?? []);
      setTodos((td as Todo[]) ?? []);
    } else {
      setEntries([]);
      setTodos([]);
    }
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
  async function logChange(description: string) {
    if (!client) return;
    await supabase.from("activity_log").insert({ kind: "client_updated", client_id: client.id, description });
    loadActivity();
  }
  const contactName = client?.primary_contact || "this contact";

  async function saveField(field: GuardField, label: string) {
    setActiveEdit(null);
    if (!client) return;
    const oldVal = client[field];
    const newVal = draft.trim() || null;
    if (newVal === oldVal) return;
    await patch({ [field]: newVal } as Partial<Client>);
    await logChange(`${userName} updated ${contactName}'s ${label} from ${oldVal || "—"} to ${newVal || "—"}`);
  }
  async function applyExisting(source: Client) {
    await patch({ primary_contact: source.name, email: source.email, phone: source.phone, address: source.address });
    await logChange(`${userName} changed the primary contact to ${source.name} (existing client)`);
    setContactModal(false);
  }
  async function createAndApply() {
    if (!newForm.name.trim() || !client) return;
    const { data: created } = await supabase.from("clients").insert({
      name: newForm.name.trim(),
      email: newForm.email.trim() || null,
      phone: newForm.phone.trim() || null,
      address: newForm.address.trim() || null,
    }).select("*").single();
    if (created) {
      await supabase.from("activity_log").insert({ kind: "client_added", client_id: (created as Client).id, description: `${userName} added client ${(created as Client).name}` });
    }
    await patch({ primary_contact: newForm.name.trim(), email: newForm.email.trim() || null, phone: newForm.phone.trim() || null, address: newForm.address.trim() || null });
    await logChange(`${userName} changed the primary contact to ${newForm.name.trim()} (new client created)`);
    setContactModal(false);
  }
  function openContactModal() {
    setContactTab("search");
    setContactQuery("");
    setNewForm(NEW_FORM);
    setContactModal(true);
  }
  const contactResults = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    return allClients.filter((c) => c.id !== params.id).filter((c) => (q ? c.name.toLowerCase().includes(q) : true)).slice(0, 8);
  }, [allClients, contactQuery, params.id]);

  if (loading) return <p className="muted-line">Loading…</p>;
  if (!client)
    return (
      <div>
        <Link href="/dashboard/clients" className="back-link">← Clients</Link>
        <p className="muted-line">Client not found.</p>
      </div>
    );

  const openMatters = matters.filter((m) => m.status !== "closed");
  const closedMatters = matters.filter((m) => m.status === "closed");
  const matterName = (id: string | null) => matters.find((m) => m.id === id)?.name ?? "—";

  const Guarded = ({ field, label, type = "text" }: { field: GuardField; label: string; type?: string }) =>
    activeEdit === field ? (
      <input className="inline-input" type={type} autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => saveField(field, label)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setActiveEdit(null); }} />
    ) : (
      <span className="inline-view" onClick={() => setPrompt({ field, label })} title="Click to edit">
        {client[field] || <span className="inline-placeholder">—</span>}
      </span>
    );

  const MatterRow = ({ m }: { m: Matter }) => (
    <li>
      <Link href={`/dashboard/matters/${m.id}`}>{m.name}</Link>
      <span className="muted-line">{m.practice_area}</span>
      <span className={`pill pill-${m.status}`}>{m.status}</span>
    </li>
  );

  return (
    <div>
      <Link href="/dashboard/clients" className="back-link">← Clients</Link>
      <div className="page-head">
        <h1 className="page-title editable-title">
          <InlineText value={client.name} onSave={(v) => { if (v) patch({ name: v }); }} />
        </h1>
        <span className={`pill pill-${client.status}`}>{client.status}</span>
      </div>

      <div className="doc-tabs client-tabs">
        {TABS.map((t) => (
          <button key={t.key} type="button" className={tab === t.key ? "active" : undefined} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="detail-grid">
            <div className="detail-item"><span className="detail-label">Primary Contact</span>
              <button type="button" className="contact-picker" onClick={openContactModal}>
                {client.primary_contact || "Search or add a contact…"}<span className="cp-icon">⌕</span>
              </button>
            </div>
            <div className="detail-item"><span className="detail-label">Email</span><Guarded field="email" label="email" type="email" /></div>
            <div className="detail-item"><span className="detail-label">Phone</span><Guarded field="phone" label="phone number" type="tel" /></div>
            <div className="detail-item"><span className="detail-label">Address</span><Guarded field="address" label="address" /></div>
          </div>
          <div className="panel" style={{ marginBottom: "1.5rem" }}>
            <h2 className="panel-title">Notes</h2>
            <InlineTextarea value={client.notes} onSave={(v) => patch({ notes: v || null })} placeholder="Click to add notes…" />
          </div>
          <div className="panel">
            <h2 className="panel-title">Matters ({matters.length})</h2>
            {matters.length === 0 ? <p className="muted-line">No matters yet.</p> : (
              <>
                <h3 className="subsection">Active ({openMatters.length})</h3>
                {openMatters.length === 0 ? <p className="muted-line">No active matters.</p> : (
                  <ul className="link-list">{openMatters.map((m) => <MatterRow key={m.id} m={m} />)}</ul>
                )}
                {closedMatters.length > 0 && (
                  <>
                    <h3 className="subsection muted">Closed ({closedMatters.length})</h3>
                    <ul className="link-list dim">{closedMatters.map((m) => <MatterRow key={m.id} m={m} />)}</ul>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}

      {tab === "contacts" && (
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Primary Contact</h2>
            <button className="btn" type="button" onClick={openContactModal}>Set contact</button>
          </div>
          <div className="detail-grid" style={{ marginBottom: 0 }}>
            <div className="detail-item"><span className="detail-label">Name</span>{client.primary_contact || "—"}</div>
            <div className="detail-item"><span className="detail-label">Email</span>{client.email || "—"}</div>
            <div className="detail-item"><span className="detail-label">Phone</span>{client.phone || "—"}</div>
            <div className="detail-item"><span className="detail-label">Address</span>{client.address || "—"}</div>
          </div>
        </div>
      )}

      {tab === "time" && (
        <div className="panel">
          <h2 className="panel-title">Time Entries ({entries.length})</h2>
          {entries.length === 0 ? <p className="muted-line">No time logged for this client.</p> : (
            <div className="table-wrap" style={{ border: "none" }}>
              <table className="data-table">
                <thead><tr><th>Date</th><th>Matter</th><th>Activity</th><th>Lawyer</th><th>Duration</th></tr></thead>
                <tbody>{entries.map((e) => (
                  <tr key={e.id}>
                    <td>{new Date(e.logged_at).toLocaleDateString()}</td>
                    <td><Link href={`/dashboard/matters/${e.matter_id}`} className="row-link">{matterName(e.matter_id)}</Link></td>
                    <td>{e.activity || "—"}</td><td>{e.lawyer}</td><td>{fmtHm(e.duration_seconds)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "tasks" && (
        <div className="panel">
          <h2 className="panel-title">Tasks ({todos.length})</h2>
          {todos.length === 0 ? <p className="muted-line">No tasks for this client&rsquo;s matters.</p> : (
            <ul className="link-list">{todos.map((t) => (
              <li key={t.id}>
                <span className={t.done ? "todo-title done" : ""} style={t.done ? { textDecoration: "line-through", color: "var(--dash-muted)" } : undefined}>{t.title}</span>
                <span className="muted-line">{matterName(t.matter_id)}</span>
                {t.assignee && <span className="todo-assignee">{(t.assignee || "").split(" ")[0]}</span>}
              </li>
            ))}</ul>
          )}
        </div>
      )}

      {tab === "invoices" && (
        <div className="panel">
          <h2 className="panel-title">Invoices ({invoices.length})</h2>
          {invoices.length === 0 ? <p className="muted-line">No invoices for this client.</p> : (
            <div className="table-wrap" style={{ border: "none" }}>
              <table className="data-table">
                <thead><tr><th>Invoice</th><th>Matter</th><th>Amount</th><th>Due</th><th>Status</th></tr></thead>
                <tbody>{invoices.map((i) => (
                  <tr key={i.id}>
                    <td className="strong-cell">{i.number || "—"}</td>
                    <td>{i.matter_id ? <Link href={`/dashboard/matters/${i.matter_id}`} className="row-link">{matterName(i.matter_id)}</Link> : "—"}</td>
                    <td>{i.amount != null ? `$${i.amount.toFixed(2)}` : "—"}</td>
                    <td>{i.due_date ? new Date(i.due_date).toLocaleDateString() : "—"}</td>
                    <td><span className={`pill inv-${i.status}`}>{i.status}</span></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "billing" && (
        <div className="panel">
          <h2 className="panel-title">Billing Preferences</h2>
          <p className="muted-line" style={{ marginBottom: "0.75rem" }}>
            Notes on how this client prefers to be billed, payment terms, or anything else billing-related.
          </p>
          <InlineTextarea value={client.billing_notes} onSave={(v) => patch({ billing_notes: v || null })} placeholder="Click to add billing notes…" />
        </div>
      )}

      {tab === "activity" && (
        <div className="panel">
          <h2 className="panel-title">Activity</h2>
          <div className="panel-scroll">
            {activity.length === 0 ? <p className="muted-line">No activity for this client yet.</p> : (
              <ul className="activity-list">{activity.map((a) => (
                <li key={a.id}>
                  <span className="act-tag tag-client">Client</span>
                  <span className="act-desc">{a.description}</span>
                  <span className="act-time">{timeAgo(a.created_at)}</span>
                </li>
              ))}</ul>
            )}
          </div>
        </div>
      )}

      {prompt && (
        <div className="modal-backdrop" onClick={() => setPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editing {prompt.label}</h3>
            <p className="modal-dur">Are we updating <strong>{contactName}</strong>&rsquo;s information, or is a different person the primary contact?</p>
            <div className="stack-actions">
              <button type="button" className="btn" onClick={() => { setDraft(client[prompt.field] ?? ""); setActiveEdit(prompt.field); setPrompt(null); }}>
                Update {contactName}&rsquo;s info
              </button>
              <button type="button" className="ghost" onClick={() => { setPrompt(null); openContactModal(); }}>
                Switch to a different contact
              </button>
            </div>
          </div>
        </div>
      )}

      {contactModal && (
        <div className="modal-backdrop" onClick={() => setContactModal(false)}>
          <div className="modal contact-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Set primary contact</h3>
            <div className="doc-tabs" style={{ marginBottom: "0.5rem" }}>
              <button type="button" className={contactTab === "search" ? "active" : undefined} onClick={() => setContactTab("search")}>Search existing</button>
              <button type="button" className={contactTab === "new" ? "active" : undefined} onClick={() => setContactTab("new")}>Add new client</button>
            </div>
            {contactTab === "search" ? (
              <>
                <input className="activity-search" type="search" autoFocus placeholder="Search clients…" value={contactQuery} onChange={(e) => setContactQuery(e.target.value)} style={{ width: "100%" }} />
                <div className="matter-pick">
                  {contactResults.length === 0 ? <p className="muted-line">No matching clients.</p> : contactResults.map((c) => (
                    <button key={c.id} type="button" className="matter-pick-item" onClick={() => applyExisting(c)}>
                      <span className="mp-name">{c.name}</span>
                      <span className="mp-sub">{c.email || "no email"} · {c.phone || "no phone"}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {(["name", "email", "phone", "address"] as const).map((f) => (
                  <label key={f}>{f[0].toUpperCase() + f.slice(1)}
                    <input value={newForm[f]} onChange={(e) => setNewForm({ ...newForm, [f]: e.target.value })} />
                  </label>
                ))}
                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={() => setContactModal(false)}>Cancel</button>
                  <button type="button" className="btn" onClick={createAndApply} disabled={!newForm.name.trim()}>Create &amp; set as contact</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
