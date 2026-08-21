"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

// A tiny app-wide undo buffer. Any destructive action can register an
// undo entry (a label + an async restore function). The header shows an
// Undo button that runs the most recent one.
type UndoEntry = { label: string; restore: () => Promise<void> | void };

type UndoCtx = {
  canUndo: boolean;
  lastLabel: string | null;
  pushUndo: (label: string, restore: () => Promise<void> | void) => void;
  runUndo: () => Promise<void>;
};

const Ctx = createContext<UndoCtx | null>(null);

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const stack = useRef<UndoEntry[]>([]);
  const [lastLabel, setLastLabel] = useState<string | null>(null);

  const pushUndo = useCallback((label: string, restore: () => Promise<void> | void) => {
    stack.current.push({ label, restore });
    if (stack.current.length > 20) stack.current.shift();
    setLastLabel(label);
  }, []);

  const runUndo = useCallback(async () => {
    const entry = stack.current.pop();
    setLastLabel(stack.current.length ? stack.current[stack.current.length - 1].label : null);
    if (entry) await entry.restore();
  }, []);

  return (
    <Ctx.Provider value={{ canUndo: lastLabel !== null, lastLabel, pushUndo, runUndo }}>
      {children}
    </Ctx.Provider>
  );
}

export function useUndo(): UndoCtx {
  const c = useContext(Ctx);
  if (!c) {
    // Safe no-op fallback so components can call it unconditionally.
    return { canUndo: false, lastLabel: null, pushUndo: () => {}, runUndo: async () => {} };
  }
  return c;
}
