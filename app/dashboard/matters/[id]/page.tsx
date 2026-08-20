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
  type Todo,
} from "@/lib/types";
import {
  InlineNumber,
  InlineSelect,
  InlineText,
  InlineTextarea,
} from "../../Inline";
import { usePortal, useCrumbs } from "../../PortalProvider";
import MatterTasksList from "./MatterTasksList";
import Disclaimer from "../../Disclaimer";
import NotesFeed from "../../NotesFeed";
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

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type NoteEntry = { header: string; time: string; date: number; who: string; initials: string; text: string };

function fmtStamp(d: Date): string {
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Notes are stored as a running log of "[stamp · name]\nbody" blocks separated
// by a blank line. Parse them back into structured entries for the feed.
function parseNotes(raw: string | null): NoteEntry[] {
  if (!raw || !raw.trim()) return [];
  const re = /\[([^\]]+)\]\n([\s\S]*?)(?=\n\n\[|$)/g;
  const out: NoteEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const header = m[1];
    const text = m[2].trim();
    const sep = header.lastIndexOf(" · ");
    const rawTime = sep === -1 ? header.trim() : header.slice(0, sep).trim();
    const who = sep === -1 ? "" : header.slice(sep + 3).trim();
    const d = new Date(rawTime);
    const valid = !isNaN(d.getTime());
    out.push({
      header,
      time: valid ? fmtStamp(d) : rawTime,
      date: valid ? d.getTime() : 0,
      who,
      initials: who ? initialsOf(who) : "•",
      text,
    });
  }
  // Legacy free-text notes (no timestamp headers) show as one entry.
  if (out.length === 0)
    out.push({ header: "", time: "", date: 0, who: "", initials: "•", text: raw.trim() });
  return out;
}

function serializeNotes(entries: NoteEntry[]): string {
  return entries
    .map((e) => (e.header ? `[${e.header}]\n${e.text}` : e.text))
    .filter((s) => s.trim())
    .join("\n\n");
}

export default function MatterDetail({ params }: { params: { id: string } }) {
  const { userName } = usePortal();
  const router = useRouter();
  const [confirmDel, setConfirmDel] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [matter, setMatter] = useState<Matter | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
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
    "time" | "expenses" | "tasks" | "documents" | "contacts" | "conflict" | "events" | "invoices" | "notes" | "timeline" | "activity"
  >("time");
  const cardsRef = useRef<HTMLDivElement>(null);
  const latestCombo = useRef(66);
  const [comboPct, setComboPct] = useState(66);
  const [stackCards, setStackCards] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [noteFilter, setNoteFilter] = useState<"all" | "comment" | "activity">("all");

  useEffect(() => {
    const c = Number(localStorage.getItem("matterComboPct"));
    if (c >= 40 && c <= 85) {
      latestCombo.current = c;
      setComboPct(c);
    }
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setStackCards(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Drag the divider between the combined Client/Details panel and Notes.
  function startComboResize(e: React.MouseEvent) {
    e.preventDefault();
    const el = cardsRef.current;
    if (!el) return;
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      const next = Math.max(40, Math.min(pct, 85));
      latestCombo.current = next;
      setComboPct(next);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
      localStorage.setItem("matterComboPct", String(Math.round(latestCombo.current)));
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
    const [{ data: m }, { data: cs }, { data: e }, { data: ev }, { data: inv }, { data: td }] =
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
        supabase
          .from("todos")
          .select("*")
          .eq("matter_id", params.id)
          .order("due_date"),
      ]);
    const matterRow = (m as Matter) ?? null;
    setMatter(matterRow);
    setClients((cs as Client[]) ?? []);
    setEntries((e as TimeEntry[]) ?? []);
    setEvents((ev as EventItem[]) ?? []);
    setTodos((td as Todo[]) ?? []);
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

  async function saveEvent(id: string, changes: Partial<EventItem>) {
    setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...changes } : e)));
    await supabase.from("events").update(changes).eq("id", id);
  }

  async function completeTask(id: string, title: string) {
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: true } : x)));
    await supabase.from("todos").update({ done: true }).eq("id", id);
    await supabase.from("activity_log").insert({
      kind: "matter_updated",
      matter_id: matter?.id ?? null,
      client_id: matter?.client_id ?? null,
      description: `${userName} completed task: ${title}`,
    });
    loadActivity();
  }

  async function reopenTask(id: string) {
    setTodos((prev) => prev.map((x) => (x.id === id ? { ...x, done: false } : x)));
    await supabase.from("todos").update({ done: false }).eq("id", id);
  }

  // Notes are a running log: each submission is stamped and prepended so the
  // newest note sits on top.
  async function addNote() {
    if (!matter) return;
    const text = noteDraft.trim();
    if (!text) return;
    const stamp = new Date().toISOString();
    const who = userName ? ` · ${userName}` : "";
    const entry = `[${stamp}${who}]\n${text}`;
    const next = matter.notes ? `${entry}\n\n${matter.notes}` : entry;
    setNoteDraft("");
    await patch({ notes: next });
  }

  async function saveNoteEdit(i: number) {
    if (!matter) return;
    const entries = parseNotes(matter.notes);
    const text = editText.trim();
    const next = entries
      .map((e, idx) => (idx === i ? { ...e, text } : e))
      .filter((e) => e.text.trim());
    setEditIdx(null);
    setEditText("");
    await patch({ notes: serializeNotes(next) || null });
  }

  async function deleteNote(i: number) {
    if (!matter) return;
    const entries = parseNotes(matter.notes).filter((_, idx) => idx !== i);
    setEditIdx(null);
    setEditText("");
    await patch({ notes: serializeNotes(entries) || null });
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

  const crumbClient = matter ? clients.find((c) => c.id === matter.client_id) : null;
  useCrumbs(
    matter
      ? [
          { label: "Matters", href: "/dashboard/matters" },
          ...(crumbClient
            ? [{ label: crumbClient.name, href: `/dashboard/clients/${crumbClient.id}` }]
            : []),
          { label: matter.name },
        ]
      : [],
  );

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

  // Upcoming = open events (deadlines) + open tasks with a due date, merged.
  // Events show their own kind (e.g. "Closing"); tasks show "Task".
  const now0 = new Date();
  const todayStrLocal = `${now0.getFullYear()}-${String(now0.getMonth() + 1).padStart(2, "0")}-${String(now0.getDate()).padStart(2, "0")}`;
  const evLabel = (k: string | null) =>
    k ? k.charAt(0).toUpperCase() + k.slice(1) : "Deadline";
  type UpItem = { id: string; date: string; title: string; kind: "event" | "task"; label: string };
  const upcomingItems: UpItem[] = [
    ...upcomingEvents.map((e) => ({ id: e.id, date: e.event_date, title: e.title, kind: "event" as const, label: evLabel(e.kind) })),
    ...todos
      .filter((t) => !t.done && t.due_date)
      .map((t) => ({ id: t.id, date: t.due_date as string, title: t.title, kind: "task" as const, label: "Task" })),
  ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const completedItems: UpItem[] = [
    ...detailsCompleted.map((e) => ({ id: e.id, date: e.event_date, title: e.title, kind: "event" as const, label: evLabel(e.kind) })),
    ...todos
      .filter((t) => t.done && t.due_date && new Date(t.due_date).getTime() >= Date.now() - 7 * 86400000)
      .map((t) => ({ id: t.id, date: t.due_date as string, title: t.title, kind: "task" as const, label: "Task" })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <div>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/dashboard/matters">Matters</Link>
        <span className="crumb-sep">/</span>
        {clientObj ? (
          <Link href={`/dashboard/clients/${clientObj.id}`}>{clientObj.name}</Link>
        ) : (
          <span className="crumb-current">—</span>
        )}
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{matter.name}</span>
      </nav>
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
          <div className="matter-substrip">
            <span
              className={`status-pill status-${matter.status === "closed" ? "closed" : "active"}`}
            >
              {matter.status === "closed" ? "Closed" : "Active"}
            </span>
            <span className="strip-sep">·</span>
            <span className="strip-item">
              Opened{" "}
              {new Date(matter.created_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {matter.opened_by && <> by <strong className="strip-who">{matter.opened_by}</strong></>}
            </span>
            {matter.status === "closed" && matter.closed_at && (
              <>
                <span className="strip-sep">·</span>
                <span className="strip-item">
                  Closed{" "}
                  {new Date(matter.closed_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                  {matter.closed_by && <> by <strong className="strip-who">{matter.closed_by}</strong></>}
                </span>
              </>
            )}
          </div>
        </div>
        <div className="matter-meta">
          <button type="button" className="ghost sm" onClick={() => setEditOpen(true)}>
            Edit
          </button>
          <button
            type="button"
            className="ghost sm"
            onClick={() => changeStatus(matter.status === "closed" ? "open" : "closed")}
          >
            {matter.status === "closed" ? "Reopen" : "Close matter"}
          </button>
          <button type="button" className="meta-delete" onClick={() => setConfirmDel(true)}>
            Delete
          </button>
        </div>
      </div>

      <div
        className="matter-cards"
        ref={cardsRef}
        style={stackCards ? undefined : { display: "flex", gap: 0, alignItems: "stretch" }}
      >
        <div
          className="panel combo-card"
          style={stackCards ? undefined : { flex: `0 0 calc(${comboPct}% - 1rem)`, minWidth: 0 }}
        >
          <div className="combo-grid">
            <div className="combo-col">
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
                <dt>Client Notes</dt>
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
            <div className="combo-col">
          <h2 className="panel-title">Details</h2>
          <dl className="details-grid">
            <div>
              <dt>Practice Area</dt>
              <dd>
                <InlineSelect
                  value={matter.practice_area ?? PRACTICE_AREAS[0]}
                  options={PRACTICE_AREAS.map((p) => ({ value: p, label: p }))}
                  onSave={(v) => patch({ practice_area: v })}
                />
              </dd>
            </div>
            {matter.status !== "closed" && (
              <div>
                <dt>Priority</dt>
                <dd>
                  <InlineSelect
                    value={matter.priority}
                    className={`prio-${matter.priority}`}
                    options={PRIORITIES.map((p) => ({ value: p.value, label: p.label }))}
                    onSave={(v) => patch({ priority: v })}
                  />
                </dd>
              </div>
            )}
          </dl>
          <div className="details-desc">
            <dt>Matter Description</dt>
            <dd>
              <InlineTextarea
                value={matter.description}
                onSave={(v) => patch({ description: v || null })}
                placeholder="Click to add a description…"
              />
            </dd>
          </div>

          {(upcomingItems.length > 0 || completedItems.length > 0) && (
            <div className="du">
              {upcomingItems.length > 0 && (
                <div className="du-head">
                  <span className="du-label">Upcoming Tasks &amp; Deadlines</span>
                </div>
              )}
              <ul className="du-list">
                {upcomingItems.slice(0, 5).map((it) => {
                  const overdue = it.date.slice(0, 10) < todayStrLocal;
                  return (
                  <li key={`${it.kind}-${it.id}`}>
                    <span className={`du-date${overdue ? " overdue" : ""}`}>
                      {new Date(it.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {overdue && (
                      <span className="du-overdue" title="Overdue">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Overdue
                      </span>
                    )}
                    <span className={`du-kind-text${it.label === "Closing" ? " closing" : ""}`}>
                      {it.label}
                    </span>
                    <span className="du-title">{it.title}</span>
                    <button
                      type="button"
                      className="du-check"
                      title="Mark complete"
                      aria-label="Mark complete"
                      onClick={() => {
                        if (it.kind === "event") {
                          const ev = events.find((e) => e.id === it.id);
                          if (ev) completeEvent(ev);
                        } else {
                          completeTask(it.id, it.title);
                        }
                      }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </button>
                  </li>
                  );
                })}
                {completedItems.map((it) => (
                  <li key={`${it.kind}-${it.id}`} className="du-item-done">
                    <span className="du-date">
                      {new Date(it.date).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    <span className="du-title done" title={it.title}>{it.title}</span>
                    <button
                      type="button"
                      className="du-check checked"
                      title="Checked off — click to reopen"
                      aria-label="Checked off — click to reopen"
                      onClick={() => {
                        if (it.kind === "event") {
                          const ev = events.find((e) => e.id === it.id);
                          if (ev) reopenEvent(ev);
                        } else {
                          reopenTask(it.id);
                        }
                      }}
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
        </div>

        {!stackCards && (
          <div
            className="cards-resizer"
            onMouseDown={startComboResize}
            title="Drag to resize"
            role="separator"
            aria-orientation="vertical"
          />
        )}
        <div
          className="panel notes-panel"
          style={stackCards ? undefined : { flex: "1 1 0", minWidth: 0 }}
        >
          <div className="notes-head notes-head-center">
            <div className="notes-filter">
              {(["all", "comment", "activity"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={noteFilter === f ? "active" : undefined}
                  onClick={() => setNoteFilter(f)}
                >
                  {f === "all" ? "All" : f === "comment" ? "Comments" : "Activity"}
                </button>
              ))}
            </div>
          </div>
          <div className="notes-log">
            <div className="notes-log-scroll">
            {(() => {
              const noteEntries = parseNotes(matter.notes);
              type Feed =
                | { type: "note"; key: string; idx: number; sort: number; time: string; who: string; initials: string; text: string }
                | { type: "act"; key: string; sort: number; time: string; description: string };
              const feed: Feed[] = [
                ...noteEntries.map((n, idx) => ({
                  type: "note" as const,
                  key: `n${idx}`,
                  idx,
                  sort: n.date,
                  time: n.time,
                  who: n.who,
                  initials: n.initials,
                  text: n.text,
                })),
                ...activity.map((a) => ({
                  type: "act" as const,
                  key: `a${a.id}`,
                  sort: new Date(a.created_at).getTime(),
                  time: fmtStamp(new Date(a.created_at)),
                  description: a.description,
                })),
              ]
                .filter((item) =>
                  noteFilter === "all"
                    ? true
                    : noteFilter === "comment"
                      ? item.type === "note"
                      : item.type === "act",
                )
                .sort((x, y) => y.sort - x.sort);
              if (feed.length === 0)
                return (
                  <p className="muted-line">
                    {noteFilter === "comment"
                      ? "No comments yet."
                      : noteFilter === "activity"
                        ? "No activity yet."
                        : "No notes or activity yet."}
                  </p>
                );
              return (
                <ul className="note-feed">
                  {feed.map((item) =>
                    item.type === "act" ? (
                      <li className="note-item feed-activity" key={item.key}>
                        <span className="feed-dot" aria-hidden="true" />
                        <div className="note-main">
                          <div className="note-time">
                            {item.time}
                            <span className="feed-tag feed-tag-activity">Activity</span>
                          </div>
                          <p className="feed-act-text">{item.description}</p>
                        </div>
                      </li>
                    ) : (
                      <li className="note-item" key={item.key}>
                        <span className="note-avatar" title={item.who || undefined}>
                          {item.initials}
                        </span>
                        <div className="note-main">
                          <div className="note-time">
                            {item.time}
                            <span className="feed-tag feed-tag-comment">Comment</span>
                          </div>
                          {editIdx === item.idx ? (
                            <div className="note-edit">
                              <textarea
                                className="notes-input"
                                autoFocus
                                rows={2}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    saveNoteEdit(item.idx);
                                  }
                                  if (e.key === "Escape") {
                                    setEditIdx(null);
                                    setEditText("");
                                  }
                                }}
                              />
                              <div className="note-edit-actions">
                                <button
                                  type="button"
                                  className="note-del"
                                  onClick={() => deleteNote(item.idx)}
                                >
                                  Delete
                                </button>
                                <span className="note-edit-right">
                                  <button
                                    type="button"
                                    className="ghost sm"
                                    onClick={() => {
                                      setEditIdx(null);
                                      setEditText("");
                                    }}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className="btn"
                                    onClick={() => saveNoteEdit(item.idx)}
                                  >
                                    Save
                                  </button>
                                </span>
                              </div>
                            </div>
                          ) : (
                            <p className="note-text">
                              {item.text}
                              <button
                                type="button"
                                className="note-edit-btn"
                                title="Edit note"
                                aria-label="Edit note"
                                onClick={() => {
                                  setEditIdx(item.idx);
                                  setEditText(item.text);
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                </svg>
                              </button>
                            </p>
                          )}
                        </div>
                      </li>
                    ),
                  )}
                </ul>
              );
            })()}
            </div>
          </div>
          <div className="notes-add">
            <textarea
              className="notes-input"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              placeholder="Add a note…"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  addNote();
                }
              }}
            />
            <button
              type="button"
              className="note-send"
              title="Add note"
              aria-label="Add note"
              disabled={!noteDraft.trim()}
              onClick={addNote}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="doc-tabs client-tabs">
        {(
          [
            ["time", "Time Entries", entries.length],
            ["expenses", "Expenses"],
            ["tasks", "Tasks"],
            ["documents", "Documents"],
            ["contacts", "Contacts"],
            ["events", "Events", upcomingEvents.length],
            ["invoices", "Invoices", invoices.length],
            ...(matter.show_case_timeline
              ? ([["timeline", "Case Timeline"]] as [string, string, number?][])
              : []),
          ] as [string, string, number?][]
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            className={bodyTab === key ? "active" : undefined}
            onClick={() => setBodyTab(key as typeof bodyTab)}
          >
            {label}
            {count != null && <span className="count-badge">{count}</span>}
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
            rateControl={
              <div className="te-rate">
                <span className="te-rate-label">Rate</span>
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
              </div>
            }
          />
        )}

        {bodyTab === "expenses" && (
          <>
            <p className="muted-line">No expenses recorded for this matter.</p>
            <Disclaimer>Expense tracking is a placeholder for now.</Disclaimer>
          </>
        )}

        {bodyTab === "contacts" && (
          <>
            {clientObj ? (
              <ul className="contact-cards">
                <li className="contact-card">
                  <div className="cc-role">Primary contact</div>
                  <div className="cc-name-lg">{clientObj.primary_contact || clientObj.name}</div>
                  <dl className="cc-fields">
                    {clientObj.contact_title && (
                      <div><dt>Title</dt><dd>{clientObj.contact_title}</dd></div>
                    )}
                    <div><dt>Email</dt><dd>{clientObj.email || "—"}</dd></div>
                    <div><dt>Phone</dt><dd>{clientObj.phone || "—"}</dd></div>
                    <div><dt>Address</dt><dd>{clientObj.address || "—"}</dd></div>
                  </dl>
                </li>
                {clientObj.partner_name && (
                  <li className="contact-card">
                    <div className="cc-role">Second contact</div>
                    <div className="cc-name-lg">{clientObj.partner_name}</div>
                    <dl className="cc-fields">
                      <div><dt>Email</dt><dd>{clientObj.partner_email || "—"}</dd></div>
                      <div><dt>Phone</dt><dd>{clientObj.partner_phone || "—"}</dd></div>
                    </dl>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted-line">No contacts linked to this matter.</p>
            )}
          </>
        )}

        {bodyTab === "tasks" && (
          <MatterTasksList matterId={matter.id} />
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
            <h3 className="ev-section">Upcoming <span className="count-badge">{upcomingEvents.length}</span></h3>
            {upcomingEvents.length === 0 ? (
              <p className="muted-line">No upcoming events.</p>
            ) : (
              <ul className="du-list">
                {upcomingEvents.map((ev) => (
                  <li key={ev.id}>
                    <input
                      type="date"
                      className="ev-date-input"
                      value={(ev.event_date || "").slice(0, 10)}
                      onChange={(e) => {
                        if (e.target.value) saveEvent(ev.id, { event_date: e.target.value });
                      }}
                    />
                    <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                    <span className="du-title">
                      <InlineText
                        value={ev.title}
                        onSave={(v) => {
                          if (v) saveEvent(ev.id, { title: v });
                        }}
                      />
                    </span>
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
                  Completed <span className="count-badge">{completedEvents.length}</span>
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

        {bodyTab === "invoices" && (
          <>
            {clientObj && (
              <div className="billing-notes" style={{ marginBottom: "1.25rem" }}>
                <h3 className="billing-notes-title">Billing Notes</h3>
                <NotesFeed
                  value={clientObj.billing_notes}
                  onSave={(next) => saveBillingNotes(clientObj.id, next ?? "")}
                  userName={userName}
                  placeholder="Add a billing note…"
                  wide
                />
              </div>
            )}
            {invoices.length === 0 ? (
              <p className="muted-line">No invoices for this matter.</p>
            ) : (
              <div className="table-wrap" style={{ border: "none" }}>
                <table className="data-table invoice-table">
                  <thead>
                    <tr>
                      <th>Invoice #</th>
                      <th>Date Created</th>
                      <th>Amount Due</th>
                      <th>Status</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((i) => {
                      const created = i.issued_date || i.created_at;
                      const due = i.status === "paid" ? 0 : i.amount;
                      return (
                        <tr key={i.id}>
                          <td className="strong-cell">{i.number || "—"}</td>
                          <td>
                            {created
                              ? new Date(created).toLocaleDateString(undefined, {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "—"}
                          </td>
                          <td>{due != null ? `$${due.toFixed(2)}` : "—"}</td>
                          <td>
                            <span className={`pill inv-${i.status}`}>{i.status}</span>
                          </td>
                          <td>{i.amount != null ? `$${i.amount.toFixed(2)}` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>

      {editOpen && (
        <div className="modal-backdrop" onClick={() => setEditOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit matter</h3>
            <p className="modal-dur">Turn optional sections on or off for this matter.</p>
            <label className="toggle-row">
              <span>
                <span className="toggle-title">Conflict Check</span>
                <span className="toggle-sub">Mark that a conflict check was run.</span>
              </span>
              <input
                type="checkbox"
                className="toggle-switch"
                checked={matter.show_conflict_check}
                onChange={(e) => patch({ show_conflict_check: e.target.checked })}
              />
            </label>
            <label className="toggle-row">
              <span>
                <span className="toggle-title">Case Timeline</span>
                <span className="toggle-sub">Adds a Case Timeline tab (off by default).</span>
              </span>
              <input
                type="checkbox"
                className="toggle-switch"
                checked={matter.show_case_timeline}
                onChange={(e) => patch({ show_case_timeline: e.target.checked })}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

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
