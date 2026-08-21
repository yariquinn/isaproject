"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, TaskComment, Todo } from "@/lib/types";
import { personColor } from "@/lib/types";
import { usePortal } from "./PortalProvider";
import { useUndo } from "./UndoProvider";
import { logoutAction } from "./actions";
import TimeTracker from "./TimeTracker";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

type Alert = {
  id: string;
  kind: "task" | "event" | "mention";
  title: string;
  matter: string | null;
  date: string;
  href: string;
  overdue: boolean;
  high: boolean;
};

type SearchGroup = "clients" | "matters" | "invoices" | "contacts" | "tasks" | "events" | "time" | "expenses";
type SearchHit = { id: string; title: string; sub: string | null; href: string; closed: boolean; flag?: string | null; who?: string | null; whoName?: string | null };
const initialsOf = (n: string | null | undefined) =>
  (n || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
const todayIso = () => iso(new Date());
const GROUP_ORDER: SearchGroup[] = ["clients", "matters", "invoices", "contacts", "tasks", "events", "time", "expenses"];
const GROUP_LABELS: Record<SearchGroup, string> = {
  clients: "Clients", matters: "Matters", invoices: "Invoices", contacts: "Contacts",
  tasks: "Tasks", events: "Events", time: "Time Entries", expenses: "Expenses",
};
const matterHref = (mid: string | null, fallback: string) => (mid ? `/dashboard/matters/${mid}` : fallback);
const emptyGroups = (): Record<SearchGroup, SearchHit[]> => ({
  clients: [], matters: [], invoices: [], contacts: [], tasks: [], events: [], time: [], expenses: [],
});

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<Record<SearchGroup, SearchHit[]>>(
    () => emptyGroups(),
  );
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  // Close the results menu on outside click / Escape (bar itself stays visible).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setOpen(false); setQ(""); inputRef.current?.blur(); }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    const term = q.trim();
    if (term === "") {
      setGroups(emptyGroups());
      return;
    }
    let cancelled = false;
    const like = `%${term}%`;
    const run = async () => {
      const [clients, matters, invoices, contacts, todos, events, times, expenses] = await Promise.all([
        supabase.from("clients").select("id,name,email,phone,address,archived").ilike("name", like).limit(6),
        supabase.from("matters").select("id,name,status").ilike("name", like).limit(6),
        supabase.from("invoices").select("id,number,status,matter_id").ilike("number", like).limit(6),
        supabase.from("contacts").select("id,name,organization,archived").ilike("name", like).limit(6),
        supabase.from("todos").select("id,title,matter_id,done,due_date").ilike("title", like).limit(6),
        supabase.from("events").select("id,title,matter_id,event_date").ilike("title", like).limit(6),
        supabase.from("time_entries").select("id,note,activity,matter_id,lawyer").or(`note.ilike.${like},activity.ilike.${like}`).limit(6),
        supabase.from("expenses").select("id,description,amount,matter_id").ilike("description", like).limit(6),
      ]);
      if (cancelled) return;
      const next = emptyGroups();
      // Resolve matter names for time entries / tasks so rows can show them.
      const needMatterIds = Array.from(new Set([
        ...((times.data as { matter_id: string | null }[]) ?? []).map((t) => t.matter_id),
        ...((todos.data as { matter_id: string | null }[]) ?? []).map((t) => t.matter_id),
      ].filter(Boolean) as string[]));
      const matterNames: Record<string, string> = {};
      if (needMatterIds.length) {
        const { data: mn } = await supabase.from("matters").select("id,name").in("id", needMatterIds);
        for (const m of (mn as { id: string; name: string }[]) ?? []) matterNames[m.id] = m.name;
      }
      if (cancelled) return;
      const today = todayIso();
      for (const c of (clients.data as { id: string; name: string; email: string | null; phone: string | null; address: string | null; archived: boolean | null }[]) ?? []) {
        const state = c.address?.match(/,\s*([A-Za-z]{2})\.?\s*\d{5}/)?.[1]?.toUpperCase() ?? null;
        const sub = [c.email, c.phone, state].filter(Boolean).join(" · ") || null;
        next.clients.push({ id: c.id, title: c.name, sub, href: `/dashboard/clients/${c.id}`, closed: !!c.archived });
      }
      for (const m of (matters.data as { id: string; name: string; status: string | null }[]) ?? [])
        next.matters.push({ id: m.id, title: m.name, sub: null, href: `/dashboard/matters/${m.id}`, closed: m.status === "closed" });
      for (const i of (invoices.data as { id: string; number: string | null; status: string | null; matter_id: string | null }[]) ?? [])
        next.invoices.push({ id: i.id, title: i.number || "Invoice", sub: i.status, href: `/dashboard/invoices/${i.id}${i.matter_id ? `?from=/dashboard/matters/${i.matter_id}` : ""}`, closed: false });
      for (const c of (contacts.data as { id: string; name: string; organization: string | null; archived: boolean | null }[]) ?? [])
        next.contacts.push({ id: c.id, title: c.name, sub: c.organization, href: `/dashboard/contacts`, closed: !!c.archived });
      for (const t of (todos.data as { id: string; title: string; matter_id: string | null; done: boolean; due_date: string | null }[]) ?? []) {
        const overdue = !t.done && !!t.due_date && t.due_date.slice(0, 10) < today;
        const sub = t.due_date ? `Due ${fmt(t.due_date.slice(0, 10))}` : null;
        next.tasks.push({ id: t.id, title: t.title, sub, href: matterHref(t.matter_id, "/dashboard/todo"), closed: t.done, flag: overdue ? "Overdue" : null });
      }
      for (const e of (events.data as { id: string; title: string; matter_id: string | null; event_date: string | null }[]) ?? [])
        next.events.push({ id: e.id, title: e.title, sub: e.event_date ? fmt(e.event_date.slice(0, 10)) : null, href: matterHref(e.matter_id, "/dashboard/deadlines"), closed: false });
      for (const t of (times.data as { id: string; note: string | null; activity: string | null; matter_id: string | null; lawyer: string | null }[]) ?? []) {
        const mName = t.matter_id ? matterNames[t.matter_id] ?? null : null;
        const sub = [mName, t.activity].filter(Boolean).join(" · ") || null;
        next.time.push({ id: t.id, title: t.note || t.activity || "Time entry", sub, href: matterHref(t.matter_id, "/dashboard/billing?tab=time"), closed: false, who: initialsOf(t.lawyer) || null, whoName: t.lawyer });
      }
      for (const x of (expenses.data as { id: string; description: string | null; amount: number | null; matter_id: string | null }[]) ?? [])
        next.expenses.push({ id: x.id, title: x.description || "Expense", sub: x.amount != null ? `$${x.amount}` : null, href: matterHref(x.matter_id, "/dashboard/billing"), closed: false });
      // Archived / closed items always sort last within their group.
      for (const g of GROUP_ORDER) next[g].sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0));
      setGroups(next);
    };
    const t = setTimeout(run, 180);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  const total = GROUP_ORDER.reduce((s, g) => s + groups[g].length, 0);

  return (
    <div className="hdr-search">
      {/* Always-visible search bar */}
      <div className="hdr-search-bar" ref={barRef}>
        <div className="hdr-search-field">
          <svg className="hdr-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            className="hdr-search-input"
            placeholder="Search everything…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        </div>
        {open && q.trim() !== "" && (
          <div className="hdr-search-menu">
            {total === 0 ? (
              <p className="hdr-empty">No matches.</p>
            ) : (
              GROUP_ORDER.filter((g) => groups[g].length > 0).map((g) => (
                <div className="hdr-search-group" key={g}>
                  <div className="hdr-search-group-label">{GROUP_LABELS[g]}</div>
                  {groups[g].map((h) => (
                    <Link
                      key={`${g}-${h.id}`}
                      href={h.href}
                      className={`hdr-search-hit${h.closed ? " closed" : ""}`}
                      onClick={() => { setOpen(false); setQ(""); }}
                    >
                      <span className="hdr-search-name">
                        {h.title}
                        {h.closed && <span className="hdr-search-inline-pill">{g === "tasks" ? "Done" : "Archived"}</span>}
                      </span>
                      <span className="hdr-search-status-slot">
                        {!h.closed && h.flag ? (
                          <span className="hdr-search-status overdue">{h.flag}</span>
                        ) : null}
                        {h.who && (
                          <span className="hdr-search-who" title={h.whoName ?? "User"} style={{ background: personColor(h.whoName), color: "#fff" }}>
                            {h.who}
                          </span>
                        )}
                      </span>
                      <span className="hdr-search-sub">{h.sub}</span>
                    </Link>
                  ))}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AppHeader() {
  const { userName } = usePortal();
  const { canUndo, lastLabel, runUndo } = useUndo();
  const initials =
    (userName || "")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [meOpen, setMeOpen] = useState(false);
  const [online, setOnline] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const initialsFor = (n: string) =>
    (n || "").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "U";

  // Real-time presence: track this user, render everyone currently online.
  useEffect(() => {
    const channel = supabase.channel("presence:online", { config: { presence: { key: userName } } });
    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, unknown[]>;
        setOnline(Object.keys(state));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: userName, online_at: new Date().toISOString() });
        }
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userName]);

  const others = online.filter((n) => n !== userName);

  useEffect(() => {
    (async () => {
      const today = iso(new Date());
      const horizon = iso(new Date(Date.now() + 14 * 86400000));
      const firstName = (userName || "").split(/\s+/)[0] || userName;
      const since = new Date(Date.now() - 14 * 86400000).toISOString();
      const [{ data: todos }, { data: events }, { data: mentions }, { data: matters }] = await Promise.all([
        supabase.from("todos").select("*").eq("done", false).not("due_date", "is", null).lte("due_date", horizon),
        supabase.from("events").select("*").eq("completed", false).gte("event_date", today).lte("event_date", horizon),
        supabase.from("task_comments").select("*").ilike("body", `%@${firstName}%`).gte("created_at", since).order("created_at", { ascending: false }),
        supabase.from("matters").select("id,name"),
      ]);
      const matterName = (id: string | null) =>
        id ? (matters as { id: string; name: string }[] | null)?.find((m) => m.id === id)?.name ?? null : null;
      const list: Alert[] = [];
      for (const t of (todos as Todo[]) ?? []) {
        list.push({
          id: `t-${t.id}`,
          kind: "task",
          title: t.title,
          matter: matterName(t.matter_id),
          date: t.due_date as string,
          href: t.matter_id ? `/dashboard/matters/${t.matter_id}` : "/dashboard/todo",
          overdue: (t.due_date as string) < today,
          high: t.priority === "high",
        });
      }
      for (const e of (events as EventItem[]) ?? []) {
        list.push({
          id: `e-${e.id}`,
          kind: "event",
          title: e.title,
          matter: matterName(e.matter_id),
          date: e.event_date.slice(0, 10),
          href: e.matter_id ? `/dashboard/matters/${e.matter_id}` : "/dashboard/deadlines",
          overdue: false,
          high: false,
        });
      }
      for (const c of (mentions as TaskComment[]) ?? []) {
        if (c.author === userName) continue; // don't alert on your own mentions
        list.push({
          id: `m-${c.id}`,
          kind: "mention",
          title: c.body,
          matter: c.author ? `${c.author} mentioned you` : "You were mentioned",
          date: c.created_at.slice(0, 10),
          href: "/dashboard/todo",
          overdue: false,
          high: false,
        });
      }
      // Soonest first; overdue floats to the very top.
      list.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        return a.date.localeCompare(b.date);
      });
      setAlerts(list);
    })();
  }, []);

  useEffect(() => {
    if (!bellOpen && !meOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setBellOpen(false);
        setMeOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [bellOpen, meOpen]);

  const count = alerts.length;

  return (
    <header className="app-header">
      {/* Left: undo last destructive action */}
      <div className="app-header-left">
        <button
          type="button"
          className="hdr-icon-btn"
          onClick={() => runUndo()}
          disabled={!canUndo}
          title={canUndo ? `Undo: ${lastLabel}` : "Nothing to undo"}
          aria-label="Undo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>
      </div>

      <div className="app-header-right" ref={wrapRef}>
        {/* Global search (magnifier, expands on hover) */}
        <GlobalSearch />

        {/* Timer (left of the timesheet shortcut) */}
        <TimeTracker />

        {/* Timesheet shortcut — clipboard/log icon (distinct from the calendar) */}
        <Link href="/dashboard/billing?tab=timesheet" className="hdr-icon-btn hdr-icon-filled" title="Timesheet" aria-label="Timesheet">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1z" />
            <rect x="5" y="4" width="14" height="18" rx="2" />
            <line x1="9" y1="11" x2="15" y2="11" />
            <line x1="9" y1="15" x2="15" y2="15" />
            <line x1="9" y1="19" x2="13" y2="19" />
          </svg>
        </Link>

        {/* Alerts */}
        <div className="hdr-bell-wrap">
          <button
            type="button"
            className="hdr-bell"
            onClick={() => {
              setBellOpen((o) => !o);
              setMeOpen(false);
            }}
            aria-label={`Alerts (${count} pending)`}
            title="Alerts"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {count > 0 && <span className="hdr-bell-badge">{count > 9 ? "9+" : count}</span>}
          </button>
          {bellOpen && (
            <div className="hdr-menu hdr-alerts">
              <div className="hdr-menu-head">Alerts {count > 0 && <span className="count-badge">{count}</span>}</div>
              {count === 0 ? (
                <p className="hdr-empty">Nothing pending.</p>
              ) : (
                <div className="hdr-alert-list">
                  {alerts.map((a) => (
                    <Link key={a.id} href={a.href} className="hdr-alert" onClick={() => setBellOpen(false)}>
                      <div className="hdr-alert-main">
                        {a.matter && <span className="hdr-alert-matter">{a.matter}</span>}
                        <span className="hdr-alert-title">{a.title}</span>
                        {a.high && <span className="hdr-alert-high">High priority</span>}
                      </div>
                      <div className="hdr-alert-right">
                        <span className={`hdr-alert-date${a.overdue ? " overdue" : ""}`}>
                          {a.overdue ? "Overdue" : fmt(a.date)}
                        </span>
                        <span className={`hdr-alert-tag tag-${a.kind}`}>
                          {a.kind === "task" ? "Task" : a.kind === "event" ? "Event" : "Mention"}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Presence — everyone currently online */}
        <span className="online-label">Online</span>
        {others.length > 0 && (
          <div className="online-stack">
            {others.slice(0, 5).map((n) => (
              <span key={n} className="online-avatar sm" style={{ background: personColor(n) }} title={`${n} · online`}>
                {initialsFor(n)}
                <span className="online-dot" aria-hidden="true" />
              </span>
            ))}
            {others.length > 5 && <span className="online-more">+{others.length - 5}</span>}
          </div>
        )}
        <div className="hdr-me-wrap">
          <button
            type="button"
            className="online-avatar hdr-me"
            onClick={() => {
              setMeOpen((o) => !o);
              setBellOpen(false);
            }}
            title={userName}
            aria-label="Account menu"
          >
            {initials}
            <span className="online-dot" aria-hidden="true" />
          </button>
          {meOpen && (
            <div className="hdr-menu hdr-me-menu">
              <div className="hdr-me-name">{userName}</div>
              <Link href="/dashboard/settings" className="hdr-me-item" onClick={() => setMeOpen(false)}>
                Settings
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="hdr-me-item danger">Sign out</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
