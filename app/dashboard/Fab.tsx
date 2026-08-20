"use client";

import Link from "next/link";
import { useState } from "react";

// Floating quick-action button, shown on every dashboard page. Demo actions
// open an explainer modal; links navigate; the timer opens the sidebar tracker.
const DEMO_ACTIONS: Record<string, { label: string; note: string }> = {
  invoice: { label: "Create invoice", note: "Invoice creation would open here. Invoicing is a demo in this mockup." },
  payment: { label: "Record payment", note: "Recording a payment would mark an invoice paid. This is a demo action." },
  expense: { label: "Add expense", note: "Expense entry would open here. Expenses are a demo in this mockup." },
  document: { label: "Upload document", note: "Document upload would open here. Storage is a demo in this mockup." },
};

function Ic({ name }: { name: string }) {
  const p = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "timer":
      return (
        <svg {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2" /><path d="M9 2h6" /></svg>
      );
    case "invoice":
      return (
        <svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>
      );
    case "payment":
      return (
        <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>
      );
    case "expense":
      return (
        <svg {...p}><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
      );
    case "document":
      return (
        <svg {...p}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>
      );
    case "matter":
      return (
        <svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
      );
    case "client":
      return (
        <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
      );
    case "timesheet":
      return (
        <svg {...p}><rect x="3" y="4" width="18" height="16" rx="2" /><line x1="3" y1="10" x2="21" y2="10" /><line x1="9" y1="10" x2="9" y2="20" /></svg>
      );
    default:
      return null;
  }
}

type Shortcut = { key: string; label: string; icon: string; href?: string; action?: string };

const SHORTCUTS: Shortcut[] = [
  { key: "timer", label: "Start timer", icon: "timer", action: "timer" },
  { key: "invoice", label: "Create invoice", icon: "invoice", action: "invoice" },
  { key: "payment", label: "Record payment", icon: "payment", action: "payment" },
  { key: "expense", label: "Add expense", icon: "expense", action: "expense" },
  { key: "document", label: "Upload document", icon: "document", action: "document" },
  { key: "timesheet", label: "Timesheet", icon: "timesheet", href: "/dashboard/billing?tab=timesheet" },
  { key: "matter", label: "Add Matter", icon: "matter", href: "/dashboard/matters" },
  { key: "client", label: "Add Client", icon: "client", href: "/dashboard/clients" },
];

export default function Fab() {
  const [open, setOpen] = useState(false);
  const [qa, setQa] = useState<string | null>(null);

  const runAction = (action: string) => {
    setOpen(false);
    if (action === "timer") {
      window.dispatchEvent(new CustomEvent("open-timer"));
      return;
    }
    setQa(action);
  };

  const renderShortcut = (s: Shortcut) =>
    s.href ? (
      <Link key={s.key} href={s.href} className="qa-btn" onClick={() => setOpen(false)}>
        <span className="qa-icon"><Ic name={s.icon} /></span>
        {s.label}
      </Link>
    ) : (
      <button key={s.key} type="button" className="qa-btn" onClick={() => runAction(s.action!)}>
        <span className="qa-icon"><Ic name={s.icon} /></span>
        {s.label}
      </button>
    );

  return (
    <>
      <div className={`ov-fab-wrap${open ? " open" : ""}`}>
        <button
          type="button"
          className="ov-fab"
          onClick={() => setOpen((o) => !o)}
          aria-label="Quick actions"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
        <div className="ov-fab-menu">{SHORTCUTS.map(renderShortcut)}</div>
      </div>

      {qa && DEMO_ACTIONS[qa] && (
        <div className="modal-backdrop" onClick={() => setQa(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{DEMO_ACTIONS[qa].label}</h3>
            <p className="modal-dur">{DEMO_ACTIONS[qa].note}</p>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setQa(null)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
