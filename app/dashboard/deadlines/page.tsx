"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { EventItem, Matter } from "@/lib/types";
import Disclaimer from "../Disclaimer";

export default function DeadlinesPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [loading, setLoading] = useState(true);

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

  const matterName = (id: string | null) =>
    matters.find((m) => m.id === id)?.name ?? "—";

  return (
    <div>
      <h1 className="page-title">Deadlines & Calendar</h1>
      <Disclaimer>
        Mock Google Calendar integration — these events are sample data. Live
        sync will be connected later.
      </Disclaimer>

      <div className="panel" style={{ marginTop: "1.25rem" }}>
        <h2 className="panel-title">Upcoming</h2>
        {loading ? (
          <p className="muted-line">Loading…</p>
        ) : events.length === 0 ? (
          <p className="muted-line">No upcoming events.</p>
        ) : (
          <ul className="event-list">
            {events.map((ev) => (
              <li key={ev.id}>
                <span className="event-date">
                  {new Date(ev.event_date).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                <span className={`event-kind ev-${ev.kind}`}>{ev.kind}</span>
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
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
