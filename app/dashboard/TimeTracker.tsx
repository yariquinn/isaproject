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
  const [picking, setPicking] = useState(false);
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

  const matterName = (id: string | null) =>
    matters.find((m) => m.id === id)?.name ?? "Untitled timer";

  async function logActivity(kind: string, description: string) {
    await supabase.from("activity_log").insert({ kind, description });
  }

  async function pauseOthers(exceptId?: string) {
    for (const t of timers) {
      if (t.is_running && t.id !== exceptId) {
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
  }

  // New timer: pick a matter → timer is created and starts immediately.
  async function startForMatter(matter: Matter) {
    await pauseOthers();
    await supabase.from("timers").insert({
      label: matter.name,
      matter_id: matter.id,
      accumulated_seconds: 0,
      is_running: true,
      last_started_at: new Date().toISOString(),
    });
    await logActivity("timer_started", `Timer started for ${matter.name}`);
    setPicking(false);
    await load();
  }

  async function resume(target: Timer) {
    await pauseOthers(target.id);
    await supabase
      .from("timers")
      .update({ is_running: true, last_started_at: new Date().toISOString() })
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
    await logActivity("timer_paused", `Timer paused for ${matterName(target.matter_id)}`);
    await load();
  }

  function openLog(target: Timer) {
    setLogTarget({
      timer: target,
      seconds: Math.floor(elapsedOf(target, Date.now())),
    });
  }

  async function removeTimer(target: Timer) {
    await supabase.from("timers").delete().eq("id", target.id);
    await load();
  }

  async function submitLog(fields: { activity: string; lawyer: string }) {
    if (!logTarget) return;
    const { timer, seconds } = logTarget;

    await supabase.from("time_entries").insert({
      matter_id: timer.matter_id,
      activity: fields.activity,
      lawyer: fields.lawyer || "Isa",
      duration_seconds: seconds,
    });
    await logActivity(
      "time_logged",
      `${fields.lawyer || "Isa"} logged ${fmt(seconds)} to ${matterName(
        timer.matter_id,
      )} (${fields.activity})`,
    );
    // Reset but keep the timer so more time can be added to the same matter.
    await supabase
      .from("timers")
      .update({
        accumulated_seconds: 0,
        is_running: false,
        last_started_at: null,
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
        <button
          className="tracker-add"
          onClick={() => setPicking(true)}
          type="button"
        >
          + New timer
        </button>
      </div>

      {open && (
        <div className="tracker-body">
          {timers.length === 0 && (
            <div className="tracker-empty">
              No timers running. Click “New timer” and choose a matter to begin.
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
                    {matterName(t.matter_id)}
                  </span>
                  <span className="timer-clock">{fmt(secs)}</span>
                </div>
                <div className="timer-controls">
                  {t.is_running ? (
                    <button onClick={() => pause(t)} type="button">
                      Pause
                    </button>
                  ) : (
                    <button onClick={() => resume(t)} type="button">
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

      {picking && (
        <div className="modal-backdrop" onClick={() => setPicking(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Start a timer</h3>
            <p className="modal-dur">Choose a matter to track time against:</p>
            {matters.length === 0 ? (
              <p className="muted-line">
                No matters yet. Add a matter first, then start a timer.
              </p>
            ) : (
              <div className="matter-pick">
                {matters.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className="matter-pick-item"
                    onClick={() => startForMatter(m)}
                  >
                    <span className="mp-name">{m.name}</span>
                    <span className="mp-sub">
                      {m.practice_area} · {m.assigned_to || "Unassigned"}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setPicking(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {logTarget && (
        <LogModal
          matterLabel={matterName(logTarget.timer.matter_id)}
          defaultLawyer={
            matters.find((m) => m.id === logTarget.timer.matter_id)
              ?.assigned_to || "Isa"
          }
          seconds={logTarget.seconds}
          onCancel={() => setLogTarget(null)}
          onSubmit={submitLog}
        />
      )}
    </div>
  );
}

function LogModal({
  matterLabel,
  defaultLawyer,
  seconds,
  onCancel,
  onSubmit,
}: {
  matterLabel: string;
  defaultLawyer: string;
  seconds: number;
  onCancel: () => void;
  onSubmit: (f: { activity: string; lawyer: string }) => void;
}) {
  const [activity, setActivity] = useState<string>(ACTIVITY_TYPES[0]);
  const [lawyer, setLawyer] = useState(defaultLawyer);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Log time</h3>
        <p className="modal-dur">
          {matterLabel} · <strong>{fmt(seconds)}</strong>
        </p>
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
            onClick={() => onSubmit({ activity, lawyer })}
          >
            Save entry
          </button>
        </div>
      </div>
    </div>
  );
}
