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
  rightHandle = false,
}: {
  children: ReactNode;
  storageKey: string;
  min?: number;
  max?: number;
  rightHandle?: boolean;
}) {
  const kids = Children.toArray(children);
  const left = kids[0] ?? null;
  const right = kids[1] ?? null;
  const single = !left || !right;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(0.5);
  const [dragging, setDragging] = useState(false);
  // Overall block width (fraction of the available row width), adjustable
  // from the far-right handle. 1 = full width.
  const [width, setWidth] = useState(1);
  const [wDragging, setWDragging] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const v = parseFloat(raw);
        if (!Number.isNaN(v)) setRatio(Math.min(max, Math.max(min, v)));
      }
      const rw = localStorage.getItem(`${storageKey}-w`);
      if (rw) {
        const v = parseFloat(rw);
        if (!Number.isNaN(v)) setWidth(Math.min(1, Math.max(0.55, v)));
      }
    } catch { /* ignore */ }
  }, [storageKey, min, max]);

  useEffect(() => {
    if (!wDragging) return;
    const onMove = (e: MouseEvent) => {
      const el = wrapRef.current?.parentElement;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const w = Math.min(1, Math.max(0.55, (e.clientX - rect.left) / rect.width));
      setWidth(w);
    };
    const onUp = () => {
      setWDragging(false);
      try { localStorage.setItem(`${storageKey}-w`, String(width)); } catch { /* ignore */ }
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
  }, [wDragging, width, storageKey]);

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
    <div className="rz-cols" ref={wrapRef} style={rightHandle ? { width: `${width * 100}%` } : undefined}>
      {single ? (
        <div className="rz-pane" style={{ flexBasis: "100%" }}>{left ?? right}</div>
      ) : (
        <>
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
          {rightHandle && (
            <div
              className={`rz-handle rz-handle-edge${wDragging ? " dragging" : ""}`}
              onMouseDown={() => setWDragging(true)}
              role="separator"
              aria-orientation="vertical"
              title="Drag to resize width"
            >
              <span className="rz-grip" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
