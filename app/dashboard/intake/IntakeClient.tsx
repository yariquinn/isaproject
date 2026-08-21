"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRACTICE_AREAS, LEAD_STATUSES, type Lead } from "@/lib/types";

const EMPTY = { name: "", email: "", phone: "", practice_area: PRACTICE_AREAS[0] as string, source: "Website", message: "" };

export default function IntakeClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"pipeline" | "form">("pipeline");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  async function load() {
    const { data } = await supabase.from("inquiries").select("*").order("created_at", { ascending: false });
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const patch = async (id: string, changes: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...changes } : l)));
    await supabase.from("inquiries").update(changes).eq("id", id);
  };

  async function submitIntake() {
    if (!form.name.trim()) return;
    setSaving(true);
    await supabase.from("inquiries").insert({
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      practice_area: form.practice_area,
      source: form.source.trim() || null,
      message: form.message.trim() || null,
      status: "new",
    });
    setForm(EMPTY);
    setSaving(false);
    setView("pipeline");
    load();
  }

  async function convertToClient(l: Lead) {
    if (l.converted_client_id) return;
    const { data } = await supabase.from("clients").insert({
      name: l.name,
      client_type: "individual",
      email: l.email,
      phone: l.phone,
      status: "active",
      notes: l.message ? `From intake: ${l.message}` : null,
    }).select("id").single();
    const cid = (data as { id: string } | null)?.id ?? null;
    await patch(l.id, { status: "converted", converted_client_id: cid });
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { new: 0, contacted: 0, consult: 0, did_not_hire: 0, converted: 0 };
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const shown = useMemo(() => {
    if (statusFilter === "all") return leads;
    if (statusFilter === "active") return leads.filter((l) => l.status !== "converted" && l.status !== "did_not_hire");
    return leads.filter((l) => l.status === statusFilter);
  }, [leads, statusFilter]);

  // ---- Trend graph: cumulative Added / Converted / Did-not-hire over the last 8 weeks ----
  const trend = useMemo(() => {
    const weeks = 8;
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - weeks * 7);
    const buckets = Array.from({ length: weeks + 1 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i * 7);
      return { t: d.getTime() };
    });
    // cumulative counts at each week boundary
    return buckets.map((b) => {
      const upto = leads.filter((l) => new Date(l.created_at).getTime() <= b.t + 7 * 86400000);
      return {
        t: b.t,
        added: upto.length,
        converted: upto.filter((l) => l.status === "converted").length,
        lost: upto.filter((l) => l.status === "did_not_hire").length,
      };
    });
  }, [leads]);

  const maxY = Math.max(1, ...trend.map((p) => p.added));
  const W = 560, H = 200, PAD = 28;
  const px = (i: number) => PAD + (i / (trend.length - 1)) * (W - PAD * 2);
  const py = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);
  const line = (key: "added" | "converted" | "lost") =>
    trend.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");

  if (loading) return <p className="muted-line">Loading…</p>;

  return (
    <>
      <div className="stat-row" style={{ margin: "1.25rem 0" }}>
        <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{leads.length}</span><span className="stat-label">Total Leads</span></div>
        <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{counts.new + counts.contacted + counts.consult}</span><span className="stat-label">In Pipeline</span></div>
        <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{counts.converted}</span><span className="stat-label">Converted</span></div>
        <div className="stat" style={{ cursor: "default" }}><span className="stat-num">{counts.did_not_hire}</span><span className="stat-label">Did Not Hire</span></div>
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Leads over time</h2>
        <div className="lead-chart-legend">
          <span><i style={{ background: "#2f6bff" }} /> Added</span>
          <span><i style={{ background: "#3fa373" }} /> Converted</span>
          <span><i style={{ background: "#c0392b" }} /> Did not hire</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="lead-chart" role="img" aria-label="Leads over time">
          <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} className="lead-axis" />
          <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} className="lead-axis" />
          <path d={line("added")} fill="none" stroke="#2f6bff" strokeWidth="2.5" />
          <path d={line("converted")} fill="none" stroke="#3fa373" strokeWidth="2.5" />
          <path d={line("lost")} fill="none" stroke="#c0392b" strokeWidth="2.5" />
        </svg>
      </div>

      <div className="doc-tabs" style={{ marginBottom: "1rem" }}>
        <button type="button" className={view === "pipeline" ? "active" : undefined} onClick={() => setView("pipeline")}>Pipeline</button>
        <button type="button" className={view === "form" ? "active" : undefined} onClick={() => setView("form")}>+ New Intake</button>
      </div>

      {view === "form" ? (
        <div className="panel" style={{ maxWidth: "40rem" }}>
          <h2 className="panel-title">New Intake</h2>
          <div className="intake-form">
            <label>Prospective client name
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name or entity" />
            </label>
            <div className="field-pair">
              <label>Email<input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@example.com" /></label>
              <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(000) 000-0000" /></label>
            </div>
            <div className="field-pair">
              <label>Matter type
                <select value={form.practice_area} onChange={(e) => setForm({ ...form, practice_area: e.target.value })}>
                  {PRACTICE_AREAS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label>Source
                <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
                  {["Website", "Referral", "Phone", "Walk-in", "Other"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
            </div>
            <label>Describe the matter
              <textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
            </label>
            <button className="btn" type="button" disabled={saving || !form.name.trim()} onClick={submitIntake}>
              {saving ? "Saving…" : "Add to pipeline"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="inv-filter-row">
            {[["active", "Active"], ["all", "All"], ...LEAD_STATUSES.map((s) => [s.value, s.label])].map(([v, l]) => (
              <button key={v} type="button" className={`inv-chip${statusFilter === v ? " on" : ""}`} onClick={() => setStatusFilter(v)}>{l}</button>
            ))}
          </div>
          {shown.length === 0 ? (
            <p className="muted-line">No leads in this view.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Name</th><th>Practice Area</th><th>Source</th><th>Received</th><th>Status</th><th></th></tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id}>
                      <td className="strong-cell">
                        {l.name}
                        {l.email && <div className="lead-sub">{l.email}</div>}
                      </td>
                      <td>{l.practice_area || "—"}</td>
                      <td>{l.source || "—"}</td>
                      <td>{new Date(l.created_at).toLocaleDateString()}</td>
                      <td>
                        <select className="lead-status-select" value={l.status} onChange={(e) => patch(l.id, { status: e.target.value })}>
                          {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {l.status === "converted" ? (
                          <span className="pill inv-paid">Client</span>
                        ) : (
                          <button type="button" className="ghost sm" onClick={() => convertToClient(l)}>Convert</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
