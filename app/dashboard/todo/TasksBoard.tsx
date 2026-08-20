"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRIORITIES, personColor, type TaskComment, type Todo } from "@/lib/types";
import { usePortal } from "../PortalProvider";

type MatterLite = { id: string; name: string };

const DAY_COUNT = 3; // 3-day view, paged with the arrows

// ---- date helpers (local, tz-safe) ----
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// ---- formatting ----
function fmtDur(mins: number | null | undefined): string | null {
  if (!mins || mins <= 0) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, "0")}h`;
}
const trimTime = (t: string | null) =>
  t ? t.replace(/^0/, "").slice(0, 5) : t;
function minutesBetween(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const [ah, am] = a.split(":").map(Number);
  const [bh, bm] = b.split(":").map(Number);
  const diff = bh * 60 + bm - (ah * 60 + am);
  return diff > 0 ? diff : null;
}
function initialsOf(n: string | null): string {
  const parts = (n || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const firstName = (n: string | null) => (n || "").split(" ")[0];

// ---- card colors (theme-aware, mixed against the surface) ----
const BARS = [
  "#6366F1", "#A855F7", "#EC4899", "#F59E0B",
  "#22C55E", "#3B82F6", "#F97316", "#14B8A6",
];
function colorFor(key: string | null): string {
  if (!key) return "#94A3B8"; // slate for "no matter"
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return BARS[h % BARS.length];
}

type Draft = {
  title: string;
  assignee: string;
  matter_id: string;
  scheduled_date: string;
  due_date: string;
  start_time: string;
  end_time: string;
  duration: string; // hours, decimal
  priority: string;
};
const emptyDraft = (): Draft => ({
  title: "",
  assignee: ATTORNEYS[0],
  matter_id: "",
  scheduled_date: "",
  due_date: "",
  start_time: "",
  end_time: "",
  duration: "",
  priority: "-",
});

export default function TasksBoard() {
  const { userName } = usePortal();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [matters, setMatters] = useState<MatterLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfDay(new Date()));
  const [filterWho, setFilterWho] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [selected, setSelected] = useState<Todo | null>(null);

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [collapsedPeople, setCollapsedPeople] = useState<Record<string, boolean>>({});
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const dragId = useRef<string | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("tasksView");
      if (v === "calendar" || v === "list") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  const changeView = (v: "calendar" | "list") => {
    setView(v);
    try {
      localStorage.setItem("tasksView", v);
    } catch {
      /* ignore */
    }
  };

  async function load() {
    const [{ data }, { data: ms }, { data: cs }] = await Promise.all([
      supabase.from("todos").select("*").order("start_time", { nullsFirst: true }),
      supabase.from("matters").select("id,name").order("name"),
      supabase.from("task_comments").select("*").order("created_at"),
    ]);
    setTodos((data as Todo[]) ?? []);
    setMatters((ms as MatterLite[]) ?? []);
    setComments((cs as TaskComment[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  const commentCount = (todoId: string) => comments.filter((c) => c.todo_id === todoId).length;

  async function addComment(todoId: string, body: string) {
    const text = body.trim();
    if (!text) return;
    const { data } = await supabase
      .from("task_comments")
      .insert({ todo_id: todoId, author: userName, body: text })
      .select("*")
      .single();
    if (data) setComments((prev) => [...prev, data as TaskComment]);
  }

  const matterName = (id: string | null) =>
    id ? matters.find((m) => m.id === id)?.name ?? null : null;

  const days = useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayIso = iso(new Date());

  // People rows: the standard roster plus any other assignee that has tasks.
  const people = useMemo(() => {
    const set = new Set<string>(ATTORNEYS as readonly string[]);
    for (const t of todos) if (t.assignee) set.add(t.assignee);
    let list = [...set];
    if (filterWho !== "all") list = list.filter((p) => p === filterWho);
    return list;
  }, [todos, filterWho]);

  const waiting = useMemo(
    () =>
      todos.filter(
        (t) => !t.scheduled_date && (filterWho === "all" || t.assignee === filterWho),
      ),
    [todos, filterWho],
  );

  const cellTasks = (person: string, dayIso: string) =>
    todos
      .filter((t) => t.assignee === person && t.scheduled_date === dayIso)
      .sort((a, b) => (a.start_time || "99").localeCompare(b.start_time || "99"));

  const cellMinutes = (person: string, dayIso: string) =>
    cellTasks(person, dayIso).reduce((s, t) => s + (t.duration_minutes || 0), 0);

  // ---- mutations ----
  async function patch(id: string, changes: Partial<Todo>) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    await supabase.from("todos").update(changes).eq("id", id);
  }

  async function dropOn(person: string | null, dayIso: string | null) {
    const id = dragId.current;
    dragId.current = null;
    if (!id) return;
    const t = todos.find((x) => x.id === id);
    if (!t) return;
    const changes: Partial<Todo> = { scheduled_date: dayIso };
    if (person) changes.assignee = person;
    await patch(id, changes);
  }

  async function createTask() {
    const title = draft.title.trim();
    if (!title) return;
    const dur =
      minutesBetween(draft.start_time || null, draft.end_time || null) ??
      (draft.duration ? Math.round(parseFloat(draft.duration) * 60) : null);
    const { data } = await supabase
      .from("todos")
      .insert({
        title,
        assignee: draft.assignee,
        created_by: userName,
        matter_id: draft.matter_id || null,
        scheduled_date: draft.scheduled_date || null,
        due_date: draft.due_date || null,
        start_time: draft.start_time || null,
        end_time: draft.end_time || null,
        duration_minutes: dur,
        priority: draft.priority,
      })
      .select("*")
      .single();
    if (data) setTodos((prev) => [data as Todo, ...prev]);
    setAddOpen(false);
    setDraft(emptyDraft());
  }

  async function saveSelected(next: Partial<Todo>) {
    if (!selected) return;
    await patch(selected.id, next);
    setSelected((s) => (s ? { ...s, ...next } : s));
  }

  async function removeTask(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    setSelected(null);
    await supabase.from("todos").delete().eq("id", id);
  }

  function openAdd(prefill?: Partial<Draft>) {
    setDraft({ ...emptyDraft(), ...prefill });
    setAddOpen(true);
  }

  const weekLabel = `${weekStart.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  })} – ${addDays(weekStart, DAY_COUNT - 1).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;

  // ---- card renderer ----
  const Card = ({ t, compact }: { t: Todo; compact?: boolean }) => {
    const bar = colorFor(matterName(t.matter_id) || t.matter_id);
    const mName = matterName(t.matter_id);
    const dur = fmtDur(t.duration_minutes);
    const daysLeft =
      t.due_date && !t.done
        ? Math.ceil(
            (new Date(t.due_date + "T00:00:00").getTime() - Date.now()) / 86400000,
          )
        : null;
    return (
      <div
        className={`tb-card${t.done ? " done" : ""}`}
        style={{
          background: `color-mix(in srgb, ${bar} 20%, var(--dash-surface))`,
        }}
        draggable
        onDragStart={(e) => {
          dragId.current = t.id;
          e.stopPropagation();
        }}
        onClick={() => setSelected(t)}
      >
        {t.start_time && t.end_time && (
          <div className="tb-card-time">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2" />
            </svg>
            {trimTime(t.start_time)} – {trimTime(t.end_time)}
          </div>
        )}
        <div className="tb-card-title">{t.title}</div>
        {mName && <div className="tb-card-matter">{mName}</div>}
        <div className="tb-card-foot">
          {dur && <span className="tb-card-dur">{dur}</span>}
          {daysLeft != null && daysLeft >= 0 && (
            <span className={`tb-card-left${daysLeft <= 1 ? " soon" : ""}`}>
              {daysLeft === 0 ? "today" : `${daysLeft}d left`}
            </span>
          )}
          {t.priority && t.priority !== "-" && (
            <span className={`tb-prio prio-${t.priority}`} />
          )}
          {commentCount(t.id) > 0 && (
            <span className="tb-card-comments" title={`${commentCount(t.id)} comment(s)`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {commentCount(t.id)}
            </span>
          )}
          {compact && (
            <span className="tb-card-who" style={{ background: personColor(t.assignee) }} title={t.assignee ?? undefined}>
              {initialsOf(t.assignee)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const fmtDay = (d: string) =>
    new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const listTasks = todos
    .filter((t) => filterWho === "all" || t.assignee === filterWho)
    .sort(
      (a, b) =>
        (a.done ? 1 : 0) - (b.done ? 1 : 0) ||
        (a.scheduled_date || a.due_date || "9999").localeCompare(b.scheduled_date || b.due_date || "9999"),
    );
  const renderList = () => (
    <div className="tb-wrap tb-listview">
      <div className="tb-lv-head">
        <span>Task</span>
        <span>Matter</span>
        <span>User</span>
        <span>Day</span>
        <span>Due</span>
      </div>
      <div className="tb-lv-body">
        {listTasks.length === 0 ? (
          <p className="muted-line" style={{ padding: "1rem" }}>No tasks.</p>
        ) : (
          listTasks.map((t) => (
            <div key={t.id} className={`tb-lv-row${t.done ? " done" : ""}`} onClick={() => setSelected(t)}>
              <span className="tb-lv-task">
                {t.title}
                {commentCount(t.id) > 0 && (
                  <span className="tb-lv-c">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    {commentCount(t.id)}
                  </span>
                )}
              </span>
              <span className="tb-lv-matter">{matterName(t.matter_id) || "—"}</span>
              <span className="tb-lv-user">
                <span className="tb-card-who sm" style={{ background: personColor(t.assignee) }} title={t.assignee ?? undefined}>
                  {initialsOf(t.assignee)}
                </span>
              </span>
              <span className="tb-lv-day">{t.scheduled_date ? fmtDay(t.scheduled_date) : "Waiting"}</span>
              <span className="tb-lv-due">{t.due_date ? fmtDay(t.due_date) : "—"}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="tb">
      {/* Toolbar */}
      <div className="tb-toolbar">
        <button className="btn icon-plus-btn tb-addnew" type="button" onClick={() => openAdd({ scheduled_date: todayIso })} title="Add task" aria-label="Add task">
          +
        </button>
        <button type="button" className="tb-today" onClick={() => setWeekStart(startOfDay(new Date()))}>
          Today
        </button>
        <span className="tb-week-label">{weekLabel}</span>
        <div className="tb-viewseg">
          <button type="button" className={view === "calendar" ? "active" : undefined} onClick={() => changeView("calendar")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="22" />
            </svg>
            Calendar
          </button>
          <button type="button" className={view === "list" ? "active" : undefined} onClick={() => changeView("list")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
            List
          </button>
        </div>
        <div className="tb-toolbar-right">
          <span className="tb-groupby">Group by responsible</span>
          <select className="inline-select" value={filterWho} onChange={(e) => setFilterWho(e.target.value)}>
            <option value="all">All people</option>
            {(ATTORNEYS as readonly string[]).map((a) => (
              <option key={a} value={a}>{firstName(a)}</option>
            ))}
          </select>
        </div>
      </div>

      {view === "list" ? renderList() : (
      <div className="tb-wrap">
        {/* Grid */}
        <div className="tb-scroll">
          <div
            className="tb-grid"
            style={{ gridTemplateColumns: `168px repeat(${DAY_COUNT}, 1fr)` }}
          >
            {/* header */}
            <div className="tb-corner">
              <span className="tb-month">{weekStart.toLocaleDateString(undefined, { month: "long" })}</span>
              <button type="button" className="tb-nav tb-nav-prev" onClick={() => setWeekStart(addDays(weekStart, -DAY_COUNT))} aria-label="Previous days">‹</button>
            </div>
            {days.map((d, i) => {
              const isToday = iso(d) === todayIso;
              return (
                <div key={iso(d)} className={`tb-dayhead${isToday ? " today" : ""}`}>
                  <span className="tb-daynum">{d.getDate()}</span>
                  <span className="tb-dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  {isToday && <span className="tb-daymark" />}
                  {i === days.length - 1 && (
                    <button type="button" className="tb-nav tb-nav-next" onClick={() => setWeekStart(addDays(weekStart, DAY_COUNT))} aria-label="Next days">›</button>
                  )}
                </div>
              );
            })}

            {/* rows */}
            {loading ? (
              <div className="tb-loading" style={{ gridColumn: `1 / span ${DAY_COUNT + 1}` }}>Loading…</div>
            ) : (
              people.map((person) => {
                const open = !collapsedPeople[person];
                const personMins = days.reduce((s, d) => s + cellMinutes(person, iso(d)), 0);
                return (
                <div className="tb-row-contents" key={person} style={{ display: "contents" }}>
                  <div className="tb-person">
                    <button
                      type="button"
                      className={`nav-caret tb-person-caret${open ? " open" : ""}`}
                      onClick={() => setCollapsedPeople((c) => ({ ...c, [person]: !c[person] }))}
                      aria-label={open ? "Collapse" : "Expand"}
                    >
                      ›
                    </button>
                    <span className="tb-person-avatar" style={{ background: personColor(person) }}>{initialsOf(person)}</span>
                    <span className="tb-person-name">{person}</span>
                    {personMins > 0 && <span className="tb-person-total">{fmtDur(personMins)}</span>}
                  </div>
                  {days.map((d) => {
                    const dIso = iso(d);
                    const items = open ? cellTasks(person, dIso) : [];
                    const mins = cellMinutes(person, dIso);
                    return (
                      <div
                        key={dIso}
                        className={`tb-cell${open ? "" : " collapsed"}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => dropOn(person, dIso)}
                      >
                        <div className="tb-cell-head">
                          <span className="tb-cell-total">{fmtDur(mins) || ""}</span>
                          <button
                            type="button"
                            className="tb-cell-add"
                            onClick={() => openAdd({ assignee: person, scheduled_date: dIso })}
                            aria-label="Add task"
                          >
                            +
                          </button>
                        </div>
                        {items.map((t) => (
                          <Card key={t.id} t={t} />
                        ))}
                      </div>
                    );
                  })}
                </div>
                );
              })
            )}
          </div>
        </div>

        {/* Waiting list */}
        <div
          className="tb-waiting"
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => dropOn(null, null)}
        >
          <div className="tb-waiting-head">
            <span>Waiting list</span>
            <span className="tb-waiting-count">{waiting.length}</span>
            <button type="button" className="tb-cell-add" onClick={() => openAdd()} aria-label="Add to waiting list">+</button>
          </div>
          <div className="tb-waiting-body">
            {waiting.length === 0 ? (
              <p className="muted-line" style={{ fontSize: "0.8rem" }}>Nothing waiting.</p>
            ) : (
              waiting.map((t) => <Card key={t.id} t={t} compact />)
            )}
          </div>
        </div>
      </div>
      )}

      {addOpen && (
        <TaskModal
          title="Add task"
          matters={matters}
          draft={draft}
          setDraft={setDraft}
          onCancel={() => setAddOpen(false)}
          onSave={createTask}
        />
      )}

      {selected && (
        <EditModal
          todo={selected}
          matters={matters}
          comments={comments.filter((c) => c.todo_id === selected.id)}
          currentUser={userName}
          onAddComment={(body) => addComment(selected.id, body)}
          onClose={() => setSelected(null)}
          onSave={saveSelected}
          onDelete={() => removeTask(selected.id)}
        />
      )}
    </div>
  );
}

// ---- searchable matter picker ----
function MatterPicker({
  matters,
  value,
  onChange,
}: {
  matters: MatterLite[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selectedName = matters.find((m) => m.id === value)?.name ?? "";
  const list = matters
    .filter((m) => m.name.toLowerCase().includes(q.trim().toLowerCase()))
    .slice(0, 8);
  return (
    <div className="mp-wrap">
      <input
        className="mp-input"
        placeholder="No matter — type to search…"
        value={open ? q : selectedName}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setQ("");
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {open && (
        <div className="mp-menu">
          <button
            type="button"
            onMouseDown={() => {
              onChange("");
              setOpen(false);
            }}
          >
            No matter
          </button>
          {list.map((m) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={() => {
                onChange(m.id);
                setOpen(false);
              }}
            >
              {m.name}
            </button>
          ))}
          {list.length === 0 && <span className="mp-empty">No matches</span>}
        </div>
      )}
    </div>
  );
}

// ---- Add modal ----
function TaskModal({
  title,
  matters,
  draft,
  setDraft,
  onCancel,
  onSave,
}: {
  title: string;
  matters: MatterLite[];
  draft: Draft;
  setDraft: (d: Draft) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const set = (k: keyof Draft, v: string) => setDraft({ ...draft, [k]: v });
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <label>
          Task
          <input autoFocus value={draft.title} onChange={(e) => set("title", e.target.value)} placeholder="What needs doing?" />
        </label>
        <div className="field-pair">
          <label>
            Assignee
            <select value={draft.assignee} onChange={(e) => set("assignee", e.target.value)}>
              {(ATTORNEYS as readonly string[]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Matter
            <MatterPicker matters={matters} value={draft.matter_id} onChange={(id) => set("matter_id", id)} />
          </label>
        </div>
        <label>
          Due date
          <input type="date" value={draft.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </label>
        <div className="field-pair">
          <label>
            Priority
            <select value={draft.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.value === "-" ? "None" : p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Start / End
            <div className="field-pair" style={{ gap: "0.4rem" }}>
              <input type="time" value={draft.start_time} onChange={(e) => set("start_time", e.target.value)} />
              <input type="time" value={draft.end_time} onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </label>
        </div>
        <label>
          Duration (hours) <span className="field-hint">— used if no start/end time</span>
          <input type="number" step="0.25" min={0} value={draft.duration} onChange={(e) => set("duration", e.target.value)} placeholder="e.g. 1.5" />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn" onClick={onSave} disabled={!draft.title.trim()}>Add task</button>
        </div>
      </div>
    </div>
  );
}

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function renderBody(body: string) {
  return body.split(/(@\S+)/g).map((part, i) =>
    part.startsWith("@") ? (
      <span key={i} className="tm-mention">{part}</span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

// ---- Edit modal ----
function EditModal({
  todo,
  matters,
  comments,
  currentUser,
  onAddComment,
  onClose,
  onSave,
  onDelete,
}: {
  todo: Todo;
  matters: MatterLite[];
  comments: TaskComment[];
  currentUser: string;
  onAddComment: (body: string) => void;
  onClose: () => void;
  onSave: (next: Partial<Todo>) => void;
  onDelete: () => void;
}) {
  const [msg, setMsg] = useState("");
  const [t, setT] = useState({
    title: todo.title,
    assignee: todo.assignee ?? ATTORNEYS[0],
    matter_id: todo.matter_id ?? "",
    scheduled_date: todo.scheduled_date ?? "",
    due_date: todo.due_date ?? "",
    start_time: todo.start_time ?? "",
    end_time: todo.end_time ?? "",
    duration: todo.duration_minutes ? (todo.duration_minutes / 60).toString() : "",
    priority: todo.priority ?? "-",
    done: todo.done,
  });
  const set = (k: keyof typeof t, v: string | boolean) => setT({ ...t, [k]: v } as typeof t);

  const save = () => {
    const dur =
      minutesBetween(t.start_time || null, t.end_time || null) ??
      (t.duration ? Math.round(parseFloat(t.duration) * 60) : null);
    onSave({
      title: t.title.trim() || todo.title,
      assignee: t.assignee,
      matter_id: t.matter_id || null,
      scheduled_date: t.scheduled_date || null,
      due_date: t.due_date || null,
      start_time: t.start_time || null,
      end_time: t.end_time || null,
      duration_minutes: dur,
      priority: t.priority,
      done: t.done,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal task-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="tm-grid">
        <div className="tm-fields">
        <h3>Task</h3>
        <label>
          Task
          <textarea rows={2} value={t.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <div className="field-pair">
          <label>
            Assignee
            <select value={t.assignee} onChange={(e) => set("assignee", e.target.value)}>
              {(ATTORNEYS as readonly string[]).includes(t.assignee) ? null : (
                <option value={t.assignee}>{t.assignee}</option>
              )}
              {(ATTORNEYS as readonly string[]).map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </label>
          <label>
            Matter
            <MatterPicker matters={matters} value={t.matter_id} onChange={(id) => set("matter_id", id)} />
          </label>
        </div>
        <label>
          Due date
          <input type="date" value={t.due_date} onChange={(e) => set("due_date", e.target.value)} />
        </label>
        <div className="field-pair">
          <label>
            Priority
            <select value={t.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.value === "-" ? "None" : p.label}</option>
              ))}
            </select>
          </label>
          <label>
            Start / End
            <div className="field-pair" style={{ gap: "0.4rem" }}>
              <input type="time" value={t.start_time} onChange={(e) => set("start_time", e.target.value)} />
              <input type="time" value={t.end_time} onChange={(e) => set("end_time", e.target.value)} />
            </div>
          </label>
        </div>
        <label>
          Duration (hours) <span className="field-hint">— used if no start/end time</span>
          <input type="number" step="0.25" min={0} value={t.duration} onChange={(e) => set("duration", e.target.value)} placeholder="e.g. 1.5" />
        </label>
        <label className="todo-modal-check">
          <input type="checkbox" checked={t.done} onChange={(e) => set("done", e.target.checked)} />
          Mark as done
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost danger" onClick={onDelete} style={{ marginRight: "auto" }}>Delete</button>
          <button type="button" className="ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="btn" onClick={save}>Save</button>
        </div>
        </div>

        <div className="tm-chat">
          <div className="tm-chat-head">Comments <span className="count-badge">{comments.length}</span></div>
          <div className="tm-chat-body">
            {comments.length === 0 ? (
              <p className="tm-empty">No comments yet. Use @ to mention someone.</p>
            ) : (
              comments.map((c) => (
                <div className="tm-msg" key={c.id}>
                  <span className="tm-msg-avatar" style={{ background: personColor(c.author) }}>{initialsOf(c.author)}</span>
                  <div className="tm-msg-main">
                    <div className="tm-msg-head">
                      <span className="tm-msg-author">{c.author || "—"}</span>
                      <span className="tm-msg-time">{fmtWhen(c.created_at)}</span>
                    </div>
                    <div className="tm-msg-body">{renderBody(c.body)}</div>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="tm-chat-input">
            <input
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder={`Comment as ${currentUser.split(" ")[0]}… @ to mention`}
              onKeyDown={(e) => {
                if (e.key === "Enter" && msg.trim()) {
                  onAddComment(msg);
                  setMsg("");
                }
              }}
            />
            <button
              type="button"
              className="tm-send"
              onClick={() => { if (msg.trim()) { onAddComment(msg); setMsg(""); } }}
              disabled={!msg.trim()}
              aria-label="Send comment"
            >
              ›
            </button>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
