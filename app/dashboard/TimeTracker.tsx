"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { ACTIVITY_TYPES, type Matter, type Timer } from "@/lib/types";
import { usePortal } from "./PortalProvider";

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
  const { userName } = usePortal();
  const [timers, setTimers] = useState<Timer[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(true);
  const [picking, setPicking] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
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

  async function submitLog(fields: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
  }) {
    if (!logTarget) return;
    const { timer } = logTarget;
    const seconds = fields.seconds;
    const clientId =
      matters.find((m) => m.id === timer.matter_id)?.client_id ?? null;

    await supabase.from("time_entries").insert({
      matter_id: timer.matter_id,
      activity: fields.activity,
      lawyer: fields.lawyer || "Isa",
      duration_seconds: seconds,
      note: fields.note.trim() || null,
    });
    await supabase.from("activity_log").insert({
      kind: "time_logged",
      matter_id: timer.matter_id,
      client_id: clientId,
      description: `${userName} logged ${fmt(seconds)} to ${matterName(
        timer.matter_id,
      )} (${fields.activity})`,
    });
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
        <div
          className="modal-backdrop"
          onClick={() => {
            setPicking(false);
            setPickQuery("");
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Start a timer</h3>
            <p className="modal-dur">Search for a matter to track time against:</p>
            {matters.length === 0 ? (
              <p className="muted-line">
                No matters yet. Add a matter first, then start a timer.
              </p>
            ) : (
              <>
                <input
                  className="activity-search"
                  type="search"
                  autoFocus
                  placeholder="Search matters…"
                  value={pickQuery}
                  onChange={(e) => setPickQuery(e.target.value)}
                  style={{ width: "100%" }}
                />
                <div className="matter-pick">
                  {matters
                    .filter((m) => {
                      const q = pickQuery.trim().toLowerCase();
                      if (!q) return true;
                      return (
                        m.name.toLowerCase().includes(q) ||
                        (m.practice_area || "").toLowerCase().includes(q) ||
                        (m.assigned_to || "").toLowerCase().includes(q)
                      );
                    })
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="matter-pick-item"
                        onClick={() => {
                          setPickQuery("");
                          startForMatter(m);
                        }}
                      >
                        <span className="mp-name">{m.name}</span>
                        <span className="mp-sub">
                          {m.practice_area} · {m.assigned_to || "Unassigned"}
                        </span>
                      </button>
                    ))}
                </div>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setPicking(false);
                  setPickQuery("");
                }}
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
  onSubmit: (f: {
    activity: string;
    lawyer: string;
    note: string;
    seconds: number;
  }) => void;
}) {
  const [activity, setActivity] = useState<string>(ACTIVITY_TYPES[0]);
  const [lawyer, setLawyer] = useState(defaultLawyer);
  const [note, setNote] = useState("");
  const [h, setH] = useState(Math.floor(seconds / 3600));
  const [m, setM] = useState(Math.floor((seconds % 3600) / 60));
  const [s, setS] = useState(seconds % 60);

  const totalSeconds = h * 3600 + m * 60 + s;
  const num = (v: string) => Math.max(0, Number(v.replace(/[^0-9]/g, "")) || 0);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Log time</h3>
        <p className="modal-dur">{matterLabel}</p>
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
          Description
          <textarea
            rows={3}
            placeholder="What did you work on for the client?"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label>
          Lawyer
          <input value={lawyer} onChange={(e) => setLawyer(e.target.value)} />
        </label>
        <label>
          Duration (editable)
          <div className="dur-inputs">
            <input
              type="number"
              min={0}
              value={h}
              onChange={(e) => setH(num(e.target.value))}
            />
            <span>h</span>
            <input
              type="number"
              min={0}
              max={59}
              value={m}
              onChange={(e) => setM(Math.min(59, num(e.target.value)))}
            />
            <span>m</span>
            <input
              type="number"
              min={0}
              max={59}
              value={s}
              onChange={(e) => setS(Math.min(59, num(e.target.value)))}
            />
            <span>s</span>
          </div>
        </label>
        <div className="modal-actions">
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn"
            disabled={totalSeconds === 0}
            onClick={() =>
              onSubmit({ activity, lawyer, note, seconds: totalSeconds })
            }
          >
            Save entry
          </button>
        </div>
      </div>
    </div>
  );
}
