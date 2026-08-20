"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, Todo } from "@/lib/types";
import { usePortal } from "./PortalProvider";
import { logoutAction } from "./actions";

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (d: string) =>
  new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

type Alert = { id: string; kind: "task" | "event"; title: string; date: string; href: string; overdue: boolean };

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
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const today = iso(new Date());
      const horizon = iso(new Date(Date.now() + 14 * 86400000));
      const [{ data: todos }, { data: events }] = await Promise.all([
        supabase.from("todos").select("*").eq("done", false).not("due_date", "is", null).lte("due_date", horizon),
        supabase.from("events").select("*").eq("completed", false).gte("event_date", today).lte("event_date", horizon),
      ]);
      const list: Alert[] = [];
      for (const t of (todos as Todo[]) ?? []) {
        list.push({
          id: `t-${t.id}`,
          kind: "task",
          title: t.title,
          date: t.due_date as string,
          href: t.matter_id ? `/dashboard/matters/${t.matter_id}` : "/dashboard/todo",
          overdue: (t.due_date as string) < today,
        });
      }
      for (const e of (events as EventItem[]) ?? []) {
        list.push({
          id: `e-${e.id}`,
          kind: "event",
          title: e.title,
          date: e.event_date.slice(0, 10),
          href: e.matter_id ? `/dashboard/matters/${e.matter_id}` : "/dashboard/deadlines",
          overdue: false,
        });
      }
      list.sort((a, b) => a.date.localeCompare(b.date));
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
                      <span className={`hdr-alert-tag tag-${a.kind}`}>{a.kind === "task" ? "Task" : "Event"}</span>
                      <span className="hdr-alert-title">{a.title}</span>
                      <span className={`hdr-alert-date${a.overdue ? " overdue" : ""}`}>
                        {a.overdue ? "Overdue · " : ""}
                        {fmt(a.date)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Me / settings */}
        <span className="online-label">Online</span>
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
