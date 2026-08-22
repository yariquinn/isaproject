"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRACTICE_AREAS, ATTORNEYS, CONTACT_TITLES, type ActivityItem, type Client, type Invoice, type Matter } from "@/lib/types";

const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";
import { InlineText, InlineTextarea } from "../../Inline";
import { usePortal, useCrumbs } from "../../PortalProvider";
import { pushRecent } from "@/lib/recents";
import TitlePill from "../../TitlePill";
import CopyButton from "../../CopyButton";

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
const NEW_FORM = { name: "", title: "", email: "", phone: "", address: "" };

export default function ClientDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const router = useRouter();
  const [client, setClient] = useState<Client | null>(null);
  const [allClients, setAllClients] = useState<Client[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [recordTab, setRecordTab] = useState<"overview" | "invoices">("overview");
  const changeRecordTab = (t: "overview" | "invoices") => {
    const y = window.scrollY;
    setRecordTab(t);
    requestAnimationFrame(() => window.scrollTo(0, y));
  };
  const [loading, setLoading] = useState(true);

  // Combined card is adjustable two ways: the OUTER RIGHT edge sets the whole
  // panel's width (it shrinks/grows, leaving margin on the right of the page);
  // the middle divider sets the contact/matters split inside it.
  const wrapRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [comboRatio, setComboRatio] = useState(0.5);  // contact/matters split
  const [comboWidth, setComboWidth] = useState(1);    // overall panel width
  const [comboDrag, setComboDrag] = useState<null | "mid" | "width">(null);
  useEffect(() => {
    try {
      const a = parseFloat(localStorage.getItem("clientComboRatio") || "");
      if (!Number.isNaN(a)) setComboRatio(Math.min(0.7, Math.max(0.25, a)));
      const b = parseFloat(localStorage.getItem("clientComboWidth") || "");
      if (!Number.isNaN(b)) setComboWidth(Math.min(1, Math.max(0.55, b)));
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    if (!comboDrag) return;
    const onMove = (e: MouseEvent) => {
      if (comboDrag === "width") {
        const w = wrapRef.current;
        if (!w) return;
        const r = w.getBoundingClientRect();
        setComboWidth(Math.min(1, Math.max(0.55, (e.clientX - r.left) / r.width)));
      } else {
        const g = gridRef.current;
        if (!g) return;
        const r = g.getBoundingClientRect();
        setComboRatio(Math.min(0.7, Math.max(0.25, (e.clientX - r.left) / r.width)));
      }
    };
    const onUp = () => {
      setComboDrag(null);
      try {
        localStorage.setItem("clientComboRatio", String(comboRatio));
        localStorage.setItem("clientComboWidth", String(comboWidth));
      } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [comboDrag, comboRatio, comboWidth]);

  const [prompt, setPrompt] = useState<{ field: GuardField; label: string } | null>(null);
  // Once the user confirms they're updating the CURRENT primary contact, we
  // stop asking for the rest of this page visit (resets on remount/navigation).
  const [contactConfirmed, setContactConfirmed] = useState(false);
  const [activeEdit, setActiveEdit] = useState<GuardField | null>(null);
  const [draft, setDraft] = useState("");
  const [contactModal, setContactModal] = useState(false);
  const [contactTab, setContactTab] = useState<"search" | "new">("search");
  const [contactQuery, setContactQuery] = useState("");
  const [newForm, setNewForm] = useState(NEW_FORM);
  const [splitOpen, setSplitOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [billingOther, setBillingOther] = useState(false);
  const [billingSearch, setBillingSearch] = useState("");
  const [billingSearchOpen, setBillingSearchOpen] = useState(false);
  const [addMatterOpen, setAddMatterOpen] = useState(false);
  const [mForm, setMForm] = useState({ name: "", practice_area: PRACTICE_AREAS[0] as string, assigned_to: ATTORNEYS[0] as string });
  const [mSaving, setMSaving] = useState(false);

  async function addMatter() {
    if (!mForm.name.trim() || !client) return;
    setMSaving(true);
    const { data: created } = await supabase
      .from("matters")
      .insert({
        name: mForm.name.trim(),
        client_id: client.id,
        practice_area: mForm.practice_area,
        assigned_to: mForm.assigned_to,
        status: "active",
        priority: "-",
        opened_by: userName,
      })
      .select("id")
      .single();
    await supabase.from("activity_log").insert({
      kind: "matter_created",
      client_id: client.id,
      matter_id: created?.id ?? null,
      description: `${userName} opened matter ${mForm.name.trim()}`,
    });
    setMSaving(false);
    setAddMatterOpen(false);
    setMForm({ name: "", practice_area: PRACTICE_AREAS[0], assigned_to: ATTORNEYS[0] });
    if (created?.id) router.push(`/dashboard/matters/${created.id}`);
  }

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
    if (c) pushRecent("client", (c as Client).id, (c as Client).name);
    setAllClients((all as Client[]) ?? []);
    const matterList = (m as Matter[]) ?? [];
    setMatters(matterList);
    // Invoices for this client — either directly linked, or on any of the client's matters.
    const matterIds = matterList.map((mm) => mm.id);
    const orClause = matterIds.length
      ? `client_id.eq.${params.id},matter_id.in.(${matterIds.join(",")})`
      : `client_id.eq.${params.id}`;
    const { data: inv } = await supabase.from("invoices").select("*").or(orClause).order("created_at", { ascending: false });
    setInvoices((inv as Invoice[]) ?? []);
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
      created_by: userName,
    }).select("*").single();
    if (created) {
      await supabase.from("activity_log").insert({ kind: "client_added", client_id: (created as Client).id, description: `${userName} added client ${(created as Client).name}` });
    }
    await patch({ primary_contact: newForm.name.trim(), contact_title: newForm.title || null, email: newForm.email.trim() || null, phone: newForm.phone.trim() || null, address: newForm.address.trim() || null });
    await logChange(`${userName} changed the primary contact to ${newForm.name.trim()} (new client created)`);
    setContactModal(false);
  }
  async function splitPartner() {
    setSplitOpen(false);
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
        created_by: userName,
      })
      .select("*")
      .single();
    if (created) {
      const nc = created as Client;
      await supabase.from("clients").update({ partner_split: true }).eq("id", client.id);
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

  // Newest matters first (by open date, falling back to created_at).
  const byNewest = (a: Matter, b: Matter) =>
    ((b.open_date || b.created_at) > (a.open_date || a.created_at) ? 1 : -1);
  const openMatters = matters.filter((m) => m.status !== "closed").sort(byNewest);
  const closedMatters = matters.filter((m) => m.status === "closed").sort(byNewest);

  const Guarded = ({ field, label, type = "text" }: { field: GuardField; label: string; type?: string }) =>
    activeEdit === field ? (
      <input className="inline-input" type={type} autoFocus value={draft}
        onChange={(e) => setDraft(e.target.value)} onBlur={() => saveField(field, label)}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setActiveEdit(null); }} />
    ) : (
      <span
        className="inline-view"
        onClick={() => {
          // Businesses have a contact person who might change, so we ask — but
          // only until the user confirms once for this page visit.
          if (client?.client_type === "business" && !contactConfirmed) {
            setPrompt({ field, label });
          } else {
            setDraft(client?.[field] ?? "");
            setActiveEdit(field);
          }
        }}
        title="Click to edit"
      >
        {client[field] || <span className="inline-placeholder">—</span>}
      </span>
    );

  const MatterPill = ({ m }: { m: Matter }) => (
    <Link
      href={`/dashboard/matters/${m.id}`}
      className={`matter-card matter-card-${m.status}`}
    >
      <span className="matter-card-main">
        <span className="matter-card-name">{m.name}</span>
        <span className="matter-card-sub">
          <span className={`pill pill-${m.status}`}>{m.status === "closed" ? "Archived" : "Active"}</span>
          <span className="matter-card-date">
            Opened {new Date((m.open_date || m.created_at) + (m.open_date ? "T00:00:00" : "")).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </span>
          <span className="matter-card-area">{m.practice_area}</span>
        </span>
      </span>
    </Link>
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
              {client.created_by && <> by <strong className="strip-who">{client.created_by}</strong></>}
            </span>
          </div>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost sm" onClick={() => { setBillingOther(false); setEditOpen(true); }}>Edit</button>
          <button type="button" className="ghost sm" onClick={() => patch({ archived: !client.archived })}>
            {client.archived ? "Unarchive" : "Archive"}
          </button>
        </div>
      </div>

      {/* Contact + Matters combined into one panel. The outer-right handle
          resizes the whole panel; the middle divider sets the internal split. */}
      <div className="combo-wrap" ref={wrapRef}>
      <div className="panel combo-card" style={{ width: `${comboWidth * 100}%` }}>
        <div
          className="combo-grid combo-grid-resizable"
          ref={gridRef}
          style={{ ["--combo-left" as string]: `${comboRatio * 100}%` } as React.CSSProperties}
        >
        <div
          className={`combo-resize-handle${comboDrag === "mid" ? " dragging" : ""}`}
          style={{ left: `${comboRatio * 100}%` }}
          onMouseDown={() => setComboDrag("mid")}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the split"
        >
          <span className="combo-resize-grip" />
        </div>
        <div className="combo-col">
          <div className="panel-head">
            <h2 className="combo-title">Contact</h2>
            {client.client_type !== "business" && client.partner_name && (
              <button
                type="button"
                className="ghost sm"
                disabled={client.partner_split}
                onClick={() => { if (!client.partner_split) setSplitOpen(true); }}
                title={client.partner_split ? "Already split into its own client record" : "Create a standalone client record for the second contact"}
              >
                Split second contact →
              </button>
            )}
          </div>
          {client.client_type !== "business" && (
            <div className="cc-name-lead">{client.name}</div>
          )}
          <dl className="cc-fields">
            {client.client_type === "business" && (
              <div>
                <dt>Primary contact</dt>
                <dd className="cc-name-strong">
                  <span className="name-with-title">
                    <button type="button" className="contact-picker" onClick={openContactModal}>
                      {client.primary_contact || "Search or add a contact…"}<span className="cp-icon">⌕</span>
                    </button>
                    <TitlePill
                      value={client.contact_title}
                      onSave={(v) => patch({ contact_title: v || null })}
                      guard={() => {
                        if (client.client_type === "business" && !contactConfirmed) {
                          setPrompt({ field: "contact_title", label: "title" });
                          return false;
                        }
                        return true;
                      }}
                    />
                  </span>
                </dd>
              </div>
            )}
            <div><dt>Email</dt><dd className="dd-with-copy"><Guarded field="email" label="email" type="email" /><CopyButton value={client.email} label="Copy email" /></dd></div>
            <div><dt>Phone</dt><dd><Guarded field="phone" label="phone number" type="tel" /></dd></div>
            <div>
              <dt>Address</dt>
              <dd>
                <Guarded field="address" label="address" />
              </dd>
            </div>
            {client.partner_name && (() => {
              const partnerClient = allClients.find(
                (c) => c.id !== client.id && c.name === client.partner_name,
              );
              return (
                <div>
                  <dt>Second contact</dt>
                  <dd className="sc-dd">
                    <span className="sc-name-row">
                      {partnerClient ? (
                        <Link href={`/dashboard/clients/${partnerClient.id}`} className="row-link">
                          {client.partner_name}
                        </Link>
                      ) : (
                        client.partner_name
                      )}
                      {client.partner_relationship && (
                        <span className="rel-pill">{client.partner_relationship}</span>
                      )}
                    </span>
                    {client.partner_phone && (
                      <span className="sc-phone">{client.partner_phone}</span>
                    )}
                  </dd>
                </div>
              );
            })()}
            <div>
              <dt>Billing contact</dt>
              <dd>
                {client.billing_contact ? (
                  <InlineText
                    value={client.billing_contact}
                    onSave={(v) => patch({ billing_contact: v || null })}
                    placeholder="Same as primary"
                  />
                ) : (
                  <span className="billing-same">
                    Same as primary
                    {(client.primary_contact || client.name) ? ` · ${client.primary_contact || client.name}` : ""}
                  </span>
                )}
              </dd>
            </div>
            {(client.billing_contact || client.billing_email) && (
              <div>
                <dt>Billing email</dt>
                <dd>
                  <InlineText
                    value={client.billing_email}
                    onSave={(v) => patch({ billing_email: v || null })}
                    placeholder="Add billing email…"
                  />
                </dd>
              </div>
            )}
          </dl>
          <div className="cc-notes">
            <dt>Client Notes</dt>
            <InlineTextarea value={client.notes} onSave={(v) => patch({ notes: v || null })} placeholder="Click to add client notes…" />
          </div>
        </div>

        <div className="combo-col">
          <div className="panel-head">
            <h2 className="combo-title">Matters <span className="count-badge">{matters.length}</span></h2>
            <button type="button" className="btn icon-plus-btn sm-plus" style={{ marginTop: "-0.5rem", marginRight: "-0.35rem", alignSelf: "flex-start" }} onClick={() => { setMForm({ name: `${client.name} · `, practice_area: PRACTICE_AREAS[0], assigned_to: ATTORNEYS[0] }); setAddMatterOpen(true); }} title="Add matter" aria-label="Add matter">+</button>
          </div>
          <div className="panel-scroll">
            {matters.length === 0 ? <p className="muted-line">No matters yet.</p> : (
              <>
                {openMatters.length > 0 && (
                  <div className="matter-card-list">{openMatters.map((m) => <MatterPill key={m.id} m={m} />)}</div>
                )}
                {openMatters.length > 0 && closedMatters.length > 0 && (
                  <div className="link-list-divider" />
                )}
                {closedMatters.length > 0 && (
                  <div className="matter-card-list">{closedMatters.map((m) => <MatterPill key={m.id} m={m} />)}</div>
                )}
              </>
            )}
          </div>
        </div>
        </div>
        <div
          className={`combo-resize-handle combo-resize-handle-edge${comboDrag === "width" ? " dragging" : ""}`}
          onMouseDown={() => setComboDrag("width")}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize the panel"
        >
          <span className="combo-resize-grip" />
        </div>
      </div>
      </div>

      <div className="doc-tabs" style={{ margin: "1.25rem 0 1rem", justifyContent: "center" }}>
        <button type="button" className={recordTab === "overview" ? "active" : undefined} onClick={() => changeRecordTab("overview")}>
          Activity
        </button>
        <button type="button" className={recordTab === "invoices" ? "active" : undefined} onClick={() => changeRecordTab("invoices")}>
          Invoices <span className="count-badge">{invoices.length}</span>
        </button>
      </div>

      {recordTab === "overview" ? (
        <div className="panel">
          <h2 className="combo-title">Activity</h2>
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
      ) : (
        <div className="panel">
          <h2 className="combo-title">Invoices <span className="count-badge">{invoices.length}</span></h2>
          {invoices.length === 0 ? (
            <p className="muted-line">No invoices for this client yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Matter</th>
                    <th>Issued</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="strong-cell">
                        <Link href={`/dashboard/invoices/${inv.id}?from=/dashboard/clients/${params.id}`} className="row-link">
                          {inv.number || "Invoice"}
                        </Link>
                      </td>
                      <td>{matters.find((m) => m.id === inv.matter_id)?.name ?? "—"}</td>
                      <td>{shortDate(inv.issued_date)}</td>
                      <td>{shortDate(inv.due_date)}</td>
                      <td><span className={`pill inv-${inv.status}`}>{inv.status}</span></td>
                      <td style={{ textAlign: "right" }}>{money(inv.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editOpen && (
        <div className="modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit client</h3>
            <div className="couple-fields">
              <p className="field-note">Second contact (optional)</p>
              <div className="field-pair">
                <label>
                  Name
                  <input
                    value={client.partner_name ?? ""}
                    onChange={(e) => patch({ partner_name: e.target.value || null })}
                    placeholder="Second contact name"
                  />
                </label>
                <label>
                  Relationship
                  <select value={client.partner_relationship ?? ""} onChange={(e) => patch({ partner_relationship: e.target.value || null })}>
                    <option value="">Relationship…</option>
                    {["Spouse", "Partner", "Parent", "Child", "Sibling", "Colleague", "Signatory", "Other"].map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="field-pair">
                <label>
                  Email
                  <input value={client.partner_email ?? ""} onChange={(e) => patch({ partner_email: e.target.value || null })} />
                </label>
                <label>
                  Phone
                  <input value={client.partner_phone ?? ""} onChange={(e) => patch({ partner_phone: e.target.value || null })} />
                </label>
              </div>
            </div>
            {(() => {
              const bc = client.billing_contact;
              const partner = client.partner_name;
              const isExisting = !!bc && !!partner && bc === partner;
              const mode = billingOther
                ? "__other"
                : bc == null || bc === ""
                  ? "__same"
                  : isExisting
                    ? "__existing"
                    : "__other";
              return (
                <>
                  <label>
                    Billing contact
                    <select
                      value={mode}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__same") {
                          setBillingOther(false);
                          patch({ billing_contact: null });
                        } else if (v === "__existing") {
                          setBillingOther(false);
                          patch({ billing_contact: partner });
                        } else {
                          setBillingOther(true);
                          if (isExisting) patch({ billing_contact: "" });
                        }
                      }}
                    >
                      <option value="__same">Same as primary</option>
                      {partner && <option value="__existing">{partner} (existing contact)</option>}
                      <option value="__other">Other / new contact…</option>
                    </select>
                  </label>
                  {mode === "__other" && (() => {
                    const bq = billingSearch.trim().toLowerCase();
                    const bmatches = allClients
                      .filter((c) => c.id !== params.id && (bq ? c.name.toLowerCase().includes(bq) : true))
                      .slice(0, 6);
                    return (
                      <label>
                        Contact name
                        <div className="billing-search">
                          <input
                            autoFocus
                            value={billingSearchOpen ? billingSearch : (bc ?? "")}
                            onChange={(e) => { setBillingSearch(e.target.value); setBillingSearchOpen(true); patch({ billing_contact: e.target.value || null }); }}
                            onFocus={() => { setBillingSearch(bc ?? ""); setBillingSearchOpen(true); }}
                            onBlur={() => setTimeout(() => setBillingSearchOpen(false), 150)}
                            placeholder="Search existing clients or type a new name…"
                          />
                          {billingSearchOpen && (
                            <div className="billing-search-menu">
                              {bmatches.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  className="billing-search-hit"
                                  onMouseDown={() => {
                                    patch({ billing_contact: c.name, billing_email: c.email, billing_phone: c.phone });
                                    setBillingSearchOpen(false);
                                  }}
                                >
                                  <span>{c.name}</span>
                                  <span className="billing-search-sub">{c.email || c.phone || "existing client"}</span>
                                </button>
                              ))}
                              {billingSearch.trim() !== "" && (
                                <button
                                  type="button"
                                  className="billing-search-hit billing-search-new"
                                  onMouseDown={() => { patch({ billing_contact: billingSearch.trim() }); setBillingSearchOpen(false); }}
                                >
                                  + Use “{billingSearch.trim()}” as a new contact
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })()}
                </>
              );
            })()}
            <div className="field-pair">
              <label>
                Billing email
                <input value={client.billing_email ?? ""} onChange={(e) => patch({ billing_email: e.target.value || null })} />
              </label>
              <label>
                Billing phone
                <input value={client.billing_phone ?? ""} onChange={(e) => patch({ billing_phone: e.target.value || null })} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {addMatterOpen && (
        <div className="modal-backdrop" onClick={() => setAddMatterOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>New matter for {client.name}</h3>
            <label>
              Matter name
              <input autoFocus value={mForm.name} onChange={(e) => setMForm({ ...mForm, name: e.target.value })} placeholder="e.g. 2025 Refinance" />
            </label>
            <div className="field-pair">
              <label>
                Practice area
                <select value={mForm.practice_area} onChange={(e) => setMForm({ ...mForm, practice_area: e.target.value })}>
                  {PRACTICE_AREAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>
                Assigned to
                <select value={mForm.assigned_to} onChange={(e) => setMForm({ ...mForm, assigned_to: e.target.value })}>
                  {ATTORNEYS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setAddMatterOpen(false)}>Cancel</button>
              <button type="button" className="btn" onClick={addMatter} disabled={mSaving || !mForm.name.trim()}>
                {mSaving ? "Saving…" : "Create matter"}
              </button>
            </div>
          </div>
        </div>
      )}

      {splitOpen && client.partner_name && (
        <div className="modal-backdrop" onClick={() => setSplitOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Split second contact</h3>
            <p className="modal-dur">
              This will create a <strong>new client</strong> in your client list for{" "}
              <strong>{client.partner_name}</strong> (split from {client.name}), and open
              their new record. Continue?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setSplitOpen(false)}>Cancel</button>
              <button type="button" className="btn" onClick={splitPartner}>Create client record</button>
            </div>
          </div>
        </div>
      )}

      {prompt && (
        <div className="modal-backdrop" onClick={() => setPrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Editing {prompt.label}</h3>
            <p className="modal-dur">Are we updating <strong>{contactName}</strong>&rsquo;s information, or is a different person the primary contact?</p>
            <div className="stack-actions">
              <button type="button" className="btn" onClick={() => { setContactConfirmed(true); setDraft(client[prompt.field] ?? ""); setActiveEdit(prompt.field); setPrompt(null); }}>
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
                <label>Name
                  <input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} />
                </label>
                <label>Title
                  <select value={newForm.title} onChange={(e) => setNewForm({ ...newForm, title: e.target.value })}>
                    <option value="">— Title</option>
                    {CONTACT_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                {(["email", "phone", "address"] as const).map((f) => (
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
