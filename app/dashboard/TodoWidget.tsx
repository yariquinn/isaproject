"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Todo } from "@/lib/types";
import { usePortal } from "./PortalProvider";

export default function TodoWidget({ compact = false }: { compact?: boolean }) {
  const { userName } = usePortal();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase
      .from("todos")
      .select("*")
      .order("done")
      .order("created_at", { ascending: false });
    setTodos((data as Todo[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function add() {
    const title = text.trim();
    if (!title) return;
    setText("");
    const { data } = await supabase
      .from("todos")
      .insert({ title, created_by: userName })
      .select("*")
      .single();
    if (data) setTodos((prev) => [data as Todo, ...prev]);
  }

  async function toggle(t: Todo) {
    setTodos((prev) =>
      prev.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)),
    );
    await supabase.from("todos").update({ done: !t.done }).eq("id", t.id);
  }

  async function remove(t: Todo) {
    setTodos((prev) => prev.filter((x) => x.id !== t.id));
    await supabase.from("todos").delete().eq("id", t.id);
  }

  const open = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);

  return (
    <div>
      <div className="todo-add">
        <input
          className="activity-search"
          placeholder="Add a task…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          style={{ flex: 1 }}
        />
        <button className="btn" type="button" onClick={add} disabled={!text.trim()}>
          Add
        </button>
      </div>

      <div className={compact ? "panel-scroll" : undefined}>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : todos.length === 0 ? (
          <p className="muted-line">Nothing on your list.</p>
        ) : (
          <ul className="todo-list">
            {open.map((t) => (
              <TodoRow key={t.id} t={t} onToggle={toggle} onRemove={remove} />
            ))}
            {done.length > 0 && !compact && (
              <li className="todo-divider">Completed</li>
            )}
            {(compact ? [] : done).map((t) => (
              <TodoRow key={t.id} t={t} onToggle={toggle} onRemove={remove} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TodoRow({
  t,
  onToggle,
  onRemove,
}: {
  t: Todo;
  onToggle: (t: Todo) => void;
  onRemove: (t: Todo) => void;
}) {
  return (
    <li className={`todo-item${t.done ? " done" : ""}`}>
      <label>
        <input
          type="checkbox"
          checked={t.done}
          onChange={() => onToggle(t)}
        />
        <span className="todo-title">{t.title}</span>
      </label>
      <button
        type="button"
        className="todo-del"
        aria-label="Delete task"
        onClick={() => onRemove(t)}
      >
        ✕
      </button>
    </li>
  );
}
