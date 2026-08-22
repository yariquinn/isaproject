"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, Matter } from "@/lib/types";
import Disclaimer from "../Disclaimer";

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function DeadlinesPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<string>("all"); // "all" | "overdue" | <kind>
  const [userFilter, setUserFilter] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const [{ data: e }, { data: m }] = await Promise.all([
        supabase.from("events").select("*").order("event_date"),
        supabase.from("matters").select("*"),
      ]);
      setEvents((e as EventItem[]) ?? []);
      setMatters((m as Matter[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const matterOf = (id: string | null) => matters.find((m) => m.id === id);
  const matterName = (id: string | null) => matterOf(id)?.name ?? "—";

  // Distinct kinds present in the data (so the chips reflect real events).
  const kinds = useMemo(
    () => Array.from(new Set(events.map((e) => e.kind || "deadline"))).sort(),
    [events],
  );
  // Users = attorneys assigned to the matters these events belong to.
  const users = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      const a = matterOf(ev.matter_id)?.assigned_to;
      if (a) set.add(a);
    }
    return Array.from(set).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, matters]);

  const shown = useMemo(() => {
    const today = todayIso();
    return events.filter((ev) => {
      if (kindFilter === "overdue") {
        if (ev.completed || (ev.event_date || "").slice(0, 10) >= today) return false;
      } else if (kindFilter !== "all" && (ev.kind || "deadline") !== kindFilter) {
        return false;
      }
      if (userFilter !== "all" && matterOf(ev.matter_id)?.assigned_to !== userFilter) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, matters, kindFilter, userFilter]);

  const overdueCount = useMemo(() => {
    const today = todayIso();
    return events.filter((e) => !e.completed && (e.event_date || "").slice(0, 10) < today).length;
  }, [events]);

  return (
    <div>
      <h1 className="page-title">Deadlines & Calendar</h1>
      <Disclaimer>
        Mock Google Calendar integration — these events are sample data. Live
        sync will be connected later.
      </Disclaimer>

      {!loading && events.length > 0 && (
        <div className="dl-filters">
          <div className="inv-filter-row">
            <button type="button" className={`inv-chip${kindFilter === "all" ? " on" : ""}`} onClick={() => setKindFilter("all")}>
              All <span className="inv-chip-count">{events.length}</span>
            </button>
            <button type="button" className={`inv-chip${kindFilter === "overdue" ? " on" : ""}`} onClick={() => setKindFilter("overdue")}>
              Overdue <span className="inv-chip-count">{overdueCount}</span>
            </button>
            {kinds.map((k) => (
              <button key={k} type="button" className={`inv-chip${kindFilter === k ? " on" : ""}`} onClick={() => setKindFilter(k)}>
                <span className="dl-chip-kind">{k}</span>
                <span className="inv-chip-count">{events.filter((e) => (e.kind || "deadline") === k).length}</span>
              </button>
            ))}
          </div>
          {users.length > 0 && (
            <select className="inline-select dl-user-select" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
              <option value="all">All users</option>
              {users.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 className="panel-title">Upcoming</h2>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : shown.length === 0 ? (
          <p className="muted-line">No events match this filter.</p>
        ) : (
          <ul className="event-list">
            {shown.map((ev) => {
              const overdue = !ev.completed && (ev.event_date || "").slice(0, 10) < todayIso();
              return (
              <li key={ev.id}>
                <span className={`event-date${overdue ? " overdue" : ""}`}>
                  {new Date(ev.event_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className={`event-kind ${overdue ? "ev-overdue" : `ev-${ev.kind}`}`}>{overdue ? "overdue" : ev.kind}</span>
                <span className="event-title">{ev.title}</span>
                {ev.matter_id && (
                  <Link
                    href={`/dashboard/matters/${ev.matter_id}`}
                    className="event-matter"
                  >
                    {matterName(ev.matter_id)}
                  </Link>
                )}
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
