"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { CONTACT_ROLES, contactRoleLabel, type Contact } from "@/lib/types";
import { usePortal } from "../PortalProvider";
import { useConfirm } from "../ConfirmProvider";
import { InlineText } from "../Inline";
import ImportExport from "../ImportExport";

const EMPTY = { name: "", role: "outside_counsel", organization: "", email: "", phone: "", address: "", notes: "" };

// Optional columns, toggled by the + at the end of the header.
const COL_DEFS = [
  { key: "role", label: "Type" },
  { key: "organization", label: "Firm" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Business Address" },
  { key: "ratecard", label: "Rate Card" },
] as const;
type ColKey = (typeof COL_DEFS)[number]["key"];

export default function ContactsPanel({ headTabs }: { headTabs?: React.ReactNode }) {
  const { userName } = usePortal();
  const confirm = useConfirm();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"open" | "archived" | "all">("open");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [csort, setCsort] = useState<{ key: "name" | "organization"; dir: 1 | -1 } | null>(null);
  const toggleCsort = (key: "name" | "organization") =>
    setCsort((s) => (s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  const csortArrow = (key: "name" | "organization") =>
    !csort || csort.key !== key ? "↕" : csort.dir === 1 ? "↑" : "↓";
  const [filterOpen, setFilterOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filterRef = useRef<HTMLDivElement>(null);

  const [cols, setCols] = useState<Record<ColKey, boolean>>({
    role: false, organization: true, email: true, phone: true, address: true, ratecard: true,
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

  const toggleSel = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  async function bulkPatch(changes: Partial<Contact>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setContacts((prev) => prev.map((c) => (selected.has(c.id) ? { ...c, ...changes } : c)));
    setSelected(new Set());
    await supabase.from("contacts").update(changes).in("id", ids);
  }
  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!(await confirm({ title: `Delete ${ids.length} contact${ids.length === 1 ? "" : "s"}?`, message: "This cannot be undone." }))) return;
    setContacts((prev) => prev.filter((c) => !selected.has(c.id)));
    setSelected(new Set());
    await supabase.from("contacts").delete().in("id", ids);
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
    const filtered = contacts.filter((c) => {
      if (view === "archived" ? !c.archived : view === "open" ? c.archived : false) return false;
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
    if (!csort) return filtered;
    return [...filtered].sort((a, b) => {
      const av = (csort.key === "name" ? a.name : a.organization || "").toLowerCase();
      const bv = (csort.key === "name" ? b.name : b.organization || "").toLowerCase();
      return av.localeCompare(bv) * csort.dir;
    });
  }, [contacts, query, roleFilter, csort, view]);

  return (
    <>
      <div className="page-head">
        <div className="head-name">
          <h1 className="page-title upper">External Contacts</h1>
        </div>
        <div className="head-controls">
          {headTabs}
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
        <div className="filter-row" style={{ margin: 0 }}>
          {(["open", "archived", "all"] as const).map((v) => {
            const n = v === "open" ? contacts.filter((c) => !c.archived).length
              : v === "archived" ? contacts.filter((c) => c.archived).length
              : contacts.length;
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
          placeholder="Search contacts…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {selected.size > 0 && (
        <div className="bulk-bar">
          <span className="bulk-count">{selected.size} selected</span>
          <label>
            Type
            <select defaultValue="" onChange={(e) => { if (e.target.value) bulkPatch({ role: e.target.value }); e.target.value = ""; }}>
              <option value="">Change…</option>
              {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <button type="button" className="ghost sm" onClick={() => bulkPatch({ archived: true })}>Archive</button>
          <button type="button" className="ghost sm" onClick={() => bulkPatch({ archived: false })}>Unarchive</button>
          <button type="button" className="ghost sm bulk-danger" onClick={bulkDelete}>Delete</button>
          <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : (
        <div className="table-wrap fill-table table-wrap-noscroll">
          <table className="data-table data-table-wrap-cells">
            <colgroup>
              <col style={{ width: "38px" }} />
              {cols.organization && <col style={{ width: "18%" }} />}
              <col style={{ width: "19%" }} />
              {cols.role && <col style={{ width: "18%" }} />}
              {cols.email && <col style={{ width: "20%" }} />}
              {cols.phone && <col style={{ width: "12%" }} />}
              {cols.address && <col style={{ width: "17%" }} />}
              {cols.ratecard && <col style={{ width: "100px" }} />}
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((c) => selected.has(c.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((c) => c.id)) : new Set())}
                    aria-label="Select all"
                  />
                </th>
                {cols.organization && <th className="sortable" onClick={() => toggleCsort("organization")}>Firm {csortArrow("organization")}</th>}
                <th className="sortable" onClick={() => toggleCsort("name")}>Contact {csortArrow("name")}</th>
                {cols.role && <th>Type</th>}
                {cols.email && <th>Email</th>}
                {cols.phone && <th>Phone</th>}
                {cols.address && <th>Business Address</th>}
                {cols.ratecard && <th>Rate Card</th>}
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
                  <td colSpan={3 + Number(cols.role) + Number(cols.organization) + Number(cols.email) + Number(cols.phone) + Number(cols.address) + Number(cols.ratecard)} className="muted-line" style={{ padding: "1.2rem 1.1rem" }}>
                    No contacts yet — click + to add outside counsel, co-counsel, adverse party lawyers, experts, and more.
                  </td>
                </tr>
              )}
              {rows.map((c) => (
                <tr key={c.id} className={`${selected.has(c.id) ? "row-selected " : ""}${c.archived ? "row-closed" : ""}`.trim() || undefined}>
                  <td className="check-col">
                    <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Select ${c.name}`} />
                  </td>
                  {cols.organization && (
                  <td>
                    <InlineText value={c.organization} onSave={(v) => patch(c.id, { organization: v || null })} placeholder="—" />
                  </td>
                  )}
                  <td className="strong-cell">
                    <span className="ct-name">
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
                  {cols.ratecard && (
                  <td>
                    <button
                      type="button"
                      className="ratecard-btn"
                      title="Upload rate card (PDF)"
                      aria-label="Upload rate card"
                      onClick={() => window.alert("Rate card upload is a placeholder in this demo — attach a PDF here.")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span>PDF</span>
                    </button>
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
