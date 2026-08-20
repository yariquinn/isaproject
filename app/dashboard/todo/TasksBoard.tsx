"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRIORITIES, type Todo } from "@/lib/types";
import { usePortal } from "../PortalProvider";

type MatterLite = { id: string; name: string };

const DAY_COUNT = 5; // Mon–Fri

// ---- date helpers (local, tz-safe) ----
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
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
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [filterWho, setFilterWho] = useState<string>("all");

  const [addOpen, setAddOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [selected, setSelected] = useState<Todo | null>(null);

  const dragId = useRef<string | null>(null);

  async function load() {
    const [{ data }, { data: ms }] = await Promise.all([
      supabase.from("todos").select("*").order("start_time", { nullsFirst: true }),
      supabase.from("matters").select("id,name").order("name"),
    ]);
    setTodos((data as Todo[]) ?? []);
    setMatters((ms as MatterLite[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

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
          borderLeftColor: bar,
          background: `color-mix(in srgb, ${bar} 12%, var(--dash-surface))`,
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
          {compact && (
            <span className="tb-card-who" title={t.assignee ?? undefined}>
              {initialsOf(t.assignee)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="tb">
      {/* Toolbar */}
      <div className="tb-toolbar">
        <button className="btn tb-addnew" type="button" onClick={() => openAdd({ scheduled_date: todayIso })}>
          + Add new
        </button>
        <div className="tb-weeknav">
          <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            Today
          </button>
          <button type="button" className="tb-arrow" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">‹</button>
          <span className="tb-week-label">{weekLabel}</span>
          <button type="button" className="tb-arrow" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">›</button>
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

      <div className="tb-wrap">
        {/* Grid */}
        <div className="tb-scroll">
          <div
            className="tb-grid"
            style={{ gridTemplateColumns: `168px repeat(${DAY_COUNT}, minmax(210px, 1fr))` }}
          >
            {/* header */}
            <div className="tb-corner" />
            {days.map((d) => {
              const isToday = iso(d) === todayIso;
              return (
                <div key={iso(d)} className={`tb-dayhead${isToday ? " today" : ""}`}>
                  <span className="tb-dow">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className="tb-daynum">{d.getDate()}</span>
                </div>
              );
            })}

            {/* rows */}
            {loading ? (
              <div className="tb-loading" style={{ gridColumn: `1 / span ${DAY_COUNT + 1}` }}>Loading…</div>
            ) : (
              people.map((person) => (
                <div className="tb-row-contents" key={person} style={{ display: "contents" }}>
                  <div className="tb-person">
                    <span className="tb-person-avatar">{initialsOf(person)}</span>
                    <span className="tb-person-name">{person}</span>
                  </div>
                  {days.map((d) => {
                    const dIso = iso(d);
                    const items = cellTasks(person, dIso);
                    const mins = cellMinutes(person, dIso);
                    return (
                      <div
                        key={dIso}
                        className="tb-cell"
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
              ))
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
          onClose={() => setSelected(null)}
          onSave={saveSelected}
          onDelete={() => removeTask(selected.id)}
        />
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
            <select value={draft.matter_id} onChange={(e) => set("matter_id", e.target.value)}>
              <option value="">No matter</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label>
            Day <span className="field-hint">(blank = waiting list)</span>
            <input type="date" value={draft.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} />
          </label>
          <label>
            Priority
            <select value={draft.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.value === "-" ? "None" : p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label>
            Start
            <input type="time" value={draft.start_time} onChange={(e) => set("start_time", e.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={draft.end_time} onChange={(e) => set("end_time", e.target.value)} />
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

// ---- Edit modal ----
function EditModal({
  todo,
  matters,
  onClose,
  onSave,
  onDelete,
}: {
  todo: Todo;
  matters: MatterLite[];
  onClose: () => void;
  onSave: (next: Partial<Todo>) => void;
  onDelete: () => void;
}) {
  const [t, setT] = useState({
    title: todo.title,
    assignee: todo.assignee ?? ATTORNEYS[0],
    matter_id: todo.matter_id ?? "",
    scheduled_date: todo.scheduled_date ?? "",
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
            <select value={t.matter_id} onChange={(e) => set("matter_id", e.target.value)}>
              <option value="">No matter</option>
              {matters.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label>
            Day <span className="field-hint">(blank = waiting list)</span>
            <input type="date" value={t.scheduled_date} onChange={(e) => set("scheduled_date", e.target.value)} />
          </label>
          <label>
            Priority
            <select value={t.priority} onChange={(e) => set("priority", e.target.value)}>
              {PRIORITIES.map((p) => (
                <option key={p.value} value={p.value}>{p.value === "-" ? "None" : p.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="field-pair">
          <label>
            Start
            <input type="time" value={t.start_time} onChange={(e) => set("start_time", e.target.value)} />
          </label>
          <label>
            End
            <input type="time" value={t.end_time} onChange={(e) => set("end_time", e.target.value)} />
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
    </div>
  );
}
