"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, type Todo } from "@/lib/types";
import { usePortal } from "./PortalProvider";

export default function TodoWidget({
  compact = false,
  matterId,
}: {
  compact?: boolean;
  matterId?: string;
}) {
  const { userName } = usePortal();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [assignee, setAssignee] = useState<string>(ATTORNEYS[0]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Todo | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editAssignee, setEditAssignee] = useState<string>(ATTORNEYS[0]);

  async function load() {
    let q = supabase
      .from("todos")
      .select("*")
      .order("done")
      .order("created_at", { ascending: false });
    q = matterId ? q.eq("matter_id", matterId) : q.is("matter_id", null);
    const { data } = await q;
    setTodos((data as Todo[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

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
        matter_id: matterId ?? null,
      })
      .select("*")
      .single();
    if (data) setTodos((prev) => [data as Todo, ...prev]);
  }

  async function toggle(t: Todo) {
    const next = !t.done;
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: next } : x)),
    );
    setSelected((s) => (s && s.id === t.id ? { ...s, done: next } : s));
    await supabase.from("todos").update({ done: next }).eq("id", t.id);
  }

  async function remove(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    setSelected(null);
    await supabase.from("todos").delete().eq("id", t.id);
  }

  async function saveTodo() {
    if (!selected) return;
    const title = editTitle.trim() || selected.title;
    const changes = { title, assignee: editAssignee };
    setTodos((prev) =>
      prev.map((x) => (x.id === selected.id ? { ...x, ...changes } : x)),
    );
    await supabase.from("todos").update(changes).eq("id", selected.id);
    setSelected(null);
  }

  function openTodo(t: Todo) {
    setEditTitle(t.title);
    setEditAssignee(t.assignee ?? ATTORNEYS[0]);
    setSelected(t);
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const firstName = (n: string | null) => (n || "").split(" ")[0];

  const Row = ({ t }: { t: Todo }) => (
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
      {t.assignee && (
        <span className="todo-assignee" title={t.assignee}>
          {firstName(t.assignee)}
        </span>
      )}
    </li>
  );

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
              <li className="todo-divider">
                Completed · {done.length}
              </li>
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
