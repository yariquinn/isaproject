"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { ActivityItem, Client, Matter } from "@/lib/types";
import { InlineText, InlineTextarea } from "../../Inline";
import { usePortal, useCrumbs } from "../../PortalProvider";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type GuardField = "email" | "phone" | "address" | "primary_contact" | "contact_title";
const NEW_FORM = { name: "", email: "", phone: "", address: "" };

export default function ClientDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

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
    const [{ data: c }, { data: all }, { data: m }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", params.id).single(),
      supabase.from("clients").select("*").order("name"),
      supabase.from("matters").select("*").eq("client_id", params.id).order("created_at", { ascending: false }),
    ]);
    setClient((c as Client) ?? null);
    setAllClients((all as Client[]) ?? []);
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
  async function splitPartner() {
    if (!client?.partner_name) return;
    const { data: created } = await supabase
      .from("clients")
      .insert({
        name: client.partner_name,
        client_type: "individual",
        primary_contact: client.partner_name,
        email: client.partner_email,
        phone: client.partner_phone,
        address: client.address,
      })
      .select("*")
      .single();
    if (created) {
      const nc = created as Client;
      await supabase.from("activity_log").insert({
        kind: "client_added",
        client_id: nc.id,
        description: `${userName} created a separate record for ${client.partner_name} (split from ${client.name})`,
      });
      router.push(`/dashboard/clients/${nc.id}`);
    }
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

  useCrumbs(
    client
      ? [{ label: "Clients", href: "/dashboard/clients" }, { label: client.name }]
      : [],
  );

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
      <span className={`pill pill-${m.status}`}>{m.status === "closed" ? "Closed" : "Active"}</span>
    </li>
  );

  return (
    <div>
      <Link href="/dashboard/clients" className="back-link">← Clients</Link>
      <div className="page-head">
        <div className="head-name">
          <h1 className="page-title editable-title">
            <InlineText value={client.name} onSave={(v) => { if (v) patch({ name: v }); }} />
          </h1>
          <div className="matter-substrip">
            <span className={`status-pill status-${client.archived ? "closed" : "active"}`}>
              {client.archived ? "Archived" : "Active"}
            </span>
            <span className="strip-sep">·</span>
            <span className="strip-item">
              Added{" "}
              {new Date(client.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      <div className="detail-cols" style={{ marginBottom: "1.5rem" }}>
        {/* Unified contact card — mirrors the Client card on a matter for continuity */}
        <div className="panel">
          <div className="panel-head">
            <h2 className="panel-title">Contact</h2>
            {client.client_type !== "business" && client.partner_name && (
              <button type="button" className="ghost sm" onClick={splitPartner} title="Create a standalone client record for the second contact">
                Split second contact →
              </button>
            )}
          </div>
          <dl className="cc-fields">
            <div>
              <dt>{client.client_type === "business" ? "Contact person" : "Primary contact"}</dt>
              <dd>
                <button type="button" className="contact-picker" onClick={openContactModal}>
                  {client.primary_contact || "Search or add a contact…"}<span className="cp-icon">⌕</span>
                </button>
              </dd>
            </div>
            {client.client_type === "business" && (
              <div><dt>Title</dt><dd><Guarded field="contact_title" label="title" /></dd></div>
            )}
            <div><dt>Email</dt><dd><Guarded field="email" label="email" type="email" /></dd></div>
            <div><dt>Phone</dt><dd><Guarded field="phone" label="phone number" type="tel" /></dd></div>
            <div>
              <dt>Address</dt>
              <dd>
                <Guarded field="address" label="address" />
              </dd>
            </div>
            {client.partner_name && (
              <div>
                <dt>Second contact</dt>
                <dd>
                  {client.partner_name}
                  {client.partner_phone ? ` · ${client.partner_phone}` : ""}
                </dd>
              </div>
            )}
          </dl>
          <div className="cc-notes">
            <dt>Client Notes</dt>
            <InlineTextarea value={client.notes} onSave={(v) => patch({ notes: v || null })} placeholder="Click to add client notes…" />
          </div>
        </div>

        <div className="panel">
          <h2 className="panel-title">Matters <span className="count-badge">{matters.length}</span></h2>
          <div className="panel-scroll">
            {matters.length === 0 ? <p className="muted-line">No matters yet.</p> : (
              <>
                <h3 className="subsection">Active <span className="count-badge">{openMatters.length}</span></h3>
                {openMatters.length === 0 ? <p className="muted-line">No active matters.</p> : (
                  <ul className="link-list">{openMatters.map((m) => <MatterRow key={m.id} m={m} />)}</ul>
                )}
                {closedMatters.length > 0 && (
                  <>
                    <h3 className="subsection muted">Closed <span className="count-badge">{closedMatters.length}</span></h3>
                    <ul className="link-list dim">{closedMatters.map((m) => <MatterRow key={m.id} m={m} />)}</ul>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>

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
