"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  ACTIVITY_TYPES,
  ATTORNEYS,
  CASE_TIMELINE_TEMPLATES,
  PRACTICE_AREAS,
  PRIORITIES,
  type ActivityItem,
  type Client,
  type EventItem,
  type Invoice,
  type Matter,
  type TimeEntry,
} from "@/lib/types";
import {
  InlineNumber,
  InlineSelect,
  InlineText,
  InlineTextarea,
} from "../../Inline";
import { usePortal } from "../../PortalProvider";
import TodoWidget from "../../TodoWidget";
import Disclaimer from "../../Disclaimer";
import Collapsible from "../../Collapsible";
import TimeEntriesTab from "./TimeEntriesTab";

const MATTER_DOCS = [
  { name: "Engagement Letter.pdf", updated: "3d ago" },
  { name: "Client Intake Form.pdf", updated: "1w ago" },
];

const TIMELINE_STEPS: Record<string, string[]> = {
  "LLC Formation": [
    "Name availability check",
    "File Articles of Organization",
    "Draft Operating Agreement",
    "Obtain EIN",
    "Open business bank account",
    "File beneficial ownership report",
  ],
  "Estate Planning": [
    "Intake questionnaire",
    "Draft will",
    "Draft trust",
    "Draft power of attorney",
    "Review with client",
    "Execute & notarize",
  ],
  "Real Estate": [
    "Engagement & conflict check",
    "Contract review",
    "Title search",
    "Financing / mortgage",
    "Closing preparation",
    "Closing & recording",
  ],
  Other: [
    "Open matter",
    "Initial review",
    "Client update",
    "Resolution",
    "Close matter",
  ],
};

function fmtHm(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const KIND_LABEL: Record<string, string> = {
  matter_created: "Matter",
  matter_updated: "Matter",
  time_logged: "Time",
};
const KIND_GROUP: Record<string, string> = {
  matter_created: "matter",
  matter_updated: "matter",
  time_logged: "time",
};

export default function MatterDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const [matter, setMatter] = useState<Matter | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const [timelineType, setTimelineType] = useState<string>("");
  const [timelineView, setTimelineView] = useState<"checklist" | "board" | "tasks">(
    "checklist",
  );
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [boardCols, setBoardCols] = useState<Record<string, number>>({});
  const dragStep = useRef<string | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<{ clientId: string; name: string } | null>(null);
  const [bodyTab, setBodyTab] = useState<
    "time" | "tasks" | "documents" | "events" | "invoices" | "notes" | "activity"
  >("time");

  async function loadActivity() {
    const { data } = await supabase
      .from("activity_log")
      .select("*")
      .eq("matter_id", params.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setActivity((data as ActivityItem[]) ?? []);
  }

  async function loadAll() {
    const [{ data: m }, { data: cs }, { data: e }, { data: ev }, { data: inv }] =
      await Promise.all([
        supabase.from("matters").select("*").eq("id", params.id).single(),
        supabase.from("clients").select("*").order("name"),
        supabase
          .from("time_entries")
          .select("*")
          .eq("matter_id", params.id)
          .order("logged_at", { ascending: false }),
        supabase
          .from("events")
          .select("*")
          .eq("matter_id", params.id)
          .order("event_date"),
        supabase
          .from("invoices")
          .select("*")
          .eq("matter_id", params.id)
          .order("created_at", { ascending: false }),
      ]);
    const matterRow = (m as Matter) ?? null;
    setMatter(matterRow);
    setClients((cs as Client[]) ?? []);
    setEntries((e as TimeEntry[]) ?? []);
    setEvents((ev as EventItem[]) ?? []);
    setInvoices((inv as Invoice[]) ?? []);
    setTimelineType(matterRow?.case_timeline_type ?? "");
    await loadActivity();
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function patch(changes: Partial<Matter>) {
    if (!matter) return;
    setMatter({ ...matter, ...changes });
    await supabase.from("matters").update(changes).eq("id", matter.id);
  }

  async function changeStatus(status: string) {
    if (!matter) return;
    const changes: Partial<Matter> = { status };
    if (status === "closed" && matter.status !== "closed") {
      changes.closed_at = new Date().toISOString();
      changes.closed_by = userName;
      changes.priority = "-";
    } else if (status !== "closed") {
      changes.closed_at = null;
      changes.closed_by = null;
    }
    const wasStatus = matter.status;
    await patch(changes);
    if (status !== wasStatus) {
      await supabase.from("activity_log").insert({
        kind: "matter_updated",
        matter_id: matter.id,
        client_id: matter.client_id,
        description:
          status === "closed"
            ? `${userName} closed matter ${matter.name}`
            : `${userName} reopened matter ${matter.name}`,
      });
      loadActivity();
    }
    // If this was the client's only open matter, offer to archive them.
    if (status === "closed" && matter.client_id) {
      const { count } = await supabase
        .from("matters")
        .select("id", { count: "exact", head: true })
        .eq("client_id", matter.client_id)
        .eq("status", "open");
      if ((count ?? 0) === 0) {
        setArchivePrompt({
          clientId: matter.client_id,
          name: clients.find((c) => c.id === matter.client_id)?.name ?? "this client",
        });
      }
    }
  }

  async function archiveClient() {
    if (!archivePrompt) return;
    await supabase.from("clients").update({ archived: true }).eq("id", archivePrompt.clientId);
    setArchivePrompt(null);
  }

  async function saveBillingNotes(clientId: string, v: string) {
    const next = v.trim() || null;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, billing_notes: next } : c)),
    );
    await supabase.from("clients").update({ billing_notes: next }).eq("id", clientId);
  }

  async function logTime(f: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
  }) {
    if (!matter) return;
    await supabase.from("time_entries").insert({
      matter_id: matter.id,
      activity: f.activity,
      lawyer: f.lawyer || "Isa",
      duration_seconds: f.seconds,
      note: f.note.trim() || null,
    });
    await supabase.from("activity_log").insert({
      kind: "time_logged",
      matter_id: matter.id,
      client_id: matter.client_id,
      description: `${userName} logged ${fmtHm(f.seconds)} to ${matter.name} (${
        f.activity
      })`,
    });
    setLogOpen(false);
    loadAll();
  }

  if (loading) return <p className="muted-line">Loading…</p>;
  if (!matter)
    return (
      <div>
        <Link href="/dashboard/matters" className="back-link">
          ← Matters
        </Link>
        <p className="muted-line">Matter not found.</p>
      </div>
    );

  const totalSeconds = entries.reduce((s, e) => s + e.duration_seconds, 0);
  const billable = matter.hourly_rate
    ? (totalSeconds / 3600) * matter.hourly_rate
    : null;

  const clientObj = clients.find((c) => c.id === matter.client_id) ?? null;
  const attorneyOptions: { value: string; label: string }[] = ATTORNEYS.map(
    (a) => ({ value: a, label: a }),
  );
  if (
    matter.assigned_to &&
    !ATTORNEYS.includes(matter.assigned_to as (typeof ATTORNEYS)[number])
  ) {
    attorneyOptions.push({
      value: matter.assigned_to,
      label: matter.assigned_to,
    });
  }

  return (
    <div>
      <Link href="/dashboard/matters" className="back-link">
        ← Matters
      </Link>
      <div className="matter-head">
        <div className="matter-head-title">
          <h1 className="page-title editable-title">
            <InlineText
              value={matter.name}
              onSave={(v) => {
                if (v) patch({ name: v });
              }}
            />
          </h1>
          {matter.status === "closed" && (
            <span className="closed-note">
              Closed{" "}
              <input
                type="date"
                className="closed-date-input"
                value={
                  matter.closed_at
                    ? new Date(matter.closed_at).toISOString().slice(0, 10)
                    : ""
                }
                onChange={(e) =>
                  patch({
                    closed_at: e.target.value
                      ? new Date(e.target.value + "T12:00:00").toISOString()
                      : null,
                  })
                }
              />
              {matter.closed_by ? ` · by ${matter.closed_by}` : ""}
            </span>
          )}
        </div>
        <div className="matter-meta">
          <div className="meta-chip">
            <span className="meta-label">Status</span>
            <InlineSelect
              value={matter.status}
              className={`pill-${matter.status}`}
              options={[
                { value: "open", label: "open" },
                { value: "closed", label: "closed" },
              ]}
              onSave={(v) => changeStatus(v)}
            />
          </div>
          {matter.status !== "closed" && (
            <div className="meta-chip">
              <span className="meta-label">Priority</span>
              <InlineSelect
                value={matter.priority}
                className={`prio-${matter.priority}`}
                options={PRIORITIES.map((p) => ({
                  value: p.value,
                  label: p.label,
                }))}
                onSave={(v) => patch({ priority: v })}
              />
            </div>
          )}
          <div className="meta-chip">
            <span className="meta-label">Practice Area</span>
            <InlineSelect
              value={matter.practice_area ?? PRACTICE_AREAS[0]}
              options={PRACTICE_AREAS.map((p) => ({ value: p, label: p }))}
              onSave={(v) => patch({ practice_area: v })}
            />
          </div>
          <div className="meta-chip">
            <span className="meta-label">Case Timeline</span>
            <label className="switch switch-chip">
              <input
                type="checkbox"
                checked={!!timelineType}
                onChange={() => {
                  const next = timelineType ? "" : CASE_TIMELINE_TEMPLATES[0];
                  setTimelineType(next);
                  patch({ case_timeline_type: next || null });
                }}
              />
              <span className="switch-track" />
            </label>
          </div>
        </div>
      </div>

      <div className="matter-cards">
        <div className="panel client-card">
          <h2 className="panel-title">Client</h2>
          {matter.client_id && clientObj ? (
            <>
              <div className="cc-name">
                <Link
                  href={`/dashboard/clients/${matter.client_id}`}
                  className="row-link"
                >
                  {clientObj.name}
                </Link>
                <span className="type-pill">
                  {clientObj.client_type === "business"
                    ? "Business"
                    : clientObj.partner_name
                      ? "Couple"
                      : "Individual"}
                </span>
              </div>
              <dl className="cc-fields">
                <div>
                  <dt>{clientObj.client_type === "business" ? "Contact" : "Primary contact"}</dt>
                  <dd>
                    {clientObj.primary_contact || "—"}
                    {clientObj.contact_title ? `, ${clientObj.contact_title}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Email</dt>
                  <dd>{clientObj.email || "—"}</dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>{clientObj.phone || "—"}</dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>{clientObj.address || "—"}</dd>
                </div>
                {clientObj.partner_name && (
                  <div>
                    <dt>Second contact</dt>
                    <dd>
                      {clientObj.partner_name}
                      {clientObj.partner_phone ? ` · ${clientObj.partner_phone}` : ""}
                    </dd>
                  </div>
                )}
              </dl>
            </>
          ) : (
            <p className="muted-line">No client linked.</p>
          )}
        </div>

        <div className="panel details-card">
          <h2 className="panel-title">Details</h2>
          <dl className="cc-fields">
            <div>
              <dt>Assigned To</dt>
              <dd>
                <InlineSelect
                  value={matter.assigned_to ?? ATTORNEYS[0]}
                  options={attorneyOptions}
                  onSave={(v) => patch({ assigned_to: v })}
                />
              </dd>
            </div>
            <div>
              <dt>Rate</dt>
              <dd>
                <InlineNumber
                  value={matter.hourly_rate}
                  prefix="$"
                  suffix={matter.rate_type === "flat" ? " flat" : "/hr"}
                  onSave={(v) => patch({ hourly_rate: v })}
                />
              </dd>
            </div>
            <div>
              <dt>Time Logged</dt>
              <dd>{fmtHm(totalSeconds)}</dd>
            </div>
            <div>
              <dt>Billable</dt>
              <dd>{billable != null ? `$${billable.toFixed(2)}` : "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {timelineType && (
        <div className="panel" style={{ marginBottom: "1.5rem" }}>
          <div className="panel-head">
            <h2 className="panel-title">Case Timeline</h2>
            <select
              className="inline-select"
              value={timelineType}
              onChange={(e) => {
                setTimelineType(e.target.value);
                patch({ case_timeline_type: e.target.value });
              }}
            >
              {CASE_TIMELINE_TEMPLATES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="timeline-body">
            <div className="seg" style={{ marginBottom: "0.9rem" }}>
              {(["checklist", "board", "tasks"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={timelineView === v ? "active" : undefined}
                  onClick={() => setTimelineView(v)}
                >
                  {v === "checklist"
                    ? "Checklist"
                    : v === "board"
                      ? "Board"
                      : "Tasks"}
                </button>
              ))}
            </div>

            {(() => {
              const steps = TIMELINE_STEPS[timelineType] ?? [];
              if (timelineView === "checklist") {
                return (
                  <ul className="tl-checklist">
                    {steps.map((s) => (
                      <li key={s}>
                        <label>
                          <input
                            type="checkbox"
                            checked={!!checkedSteps[s]}
                            onChange={() =>
                              setCheckedSteps((p) => ({ ...p, [s]: !p[s] }))
                            }
                          />
                          <span className={checkedSteps[s] ? "done" : ""}>{s}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                );
              }
              if (timelineView === "board") {
                const cols = ["To Do", "In Progress", "Done"];
                const colOf = (s: string, i: number) => boardCols[s] ?? i % 3;
                return (
                  <div className="tl-board">
                    {cols.map((col, ci) => (
                      <div
                        className="tl-col"
                        key={col}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          const s = dragStep.current;
                          if (s != null) setBoardCols((p) => ({ ...p, [s]: ci }));
                          dragStep.current = null;
                        }}
                      >
                        <div className="tl-col-head">{col}</div>
                        {steps
                          .map((s, i) => ({ s, i }))
                          .filter(({ s, i }) => colOf(s, i) === ci)
                          .map(({ s }) => (
                            <div
                              className="tl-card"
                              key={s}
                              draggable
                              onDragStart={() => {
                                dragStep.current = s;
                              }}
                            >
                              {s}
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <ul className="tl-tasks">
                  {steps.map((s, i) => (
                    <li key={s}>
                      <span className="tl-num">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              );
            })()}
          </div>
        </div>
      )}

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Description</h2>
        <InlineTextarea
          value={matter.description}
          onSave={(v) => patch({ description: v || null })}
          placeholder="Click to add a description…"
        />
      </div>

      <div className="doc-tabs client-tabs">
        {([
          ["time", `Time Entries (${entries.length})`],
          ["tasks", "Tasks"],
          ["documents", "Documents"],
          ["events", `Events (${events.length})`],
          ["invoices", `Invoices (${invoices.length})`],
          ["notes", "Notes"],
          ["activity", "Activity"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={bodyTab === key ? "active" : undefined}
            onClick={() => setBodyTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="panel">
        {bodyTab === "time" && (
          <TimeEntriesTab
            entries={entries}
            rate={matter.hourly_rate}
            onAdd={() => setLogOpen(true)}
            onChanged={loadAll}
          />
        )}

        {bodyTab === "tasks" && (
          <>
            <h2 className="panel-title">Tasks</h2>
            <TodoWidget matterId={matter.id} compact />
          </>
        )}

        {bodyTab === "documents" && (
          <>
            <h2 className="panel-title">Documents</h2>
            <div className="table-wrap" style={{ border: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {MATTER_DOCS.map((d) => (
                    <tr key={d.name}>
                      <td className="strong-cell">{d.name}</td>
                      <td>{d.updated}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Disclaimer>Document storage is a placeholder for this mockup.</Disclaimer>
          </>
        )}

        {bodyTab === "notes" && (
          <>
            <h2 className="panel-title">Notes</h2>
            <InlineTextarea
              value={matter.notes}
              onSave={(v) => patch({ notes: v || null })}
              placeholder="Internal notes for this matter…"
            />
          </>
        )}

        {bodyTab === "events" && (
          <>
            <div className="panel-head">
              <h2 className="panel-title">Events ({events.length})</h2>
              <span className="chip-note">from calendar (demo)</span>
            </div>
            {events.length === 0 ? (
              <p className="muted-line">No upcoming events.</p>
            ) : (
              <ul className="event-list">
                {events.map((ev) => (
                  <li key={ev.id}>
                    <span className="event-date">
                      {new Date(ev.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                    <span className="event-title">{ev.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {bodyTab === "invoices" && (
          <>
            <h2 className="panel-title">Invoices ({invoices.length})</h2>
            {invoices.length === 0 ? (
              <p className="muted-line">No invoices for this matter.</p>
            ) : (
              <ul className="invoice-list">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <span className="strong-cell">{i.number || "—"}</span>
                    <span>{i.amount != null ? `$${i.amount.toFixed(2)}` : "—"}</span>
                    <span className={`pill inv-${i.status}`}>{i.status}</span>
                  </li>
                ))}
              </ul>
            )}
            {clientObj && (
              <div style={{ marginTop: "1.25rem" }}>
                <Collapsible title="Billing Notes" empty={!clientObj.billing_notes}>
                  <p className="field-note">
                    How {clientObj.name} likes to be billed.
                  </p>
                  <InlineTextarea
                    value={clientObj.billing_notes}
                    onSave={(v) => saveBillingNotes(clientObj.id, v)}
                    placeholder="e.g. Flat monthly retainer, invoice on the 1st…"
                  />
                </Collapsible>
              </div>
            )}
          </>
        )}

        {bodyTab === "activity" && (
          <>
            <h2 className="panel-title">Activity</h2>
            <div className="panel-scroll tall">
              {activity.length === 0 ? (
                <p className="muted-line">No activity for this matter yet.</p>
              ) : (
                <ul className="activity-list">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span className={`act-tag tag-${KIND_GROUP[a.kind] ?? "matter"}`}>
                        {KIND_LABEL[a.kind] ?? "Matter"}
                      </span>
                      <span className="act-desc">{a.description}</span>
                      <span className="act-time">{timeAgo(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>

      {archivePrompt && (
        <div className="modal-backdrop" onClick={() => setArchivePrompt(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Archive client?</h3>
            <p className="modal-dur">
              This was <strong>{archivePrompt.name}</strong>&rsquo;s only open
              matter. Archive the primary contact?
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setArchivePrompt(null)}>
                Keep active
              </button>
              <button type="button" className="btn" onClick={archiveClient}>
                Archive client
              </button>
            </div>
          </div>
        </div>
      )}

      {logOpen && (
        <MatterLogModal
          matterName={matter.name}
          defaultLawyer={matter.assigned_to || ATTORNEYS[0]}
          onCancel={() => setLogOpen(false)}
          onSubmit={logTime}
        />
      )}
    </div>
  );
}

function MatterLogModal({
  matterName,
  defaultLawyer,
  onCancel,
  onSubmit,
}: {
  matterName: string;
  defaultLawyer: string;
  onCancel: () => void;
  onSubmit: (f: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
  }) => void;
}) {
  const [activity, setActivity] = useState<string>(ACTIVITY_TYPES[0]);
  const [lawyer, setLawyer] = useState(defaultLawyer);
  const [note, setNote] = useState("");
  const [h, setH] = useState(0);
  const [m, setM] = useState(0);
  const [decimal, setDecimal] = useState("");
  const num = (v: string) => Math.max(0, Number(v.replace(/[^0-9]/g, "")) || 0);
  const totalSeconds = h * 3600 + m * 60;

  function applyDecimal(raw: string) {
    setDecimal(raw);
    const hrs = parseFloat(raw);
    if (!isNaN(hrs) && hrs >= 0) {
      const secs = Math.round(hrs * 3600);
      setH(Math.floor(secs / 3600));
      setM(Math.floor((secs % 3600) / 60));
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Log time</h3>
        <p className="modal-dur">{matterName}</p>
        <label>
          Activity
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            {ACTIVITY_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            rows={3}
            placeholder="What did you work on for the client?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label>
          Lawyer
          <select value={lawyer} onChange={(e) => setLawyer(e.target.value)}>
            {(ATTORNEYS as readonly string[]).includes(lawyer) ? null : (
              <option value={lawyer}>{lawyer}</option>
            )}
            {ATTORNEYS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration
          <div className="dur-inputs">
            <input
              type="number"
              min={0}
              value={h}
              onChange={(e) => {
                setH(num(e.target.value));
                setDecimal("");
              }}
            />
            <span>h</span>
            <input
              type="number"
              min={0}
              max={59}
              value={m}
              onChange={(e) => {
                setM(Math.min(59, num(e.target.value)));
                setDecimal("");
              }}
            />
            <span>m</span>
          </div>
        </label>
        <label>
          Or enter decimal hours (e.g. 1.5)
          <input
            type="number"
            step="0.25"
            min={0}
            placeholder="1.5"
            value={decimal}
            onChange={(e) => applyDecimal(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={totalSeconds === 0}
            onClick={() => onSubmit({ activity, lawyer, note, seconds: totalSeconds })}
          >
            Save entry
          </button>
        </div>
      </div>
    </div>
  );
}
