"use client";

import { useState } from "react";

export default function Collapsible({
  title,
  empty,
  action,
  children,
}: {
  title: string;
  empty: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!empty);
  return (
    <div className="panel">
      <div className="panel-head">
        <button
          type="button"
          className="collapse-toggle"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="collapse-caret">{open ? "▾" : "▸"}</span>
          {title}
          {empty && !open && <span className="collapse-empty-tag">empty</span>}
        </button>
        {action}
      </div>
      {open && children}
    </div>
  );
}
