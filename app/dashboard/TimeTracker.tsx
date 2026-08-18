"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_TYPES, type Matter, type Timer } from "@/lib/types";

function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

function elapsedOf(t: Timer, nowMs: number): number {
  let e = t.accumulated_seconds;
  if (t.is_running && t.last_started_at) {
    e += (nowMs - new Date(t.last_started_at).getTime()) / 1000;
  }
  return e;
}

type LogTarget = { timer: Timer; seconds: number } | null;

export default function TimeTracker() {
  const [timers, setTimers] = useState<Timer[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(true);
  const [logTarget, setLogTarget] = useState<LogTarget>(null);

  const load = useCallback(async () => {
    const [{ data: t }, { data: m }] = await Promise.all([
      supabase.from("timers").select("*").order("created_at"),
      supabase.from("matters").select("*").order("name"),
    ]);
    setTimers((t as Timer[]) || []);
    setMatters((m as Matter[]) || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  async function logActivity(kind: string, description: string) {
    await supabase.from("activity_log").insert({ kind, description });
  }

  async function addTimer() {
    const label = window.prompt("Name this timer (optional):", "") ?? "";
    await supabase
      .from("timers")
      .insert({ label: label.trim() || null, accumulated_seconds: 0 });
    await load();
  }

  // Start a timer; pause any other running timer first (only one runs at a time).
  async function start(target: Timer) {
    const nowIso = new Date().toISOString();
    for (const t of timers) {
      if (t.is_running && t.id !== target.id) {
        const acc = Math.floor(elapsedOf(t, Date.now()));
        await supabase
          .from("timers")
          .update({
            is_running: false,
            accumulated_seconds: acc,
            last_started_at: null,
          })
          .eq("id", t.id);
      }
    }
    await supabase
      .from("timers")
      .update({ is_running: true, last_started_at: nowIso })
      .eq("id", target.id);
    await load();
  }

  async function pause(target: Timer) {
    const acc = Math.floor(elapsedOf(target, Date.now()));
    await supabase
      .from("timers")
      .update({
        is_running: false,
        accumulated_seconds: acc,
        last_started_at: null,
      })
      .eq("id", target.id);
    await load();
  }

  function openLog(target: Timer) {
    setLogTarget({ timer: target, seconds: Math.floor(elapsedOf(target, Date.now())) });
  }

  async function removeTimer(target: Timer) {
    if (!window.confirm("Delete this timer? Unlogged time will be lost.")) return;
    await supabase.from("timers").delete().eq("id", target.id);
    await load();
  }

  async function submitLog(fields: {
    matterId: string;
    activity: string;
    lawyer: string;
  }) {
    if (!logTarget) return;
    const { timer, seconds } = logTarget;
    const matter = matters.find((m) => m.id === fields.matterId);

    await supabase.from("time_entries").insert({
      matter_id: fields.matterId || null,
      activity: fields.activity,
      lawyer: fields.lawyer || "Isa",
      duration_seconds: seconds,
    });
    await logActivity(
      "time_logged",
      `${fields.lawyer || "Isa"} logged ${fmt(seconds)} to ${
        matter ? matter.name : "a matter"
      } (${fields.activity})`,
    );
    // Reset the timer but keep it so more time can be added later.
    await supabase
      .from("timers")
      .update({
        accumulated_seconds: 0,
        is_running: false,
        last_started_at: null,
        matter_id: fields.matterId || null,
      })
      .eq("id", timer.id);

    setLogTarget(null);
    await load();
  }

  const runningCount = timers.filter((t) => t.is_running).length;

  return (
    <div className="tracker">
      <div className="tracker-head">
        <button
          className="tracker-toggle"
          onClick={() => setOpen((o) => !o)}
          type="button"
        >
          {open ? "▾" : "▸"} Time Tracker
          {runningCount > 0 && <span className="tracker-live">● running</span>}
        </button>
        <button className="tracker-add" onClick={addTimer} type="button">
          + New timer
        </button>
      </div>

      {open && (
        <div className="tracker-body">
          {timers.length === 0 && (
            <div className="tracker-empty">
              No timers yet. Create one to start tracking time.
            </div>
          )}
          {timers.map((t) => {
            const secs = elapsedOf(t, now);
            return (
              <div
                key={t.id}
                className={`timer-chip${t.is_running ? " on" : ""}`}
              >
                <div className="timer-meta">
                  <span className="timer-label">
                    {t.label || "Untitled timer"}
                  </span>
                  <span className="timer-clock">{fmt(secs)}</span>
                </div>
                <div className="timer-controls">
                  {t.is_running ? (
                    <button onClick={() => pause(t)} type="button">
                      Pause
                    </button>
                  ) : (
                    <button onClick={() => start(t)} type="button">
                      Start
                    </button>
                  )}
                  <button
                    onClick={() => openLog(t)}
                    type="button"
                    disabled={Math.floor(secs) === 0}
                    className="timer-log"
                  >
                    Log
                  </button>
                  <button
                    onClick={() => removeTimer(t)}
                    type="button"
                    className="timer-del"
                    aria-label="Delete timer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {logTarget && (
        <LogModal
          matters={matters}
          seconds={logTarget.seconds}
          onCancel={() => setLogTarget(null)}
          onSubmit={submitLog}
        />
      )}
    </div>
  );
}

function LogModal({
  matters,
  seconds,
  onCancel,
  onSubmit,
}: {
  matters: Matter[];
  seconds: number;
  onCancel: () => void;
  onSubmit: (f: {
    matterId: string;
    activity: string;
    lawyer: string;
  }) => void;
}) {
  const [matterId, setMatterId] = useState(matters[0]?.id ?? "");
  const [activity, setActivity] = useState<string>(ACTIVITY_TYPES[0]);
  const [lawyer, setLawyer] = useState("Isa");

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Log time</h3>
        <p className="modal-dur">
          Duration: <strong>{fmt(seconds)}</strong>
        </p>
        <label>
          Matter
          <select value={matterId} onChange={(e) => setMatterId(e.target.value)}>
            {matters.length === 0 && <option value="">No matters yet</option>}
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Activity
          <select value={activity} onChange={(e) => setActivity(e.target.value)}>
            {ACTIVITY_TYPES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label>
          Lawyer
          <input value={lawyer} onChange={(e) => setLawyer(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => onSubmit({ matterId, activity, lawyer })}
          >
            Save entry
          </button>
        </div>
      </div>
    </div>
  );
}
