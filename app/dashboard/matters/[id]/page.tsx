"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  CASE_TIMELINE_TEMPLATES,
  PRACTICE_AREAS,
  PRIORITIES,
  RATE_TYPES,
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
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [timelineType, setTimelineType] = useState<string>("");
  const [timelineView, setTimelineView] = useState<"checklist" | "board" | "tasks">(
    "checklist",
  );
  const [checkedSteps, setCheckedSteps] = useState<Record<string, boolean>>({});
  const [boardCols, setBoardCols] = useState<Record<string, number>>({});
  const dragStep = useRef<string | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<{ clientId: string; name: string } | null>(null);
  const [bodyTab, setBodyTab] = useState<
    "time" | "tasks" | "documents" | "events" | "invoices" | "notes" | "timeline" | "activity"
  >("time");
  const cardsRef = useRef<HTMLDivElement>(null);
  const latestPct = useRef(58);
  const [leftPct, setLeftPct] = useState(58);
  const [stackCards, setStackCards] = useState(false);

  useEffect(() => {
    const saved = Number(localStorage.getItem("matterCardsLeftPct"));
    if (saved >= 25 && saved <= 75) {
      latestPct.current = saved;
      setLeftPct(saved);
    }
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setStackCards(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  function startCardResize(e: React.MouseEvent) {
    e.preventDefault();
    const el = cardsRef.current;
    if (!el) return;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      let pct = ((ev.clientX - rect.left) / rect.width) * 100;
      pct = Math.max(25, Math.min(75, pct));
      latestPct.current = pct;
      setLeftPct(pct);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("matterCardsLeftPct", String(Math.round(latestPct.current)));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }

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

  async function deleteMatter() {
    if (!matter) return;
    const id = matter.id;
    const name = matter.name;
    const clientId = matter.client_id;
    for (const table of ["time_entries", "events", "invoices", "todos", "activity_log"]) {
      await supabase.from(table).delete().eq("matter_id", id);
    }
    await supabase.from("matters").delete().eq("id", id);
    // Log after deletion, without matter_id so it survives on the client/global feed.
    await supabase.from("activity_log").insert({
      kind: "matter_updated",
      client_id: clientId,
      description: `${userName} deleted matter ${name}`,
    });
    router.push("/dashboard/matters");
  }

  async function completeEvent(ev: EventItem) {
    setEvents((prev) =>
      prev.map((e) => (e.id === ev.id ? { ...e, completed: true } : e)),
    );
    await supabase.from("events").update({ completed: true }).eq("id", ev.id);
    await supabase.from("activity_log").insert({
      kind: "matter_updated",
      matter_id: matter?.id ?? null,
      client_id: matter?.client_id ?? null,
      description: `${userName} completed event: ${ev.title}`,
    });
    loadActivity();
  }

  async function reopenEvent(ev: EventItem) {
    setEvents((prev) =>
      prev.map((e) => (e.id === ev.id ? { ...e, completed: false } : e)),
    );
    await supabase.from("events").update({ completed: false }).eq("id", ev.id);
  }

  async function saveClientField(
    clientId: string,
    field: "primary_contact" | "email" | "phone" | "address" | "contact_title",
    v: string,
  ) {
    const next = v.trim() || null;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, [field]: next } : c)),
    );
    await supabase.from("clients").update({ [field]: next }).eq("id", clientId);
  }

  async function saveBillingNotes(clientId: string, v: string) {
    const next = v.trim() || null;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, billing_notes: next } : c)),
    );
    await supabase.from("clients").update({ billing_notes: next }).eq("id", clientId);
  }

  async function saveClientNotes(clientId: string, v: string) {
    const next = v.trim() || null;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, notes: next } : c)),
    );
    await supabase.from("clients").update({ notes: next }).eq("id", clientId);
  }

  async function addEntry(f: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
    date: string;
  }) {
    if (!matter) return;
    await supabase.from("time_entries").insert({
      matter_id: matter.id,
      activity: f.activity,
      lawyer: f.lawyer || "Isa",
      duration_seconds: f.seconds,
      note: f.note.trim() || null,
      logged_at: f.date
        ? new Date(f.date + "T12:00:00").toISOString()
        : new Date().toISOString(),
    });
    await supabase.from("activity_log").insert({
      kind: "time_logged",
      matter_id: matter.id,
      client_id: matter.client_id,
      description: `${userName} logged ${fmtHm(f.seconds)} to ${matter.name} (${
        f.activity
      })`,
    });
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

  const tlType = timelineType || CASE_TIMELINE_TEMPLATES[0];
  const clientObj = clients.find((c) => c.id === matter.client_id) ?? null;
  const upcomingEvents = events.filter((e) => !e.completed);
  const completedEvents = events.filter((e) => e.completed);
  // In the Details box, keep a completed deadline visible for one week after its
  // date, then let it drop off (the Events tab still keeps the full history).
  const detailsCompleted = completedEvents.filter(
    (e) => new Date(e.event_date).getTime() >= Date.now() - 7 * 86400000,
  );

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
            <span className="meta-label">&nbsp;</span>
            <button type="button" className="meta-delete" onClick={() => setConfirmDel(true)}>
              Delete
            </button>
          </div>
        </div>
      </div>

      <div
        className="matter-cards"
        ref={cardsRef}
        style={stackCards ? undefined : { display: "flex", gap: "1.5rem", alignItems: "stretch" }}
      >
        <div
          className="panel client-card"
          style={stackCards ? undefined : { flex: `0 0 calc(${leftPct}% - 0.75rem)`, minWidth: 0, position: "relative" }}
        >
          {!stackCards && (
            <div
              className="card-grip right"
              onMouseDown={startCardResize}
              title="Drag to resize"
              role="separator"
              aria-orientation="vertical"
            />
          )}
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
              </div>
              <dl className="cc-fields">
                <div>
                  <dt>{clientObj.client_type === "business" ? "Contact" : "Primary contact"}</dt>
                  <dd>
                    <InlineText
                      value={clientObj.primary_contact}
                      onSave={(v) => saveClientField(clientObj.id, "primary_contact", v)}
                      placeholder="—"
                    />
                  </dd>
                </div>
                {clientObj.client_type === "business" && (
                  <div>
                    <dt>Title</dt>
                    <dd>
                      <InlineText
                        value={clientObj.contact_title}
                        onSave={(v) => saveClientField(clientObj.id, "contact_title", v)}
                        placeholder="—"
                      />
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Email</dt>
                  <dd>
                    <InlineText
                      value={clientObj.email}
                      onSave={(v) => saveClientField(clientObj.id, "email", v)}
                      placeholder="—"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Phone</dt>
                  <dd>
                    <InlineText
                      value={clientObj.phone}
                      onSave={(v) => saveClientField(clientObj.id, "phone", v)}
                      placeholder="—"
                    />
                  </dd>
                </div>
                <div>
                  <dt>Address</dt>
                  <dd>
                    <InlineText
                      value={clientObj.address}
                      onSave={(v) => saveClientField(clientObj.id, "address", v)}
                      placeholder="—"
                      format={(v) => {
                        const i = v.indexOf(",");
                        if (i === -1) return v;
                        return (
                          <>
                            {v.slice(0, i).trim()}
                            <br />
                            {v.slice(i + 1).trim()}
                          </>
                        );
                      }}
                    />
                  </dd>
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
              <div className="cc-notes">
                <dt>Notes</dt>
                <InlineTextarea
                  value={clientObj.notes}
                  onSave={(v) => saveClientNotes(clientObj.id, v)}
                  placeholder="Click to add client notes…"
                />
              </div>
            </>
          ) : (
            <p className="muted-line">No client linked.</p>
          )}
        </div>

        <div
          className="panel details-card"
          style={stackCards ? undefined : { flex: "1 1 0", minWidth: 0, position: "relative" }}
        >
          {!stackCards && (
            <div
              className="card-grip left"
              onMouseDown={startCardResize}
              title="Drag to resize"
              role="separator"
              aria-orientation="vertical"
            />
          )}
          <h2 className="panel-title">Details</h2>
          <dl className="details-grid">
            <div>
              <dt>Rate</dt>
              <dd className="rate-dd">
                <InlineNumber
                  value={matter.hourly_rate}
                  prefix="$"
                  onSave={(v) => patch({ hourly_rate: v })}
                />
                <InlineSelect
                  value={matter.rate_type || "hourly"}
                  className="rate-type-select"
                  options={RATE_TYPES.map((r) => ({
                    value: r.value,
                    label: r.value === "flat" ? "flat" : "/hr",
                  }))}
                  onSave={(v) => patch({ rate_type: v })}
                />
              </dd>
            </div>
          </dl>
          <div className="details-desc">
            <dt>Description</dt>
            <dd>
              <InlineTextarea
                value={matter.description}
                onSave={(v) => patch({ description: v || null })}
                placeholder="Click to add a description…"
              />
            </dd>
          </div>

          {(upcomingEvents.length > 0 || detailsCompleted.length > 0) && (
            <div className="du">
              {upcomingEvents.length > 0 && (
                <div className="du-head">
                  <svg className="du-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  <span className="du-label">Upcoming</span>
                </div>
              )}
              <ul className="du-list">
                {upcomingEvents.slice(0, 4).map((ev) => (
                  <li key={ev.id}>
                    <span className="du-date">
                      {new Date(ev.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="du-title">{ev.title}</span>
                    <button
                      type="button"
                      className="du-check"
                      title="Mark complete"
                      aria-label="Mark complete"
                      onClick={() => completeEvent(ev)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </li>
                ))}
                {detailsCompleted.map((ev) => (
                  <li key={ev.id} className="du-item-done">
                    <span className="du-date">
                      {new Date(ev.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="du-title done" title={ev.title}>{ev.title}</span>
                    <button
                      type="button"
                      className="du-check checked"
                      title="Checked off — click to reopen"
                      aria-label="Checked off — click to reopen"
                      onClick={() => reopenEvent(ev)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="doc-tabs client-tabs">
        {([
          ["time", `Time Entries (${entries.length})`],
          ["tasks", "Tasks"],
          ["documents", "Documents"],
          ["events", `Events (${upcomingEvents.length})`],
          ["invoices", `Invoices (${invoices.length})`],
          ["notes", "Notes"],
          ["timeline", "Case Timeline"],
          ["activity", `Activity (${activity.length})`],
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
        {bodyTab === "timeline" && (
          <div className="timeline-body">
            <div className="timeline-controls" style={{ marginBottom: "0.9rem" }}>
              <select
                className="inline-select"
                value={tlType}
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

            {(() => {
              const steps = TIMELINE_STEPS[tlType] ?? [];
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
        )}

        {bodyTab === "time" && (
          <TimeEntriesTab
            entries={entries}
            rate={matter.hourly_rate}
            onAddEntry={addEntry}
            onChanged={loadAll}
          />
        )}

        {bodyTab === "tasks" && (
          <TodoWidget matterId={matter.id} compact />
        )}

        {bodyTab === "documents" && (
          <>
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

        {bodyTab === "events" && (
          <>
            <h3 className="ev-section">Upcoming ({upcomingEvents.length})</h3>
            {upcomingEvents.length === 0 ? (
              <p className="muted-line">No upcoming events.</p>
            ) : (
              <ul className="du-list">
                {upcomingEvents.map((ev) => (
                  <li key={ev.id}>
                    <span className="du-date">
                      {new Date(ev.event_date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                    <span className="du-title">{ev.title}</span>
                    <button
                      type="button"
                      className="du-check"
                      title="Mark complete"
                      aria-label="Mark complete"
                      onClick={() => completeEvent(ev)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {completedEvents.length > 0 && (
              <>
                <h3 className="ev-section muted" style={{ marginTop: "1.4rem" }}>
                  Completed ({completedEvents.length})
                </h3>
                <ul className="du-list dim">
                  {completedEvents.map((ev) => (
                    <li key={ev.id}>
                      <span className="du-date">
                        {new Date(ev.event_date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                      <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                      <span className="du-title done">{ev.title}</span>
                      <button
                        type="button"
                        className="ghost sm"
                        onClick={() => reopenEvent(ev)}
                      >
                        Reopen
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}

        {bodyTab === "notes" && (
          <InlineTextarea
            value={matter.notes}
            onSave={(v) => patch({ notes: v || null })}
            placeholder="Internal notes for this matter…"
          />
        )}

        {bodyTab === "invoices" && (
          <>
            {clientObj && (
              <div style={{ marginBottom: "1.25rem" }}>
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
          </>
        )}

        {bodyTab === "activity" && (
          <>
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

      {confirmDel && (
        <div className="modal-backdrop" onClick={() => setConfirmDel(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete matter?</h3>
            <p className="modal-dur">
              Delete <strong>{matter.name}</strong>? This also removes its time
              entries, events, invoices, tasks and activity. This cannot be undone.
            </p>
            <div className="modal-actions">
              <button type="button" className="ghost" onClick={() => setConfirmDel(false)}>
                Cancel
              </button>
              <button type="button" className="btn danger-btn" onClick={deleteMatter}>
                Delete matter
              </button>
            </div>
          </div>
        </div>
      )}

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

    </div>
  );
}
