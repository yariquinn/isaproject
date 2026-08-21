"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CONTACT_ROLES, contactRoleLabel, personColor, type Contact } from "@/lib/types";
import { usePortal } from "../PortalProvider";
import { InlineText } from "../Inline";
import ImportExport from "../ImportExport";

const EMPTY = { name: "", role: "outside_counsel", organization: "", email: "", phone: "", address: "", notes: "" };
const initialsOf = (n: string) =>
  (n || "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";

// Optional columns, toggled by the + at the end of the header.
const COL_DEFS = [
  { key: "role", label: "Type" },
  { key: "organization", label: "Firm" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Business Address" },
] as const;
type ColKey = (typeof COL_DEFS)[number]["key"];

export default function ContactsPanel() {
  const { userName } = usePortal();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  const [cols, setCols] = useState<Record<ColKey, boolean>>({
    role: true, organization: true, email: true, phone: true, address: true,
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("contactCols");
      if (raw) setCols((c) => ({ ...c, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, []);
  const toggleCol = (key: ColKey) => {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("contactCols", JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  useEffect(() => {
    if (!colMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) setColMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [colMenuOpen]);

  async function load() {
    const { data } = await supabase.from("contacts").select("*").order("name");
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  async function patch(id: string, changes: Partial<Contact>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...changes } : c)));
    await supabase.from("contacts").update(changes).eq("id", id);
  }
  async function addContact() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("contacts")
      .insert({
        name: form.name.trim(),
        role: form.role,
        organization: form.organization.trim() || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        notes: form.notes.trim() || null,
        created_by: userName,
      })
      .select()
      .single();
    if (data) setContacts((prev) => [...prev, data as Contact].sort((a, b) => a.name.localeCompare(b.name)));
    setForm(EMPTY);
    setAddOpen(false);
    setSaving(false);
  }
  async function removeContact(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("contacts").delete().eq("id", id);
  }
  async function importContacts(records: Record<string, string>[]) {
    const rows = records
      .map((r) => ({
        name: (r["Name"] || r["name"] || "").trim(),
        role: (r["Type"] || r["Role"] || r["role"] || "other").trim(),
        organization: (r["Firm"] || r["Organization"] || r["organization"] || "").trim() || null,
        email: (r["Email"] || r["email"] || "").trim() || null,
        phone: (r["Phone"] || r["phone"] || "").trim() || null,
        address: (r["Business Address"] || r["Address"] || r["address"] || "").trim() || null,
        created_by: userName,
      }))
      .filter((r) => r.name);
    if (rows.length === 0) return;
    await supabase.from("contacts").insert(rows);
    load();
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contacts.filter((c) => {
      if (roleFilter !== "all" && c.role !== roleFilter) return false;
      if (q === "") return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.organization || "").toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q) ||
        contactRoleLabel(c.role).toLowerCase().includes(q)
      );
    });
  }, [contacts, query, roleFilter]);

  return (
    <>
      <div className="page-head">
        <div className="head-name">
          <h1 className="page-title upper">
            Contacts <span className="count-badge">{contacts.length}</span>
          </h1>
        </div>
        <div className="head-controls">
          <div className="filter-wrap" ref={filterRef}>
            <button
              type="button"
              className={`icon-btn${roleFilter !== "all" ? " filter-on" : ""}`}
              onClick={() => setFilterOpen((o) => !o)}
              title="Filter"
              aria-label="Filter"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
            </button>
            {filterOpen && (
              <div className="filter-menu">
                <div className="filter-menu-group">
                  <div className="filter-menu-label">Type</div>
                  <button type="button" className={`filter-menu-item${roleFilter === "all" ? " on" : ""}`} onClick={() => { setRoleFilter("all"); setFilterOpen(false); }}>All types</button>
                  {CONTACT_ROLES.map((r) => (
                    <button key={r.value} type="button" className={`filter-menu-item${roleFilter === r.value ? " on" : ""}`} onClick={() => { setRoleFilter(r.value); setFilterOpen(false); }}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ImportExport
            filename="contacts"
            headers={["Name", "Type", "Firm", "Email", "Phone", "Business Address"]}
            rows={rows.map((c) => [c.name, contactRoleLabel(c.role), c.organization, c.email, c.phone, c.address])}
            onImport={importContacts}
          />
          <button type="button" className="btn icon-plus-btn" onClick={() => setAddOpen(true)} title="Add contact" aria-label="Add contact">+</button>
        </div>
      </div>

      <div className="filter-search-row">
        <span className="muted-line" style={{ fontSize: "0.85rem" }}>
          Outside counsel, co-counsel, adverse counsel, experts &amp; more
        </span>
        <input
          className="activity-search head-search"
          type="search"
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : (
        <div className="table-wrap fill-table table-wrap-noscroll">
          <table className="data-table data-table-wrap-cells">
            <colgroup>
              <col style={{ width: "19%" }} />
              {cols.role && <col style={{ width: "18%" }} />}
              {cols.organization && <col style={{ width: "18%" }} />}
              {cols.email && <col style={{ width: "20%" }} />}
              {cols.phone && <col style={{ width: "12%" }} />}
              {cols.address && <col style={{ width: "17%" }} />}
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Name</th>
                {cols.role && <th>Type</th>}
                {cols.organization && <th>Firm</th>}
                {cols.email && <th>Email</th>}
                {cols.phone && <th>Phone</th>}
                {cols.address && <th>Business Address</th>}
                <th className="col-menu-th" ref={colMenuRef}>
                  <button type="button" className="col-menu-btn" onClick={() => setColMenuOpen((o) => !o)} title="Add or remove columns" aria-label="Add or remove columns">+</button>
                  {colMenuOpen && (
                    <div className="col-menu">
                      <div className="col-menu-head">Columns</div>
                      {COL_DEFS.map((c) => (
                        <label key={c.key} className="col-menu-item">
                          <input type="checkbox" checked={cols[c.key]} onChange={() => toggleCol(c.key)} />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={2 + Number(cols.role) + Number(cols.organization) + Number(cols.email) + Number(cols.phone) + Number(cols.address)} className="muted-line" style={{ padding: "1.2rem 1.1rem" }}>
                    No contacts yet — click + to add outside counsel, co-counsel, adverse party lawyers, experts, and more.
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="strong-cell">
                    <span className="ct-name">
                      <span className="ct-avatar" style={{ background: personColor(c.name) }}>{initialsOf(c.name)}</span>
                      <InlineText value={c.name} onSave={(v) => { if (v) patch(c.id, { name: v }); }} />
                    </span>
                  </td>
                  {cols.role && (
                  <td>
                    <select className="ct-role-select" value={c.role} onChange={(e) => patch(c.id, { role: e.target.value })}>
                      {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  )}
                  {cols.organization && (
                  <td>
                    <InlineText value={c.organization} onSave={(v) => patch(c.id, { organization: v || null })} placeholder="—" />
                  </td>
                  )}
                  {cols.email && (
                  <td>
                    <InlineText value={c.email} onSave={(v) => patch(c.id, { email: v || null })} placeholder="—" />
                  </td>
                  )}
                  {cols.phone && (
                  <td>
                    <InlineText value={c.phone} onSave={(v) => patch(c.id, { phone: v || null })} placeholder="—" />
                  </td>
                  )}
                  {cols.address && (
                  <td>
                    <InlineText value={c.address} onSave={(v) => patch(c.id, { address: v || null })} placeholder="—" />
                  </td>
                  )}
                  <td className="ct-actions">
                    <button type="button" className="ct-del" aria-label={`Delete ${c.name}`} title="Delete" onClick={() => removeContact(c.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {addOpen && (
        <div className="modal-backdrop" onClick={() => setAddOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add contact</h3>
            <label>
              Name
              <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Jane Roe" />
            </label>
            <label>
              Type
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <label>
              Firm
              <input value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} placeholder="Firm they work for" />
            </label>
            <div className="field-pair">
              <label>
                Email
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </label>
              <label>
                Phone
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>
            <label>
              Business Address
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </label>
            <label>
              Notes
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </label>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setAddOpen(false)}>Cancel</button>
              <button type="button" className="btn" disabled={saving || !form.name.trim()} onClick={addContact}>Add contact</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
