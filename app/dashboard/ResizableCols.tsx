"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

// Two side-by-side panels with a draggable divider. The split ratio persists
// per `storageKey`. Collapses to a single column on narrow screens (CSS).
// Expects exactly two children (left panel, right panel).
export default function ResizableCols({
  children,
  storageKey,
  min = 0.25,
  max = 0.75,
}: {
  children: ReactNode;
  storageKey: string;
  min?: number;
  max?: number;
}) {
  const kids = Children.toArray(children);
  const left = kids[0] ?? null;
  const right = kids[1] ?? null;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) setRatio(Math.min(max, Math.max(min, v)));
      }
    } catch { /* ignore */ }
  }, [storageKey, min, max]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const r = Math.min(max, Math.max(min, (e.clientX - rect.left) / rect.width));
      setRatio(r);
    };
    const onUp = () => {
      setDragging(false);
      try { localStorage.setItem(storageKey, String(ratio)); } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, ratio, storageKey, min, max]);

  return (
    <div className="rz-cols" ref={wrapRef}>
      <div className="rz-pane" style={{ flexBasis: `${ratio * 100}%` }}>{left}</div>
      <div
        className={`rz-handle${dragging ? " dragging" : ""}`}
        onMouseDown={() => setDragging(true)}
        role="separator"
        aria-orientation="vertical"
        title="Drag to resize"
      >
        <span className="rz-grip" />
      </div>
      <div className="rz-pane" style={{ flexBasis: `${(1 - ratio) * 100}%` }}>{right}</div>
    </div>
  );
}
