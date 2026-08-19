"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRACTICE_AREAS, type Client, type Matter } from "@/lib/types";
import { InlineNumber, InlineSelect } from "../Inline";
import { usePortal } from "../PortalProvider";

const EMPTY = {
  name: "",
  client_id: "",
  practice_area: PRACTICE_AREAS[0] as string,
  assigned_to: ATTORNEYS[0] as string,
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
  const [sortAsc, setSortAsc] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "closed" | "all">(
    "active",
  );
  const [areaFilter, setAreaFilter] = useState<string>("all");

  async function load() {
    const [{ data: m }, { data: c }] = await Promise.all([
      supabase
        .from("matters")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("name"),
    ]);
    setMatters((m as Matter[]) ?? []);
    setClients((c as Client[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (id: string | null) =>
      clients.find((c) => c.id === id)?.name ?? "";
    let list = matters.filter((m) => {
      if (statusFilter === "active" && m.status === "closed") return false;
      if (statusFilter === "closed" && m.status !== "closed") return false;
      if (areaFilter !== "all" && m.practice_area !== areaFilter) return false;
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
    if (sortAsc === null) return list;
    return [...list].sort((a, b) =>
      sortAsc ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }, [matters, clients, sortAsc, query, statusFilter, areaFilter]);

  const nameOf = (id: string | null) =>
    clients.find((c) => c.id === id)?.name ?? "";

  const attorneyOptions = (current: string | null) => {
    const base: { value: string; label: string }[] = ATTORNEYS.map((a) => ({
      value: a,
      label: a,
    }));
    if (current && !ATTORNEYS.includes(current as (typeof ATTORNEYS)[number])) {
      base.push({ value: current, label: current });
    }
    return base;
  };

  async function patch(id: string, changes: Partial<Matter>) {
    setMatters((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...changes } : m)),
    );
    await supabase.from("matters").update(changes).eq("id", id);
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
        description: form.description.trim() || null,
        hourly_rate: form.hourly_rate ? Number(form.hourly_rate) : null,
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
        <h1 className="page-title">Matters</h1>
        <div className="head-controls">
          <input
            className="activity-search"
            type="search"
            placeholder="Search all matters…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="btn" onClick={() => setOpen(true)} type="button">
            + Add Matter
          </button>
        </div>
      </div>

      <div className="matter-filters">
        <div className="seg">
          {(["active", "closed", "all"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={statusFilter === s ? "active" : undefined}
              onClick={() => setStatusFilter(s)}
            >
              {s === "active" ? "Active" : s === "closed" ? "Closed" : "All"}
            </button>
          ))}
        </div>
        <div className="filter-row" style={{ margin: 0 }}>
          <button
            type="button"
            className={`filter-chip${areaFilter === "all" ? " active" : ""}`}
            onClick={() => setAreaFilter("all")}
          >
            All areas
          </button>
          {PRACTICE_AREAS.map((p) => (
            <button
              key={p}
              type="button"
              className={`filter-chip${areaFilter === p ? " active" : ""}`}
              onClick={() => setAreaFilter(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="muted-line">Loading…</p>
      ) : matters.length === 0 ? (
        <p className="muted-line">No matters yet.</p>
      ) : rows.length === 0 ? (
        <p className="muted-line">No matters match these filters.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th
                  className="sortable"
                  onClick={() => setSortAsc((s) => (s === true ? false : true))}
                >
                  Matter {sortAsc === null ? "↕" : sortAsc ? "↑" : "↓"}
                </th>
                <th>Client</th>
                <th>Practice Area</th>
                <th>Assigned To</th>
                <th>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id}>
                  <td className="strong-cell">
                    <Link href={`/dashboard/matters/${m.id}`} className="row-link">
                      {m.name}
                    </Link>
                  </td>
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
                  <td>
                    <InlineSelect
                      value={m.assigned_to ?? ATTORNEYS[0]}
                      options={attorneyOptions(m.assigned_to)}
                      onSave={(v) => patch(m.id, { assigned_to: v })}
                    />
                  </td>
                  <td>
                    <InlineNumber
                      value={m.hourly_rate}
                      prefix="$"
                      suffix="/hr"
                      onSave={(v) => patch(m.id, { hourly_rate: v })}
                    />
                  </td>
                  <td>
                    <InlineSelect
                      value={m.status}
                      className={`pill-${m.status}`}
                      options={[
                        { value: "open", label: "open" },
                        { value: "closed", label: "closed" },
                      ]}
                      onSave={(v) => patch(m.id, { status: v })}
                    />
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
                value={form.client_id}
                onChange={(e) =>
                  setForm({ ...form, client_id: e.target.value })
                }
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
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
              Hourly Rate (USD)
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
