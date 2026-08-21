"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ATTORNEYS,
  CLIENT_TYPES,
  PRACTICE_AREAS,
  PRIORITIES,
  RATE_TYPES,
  personColor,
  type Client,
  type Matter,
} from "@/lib/types";

const initialsOf = (n: string | null) =>
  (n || "").trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "—";
import { InlineNumber, InlineSelect } from "../Inline";
import { usePortal } from "../PortalProvider";
import ImportExport from "../ImportExport";

const EMPTY = {
  name: "",
  client_id: "",
  practice_area: PRACTICE_AREAS[0] as string,
  assigned_to: ATTORNEYS[0] as string,
  priority: "-",
  rate_type: "hourly",
  description: "",
  hourly_rate: "",
};

export default function MattersPage() {
  const { userName } = usePortal();
  const [matters, setMatters] = useState<Matter[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  type SortKey = "name" | "priority" | "status" | "client" | "rate";
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState("");

  function toggleSort(key: SortKey) {
    setSort((s) =>
      s && s.key === key
        ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 }
        : { key, dir: 1 },
    );
  }
  const sortArrow = (key: SortKey) =>
    !sort || sort.key !== key ? "↕" : sort.dir === 1 ? "↑" : "↓";
  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "all">(
    "active",
  );
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [prioFilter, setPrioFilter] = useState<string>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filterOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [filterOpen]);

  async function importMatters(records: Record<string, string>[]) {
    const toInsert = records
      .map((r) => ({
        name: (r.Matter || r.name || "").trim(),
        practice_area: r["Practice Area"] || r.practice_area || null,
        priority: ((r.Priority || r.priority || "-").toLowerCase() || "-"),
        status: (r.Status || r.status || "open").toLowerCase() === "closed" ? "closed" : "open",
        opened_by: userName,
      }))
      .filter((m) => m.name);
    if (toInsert.length === 0) return;
    await supabase.from("matters").insert(toInsert);
    load();
  }
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingTasks, setPendingTasks] = useState<Record<string, number>>({});
  const [matterTasks, setMatterTasks] = useState<Record<string, { title: string; assignee: string | null }[]>>({});
  const [ncOpen, setNcOpen] = useState(false);
  const [nc, setNc] = useState({ name: "", client_type: "individual", email: "", phone: "" });

  // Which optional columns are shown (persisted per browser).
  const COL_DEFS = [
    { key: "client", label: "Client" },
    { key: "practice", label: "Practice Area" },
    { key: "tasks", label: "Tasks" },
    { key: "rate", label: "Rate" },
    { key: "status", label: "Status" },
  ] as const;
  type ColKey = (typeof COL_DEFS)[number]["key"];
  const [cols, setCols] = useState<Record<ColKey, boolean>>({
    client: true, practice: true, tasks: true, rate: true, status: true,
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLTableCellElement>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("matterCols");
      if (raw) setCols((c) => ({ ...c, ...JSON.parse(raw) }));
    } catch { /* ignore */ }
  }, []);
  const toggleCol = (key: ColKey) => {
    setCols((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem("matterCols", JSON.stringify(next)); } catch { /* ignore */ }
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

  async function createNewClient() {
    if (!nc.name.trim()) return;
    const isBiz = nc.client_type === "business";
    const { data: created } = await supabase
      .from("clients")
      .insert({
        name: nc.name.trim(),
        client_type: nc.client_type,
        primary_contact: isBiz ? null : nc.name.trim() || null,
        email: nc.email.trim() || null,
        phone: nc.phone.trim() || null,
      })
      .select("*")
      .single();
    if (created) {
      const c = created as Client;
      setClients((prev) => [...prev, c].sort((a, b) => a.name.localeCompare(b.name)));
      setForm((f) => ({ ...f, client_id: c.id }));
      await supabase.from("activity_log").insert({
        kind: "client_added",
        client_id: c.id,
        description: `${userName} added client ${c.name}`,
      });
    }
    setNc({ name: "", client_type: "individual", email: "", phone: "" });
    setNcOpen(false);
  }

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function load() {
    const [{ data: m }, { data: c }, { data: td }] = await Promise.all([
      supabase
        .from("matters")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
      supabase.from("todos").select("matter_id,title,assignee").eq("done", false),
    ]);
    setMatters((m as Matter[]) ?? []);
    setClients((c as Client[]) ?? []);
    const counts: Record<string, number> = {};
    const lists: Record<string, { title: string; assignee: string | null }[]> = {};
    for (const t of (td as { matter_id: string | null; title: string; assignee: string | null }[]) ?? []) {
      if (t.matter_id) {
        counts[t.matter_id] = (counts[t.matter_id] ?? 0) + 1;
        (lists[t.matter_id] ??= []).push({ title: t.title, assignee: t.assignee });
      }
    }
    setPendingTasks(counts);
    setMatterTasks(lists);
    setLoading(false);
  }

  useEffect(() => {
    load();
    const s = new URLSearchParams(window.location.search).get("status");
    if (s === "closed" || s === "all" || s === "active") setStatusFilter(s);
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (id: string | null) =>
      clients.find((c) => c.id === id)?.name ?? "";
    let list = matters.filter((m) => {
      if (statusFilter === "active" && m.status === "closed") return false;
      if (statusFilter === "closed" && m.status !== "closed") return false;
      if (areaFilter !== "all" && m.practice_area !== areaFilter) return false;
      if (prioFilter !== "all" && (m.priority || "-") !== prioFilter) return false;
      if (q) {
        const hay = [
          m.name,
          nameOf(m.client_id),
          m.practice_area,
          m.assigned_to,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    // Closed matters always sort to the bottom, regardless of the active sort.
    const rank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    const sorted = sort
      ? [...list].sort((a, b) => {
          let cmp = 0;
          if (sort.key === "name") cmp = a.name.localeCompare(b.name);
          else if (sort.key === "priority") cmp = (rank[a.priority] ?? 9) - (rank[b.priority] ?? 9);
          else if (sort.key === "status") cmp = (a.status || "").localeCompare(b.status || "");
          else if (sort.key === "client") cmp = nameOf(a.client_id).localeCompare(nameOf(b.client_id));
          else if (sort.key === "rate") cmp = (a.hourly_rate ?? 0) - (b.hourly_rate ?? 0);
          return cmp * sort.dir;
        })
      : list;
    return [...sorted].sort((a, b) => (a.status === "closed" ? 1 : 0) - (b.status === "closed" ? 1 : 0));
  }, [matters, clients, sort, query, statusFilter, areaFilter, prioFilter]);

  const nameOf = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "";

  async function patch(id: string, changes: Partial<Matter>) {
    setMatters((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...changes } : m)),
    );
    await supabase.from("matters").update(changes).eq("id", id);
  }

  async function bulkPatch(changes: Partial<Matter>) {
    const ids = [...selected];
    if (ids.length === 0) return;
    setMatters((prev) =>
      prev.map((m) => (selected.has(m.id) ? { ...m, ...changes } : m)),
    );
    await supabase.from("matters").update(changes).in("id", ids);
  }

  async function bulkStatus(status: string) {
    const changes: Partial<Matter> =
      status === "closed"
        ? { status, closed_at: new Date().toISOString(), closed_by: userName, priority: "-" }
        : { status, closed_at: null, closed_by: null };
    await bulkPatch(changes);
  }

  async function bulkDelete() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Delete ${ids.length} matter${ids.length === 1 ? "" : "s"}? This also removes their time entries, events, invoices, tasks and activity. This cannot be undone.`,
      )
    )
      return;
    for (const table of ["time_entries", "events", "invoices", "todos", "activity_log"]) {
      await supabase.from(table).delete().in("matter_id", ids);
    }
    await supabase.from("matters").delete().in("id", ids);
    setMatters((prev) => prev.filter((m) => !selected.has(m.id)));
    setSelected(new Set());
  }

  async function deleteMatter(m: Matter) {
    if (!window.confirm(`Delete matter "${m.name}"? This also removes its time entries, events, invoices, tasks and activity. This cannot be undone.`)) return;
    for (const table of ["time_entries", "events", "invoices", "todos", "activity_log"]) {
      await supabase.from(table).delete().eq("matter_id", m.id);
    }
    await supabase.from("matters").delete().eq("id", m.id);
    setMatters((prev) => prev.filter((x) => x.id !== m.id));
  }

  // Changing status records who/when on close, clears it on reopen, and logs.
  async function changeStatus(m: Matter, status: string) {
    const changes: Partial<Matter> = { status };
    if (status === "closed" && m.status !== "closed") {
      changes.closed_at = new Date().toISOString();
      changes.closed_by = userName;
      changes.priority = "-";
    } else if (status !== "closed") {
      changes.closed_at = null;
      changes.closed_by = null;
    }
    await patch(m.id, changes);
    if (status !== m.status) {
      await supabase.from("activity_log").insert({
        kind: "matter_updated",
        matter_id: m.id,
        client_id: m.client_id,
        description:
          status === "closed"
            ? `${userName} closed matter ${m.name}`
            : `${userName} reopened matter ${m.name}`,
      });
    }
  }

  async function addMatter() {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: created } = await supabase
      .from("matters")
      .insert({
        name: form.name.trim(),
        client_id: form.client_id || null,
        practice_area: form.practice_area,
        assigned_to: form.assigned_to || null,
        priority: form.priority,
        rate_type: form.rate_type,
        description: form.description.trim() || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
        opened_by: userName,
      })
      .select("id")
      .single();
    await supabase.from("activity_log").insert({
      kind: "matter_created",
      matter_id: created?.id ?? null,
      client_id: form.client_id || null,
      description: `${userName} opened matter ${form.name.trim()}`,
    });
    setForm(EMPTY);
    setOpen(false);
    setSaving(false);
    load();
  }

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title upper">Matters</h1>
        <div className="head-controls">
          <div className="filter-wrap" ref={filterRef}>
            <button
              className={`icon-btn print-btn${areaFilter !== "all" || prioFilter !== "all" ? " filter-on" : ""}`}
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
                  <div className="filter-menu-label">Practice area</div>
                  {["all", ...PRACTICE_AREAS].map((p) => (
                    <button key={p} type="button" className={`filter-menu-item${areaFilter === p ? " on" : ""}`} onClick={() => setAreaFilter(p)}>
                      {p === "all" ? "All areas" : p}
                    </button>
                  ))}
                </div>
                <div className="filter-menu-group">
                  <div className="filter-menu-label">Priority</div>
                  {[["all", "All priorities"], ...PRIORITIES.map((p) => [p.value, p.value === "-" ? "None" : p.label])].map(([v, l]) => (
                    <button key={v} type="button" className={`filter-menu-item${prioFilter === v ? " on" : ""}`} onClick={() => setPrioFilter(v as string)}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ImportExport
            filename="matters"
            headers={["Matter", "Client", "Practice Area", "Pending Tasks", "Rate", "Priority", "Status"]}
            rows={rows.map((m) => [
              m.name,
              m.client_id ? nameOf(m.client_id) : "",
              m.practice_area ?? "",
              pendingTasks[m.id] ?? 0,
              m.hourly_rate != null ? `$${m.hourly_rate}${m.rate_type === "flat" ? " flat fee" : "/hr"}` : "",
              m.priority,
              m.status,
            ])}
            onImport={importMatters}
          />
          <button className="btn icon-plus-btn" onClick={() => setOpen(true)} type="button" title="Add matter" aria-label="Add matter">
            +
          </button>
        </div>
      </div>
      <div className="filter-search-row">
        <div className="filter-row" style={{ margin: 0 }}>
          {(["active", "closed", "all"] as const).map((s) => {
            const n = s === "active" ? matters.filter((m) => m.status !== "closed").length
              : s === "closed" ? matters.filter((m) => m.status === "closed").length
              : matters.length;
            return (
              <button
                key={s}
                type="button"
                className={`filter-chip${statusFilter === s ? " active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "active" ? "Active" : s === "closed" ? "Archived" : "All"} <span className="chip-count">{n}</span>
              </button>
            );
          })}
        </div>
        <input
          className="activity-search head-search"
          type="search"
          placeholder="Search all matters…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : matters.length === 0 ? (
        <p className="muted-line">No matters yet.</p>
      ) : rows.length === 0 ? (
        <p className="muted-line">No matters match these filters.</p>
      ) : (
        <div className="table-wrap printable fill-table table-wrap-noscroll">
          {selected.size > 0 && (
            <div className="bulk-bar">
              <span className="bulk-count">{selected.size} selected</span>
              <label>
                Priority
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkPatch({ priority: e.target.value }); e.target.value = ""; }}>
                  <option value="">Set…</option>
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkStatus(e.target.value); e.target.value = ""; }}>
                  <option value="">Set…</option>
                  <option value="open">Active</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label>
                Assign
                <select defaultValue="" onChange={(e) => { if (e.target.value) bulkPatch({ assigned_to: e.target.value }); e.target.value = ""; }}>
                  <option value="">Set…</option>
                  {ATTORNEYS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="ghost sm danger" onClick={bulkDelete}>Delete</button>
              <button type="button" className="ghost sm" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}
          <table className="data-table data-table-wrap-cells">
            <colgroup>
              <col style={{ width: "38px" }} />
              <col style={{ width: "22%" }} />
              {cols.client && <col style={{ width: "16%" }} />}
              {cols.practice && <col style={{ width: "14%" }} />}
              {cols.tasks && <col style={{ width: "8%" }} />}
              {cols.rate && <col style={{ width: "11%" }} />}
              {cols.status && <col style={{ width: "15%" }} />}
              <col style={{ width: "44px" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="check-col">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((m) => selected.has(m.id))}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(rows.map((m) => m.id)) : new Set())
                    }
                    aria-label="Select all"
                  />
                </th>
                <th className="sortable" onClick={() => toggleSort("name")}>
                  Matter {sortArrow("name")}
                </th>
                {cols.client && <th className="sortable" onClick={() => toggleSort("client")}>Client {sortArrow("client")}</th>}
                {cols.practice && <th>Practice Area</th>}
                {cols.tasks && <th>Tasks</th>}
                {cols.rate && <th className="sortable" onClick={() => toggleSort("rate")}>Rate {sortArrow("rate")}</th>}
                {cols.status && <th className="sortable" onClick={() => toggleSort("status")}>Status {sortArrow("status")}</th>}
                <th className="col-menu-th" ref={colMenuRef}>
                  <button
                    type="button"
                    className="col-menu-btn"
                    onClick={() => setColMenuOpen((o) => !o)}
                    title="Add or remove columns"
                    aria-label="Add or remove columns"
                  >
                    +
                  </button>
                  {colMenuOpen && (
                    <div className="col-menu">
                      <div className="col-menu-head">Columns</div>
                      {COL_DEFS.map((c) => (
                        <label key={c.key} className="col-menu-item">
                          <input
                            type="checkbox"
                            checked={cols[c.key]}
                            onChange={() => toggleCol(c.key)}
                          />
                          <span>{c.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr
                  key={m.id}
                  className={`${selected.has(m.id) ? "row-selected " : ""}${m.status === "closed" ? "row-closed" : ""}`.trim() || undefined}
                >
                  <td className="check-col">
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => toggleRow(m.id)}
                      aria-label={`Select ${m.name}`}
                    />
                  </td>
                  <td className="strong-cell">
                    <Link href={`/dashboard/matters/${m.id}`} className="row-link">
                      {m.name}
                    </Link>
                  </td>
                  {cols.client && (
                  <td>
                    {m.client_id ? (
                      <Link
                        href={`/dashboard/clients/${m.client_id}`}
                        className="row-link"
                      >
                        {nameOf(m.client_id)}
                      </Link>
                    ) : (
                      <span className="inline-placeholder">—</span>
                    )}
                  </td>
                  )}
                  {cols.practice && (
                  <td>
                    <InlineSelect
                      value={m.practice_area ?? PRACTICE_AREAS[0]}
                      options={PRACTICE_AREAS.map((p) => ({
                        value: p,
                        label: p,
                      }))}
                      onSave={(v) => patch(m.id, { practice_area: v })}
                    />
                  </td>
                  )}
                  {cols.tasks && (
                  <td>
                    {pendingTasks[m.id] ? (
                      <span className="task-pop-wrap">
                        <span className="task-badge">
                          {pendingTasks[m.id]} task{pendingTasks[m.id] === 1 ? "" : "s"}
                        </span>
                        <span className="task-pop">
                          <span className="task-pop-head">Pending tasks</span>
                          {(matterTasks[m.id] ?? []).map((t, i) => (
                            <span className="task-pop-item" key={i}>
                              <span className="task-pop-title">{t.title}</span>
                              {t.assignee && (
                                <span className="task-pop-avatar" style={{ background: personColor(t.assignee) }} title={t.assignee}>
                                  {initialsOf(t.assignee)}
                                </span>
                              )}
                            </span>
                          ))}
                        </span>
                      </span>
                    ) : (
                      <span className="inline-placeholder">—</span>
                    )}
                  </td>
                  )}
                  {cols.rate && (
                  <td>
                    <span className="rate-cell">
                      <InlineNumber
                        value={m.hourly_rate}
                        prefix="$"
                        onSave={(v) => patch(m.id, { hourly_rate: v })}
                      />
                      <select
                        className="rate-type-select"
                        value={m.rate_type ?? "hourly"}
                        onChange={(e) => patch(m.id, { rate_type: e.target.value })}
                        aria-label="Rate type"
                      >
                        <option value="flat">flat fee</option>
                        <option value="hourly">/hr</option>
                      </select>
                    </span>
                  </td>
                  )}
                  {cols.status && (
                  <td>
                    <InlineSelect
                      value={m.status}
                      className={`pill-${m.status}`}
                      options={[
                        { value: "open", label: "Active" },
                        { value: "closed", label: "Archived" },
                      ]}
                      onSave={(v) => changeStatus(m, v)}
                    />
                  </td>
                  )}
                  <td className="col-menu-cell ct-actions">
                    <button type="button" className="ct-del" title="Delete matter" aria-label="Delete matter" onClick={() => deleteMatter(m)}>✕</button>
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
            <h3>Add Matter</h3>
            <label>
              Matter Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Client
              <select
                value={ncOpen ? "__new__" : form.client_id}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setNcOpen(true);
                    setForm({ ...form, client_id: "" });
                  } else {
                    setNcOpen(false);
                    setForm({ ...form, client_id: e.target.value });
                  }
                }}
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value="__new__">+ Add new client…</option>
              </select>
            </label>

            {ncOpen && (
              <div className="nc-inline">
                <div className="seg seg-full" style={{ marginBottom: "0.6rem" }}>
                  {CLIENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      className={nc.client_type === t.value ? "active" : undefined}
                      onClick={() => setNc({ ...nc, client_type: t.value })}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <label>
                  {nc.client_type === "business" ? "Business name" : "Full name"}
                  <input
                    value={nc.name}
                    onChange={(e) => setNc({ ...nc, name: e.target.value })}
                    autoFocus
                  />
                </label>
                <div className="field-pair">
                  <label>
                    Email
                    <input value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} />
                  </label>
                  <label>
                    Phone
                    <input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} />
                  </label>
                </div>
                <div className="modal-actions" style={{ marginTop: "0.4rem" }}>
                  <button type="button" className="ghost" onClick={() => { setNcOpen(false); setNc({ name: "", client_type: "individual", email: "", phone: "" }); }}>
                    Cancel
                  </button>
                  <button type="button" className="btn" onClick={createNewClient} disabled={!nc.name.trim()}>
                    Create client
                  </button>
                </div>
              </div>
            )}
            <label>
              Practice Area
              <select
                value={form.practice_area}
                onChange={(e) =>
                  setForm({ ...form, practice_area: e.target.value })
                }
              >
                {PRACTICE_AREAS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Assigned To
              <select
                value={form.assigned_to}
                onChange={(e) =>
                  setForm({ ...form, assigned_to: e.target.value })
                }
              >
                {ATTORNEYS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(e) =>
                  setForm({ ...form, priority: e.target.value })
                }
              >
                {PRIORITIES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Rate Type
              <select
                value={form.rate_type}
                onChange={(e) =>
                  setForm({ ...form, rate_type: e.target.value })
                }
              >
                {RATE_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {form.rate_type === "flat" ? "Flat Rate (USD)" : "Hourly Rate (USD)"}
              <input
                type="number"
                value={form.hourly_rate}
                onChange={(e) =>
                  setForm({ ...form, hourly_rate: e.target.value })
                }
              />
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
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
                onClick={addMatter}
                disabled={saving || !form.name.trim()}
              >
                {saving ? "Saving…" : "Save Matter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
