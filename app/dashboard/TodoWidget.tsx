"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRIORITIES, type Todo } from "@/lib/types";
import { usePortal } from "./PortalProvider";

type MatterLite = { id: string; name: string };

export default function TodoWidget({
  compact = false,
  matterId,
}: {
  compact?: boolean;
  matterId?: string;
}) {
  const { userName } = usePortal();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [matters, setMatters] = useState<MatterLite[]>([]);
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string>(ATTORNEYS[0]);
  const [newMatter, setNewMatter] = useState<string>("");
  const [matterQuery, setMatterQuery] = useState<string>("");
  const [matterOpen, setMatterOpen] = useState<boolean>(false);
  const [newDue, setNewDue] = useState<string>("");
  const [newPriority, setNewPriority] = useState<string>("-");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Todo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState<string>(ATTORNEYS[0]);
  const [editMatter, setEditMatter] = useState<string>("");
  const [editDue, setEditDue] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("-");

  async function load() {
    let q = supabase
      .from("todos")
      .select("*")
      .order("done")
      .order("created_at", { ascending: false });
    q = matterId ? q.eq("matter_id", matterId) : q.is("matter_id", null);
    const [{ data }, { data: ms }] = await Promise.all([
      q,
      supabase.from("matters").select("id,name").order("name"),
    ]);
    setTodos((data as Todo[]) ?? []);
    setMatters((ms as MatterLite[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

  const matterName = (id: string | null) =>
    id ? matters.find((m) => m.id === id)?.name ?? null : null;

  async function add() {
    const title = text.trim();
    if (!title) return;
    setText("");
    const { data } = await supabase
      .from("todos")
      .insert({
        title,
        assignee,
        created_by: userName,
        matter_id: matterId ?? (newMatter || null),
        due_date: newDue || null,
        priority: newPriority,
      })
      .select("*")
      .single();
    if (data) setTodos((prev) => [data as Todo, ...prev]);
    setNewMatter("");
    setMatterQuery("");
    setNewDue("");
    setNewPriority("-");
  }

  const matterMatches = matters
    .filter((m) => m.name.toLowerCase().includes(matterQuery.trim().toLowerCase()))
    .slice(0, 6);

  async function toggle(t: Todo) {
    const next = !t.done;
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: next } : x)),
    );
    setSelected((s) => (s && s.id === t.id ? { ...s, done: next } : s));
    await supabase.from("todos").update({ done: next }).eq("id", t.id);
  }

  async function changeAssignee(t: Todo, value: string) {
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, assignee: value } : x)),
    );
    await supabase.from("todos").update({ assignee: value }).eq("id", t.id);
  }

  async function remove(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    setSelected(null);
    await supabase.from("todos").delete().eq("id", t.id);
  }

  async function saveTodo() {
    if (!selected) return;
    const title = editTitle.trim() || selected.title;
    const changes: Partial<Todo> = {
      title,
      assignee: editAssignee,
      due_date: editDue || null,
      priority: editPriority,
    };
    if (!matterId) changes.matter_id = editMatter || null;
    setTodos((prev) =>
      prev.map((x) => (x.id === selected.id ? { ...x, ...changes } : x)),
    );
    await supabase.from("todos").update(changes).eq("id", selected.id);
    setSelected(null);
  }

  function openTodo(t: Todo) {
    setEditTitle(t.title);
    setEditAssignee(t.assignee ?? ATTORNEYS[0]);
    setEditMatter(t.matter_id ?? "");
    setEditDue(t.due_date ?? "");
    setEditPriority(t.priority ?? "-");
    setSelected(t);
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const firstName = (n: string | null) => (n || "").split(" ")[0];
  const prioLabel = (v: string) =>
    PRIORITIES.find((p) => p.value === v)?.label ?? v;
  const fmtDue = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  const todayStr = new Date().toISOString().slice(0, 10);

  const Row = ({ t }: { t: Todo }) => {
    const mName = matterName(t.matter_id);
    const overdue = !!t.due_date && !t.done && t.due_date < todayStr;
    return (
      <li className={`todo-item${t.done ? " done" : ""}`}>
        <button
          type="button"
          className={`todo-check${t.done ? " on" : ""}`}
          onClick={() => toggle(t)}
          aria-label="Mark done"
        >
          {t.done ? "✓" : ""}
        </button>
        <button type="button" className="todo-open" onClick={() => openTodo(t)}>
          <span className="todo-title">{t.title}</span>
        </button>
        <span className="todo-row-meta">
          {t.priority && t.priority !== "-" && (
            <span className={`todo-prio-pill prio-${t.priority}`}>
              {prioLabel(t.priority)} priority
            </span>
          )}
          {mName && <span className="todo-matter">{mName}</span>}
          {t.due_date && (
            <span className={`todo-due${overdue ? " overdue" : ""}`}>
              Due {fmtDue(t.due_date)}
            </span>
          )}
        </span>
        <select
          className="todo-assign-inline"
          value={(ATTORNEYS as readonly string[]).includes(t.assignee ?? "")
            ? (t.assignee as string)
            : ATTORNEYS[0]}
          onChange={(e) => changeAssignee(t, e.target.value)}
          aria-label="Assignee"
          title={t.assignee ?? undefined}
        >
          {ATTORNEYS.map((a) => (
            <option key={a} value={a}>
              {firstName(a)}
            </option>
          ))}
        </select>
      </li>
    );
  };

  return (
    <div>
      <div className="todo-add">
        <input
          className="todo-input"
          placeholder="Add a task…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
        />
        {!matterId && (
          <div className="todo-matter-pick">
            <input
              className="todo-matter-input"
              type="text"
              placeholder="Search matter…"
              value={matterQuery}
              onChange={(e) => {
                setMatterQuery(e.target.value);
                setNewMatter("");
                setMatterOpen(true);
              }}
              onFocus={() => setMatterOpen(true)}
              onBlur={() => setTimeout(() => setMatterOpen(false), 150)}
              aria-label="Search matter"
            />
            {matterOpen && (
              <div className="todo-matter-menu">
                <button
                  type="button"
                  onMouseDown={() => {
                    setNewMatter("");
                    setMatterQuery("");
                    setMatterOpen(false);
                  }}
                >
                  No matter
                </button>
                {matterMatches.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={() => {
                      setNewMatter(m.id);
                      setMatterQuery(m.name);
                      setMatterOpen(false);
                    }}
                  >
                    {m.name}
                  </button>
                ))}
                {matterMatches.length === 0 && (
                  <span className="todo-matter-empty">No matches</span>
                )}
              </div>
            )}
          </div>
        )}
        <label className="todo-due-field">
          <span>Due</span>
          <input
            className="todo-due-input"
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            aria-label="Due date"
          />
        </label>
        <select
          className="todo-assign-select"
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value)}
          aria-label="Priority"
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.value === "-" ? "Priority" : p.label}
            </option>
          ))}
        </select>
        <select
          className="todo-assign-select"
          value={assignee}
          onChange={(e) => setAssignee(e.target.value)}
          aria-label="Assign to"
        >
          {ATTORNEYS.map((a) => (
            <option key={a} value={a}>
              {firstName(a)}
            </option>
          ))}
        </select>
        <button className="btn" type="button" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>

      <div className={compact ? "panel-scroll" : undefined}>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : todos.length === 0 ? (
          <p className="todo-empty">Nothing on your list — you&rsquo;re all caught up.</p>
        ) : (
          <ul className="todo-list">
            {open.map((t) => (
              <Row key={t.id} t={t} />
            ))}
            {done.length > 0 && !compact && (
              <li className="todo-divider">Completed · {done.length}</li>
            )}
            {(compact ? [] : done).map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </ul>
        )}
      </div>

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Task</h3>
            <label>
              Title
              <textarea
                rows={3}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </label>
            {!matterId && (
              <label>
                Matter
                <select
                  value={editMatter}
                  onChange={(e) => setEditMatter(e.target.value)}
                >
                  <option value="">No matter</option>
                  {matters.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="field-pair">
              <label>
                Due date
                <input
                  type="date"
                  value={editDue}
                  onChange={(e) => setEditDue(e.target.value)}
                />
              </label>
              <label>
                Priority
                <select
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Assigned to
              <select
                value={editAssignee}
                onChange={(e) => setEditAssignee(e.target.value)}
              >
                {(ATTORNEYS as readonly string[]).includes(editAssignee)
                  ? null
                  : <option value={editAssignee}>{editAssignee}</option>}
                {ATTORNEYS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="todo-modal-check">
              <input
                type="checkbox"
                checked={selected.done}
                onChange={() => toggle(selected)}
              />
              Mark as done
            </label>
            <p className="muted-line" style={{ fontSize: "0.8rem" }}>
              Added by {selected.created_by || "—"} ·{" "}
              {new Date(selected.created_at).toLocaleDateString()}
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="ghost danger"
                onClick={() => remove(selected)}
                style={{ marginRight: "auto" }}
              >
                Delete
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => setSelected(null)}
              >
                Cancel
              </button>
              <button type="button" className="btn" onClick={saveTodo}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
