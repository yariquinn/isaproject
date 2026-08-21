"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PRACTICE_AREAS, LEAD_STATUSES, type Lead } from "@/lib/types";

const EMPTY = { name: "", client_type: "individual", email: "", phone: "", practice_area: PRACTICE_AREAS[0] as string, source: "Website", message: "" };

export default function IntakeClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<"pipeline" | "form">("pipeline");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [detail, setDetail] = useState<Lead | null>(null);

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
      client_type: form.client_type,
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
      client_type: l.client_type || "individual",
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

  const rawMax = Math.max(1, ...trend.map((p) => p.added));
  // Round the top of the axis up to a "nice" number so tick labels are whole.
  const step = Math.max(1, Math.ceil(rawMax / 4));
  const maxY = step * 4;
  const W = 560, H = 210, PADL = 34, PADB = 30, PADT = 12, PADR = 12;
  const px = (i: number) => PADL + (i / (trend.length - 1)) * (W - PADL - PADR);
  const py = (v: number) => H - PADB - (v / maxY) * (H - PADB - PADT);
  const line = (key: "added" | "converted" | "lost") =>
    trend.map((p, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");
  const yTicks = Array.from({ length: 5 }, (_, i) => i * step);
  // Label the horizontal axis with month/year at each bucket, de-duplicated.
  const xLabels = trend.map((p, i) => {
    const d = new Date(p.t);
    const label = d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
    return { i, label };
  }).filter((l, idx, arr) => idx === 0 || arr[idx - 1].label !== l.label);
  const recentLeads = [...leads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  if (loading) return <p className="muted-line">Loading…</p>;

  return (
    <>
      <div className="intake-toptabs">
        <button type="button" className="btn icon-plus-btn" onClick={() => setView("form")} title="New intake" aria-label="New intake">+</button>
      </div>

      <div className="intake-graph-row">
        <div className="panel intake-graph-panel">
          <h2 className="panel-title">Leads over time</h2>
          <div className="lead-chart-legend">
            <span><i style={{ background: "#2f6bff" }} /> Added</span>
            <span><i style={{ background: "#3fa373" }} /> Converted</span>
            <span><i style={{ background: "#c0392b" }} /> Did not hire</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="lead-chart" role="img" aria-label="Leads over time">
            {/* horizontal gridlines + Y-axis numbers */}
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={PADL} y1={py(v)} x2={W - PADR} y2={py(v)} className="lead-grid" />
                <text x={PADL - 6} y={py(v) + 3} textAnchor="end" className="lead-axis-num">{v}</text>
              </g>
            ))}
            {/* X-axis month/year labels */}
            {xLabels.map(({ i, label }) => (
              <text key={i} x={px(i)} y={H - PADB + 16} textAnchor="middle" className="lead-axis-num">{label}</text>
            ))}
            <defs>
              <linearGradient id="addedFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2f6bff" stopOpacity="0.18" />
                <stop offset="100%" stopColor="#2f6bff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <line x1={PADL} y1={H - PADB} x2={W - PADR} y2={H - PADB} className="lead-axis" />
            <line x1={PADL} y1={PADT} x2={PADL} y2={H - PADB} className="lead-axis" />
            <path d={`${line("added")} L${px(trend.length - 1).toFixed(1)},${(H - PADB).toFixed(1)} L${px(0).toFixed(1)},${(H - PADB).toFixed(1)} Z`} fill="url(#addedFill)" stroke="none" />
            <path d={line("lost")} fill="none" stroke="#c0392b" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line("converted")} fill="none" stroke="#3fa373" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
            <path d={line("added")} fill="none" stroke="#2f6bff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="panel intake-activity-panel">
          <h2 className="panel-title">Recent submissions</h2>
          {recentLeads.length === 0 ? (
            <p className="muted-line">No submissions yet.</p>
          ) : (
            <ul className="intake-activity-list">
              {recentLeads.slice(0, 8).map((l) => (
                <li key={l.id} className="intake-activity-item" onClick={() => setDetail(l)}>
                  <div className="intake-activity-main">
                    <span className="intake-activity-name">{l.name}</span>
                    <span className="intake-activity-meta">{l.practice_area || "—"}</span>
                  </div>
                  <span className="intake-activity-date">{new Date(l.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {view === "form" && (
        <div className="modal-backdrop" onClick={() => setView("pipeline")}>
        <div className="modal intake-modal" onClick={(e) => e.stopPropagation()}>
          <h3>New Intake</h3>
          <div className="intake-form">
            <div className="seg seg-full" style={{ marginBottom: "0.9rem" }}>
              {(["individual", "business"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={form.client_type === t ? "active" : undefined}
                  onClick={() => setForm({ ...form, client_type: t })}
                >
                  {t === "individual" ? "Individual" : "Business"}
                </button>
              ))}
            </div>
            <label>{form.client_type === "business" ? "Business name" : "Prospective client name"}
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={form.client_type === "business" ? "Entity name" : "Full name"} />
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
        </div>
      )}

      <>
          <div className="inv-filter-row">
            {[["active", "Active"], ["all", "All"], ...LEAD_STATUSES.map((s) => [s.value, s.label])].map(([v, l]) => {
              const n =
                v === "all" ? leads.length
                : v === "active" ? counts.new + counts.contacted + counts.consult
                : counts[v] ?? 0;
              return (
                <button key={v} type="button" className={`inv-chip${statusFilter === v ? " on" : ""}`} onClick={() => setStatusFilter(v)}>
                  {l} <span className="inv-chip-count">{n}</span>
                </button>
              );
            })}
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
                        <button type="button" className="row-link lead-name-btn" onClick={() => setDetail(l)}>{l.name}</button>
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

      {detail && (() => {
        const l = leads.find((x) => x.id === detail.id) ?? detail;
        return (
          <div className="modal-backdrop" onClick={() => setDetail(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <h3>{l.name}</h3>
              <p className="field-note" style={{ marginTop: "-0.3rem" }}>
                {l.client_type === "business" ? "Business" : "Individual"} · received {new Date(l.created_at).toLocaleDateString()}
              </p>
              <dl className="cc-fields" style={{ marginBottom: "0.8rem" }}>
                <div><dt>Email</dt><dd>{l.email || "—"}</dd></div>
                <div><dt>Phone</dt><dd>{l.phone || "—"}</dd></div>
                <div><dt>Source</dt><dd>{l.source || "—"}</dd></div>
              </dl>
              <div className="field-pair">
                <label>Practice area
                  <select value={l.practice_area || PRACTICE_AREAS[0]} onChange={(e) => patch(l.id, { practice_area: e.target.value })}>
                    {PRACTICE_AREAS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </label>
                <label>Status
                  <select value={l.status} onChange={(e) => patch(l.id, { status: e.target.value })}>
                    {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </label>
              </div>
              {l.message && (
                <label style={{ marginTop: "0.6rem" }}>Matter description
                  <textarea rows={4} readOnly value={l.message} />
                </label>
              )}
              <div className="modal-actions">
                {l.status === "converted" ? (
                  <span className="pill inv-paid">Converted to client</span>
                ) : (
                  <button type="button" className="ghost" onClick={() => convertToClient(l)}>Convert to client</button>
                )}
                <button type="button" className="btn" onClick={() => setDetail(null)}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
