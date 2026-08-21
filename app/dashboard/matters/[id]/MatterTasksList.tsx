"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ATTORNEYS, PRIORITIES, personColor, type Todo } from "@/lib/types";
import { usePortal } from "../../PortalProvider";

const firstName = (n: string | null) => (n || "").split(" ")[0];
function initialsOf(n: string | null): string {
  const parts = (n || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
const fmtDate = (d: string | null) =>
  d
    ? new Date(d + "T00:00:00").toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

// Status is derived from the shared task fields so this list stays in sync
// with the weekly Tasks board (scheduling a task there flips it to Scheduled).
function statusOf(t: Todo): { label: string; cls: string } {
  if (t.done) return { label: "Completed", cls: "st-done" };
  if (t.scheduled_date) return { label: "Scheduled", cls: "st-sched" };
  return { label: "New task", cls: "st-new" };
}
function StatusIcon({ cls }: { cls: string }) {
  const p = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (cls === "st-done")
    return <svg {...p}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>;
  if (cls === "st-sched")
    return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>;
  return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 5L2 7" /></svg>;
}
const prioLabel = (v: string) =>
  v === "-" ? "Normal" : PRIORITIES.find((p) => p.value === v)?.label ?? v;

export default function MatterTasksList({ matterId }: { matterId: string }) {
  const { userName } = usePortal();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapse, setCollapse] = useState<{ active: boolean; done: boolean }>({
    active: false,
    done: false,
  });
  const [newTitle, setNewTitle] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");
  const [dueEdit, setDueEdit] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("todos")
      .select("*")
      .eq("matter_id", matterId)
      .order("created_at", { ascending: false });
    setTodos((data as Todo[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matterId]);

  const active = useMemo(() => todos.filter((t) => !t.done), [todos]);
  const done = useMemo(() => todos.filter((t) => t.done), [todos]);

  async function patch(id: string, changes: Partial<Todo>) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, ...changes } : t)));
    await supabase.from("todos").update(changes).eq("id", id);
  }
  async function add() {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    const { data } = await supabase
      .from("todos")
      .insert({
        title,
        matter_id: matterId,
        assignee: ATTORNEYS[0],
        created_by: userName,
        priority: "-",
      })
      .select("*")
      .single();
    if (data) setTodos((prev) => [data as Todo, ...prev]);
  }
  async function remove(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await supabase.from("todos").delete().eq("id", id);
  }

  const renderRow = (t: Todo) => {
    const st = statusOf(t);
    return (
      <div className="mt-row" key={t.id}>
        <div className="mt-cell mt-task">
          <button
            type="button"
            className={`mt-check${t.done ? " on" : ""}`}
            onClick={() => patch(t.id, { done: !t.done })}
            aria-label={t.done ? "Mark not done" : "Mark done"}
          >
            {t.done ? "✓" : ""}
          </button>
          {editId === t.id ? (
            <input
              className="mt-edit"
              autoFocus
              value={editVal}
              onChange={(e) => setEditVal(e.target.value)}
              onBlur={() => {
                patch(t.id, { title: editVal.trim() || t.title });
                setEditId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") setEditId(null);
              }}
            />
          ) : (
            <span
              className={`mt-title${t.done ? " done" : ""}`}
              onClick={() => {
                setEditId(t.id);
                setEditVal(t.title);
              }}
            >
              {t.title}
            </span>
          )}
          <button type="button" className="mt-del" onClick={() => remove(t.id)} aria-label="Delete task">
            ×
          </button>
        </div>

        <div className="mt-cell mt-status">
          <span className={`mt-status-pill ${st.cls}`}>
            <span className="mt-status-ic"><StatusIcon cls={st.cls} /></span>
            {st.label}
          </span>
        </div>

        <div className="mt-cell mt-type">
          <select
            className={`mt-type-select prio-${t.priority}`}
            value={t.priority}
            onChange={(e) => patch(t.id, { priority: e.target.value })}
            aria-label="Priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {prioLabel(p.value)}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-cell mt-due">
          {dueEdit === t.id ? (
            <input
              type="date"
              autoFocus
              className="mt-due-input"
              value={t.due_date ?? ""}
              onChange={(e) => patch(t.id, { due_date: e.target.value || null })}
              onBlur={() => setDueEdit(null)}
              aria-label="Due date"
            />
          ) : (
            <button type="button" className="mt-due-btn" onClick={() => setDueEdit(t.id)}>
              {t.due_date ? (
                fmtDate(t.due_date)
              ) : (
                <span className="mt-due-empty" aria-label="No due date">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                </span>
              )}
            </button>
          )}
        </div>

        <div className="mt-cell mt-resp">
          <span className="mt-avatar" style={{ background: personColor(t.assignee) }} title={t.assignee ?? undefined}>
            {initialsOf(t.assignee)}
          </span>
          <select
            className="mt-resp-select"
            value={(ATTORNEYS as readonly string[]).includes(t.assignee ?? "") ? (t.assignee as string) : ATTORNEYS[0]}
            onChange={(e) => patch(t.id, { assignee: e.target.value })}
            aria-label="Responsible"
          >
            {ATTORNEYS.map((a) => (
              <option key={a} value={a}>
                {firstName(a)}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  };

  const renderGroup = (label: string, items: Todo[], which: "active" | "done") => {
    const open = !collapse[which];
    return (
      <div className="mt-group" key={which}>
        <div className="mt-group-head">
          <div className="mt-group-left">
            <button
              type="button"
              className={`nav-caret${open ? " open" : ""}`}
              onClick={() => setCollapse((c) => ({ ...c, [which]: !c[which] }))}
              aria-label={open ? "Collapse" : "Expand"}
            >
              ›
            </button>
            <span className="mt-group-title">{label}</span>
            <span className="mt-group-count">{items.length}</span>
          </div>
          <span className="mt-col">Status</span>
          <span className="mt-col">Type</span>
          <span className="mt-col">Due date</span>
          <span className="mt-col">Responsible</span>
        </div>
        {open && (
          <div className="mt-rows">
            {items.map((t) => renderRow(t))}
            {which === "active" && (
              <div className="mt-addrow">
                <span className="mt-check ghost" />
                <input
                  className="mt-add-input"
                  placeholder="+ Add task"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") add();
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  if (loading) return <p className="muted-line">Loading…</p>;

  return (
    <div className="mt-list">
      {renderGroup("Active", active, "active")}
      {done.length > 0 && renderGroup("Completed", done, "done")}
    </div>
  );
}
