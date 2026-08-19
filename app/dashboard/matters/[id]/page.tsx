"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
  const [archivePrompt, setArchivePrompt] = useState<{ clientId: string; name: string } | null>(null);

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
  const clientName = clientObj?.name ?? null;
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
          <div className="meta-chip">
            <span className="meta-label">Practice Area</span>
            <InlineSelect
              value={matter.practice_area ?? PRACTICE_AREAS[0]}
              options={PRACTICE_AREAS.map((p) => ({ value: p, label: p }))}
              onSave={(v) => patch({ practice_area: v })}
            />
          </div>
        </div>
      </div>

      <div className="detail-grid grid-even">
        <div className="detail-item">
          <span className="detail-label">Client</span>
          {matter.client_id ? (
            <>
              <Link
                href={`/dashboard/clients/${matter.client_id}`}
                className="row-link"
              >
                {clientName}
              </Link>
              {(clientObj?.email || clientObj?.phone) && (
                <span className="client-contact">
                  {clientObj?.email && <span>{clientObj.email}</span>}
                  {clientObj?.phone && <span>{clientObj.phone}</span>}
                </span>
              )}
            </>
          ) : (
            <span className="inline-placeholder">—</span>
          )}
        </div>
        <div className="detail-item">
          <span className="detail-label">Assigned To</span>
          <InlineSelect
            value={matter.assigned_to ?? ATTORNEYS[0]}
            options={attorneyOptions}
            onSave={(v) => patch({ assigned_to: v })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Rate</span>
          <InlineNumber
            value={matter.hourly_rate}
            prefix="$"
            suffix="/hr"
            onSave={(v) => patch({ hourly_rate: v })}
          />
        </div>
        <div className="detail-item">
          <span className="detail-label">Time Logged</span>
          {fmtHm(totalSeconds)}
        </div>
        <div className="detail-item">
          <span className="detail-label">Billable</span>
          {billable != null ? `$${billable.toFixed(2)}` : "—"}
        </div>
      </div>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <div className="panel-head">
          <h2 className="panel-title">Case Timeline</h2>
          <label className="switch">
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
            {timelineType ? "On" : "Off"}
          </label>
        </div>

        {timelineType && (
          <div className="timeline-body">
            <div className="timeline-controls">
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
              <div className="seg">
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
            </div>

            <Disclaimer>
              Preview only — compare the three layouts, then tell me which to keep
              (progress isn&rsquo;t saved yet).
            </Disclaimer>

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
                return (
                  <div className="tl-board">
                    {cols.map((col, ci) => (
                      <div className="tl-col" key={col}>
                        <div className="tl-col-head">{col}</div>
                        {steps
                          .filter((_, i) => i % 3 === ci)
                          .map((s) => (
                            <div className="tl-card" key={s}>
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
        )}
      </div>

      <div className="matter-body">
        <div className="matter-body-main">
          <Collapsible title="Description" empty={!matter.description}>
            <InlineTextarea
              value={matter.description}
              onSave={(v) => patch({ description: v || null })}
              placeholder="Click to add a description…"
            />
          </Collapsible>

          <Collapsible
            title={`Time Entries (${entries.length})`}
            empty={entries.length === 0}
            action={
              <button className="btn" type="button" onClick={() => setLogOpen(true)}>
                + Log time
              </button>
            }
          >
            {entries.length === 0 ? (
              <p className="muted-line">No time logged to this matter yet.</p>
            ) : (
              <div className="table-wrap" style={{ border: "none" }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Activity</th>
                      <th>Description</th>
                      <th>Lawyer</th>
                      <th>Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => (
                      <tr key={e.id}>
                        <td>{new Date(e.logged_at).toLocaleDateString()}</td>
                        <td>{e.activity || "—"}</td>
                        <td>{e.note || "—"}</td>
                        <td>{e.lawyer}</td>
                        <td>{fmtHm(e.duration_seconds)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Collapsible>
        </div>

        <div className="matter-body-side">
          <Collapsible
            title="Events"
            empty={events.length === 0}
            action={<span className="chip-note">from calendar (demo)</span>}
          >
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
          </Collapsible>

          <Collapsible
            title={`Invoices (${invoices.length})`}
            empty={invoices.length === 0}
          >
            {invoices.length === 0 ? (
              <p className="muted-line">No invoices for this matter.</p>
            ) : (
              <ul className="invoice-list">
                {invoices.map((i) => (
                  <li key={i.id}>
                    <span className="strong-cell">{i.number || "—"}</span>
                    <span>
                      {i.amount != null ? `$${i.amount.toFixed(2)}` : "—"}
                    </span>
                    <span className={`pill inv-${i.status}`}>{i.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Collapsible>

          <div className="panel">
            <h2 className="panel-title">Tasks</h2>
            <TodoWidget matterId={matter.id} compact />
          </div>

          <Collapsible title="Activity" empty={activity.length === 0}>
            <div className="panel-scroll tall">
              {activity.length === 0 ? (
                <p className="muted-line">No activity for this matter yet.</p>
              ) : (
                <ul className="activity-list">
                  {activity.map((a) => (
                    <li key={a.id}>
                      <span
                        className={`act-tag tag-${
                          KIND_GROUP[a.kind] ?? "matter"
                        }`}
                      >
                        {KIND_LABEL[a.kind] ?? "Matter"}
                      </span>
                      <span className="act-desc">{a.description}</span>
                      <span className="act-time">{timeAgo(a.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Collapsible>
        </div>
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
