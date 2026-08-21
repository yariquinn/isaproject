"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, TaskComment, Todo } from "@/lib/types";
import { personColor } from "@/lib/types";
import { usePortal } from "./PortalProvider";
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

type SearchHit = { kind: "client" | "matter"; id: string; name: string; sub: string | null; closed: boolean };

function GlobalSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
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
      setHits([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const [{ data: clients }, { data: matters }] = await Promise.all([
        supabase.from("clients").select("id,name,primary_contact,archived").ilike("name", `%${term}%`),
        supabase.from("matters").select("id,name,practice_area,status").ilike("name", `%${term}%`),
      ]);
      if (cancelled) return;
      const list: SearchHit[] = [];
      for (const c of (clients as { id: string; name: string; primary_contact: string | null; archived: boolean | null }[]) ?? [])
        list.push({ kind: "client", id: c.id, name: c.name, sub: c.primary_contact, closed: !!c.archived });
      for (const m of (matters as { id: string; name: string; practice_area: string | null; status: string | null }[]) ?? [])
        list.push({ kind: "matter", id: m.id, name: m.name, sub: m.practice_area, closed: m.status === "closed" });
      // Active first, archived/closed last (stable within each group).
      list.sort((a, b) => (a.closed ? 1 : 0) - (b.closed ? 1 : 0));
      setHits(list);
    };
    const t = setTimeout(run, 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

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
            placeholder="Search clients & matters…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setOpen(true)}
          />
        </div>
        {open && q.trim() !== "" && (
          <div className="hdr-search-menu">
            {hits.length === 0 ? (
              <p className="hdr-empty">No matches.</p>
            ) : (
              hits.map((h) => (
                <Link
                  key={`${h.kind}-${h.id}`}
                  href={h.kind === "client" ? `/dashboard/clients/${h.id}` : `/dashboard/matters/${h.id}`}
                  className={`hdr-search-hit${h.closed ? " closed" : ""}`}
                  onClick={() => { setOpen(false); setQ(""); }}
                >
                  <span className={`hdr-search-kind hdr-search-${h.kind}`}>{h.kind === "client" ? "Client" : "Matter"}</span>
                  <span className="hdr-search-name">{h.name}</span>
                  {h.closed && <span className="hdr-search-status">Archived</span>}
                  {h.sub && <span className="hdr-search-sub">{h.sub}</span>}
                </Link>
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
      <div className="app-header-right" ref={wrapRef}>
        {/* Global search (magnifier, expands on hover) */}
        <GlobalSearch />

        {/* Timer (lives in the header, left of alerts) */}
        <TimeTracker />

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
            style={{ background: personColor(userName) }}
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
