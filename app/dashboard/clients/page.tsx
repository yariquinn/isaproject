"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CLIENT_TYPES, type Client } from "@/lib/types";
import { usePortal } from "../PortalProvider";
import { useConfirm } from "../ConfirmProvider";
import ImportExport from "../ImportExport";
import ContactsPanel from "../contacts/ContactsPanel";

const EMPTY = {
  name: "",
  client_type: "individual",
  primary_contact: "",
  contact_title: "",
  partner_name: "",
  partner_email: "",
  partner_phone: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  billing_same: true,
  billing_contact: "",
  billing_email: "",
  billing_phone: "",
};

type GuardField = "primary_contact" | "email" | "phone";
const NEW_FORM = { name: "", email: "", phone: "", address: "" };

export default function ClientsPage() {
  const { userName } = usePortal();
  const confirm = useConfirm();
  const [clients, setClients] = useState<Client[]>([]);
  const [contactsCount, setContactsCount] = useState(0);
  const [mainTab, setMainTab] = useState<"clients" | "contacts">("clients");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [csort, setCsort] = useState<{ key: "name" | "contact"; dir: 1 | -1 } | null>(null);
  const toggleCsort = (key: "name" | "contact") =>
    setCsort((s) => (s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  const csortArrow = (key: "name" | "contact") =>
    !csort || csort.key !== key ? "↕" : csort.dir === 1 ? "↑" : "↓";
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"open" | "archived" | "all">("open");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // Optional columns (persisted per browser).
  const CCOL_DEFS = [
    { key: "contact", label: "Contact" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "matters", label: "Active Matters" },
  ] as const;
  type CCol = (typeof CCOL_DEFS)[number]["key"];
  const [ccols, setCcols] = useState<Record<CCol, boolean>>({ contact: true, email: true, phone: true, matters: true });
  const [ccolMenuOpen, setCcolMenuOpen] = useState(false);
  const ccolMenuRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("clientCols");
      if (raw) setCcols((c) => ({ ...c, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, []);
  const toggleCcol = (key: CCol) => {
    setCcols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("clientCols", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  useEffect(() => {
    if (!ccolMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ccolMenuRef.current && !ccolMenuRef.current.contains(e.target as Node)) setCcolMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [ccolMenuOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  // CSV import with per-type rules.
  //  Individual columns: First Name, Last Name, Email, Phone, Address  (First + Last required)
  //  Business columns:   Entity Name, Primary Contact, Title, Email, Phone, Address,
  //                      Second Contact, Relationship to Second Contact,
  //                      Billing Contact, Billing Contact Email, Billing Contact Phone
  //                      (Entity Name + Primary Contact required)
  async function importClients(records: Record<string, string>[]) {
    const get = (r: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        const found = Object.keys(r).find((h) => h.trim().toLowerCase() === k.toLowerCase());
        if (found && (r[found] ?? "").trim()) return r[found].trim();
      }
      return "";
    };
    // Normalizers for de-duplication.
    const nk = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
    const ek = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
    const pk = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
    // Existing individuals already in the system, keyed by normalized name.
    const existingByName = new Map<string, { email: string; phone: string }[]>();
    for (const c of clients) {
      if ((c.client_type ?? "individual") !== "individual") continue;
      const key = nk(c.name);
      const arr = existingByName.get(key) ?? [];
      arr.push({ email: ek(c.email), phone: pk(c.phone) });
      existingByName.set(key, arr);
    }

    const toInsert: Record<string, unknown>[] = [];
    let skipped = 0;
    const notImported: { name: string; reason: string }[] = [];
    for (const r of records) {
      const entity = get(r, "entity name", "business name");
      const first = get(r, "first name", "firstname");
      const last = get(r, "last name", "lastname");
      if (entity || get(r, "primary contact")) {
        const primary = get(r, "primary contact");
        if (!entity || !primary) { skipped++; notImported.push({ name: entity || primary || "(business row)", reason: "Missing Entity Name or Primary Contact" }); continue; }
        toInsert.push({
          name: entity,
          client_type: "business",
          primary_contact: primary,
          contact_title: get(r, "title of primary contact", "title") || null,
          email: get(r, "email") || null,
          phone: get(r, "phone") || null,
          address: get(r, "address") || null,
          partner_name: get(r, "second contact") || null,
          partner_relationship: get(r, "relationship to second contact", "second contact relationship") || null,
          billing_contact: get(r, "billing contact") || null,
          billing_email: get(r, "billing contact email") || null,
          billing_phone: get(r, "billing contact phone") || null,
          created_by: userName,
        });
      } else if (first || last) {
        if (!first || !last) { skipped++; notImported.push({ name: `${first} ${last}`.trim() || "(individual row)", reason: "Missing First or Last name" }); continue; }
        const fullName = `${first} ${last}`;
        const email = get(r, "email");
        const phone = get(r, "phone");
        // Same-name individual already present → import only if email OR phone differs.
        const matches = existingByName.get(nk(fullName));
        if (matches && matches.some((m) => m.email === ek(email) && m.phone === pk(phone))) {
          skipped++;
          notImported.push({ name: fullName, reason: "Duplicate — a client with this name and the same email & phone already exists" });
          continue;
        }
        // Record so later rows in the same file also dedupe against this one.
        const arr = existingByName.get(nk(fullName)) ?? [];
        arr.push({ email: ek(email), phone: pk(phone) });
        existingByName.set(nk(fullName), arr);
        toInsert.push({
          name: fullName,
          client_type: "individual",
          email: email || null,
          phone: phone || null,
          address: get(r, "address") || null,
          created_by: userName,
        });
      } else {
        // legacy fallback: a single Name column
        const name = get(r, "name");
        if (!name) { skipped++; notImported.push({ name: "(blank row)", reason: "No name provided" }); continue; }
        toInsert.push({
          name,
          client_type: get(r, "type").toLowerCase() === "business" ? "business" : "individual",
          email: get(r, "email") || null,
          phone: get(r, "phone") || null,
          created_by: userName,
        });
      }
    }
    if (toInsert.length) await supabase.from("clients").insert(toInsert);
    load();
    if (typeof window !== "undefined") {
      let msg = `Imported ${toInsert.length} client(s).`;
      if (skipped) {
        msg += `\n\nNot imported (${skipped}):\n`;
        msg += notImported.map((n) => `• ${n.name} — ${n.reason}`).join("\n");
      }
      window.alert(msg);
    }
  }
  const [activeMatters, setActiveMatters] = useState<
    Record<string, { id: string; name: string }[]>
  >({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Active-matters popover: rendered fixed so the table's overflow can't clip it.
  const [matterPop, setMatterPop] = useState<{ id: string; top: number; left: number } | null>(null);
  const popCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openMatterPop = (id: string, el: HTMLElement) => {
    if (popCloseTimer.current) clearTimeout(popCloseTimer.current);
    const r = el.getBoundingClientRect();
    // Centre the popover under the badge, clamped to stay on-screen.
    const center = Math.max(130, Math.min(r.left + r.width / 2, window.innerWidth - 130));
    setMatterPop({ id, top: r.bottom + 6, left: center });
  };
  const scheduleClosePop = () => {
    if (popCloseTimer.current) clearTimeout(popCloseTimer.current);
    popCloseTimer.current = setTimeout(() => setMatterPop(null), 140);
  };
  const cancelClosePop = () => {
    if (popCloseTimer.current) clearTimeout(popCloseTimer.current);
  };

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function bulkPatch(changes: Partial<Client>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setClients((prev) =>
      prev.map((c) => (selected.has(c.id) ? { ...c, ...changes } : c)),
    );
    await supabase.from("clients").update(changes).in("id", ids);
  }
  async function deleteClient(c: Client) {
    if (!(await confirm({ title: `Delete client "${c.name}"?`, message: "This cannot be undone." }))) return;
    setClients((prev) => prev.filter((x) => x.id !== c.id));
    await supabase.from("clients").delete().eq("id", c.id);
  }

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
    const [{ data }, { data: ms }, { count: cc }] = await Promise.all([
      supabase.from("clients").select("*").order("created_at", { ascending: false }),
      supabase.from("matters").select("id,name,client_id,status"),
      supabase.from("contacts").select("id", { count: "exact", head: true }).neq("archived", true),
    ]);
    setClients((data as Client[]) ?? []);
    setContactsCount(cc ?? 0);
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
    if (typeFilter !== "all") list = list.filter((c) => c.client_type === typeFilter);
    if (q) {
      list = list.filter((c) =>
        [c.name, c.primary_contact, c.email, c.phone, c.address]
          .filter(Boolean)
          .some((v) => (v as string).toLowerCase().includes(q)),
      );
    }
    if (!csort) return list;
    return [...list].sort((a, b) => {
      const cmp = csort.key === "name"
        ? a.name.localeCompare(b.name)
        : (a.primary_contact || "").localeCompare(b.primary_contact || "");
      return cmp * csort.dir;
    });
  }, [clients, csort, query, view, typeFilter]);

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
        created_by: userName,
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
    const isBiz = form.client_type === "business";
    const { data: created } = await supabase
      .from("clients")
      .insert({
        name: form.name.trim(),
        client_type: form.client_type,
        primary_contact: isBiz
          ? form.primary_contact.trim() || null
          : form.name.trim() || null,
        contact_title: isBiz ? form.contact_title.trim() || null : null,
        partner_name: !isBiz ? form.partner_name.trim() || null : null,
        partner_email: !isBiz ? form.partner_email.trim() || null : null,
        partner_phone: !isBiz ? form.partner_phone.trim() || null : null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        billing_contact: isBiz
          ? (form.billing_same ? form.primary_contact.trim() || null : form.billing_contact.trim() || null)
          : null,
        billing_email: isBiz
          ? (form.billing_same ? form.email.trim() || null : form.billing_email.trim() || null)
          : null,
        billing_phone: isBiz
          ? (form.billing_same ? form.phone.trim() || null : form.billing_phone.trim() || null)
          : null,
        created_by: userName,
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

  const headTabs = (
    <div className="doc-tabs head-tabs">
      <button type="button" className={mainTab === "clients" ? "active" : undefined} onClick={() => setMainTab("clients")}>
        Clients
      </button>
      <button type="button" className={mainTab === "contacts" ? "active" : undefined} onClick={() => setMainTab("contacts")}>
        Contacts
      </button>
    </div>
  );

  return (
    <div>
      {mainTab === "contacts" ? (
        <ContactsPanel headTabs={headTabs} />
      ) : (
      <>
      <div className="page-head">
        <h1 className="page-title upper">Clients</h1>
        <div className="head-controls">
          {headTabs}
          <div className="filter-wrap" ref={filterRef}>
            <button
              className={`icon-btn print-btn${typeFilter !== "all" ? " filter-on" : ""}`}
              type="button"
              title="Filter"
              aria-label="Filter"
              onClick={() => setFilterOpen((o) => !o)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
            {filterOpen && (
              <div className="filter-menu">
                <div className="filter-menu-group">
                  <div className="filter-menu-label">Type</div>
                  {[["all", "All types"], ...CLIENT_TYPES.map((t) => [t.value, t.label])].map(([v, l]) => (
                    <button key={v} type="button" className={`filter-menu-item${typeFilter === v ? " on" : ""}`} onClick={() => setTypeFilter(v as string)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ImportExport
            filename="clients"
            headers={["Name", "Type", "Contact", "Email", "Phone", "Active Matters"]}
            rows={rows.map((c) => [
              c.name,
              c.client_type,
              c.primary_contact,
              c.email,
              c.phone,
              (activeMatters[c.id] ?? []).map((m) => m.name).join("; "),
            ])}
            onImport={importClients}
          />
          <button className="btn icon-plus-btn" onClick={() => setAddOpen(true)} type="button" title="Add client" aria-label="Add client">
            +
          </button>
        </div>
      </div>
      <div className="filter-search-row">
        <div className="filter-row" style={{ margin: 0 }}>
          {(["open", "archived", "all"] as const).map((v) => {
            const n = v === "open" ? clients.filter((c) => !c.archived).length
              : v === "archived" ? clients.filter((c) => c.archived).length
              : clients.length;
            return (
              <button
                key={v}
                type="button"
                className={`filter-chip${view === v ? " active" : ""}`}
                onClick={() => setView(v)}
              >
                {v === "open" ? "Active" : v === "archived" ? "Archived" : "All"} <span className="chip-count">{n}</span>
              </button>
            );
          })}
        </div>
        <input
          className="activity-search head-search"
          type="search"
          placeholder="Search clients…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="muted-line">No clients yet.</p>
      ) : (
        <div className="table-wrap printable fill-table table-wrap-noscroll">
          {selected.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{selected.size} selected</span>
              <label>
                Type
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkPatch({ client_type: e.target.value }); e.target.value = ""; }}>
                  <option value="">Set…</option>
                  {CLIENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="ghost sm" onClick={() => bulkPatch({ archived: true })}>Archive</button>
              <button type="button" className="ghost sm" onClick={() => bulkPatch({ archived: false })}>Unarchive</button>
              <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
          <table className="data-table data-table-wrap-cells">
            <colgroup>
              <col style={{ width: "44px" }} />
              <col style={{ width: "23%" }} />
              {ccols.contact && <col style={{ width: "19%" }} />}
              {ccols.email && <col style={{ width: "26%" }} />}
              {ccols.phone && <col style={{ width: "16%" }} />}
              {ccols.matters && <col style={{ width: "16%" }} />}
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((c) => selected.has(c.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())
                    }
                    aria-label="Select all"
                  />
                </th>
                <th className="sortable" onClick={() => toggleCsort("name")}>
                  Name {csortArrow("name")}
                </th>
                {ccols.contact && <th className="sortable" onClick={() => toggleCsort("contact")}>Contact {csortArrow("contact")}</th>}
                {ccols.email && <th>Email</th>}
                {ccols.phone && <th>Phone</th>}
                {ccols.matters && <th>Active Matters</th>}
                <th className="col-menu-th" ref={ccolMenuRef}>
                  <button
                    type="button"
                    className="col-menu-btn"
                    onClick={() => setCcolMenuOpen((o) => !o)}
                    title="Add or remove columns"
                    aria-label="Add or remove columns"
                  >
                    +
                  </button>
                  {ccolMenuOpen && (
                    <div className="col-menu">
                      <div className="col-menu-head">Columns</div>
                      {CCOL_DEFS.map((c) => (
                        <label key={c.key} className="col-menu-item">
                          <input type="checkbox" checked={ccols[c.key]} onChange={() => toggleCcol(c.key)} />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr
                  key={c.id}
                  className={`${selected.has(c.id) ? "row-selected " : ""}${c.archived ? "row-closed" : ""}`.trim() || undefined}
                >
                  <td className="check-col">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggleRow(c.id)}
                      aria-label={`Select ${c.name}`}
                    />
                  </td>
                  <td className="strong-cell">
                    <Link
                      href={`/dashboard/clients/${c.id}`}
                      className="row-link"
                    >
                      {c.name}
                    </Link>
                  </td>
                  {ccols.contact && (
                  <td>
                    <Guarded
                      client={c}
                      field="primary_contact"
                      label="primary contact"
                    />
                  </td>
                  )}
                  {ccols.email && (
                  <td>
                    <Guarded
                      client={c}
                      field="email"
                      label="email"
                      type="email"
                    />
                  </td>
                  )}
                  {ccols.phone && (
                  <td>
                    <Guarded
                      client={c}
                      field="phone"
                      label="phone number"
                      type="tel"
                    />
                  </td>
                  )}
                  {ccols.matters && (
                  <td>
                    {activeMatters[c.id]?.length ? (
                      <span
                        className="matter-count-badge"
                        onMouseEnter={(e) => openMatterPop(c.id, e.currentTarget)}
                        onMouseLeave={scheduleClosePop}
                      >
                        {activeMatters[c.id].length} matter
                        {activeMatters[c.id].length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      <span className="inline-placeholder">—</span>
                    )}
                  </td>
                  )}
                  <td className="col-menu-cell ct-actions">
                    <button type="button" className="ct-del" title="Delete client" aria-label="Delete client" onClick={() => deleteClient(c)}>✕</button>
                  </td>
                </tr>
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

            <div className="seg seg-full" style={{ marginBottom: "0.9rem" }}>
              {CLIENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={form.client_type === t.value ? "active" : undefined}
                  onClick={() => setForm({ ...form, client_type: t.value })}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label>
              {form.client_type === "business" ? "Business name" : "Full name"}
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={
                  form.client_type === "business"
                    ? "e.g. Crescent Faith LLC"
                    : "e.g. Marcus Vale"
                }
              />
            </label>

            {form.client_type === "business" && (
              <div className="field-pair">
                <label>
                  Contact person
                  <input
                    value={form.primary_contact}
                    onChange={(e) =>
                      setForm({ ...form, primary_contact: e.target.value })
                    }
                    placeholder="e.g. Yusuf Bello"
                  />
                </label>
                <label>
                  Title
                  <input
                    value={form.contact_title}
                    onChange={(e) =>
                      setForm({ ...form, contact_title: e.target.value })
                    }
                    placeholder="e.g. Managing Member"
                  />
                </label>
              </div>
            )}

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

            {form.client_type !== "business" && (
              <div className="couple-fields">
                <p className="field-note">
                  Spouse / partner (optional — for a joint matter)
                </p>
                <label>
                  Partner name
                  <input
                    value={form.partner_name}
                    onChange={(e) =>
                      setForm({ ...form, partner_name: e.target.value })
                    }
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Partner email
                    <input
                      value={form.partner_email}
                      onChange={(e) =>
                        setForm({ ...form, partner_email: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Partner phone
                    <input
                      value={form.partner_phone}
                      onChange={(e) =>
                        setForm({ ...form, partner_phone: e.target.value })
                      }
                    />
                  </label>
                </div>
              </div>
            )}

            {form.client_type === "business" && (
              <div className="couple-fields">
                <label className="billing-same-row">
                  <input
                    type="checkbox"
                    checked={form.billing_same}
                    onChange={(e) => setForm({ ...form, billing_same: e.target.checked })}
                  />
                  <span>Billing person is the primary contact</span>
                </label>
                {!form.billing_same && (
                  <>
                    <label>
                      Billing person
                      <input
                        value={form.billing_contact}
                        onChange={(e) => setForm({ ...form, billing_contact: e.target.value })}
                        placeholder="e.g. Accounts Payable"
                      />
                    </label>
                    <div className="field-pair">
                      <label>
                        Billing email
                        <input
                          value={form.billing_email}
                          onChange={(e) => setForm({ ...form, billing_email: e.target.value })}
                        />
                      </label>
                      <label>
                        Billing phone
                        <input
                          value={form.billing_phone}
                          onChange={(e) => setForm({ ...form, billing_phone: e.target.value })}
                        />
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}

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
      </>
      )}

      {matterPop && activeMatters[matterPop.id]?.length && (
        <div
          className="matter-pop matter-pop-fixed"
          style={{ top: matterPop.top, left: matterPop.left }}
          onMouseEnter={cancelClosePop}
          onMouseLeave={scheduleClosePop}
        >
          <span className="matter-pop-head">Active matters</span>
          {activeMatters[matterPop.id].map((m) => (
            <Link key={m.id} href={`/dashboard/matters/${m.id}`} className="matter-pop-item">
              {m.name}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
