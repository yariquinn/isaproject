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
  CONTACT_TITLES,
  CONTACT_ROLES,
  contactRoleLabel,
  personColor,
  type ActivityItem,
  type Client,
  type Contact,
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
import { pushRecent } from "@/lib/recents";
import MatterTasksList from "./MatterTasksList";
import TitlePill from "../../TitlePill";
import CopyButton from "../../CopyButton";
import ExpensesTab from "./ExpensesTab";
import Disclaimer from "../../Disclaimer";
import TimeEntriesTab from "./TimeEntriesTab";

const MATTER_DOCS = [
  { name: "Engagement Letter.pdf", updated: "Aug 18, 2026", sharedWith: "Client" },
  { name: "Client Intake Form.pdf", updated: "Aug 14, 2026", sharedWith: "Not shared" },
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
  const [docQuery, setDocQuery] = useState("");
  const [matterContacts, setMatterContacts] = useState<{ linkId: string; contact: Contact }[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [acTab, setAcTab] = useState<"existing" | "new">("existing");
  const [acForm, setAcForm] = useState<{ name: string; role: string; organization: string; email: string; phone: string }>({ name: "", role: CONTACT_ROLES[0].value, organization: "", email: "", phone: "" });
  const [pcModal, setPcModal] = useState(false);
  // No confirmation prompt — editing the primary contact just works.
  const confirmContactEdit = () => true;
  const [pcTab, setPcTab] = useState<"search" | "new">("search");
  const [pcQuery, setPcQuery] = useState("");
  const [pcForm, setPcForm] = useState({ name: "", title: "", email: "", phone: "", address: "" });
  const [allContacts, setAllContacts] = useState<Contact[]>([]);

  async function loadMatterContacts() {
    const { data } = await supabase
      .from("matter_contacts")
      .select("id, contacts(*)")
      .eq("matter_id", params.id);
    const rowsRaw = (data as unknown as { id: string; contacts: Contact | Contact[] | null }[]) ?? [];
    const list = rowsRaw
      .map((r) => ({ linkId: r.id, contact: (Array.isArray(r.contacts) ? r.contacts[0] : r.contacts) as Contact | undefined }))
      .filter((r): r is { linkId: string; contact: Contact } => !!r.contact);
    setMatterContacts(list);
  }
  async function linkContact(contactId: string) {
    await supabase.from("matter_contacts").insert({ matter_id: params.id, contact_id: contactId });
    setAddContactOpen(false);
    setContactSearch("");
    loadMatterContacts();
  }
  async function createAndLinkContact() {
    if (!acForm.name.trim()) return;
    const { data } = await supabase.from("contacts").insert({
      name: acForm.name.trim(),
      role: acForm.role,
      organization: acForm.organization.trim() || null,
      email: acForm.email.trim() || null,
      phone: acForm.phone.trim() || null,
    }).select().single();
    const nc = data as Contact | null;
    if (nc) {
      setAllContacts((prev) => [...prev, nc]);
      await supabase.from("matter_contacts").insert({ matter_id: params.id, contact_id: nc.id });
    }
    setAcForm({ name: "", role: CONTACT_ROLES[0].value, organization: "", email: "", phone: "" });
    setAcTab("existing");
    setAddContactOpen(false);
    loadMatterContacts();
  }
  async function unlinkContact(linkId: string) {
    setMatterContacts((prev) => prev.filter((x) => x.linkId !== linkId));
    await supabase.from("matter_contacts").delete().eq("id", linkId);
  }
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
  // Switching tabs must not scroll the page — keep the viewport where it is.
  const changeBodyTab = (key: typeof bodyTab) => {
    const y = window.scrollY;
    setBodyTab(key);
    requestAnimationFrame(() => window.scrollTo(0, y));
  };
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
    if (matterRow) pushRecent("matter", matterRow.id, matterRow.name);
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
    loadMatterContacts();
    supabase.from("contacts").select("*").order("name").then(({ data }) => setAllContacts((data as Contact[]) ?? []));
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
    field: "primary_contact" | "email" | "phone" | "address" | "contact_title" | "billing_contact"
      | "billing_email" | "billing_phone"
      | "partner_name" | "partner_email" | "partner_phone" | "partner_relationship",
    v: string,
  ) {
    const next = v.trim() || null;
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, [field]: next } : c)),
    );
    await supabase.from("clients").update({ [field]: next }).eq("id", clientId);
  }

  async function setClientContact(fields: Partial<Client>) {
    const cid = matter?.client_id;
    if (!cid) return;
    setClients((prev) => prev.map((c) => (c.id === cid ? { ...c, ...fields } : c)));
    await supabase.from("clients").update(fields).eq("id", cid);
  }
  async function applyExistingAsContact(c: Client) {
    await setClientContact({ primary_contact: c.name, email: c.email, phone: c.phone, address: c.address });
    setPcModal(false); setPcQuery("");
  }
  async function createContactClient() {
    if (!pcForm.name.trim()) return;
    await supabase.from("clients").insert({
      name: pcForm.name.trim(), client_type: "individual", status: "active",
      email: pcForm.email.trim() || null, phone: pcForm.phone.trim() || null, address: pcForm.address.trim() || null,
    });
    await setClientContact({ primary_contact: pcForm.name.trim(), contact_title: pcForm.title || null, email: pcForm.email.trim() || null, phone: pcForm.phone.trim() || null, address: pcForm.address.trim() || null });
    setPcForm({ name: "", title: "", email: "", phone: "", address: "" }); setPcTab("search"); setPcModal(false);
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
    rate: number | null;
  }) {
    if (!matter) return;
    await supabase.from("time_entries").insert({
      matter_id: matter.id,
      activity: f.activity,
      lawyer: f.lawyer || "Isa",
      duration_seconds: f.seconds,
      note: f.note.trim() || null,
      rate: f.rate,
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
          <h2 className="combo-title">Client</h2>
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
                {clientObj.client_type === "business" && (
                  <div>
                    <dt>Primary contact</dt>
                    <dd className="cc-primary-contact cc-name-strong">
                      <span className="name-with-title">
                        <button type="button" className="contact-picker" onClick={() => { if (!confirmContactEdit()) return; setPcQuery(""); setPcTab("search"); setPcModal(true); }}>
                          {clientObj.primary_contact || "Search or add a contact…"}<span className="cp-icon">⌕</span>
                        </button>
                        <TitlePill
                          value={clientObj.contact_title}
                          onSave={(v) => saveClientField(clientObj.id, "contact_title", v)}
                          guard={confirmContactEdit}
                        />
                      </span>
                    </dd>
                  </div>
                )}
                <div>
                  <dt>Email</dt>
                  <dd className="dd-with-copy">
                    <InlineText
                      value={clientObj.email}
                      onSave={(v) => saveClientField(clientObj.id, "email", v)}
                      placeholder="—"
                    />
                    <CopyButton value={clientObj.email} label="Copy email" />
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
                {clientObj.partner_name && (() => {
                  const splitContact = clients.find(
                    (c) => c.id !== clientObj.id && c.name === clientObj.partner_name,
                  );
                  return (
                    <div>
                      <dt>Second contact</dt>
                      <dd className="sc-dd">
                        <span className="sc-name-row">
                          {splitContact ? (
                            <Link href={`/dashboard/clients/${splitContact.id}`} className="row-link">
                              {clientObj.partner_name}
                            </Link>
                          ) : (
                            clientObj.partner_name
                          )}
                          {clientObj.partner_relationship && (
                            <span className="rel-pill">{clientObj.partner_relationship}</span>
                          )}
                        </span>
                        {clientObj.partner_phone && (
                          <span className="sc-phone">{clientObj.partner_phone}</span>
                        )}
                      </dd>
                    </div>
                  );
                })()}
                {clientObj.client_type === "business" && (
                  <div>
                    <dt>Billing contact</dt>
                    <dd>
                      <InlineText
                        value={clientObj.billing_contact}
                        onSave={(v) => saveClientField(clientObj.id, "billing_contact", v)}
                        placeholder="Same as primary"
                      />
                      {clientObj.billing_email ? ` · ${clientObj.billing_email}` : ""}
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
          <h2 className="combo-title">Details</h2>
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
                      {new Date(it.date.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, {
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
                    {!overdue && (
                      <span className={`du-kind-text${it.label === "Closing" ? " closing" : ""}`}>
                        {it.label}
                      </span>
                    )}
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
                      {new Date(it.date.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, {
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
            <h2 className="combo-title notes-title">Activity</h2>
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
            ["contacts", "Contacts", (clientObj ? 1 + (clientObj.partner_name ? 1 : 0) : 0) + matterContacts.length],
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
            onClick={() => changeBodyTab(key as typeof bodyTab)}
          >
            {label}
            {count != null && <span className="count-badge">{count}</span>}
          </button>
        ))}
      </div>

      <div className="panel" style={{ minHeight: "60vh" }}>
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
            rate={matter.rate_type === "flat" ? 0 : matter.hourly_rate}
            onAddEntry={addEntry}
            onChanged={loadAll}
            rateControl={
              <div className="te-rate">
                <span className="te-rate-label">Case rate</span>
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
                    label: r.value === "flat" ? "flat fee" : "/hr",
                  }))}
                  onSave={(v) => patch({ rate_type: v })}
                />
              </div>
            }
          />
        )}

        {bodyTab === "expenses" && (
          <ExpensesTab matterId={matter.id} />
        )}

        {bodyTab === "contacts" && (
          <>
            <div className="mc-head" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="ghost sm" onClick={() => setAddContactOpen(true)}>+ Add contact</button>
            </div>
            <div className="mc-cols">
              {/* Left: the client's own people */}
              <div className="mc-col">
                <div className="mc-col-label">Client</div>
                <ul className="contact-cards">
                  {clientObj && (
                    <li className="contact-card">
                      <div className="cc-role">Primary contact</div>
                      <div className="cc-name-lg">{clientObj.primary_contact || clientObj.name}</div>
                      <dl className="cc-fields">
                        <div><dt>Email</dt><dd className="dd-with-copy"><InlineText value={clientObj.email} onSave={(v) => saveClientField(clientObj.id, "email", v)} placeholder="—" /><CopyButton value={clientObj.email} label="Copy email" /></dd></div>
                        <div><dt>Phone</dt><dd><InlineText value={clientObj.phone} onSave={(v) => saveClientField(clientObj.id, "phone", v)} placeholder="—" /></dd></div>
                        <div><dt>Address</dt><dd><InlineText value={clientObj.address} onSave={(v) => saveClientField(clientObj.id, "address", v)} placeholder="—" /></dd></div>
                      </dl>
                    </li>
                  )}
                  {clientObj?.partner_name && (
                    <li className="contact-card">
                      <div className="cc-role">{clientObj.partner_relationship || "Second contact"}</div>
                      <div className="cc-name-lg">{clientObj.partner_name}</div>
                      <dl className="cc-fields">
                        <div><dt>Email</dt><dd><InlineText value={clientObj.partner_email} onSave={(v) => saveClientField(clientObj.id, "partner_email", v)} placeholder="—" /></dd></div>
                        <div><dt>Phone</dt><dd><InlineText value={clientObj.partner_phone} onSave={(v) => saveClientField(clientObj.id, "partner_phone", v)} placeholder="—" /></dd></div>
                      </dl>
                    </li>
                  )}
                  {clientObj?.billing_contact && (
                    <li className="contact-card">
                      <div className="cc-role">Billing contact</div>
                      <div className="cc-name-lg">{clientObj.billing_contact}</div>
                      <dl className="cc-fields">
                        <div><dt>Email</dt><dd>{clientObj.billing_email || "—"}</dd></div>
                        <div><dt>Phone</dt><dd>{clientObj.billing_phone || "—"}</dd></div>
                      </dl>
                    </li>
                  )}
                  {!clientObj && <p className="muted-line">No client linked.</p>}
                </ul>
              </div>

              {/* Right: outside parties (counsel, experts, etc.) */}
              <div className="mc-col">
                <div className="mc-col-label">Outside parties</div>
                <ul className="contact-cards">
                  {matterContacts.map(({ linkId, contact }) => (
                    <li className="contact-card" key={linkId}>
                      <div className="cc-role">
                        {contactRoleLabel(contact.role)}
                        <button type="button" className="mc-unlink" title="Remove from matter" aria-label="Remove from matter" onClick={() => unlinkContact(linkId)}>✕</button>
                      </div>
                      <div className="cc-name-lg">
                        {contact.name}
                        {contact.organization && <span className="cc-firm-inline">· {contact.organization}</span>}
                      </div>
                      <dl className="cc-fields">
                        <div><dt>Email</dt><dd className="dd-with-copy">{contact.email || "—"}<CopyButton value={contact.email} label="Copy email" /></dd></div>
                        <div><dt>Phone</dt><dd>{contact.phone || "—"}</dd></div>
                      </dl>
                    </li>
                  ))}
                  {matterContacts.length === 0 && (
                    <p className="muted-line">No outside parties yet — use “+ Add contact”.</p>
                  )}
                </ul>
              </div>
            </div>
          </>
        )}

        {bodyTab === "tasks" && (
          <MatterTasksList matterId={matter.id} />
        )}

        {bodyTab === "documents" && (
          <>
            <div className="doc-searchrow">
              <input
                className="activity-search head-search"
                type="search"
                placeholder="Search documents…"
                value={docQuery}
                onChange={(e) => setDocQuery(e.target.value)}
              />
            </div>
            <div className="table-wrap" style={{ border: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Uploaded date</th>
                    <th>Shared with</th>
                  </tr>
                </thead>
                <tbody>
                  {MATTER_DOCS.filter((d) => d.name.toLowerCase().includes(docQuery.trim().toLowerCase())).map((d) => (
                    <tr key={d.name}>
                      <td className="strong-cell">{d.name}</td>
                      <td>{d.updated}</td>
                      <td>{d.sharedWith}</td>
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
            <h3 className="ev-section">Upcoming</h3>
            {upcomingEvents.length === 0 ? (
              <p className="muted-line">No upcoming events.</p>
            ) : (
              <ul className="du-list">
                {upcomingEvents.map((ev) => {
                  const evOverdue = (ev.event_date || "").slice(0, 10) < todayStrLocal;
                  return (
                  <li key={ev.id}>
                    <input
                      type="date"
                      className="ev-date-input"
                      value={(ev.event_date || "").slice(0, 10)}
                      onChange={(e) => {
                        if (e.target.value) saveEvent(ev.id, { event_date: e.target.value });
                      }}
                    />
                    {evOverdue ? (
                      <span className="du-overdue" title="Overdue">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                        </svg>
                        Overdue
                      </span>
                    ) : (
                      <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
                    )}
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
                  );
                })}
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
                        <tr key={i.id} className="inv-row" onClick={() => router.push(`/dashboard/invoices/${i.id}?from=/dashboard/matters/${matter.id}`)}>
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
                          <td>{due != null ? `$${due.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
                          <td>
                            <span className={`pill inv-${i.status}`}>{i.status}</span>
                          </td>
                          <td>{i.amount != null ? `$${i.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</td>
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

      {addContactOpen && (
        <div className="modal-backdrop" onClick={() => setAddContactOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Add a contact to this matter</h3>
            <div className="doc-tabs" style={{ marginBottom: "0.6rem" }}>
              <button type="button" className={acTab === "existing" ? "active" : undefined} onClick={() => setAcTab("existing")}>Existing contact</button>
              <button type="button" className={acTab === "new" ? "active" : undefined} onClick={() => setAcTab("new")}>New contact</button>
            </div>
            {acTab === "existing" ? (
              <>
                <input
                  className="activity-search"
                  type="search"
                  autoFocus
                  placeholder="Search contacts…"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  style={{ width: "100%", marginBottom: "0.6rem" }}
                />
                <div className="mc-picklist">
                  {allContacts
                    .filter((c) => !matterContacts.some((mc) => mc.contact.id === c.id))
                    .filter((c) => {
                      const q = contactSearch.trim().toLowerCase();
                      return q === "" || c.name.toLowerCase().includes(q) || (c.organization || "").toLowerCase().includes(q) || contactRoleLabel(c.role).toLowerCase().includes(q);
                    })
                    .slice(0, 20)
                    .map((c) => (
                      <button key={c.id} type="button" className="mc-pickitem" onClick={() => linkContact(c.id)}>
                        <span className="mc-pickname">{c.name}</span>
                        <span className="mc-pickrole">{contactRoleLabel(c.role)}{c.organization ? ` · ${c.organization}` : ""}</span>
                      </button>
                    ))}
                </div>
                <p className="field-note" style={{ marginTop: "0.6rem" }}>
                  Manage the full contacts list on the <Link href="/dashboard/contacts">Contacts</Link> page.
                </p>
              </>
            ) : (
              <>
                <label>Name
                  <input autoFocus value={acForm.name} onChange={(e) => setAcForm({ ...acForm, name: e.target.value })} placeholder="e.g. Jane Roe" />
                </label>
                <div className="field-pair">
                  <label>Type
                    <select value={acForm.role} onChange={(e) => setAcForm({ ...acForm, role: e.target.value })}>
                      {CONTACT_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </label>
                  <label>Firm
                    <input value={acForm.organization} onChange={(e) => setAcForm({ ...acForm, organization: e.target.value })} placeholder="Firm" />
                  </label>
                </div>
                <div className="field-pair">
                  <label>Email
                    <input value={acForm.email} onChange={(e) => setAcForm({ ...acForm, email: e.target.value })} />
                  </label>
                  <label>Phone
                    <input value={acForm.phone} onChange={(e) => setAcForm({ ...acForm, phone: e.target.value })} />
                  </label>
                </div>
                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={() => setAddContactOpen(false)}>Cancel</button>
                  <button type="button" className="btn" disabled={!acForm.name.trim()} onClick={createAndLinkContact}>Create &amp; add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {pcModal && (
        <div className="modal-backdrop" onClick={() => setPcModal(false)}>
          <div className="modal contact-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Set primary contact</h3>
            <div className="doc-tabs" style={{ marginBottom: "0.5rem" }}>
              <button type="button" className={pcTab === "search" ? "active" : undefined} onClick={() => setPcTab("search")}>Search existing</button>
              <button type="button" className={pcTab === "new" ? "active" : undefined} onClick={() => setPcTab("new")}>Add new client</button>
            </div>
            {pcTab === "search" ? (
              <>
                <input className="activity-search" type="search" autoFocus placeholder="Search clients…" value={pcQuery} onChange={(e) => setPcQuery(e.target.value)} style={{ width: "100%" }} />
                <div className="matter-pick">
                  {clients.filter((c) => c.id !== matter?.client_id && (pcQuery.trim() ? c.name.toLowerCase().includes(pcQuery.trim().toLowerCase()) : true)).slice(0, 12).map((c) => (
                    <button key={c.id} type="button" className="matter-pick-item" onClick={() => applyExistingAsContact(c)}>
                      <span className="mp-name">{c.name}</span>
                      <span className="mp-sub">{c.email || "no email"} · {c.phone || "no phone"}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <label>Name
                  <input value={pcForm.name} onChange={(e) => setPcForm({ ...pcForm, name: e.target.value })} />
                </label>
                <label>Title
                  <select value={pcForm.title} onChange={(e) => setPcForm({ ...pcForm, title: e.target.value })}>
                    <option value="">— Title</option>
                    {CONTACT_TITLES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </label>
                {(["email", "phone", "address"] as const).map((f) => (
                  <label key={f}>{f[0].toUpperCase() + f.slice(1)}
                    <input value={pcForm[f]} onChange={(e) => setPcForm({ ...pcForm, [f]: e.target.value })} />
                  </label>
                ))}
                <div className="modal-actions">
                  <button type="button" className="ghost" onClick={() => setPcModal(false)}>Cancel</button>
                  <button type="button" className="btn" onClick={createContactClient} disabled={!pcForm.name.trim()}>Create &amp; set as contact</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

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
            {clientObj && clientObj.client_type === "business" && (
              <div className="couple-fields" style={{ marginTop: "0.5rem" }}>
                <p className="field-note">Billing contact for {clientObj.name}</p>
                <label className="toggle-line" style={{ marginBottom: "0.4rem" }}>
                  <span className="toggle-text">
                    <span className="toggle-title">Same as primary contact</span>
                  </span>
                  <input
                    type="checkbox"
                    className="toggle-switch"
                    checked={!clientObj.billing_contact}
                    onChange={(e) => {
                      if (e.target.checked) saveClientField(clientObj.id, "billing_contact", "");
                      else saveClientField(clientObj.id, "billing_contact", clientObj.primary_contact || clientObj.name || "");
                    }}
                  />
                </label>
                {clientObj.billing_contact && (
                  <>
                    <div className="field-pair">
                      <label>
                        Name
                        <input
                          defaultValue={clientObj.billing_contact ?? ""}
                          onBlur={(e) => saveClientField(clientObj.id, "billing_contact", e.target.value)}
                          placeholder="Billing contact name"
                        />
                      </label>
                      <label>
                        Email
                        <input defaultValue={clientObj.billing_email ?? ""} onBlur={(e) => saveClientField(clientObj.id, "billing_email", e.target.value)} />
                      </label>
                    </div>
                    <div className="field-pair">
                      <label>
                        Phone
                        <input defaultValue={clientObj.billing_phone ?? ""} onBlur={(e) => saveClientField(clientObj.id, "billing_phone", e.target.value)} />
                      </label>
                    </div>
                  </>
                )}
              </div>
            )}
            {clientObj && clientObj.client_type !== "business" && (
              <div className="couple-fields" style={{ marginTop: "0.5rem" }}>
                <p className="field-note">Second contact for {clientObj.name}</p>
                <div className="field-pair">
                  <label>
                    Name
                    <input
                      defaultValue={clientObj.partner_name ?? ""}
                      onBlur={(e) => saveClientField(clientObj.id, "partner_name", e.target.value)}
                      placeholder="Second contact name"
                    />
                  </label>
                  <label>
                    Relationship
                    <select
                      defaultValue={clientObj.partner_relationship ?? ""}
                      onChange={(e) => saveClientField(clientObj.id, "partner_relationship", e.target.value)}
                    >
                      <option value="">Relationship…</option>
                      {["Spouse", "Partner", "Parent", "Child", "Sibling", "Colleague", "Signatory", "Other"].map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="field-pair">
                  <label>
                    Email
                    <input defaultValue={clientObj.partner_email ?? ""} onBlur={(e) => saveClientField(clientObj.id, "partner_email", e.target.value)} />
                  </label>
                  <label>
                    Phone
                    <input defaultValue={clientObj.partner_phone ?? ""} onBlur={(e) => saveClientField(clientObj.id, "partner_phone", e.target.value)} />
                  </label>
                </div>
              </div>
            )}
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
