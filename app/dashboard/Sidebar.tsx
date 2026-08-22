"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import { usePortal } from "./PortalProvider";
import { logoutAction } from "./actions";

type NavItem = { href: string; label: string; children?: NavItem[] };
type Section = { key: string; label: string; href?: string; items: NavItem[] };

const SECTIONS: Section[] = [
  {
    key: "workspace",
    label: "Workspace",
    items: [
      { href: "/dashboard", label: "Dashboard" },
      { href: "/dashboard/clients", label: "Contacts" },
      { href: "/dashboard/matters", label: "Matters" },
    ],
  },
  {
    key: "practice",
    label: "Practice",
    items: [
      { href: "/dashboard/billing", label: "Billing Dashboard" },
      { href: "/dashboard/todo", label: "Tasks" },
      { href: "/dashboard/deadlines", label: "Deadlines" },
      { href: "/dashboard/reports", label: "Reports" },
      { href: "/dashboard/billing?tab=invoices", label: "Invoices" },
      { href: "/dashboard/billing?tab=time", label: "Time Entries" },
      { href: "/dashboard/intake", label: "Intake" },
    ],
  },
  {
    key: "files",
    label: "Files",
    items: [{ href: "/dashboard/documents", label: "Documents" }],
  },
];

// Destinations a custom pinned shortcut can point at.
const DESTINATIONS: { href: string; label: string }[] = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/contacts", label: "Contacts" },
  { href: "/dashboard/billing?tab=timesheet", label: "Timesheet" },
  { href: "/dashboard/matters", label: "Matters" },
  { href: "/dashboard/todo", label: "Tasks" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/intake", label: "Intake" },
  { href: "/dashboard/deadlines", label: "Deadlines" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/settings", label: "Settings" },
];

type Custom = { id: string; label: string; href: string };

function SidebarInner({ userName }: { userName: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const { canManageBilling } = usePortal();
  const initials =
    userName
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    const [hrefPath, hrefQuery] = href.split("?");
    // Billing links share one route (/dashboard/billing) and differ only by
    // ?tab= — match on the tab so Invoices/Time Entries highlight correctly
    // and Billing Dashboard only highlights on the plain (no-tab) view.
    if (hrefPath === "/dashboard/billing") {
      if (pathname !== "/dashboard/billing") return false;
      const hrefTab = hrefQuery ? new URLSearchParams(hrefQuery).get("tab") : null;
      if (!hrefTab) return currentTab !== "invoices" && currentTab !== "time";
      return currentTab === hrefTab;
    }
    return pathname === hrefPath || pathname.startsWith(hrefPath + "/");
  };

  // Collapse state (per section + per parent item), persisted per browser.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [custom, setCustom] = useState<Record<string, Custom[]>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [addLabel, setAddLabel] = useState("");
  const [addHref, setAddHref] = useState(DESTINATIONS[0].href);

  useEffect(() => {
    try {
      const c = localStorage.getItem("sidebarCollapsed");
      if (c) setCollapsed(JSON.parse(c));
      const x = localStorage.getItem("sidebarCustom");
      if (x) setCustom(JSON.parse(x));
    } catch {
      /* ignore */
    }
  }, []);

  const persistCollapsed = (next: Record<string, boolean>) => {
    setCollapsed(next);
    try {
      localStorage.setItem("sidebarCollapsed", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const persistCustom = (next: Record<string, Custom[]>) => {
    setCustom(next);
    try {
      localStorage.setItem("sidebarCustom", JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };
  const toggle = (key: string) =>
    persistCollapsed({ ...collapsed, [key]: !collapsed[key] });

  const startAdd = (sectionKey: string) => {
    setAdding(sectionKey);
    setAddLabel("");
    setAddHref(DESTINATIONS[0].href);
    persistCollapsed({ ...collapsed, [sectionKey]: false });
  };
  const saveAdd = (sectionKey: string) => {
    const label = addLabel.trim();
    if (!label) return;
    const item: Custom = {
      id: Math.random().toString(36).slice(2),
      label,
      href: addHref,
    };
    persistCustom({
      ...custom,
      [sectionKey]: [...(custom[sectionKey] ?? []), item],
    });
    setAdding(null);
  };
  const removeCustom = (sectionKey: string, id: string) => {
    persistCustom({
      ...custom,
      [sectionKey]: (custom[sectionKey] ?? []).filter((c) => c.id !== id),
    });
  };

  const renderItem = (item: NavItem) => {
    const hasChildren = !!item.children?.length;
    return (
      <div className="nav-item" key={item.href}>
        <div className={`nav-row${isActive(item.href) ? " active" : ""}`}>
          <span className="nav-caret-spacer" />
          <Link href={item.href} title={item.label} className="nav-link">
            <span className="nav-tx">{item.label}</span>
          </Link>
        </div>
        {hasChildren && (
          <div className="nav-children">
            {item.children!.map((c) => (
              <Link
                key={c.href}
                href={c.href}
                title={c.label}
                className={`nav-child${isActive(c.href) ? " active" : ""}`}
              >
                {c.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-inner">
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <span className="brand-kicker">Law Offices of</span>
            <span className="brand-name">Isa Abdur-Rahman</span>
            <span className="brand-sub">Employee Portal</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {SECTIONS.map((s) => {
            const open = !collapsed[s.key];
            const customItems = custom[s.key] ?? [];
            return (
              <div className="nav-group" key={s.key}>
                <div className="nav-section-head">
                  <button
                    type="button"
                    className={`nav-caret${open ? " open" : ""}`}
                    onClick={() => toggle(s.key)}
                    aria-label={open ? "Collapse section" : "Expand section"}
                  >
                    ›
                  </button>
                  {s.href ? (
                    <Link href={s.href} className={`nav-group-label nav-group-link${isActive(s.href) ? " active" : ""}`} title={s.label}>
                      {s.label}
                    </Link>
                  ) : (
                    <span className="nav-group-label" onClick={() => toggle(s.key)}>
                      {s.label}
                    </span>
                  )}
                  <button
                    type="button"
                    className="nav-add"
                    onClick={() => startAdd(s.key)}
                    title={`Add a shortcut under ${s.label}`}
                    aria-label={`Add a shortcut under ${s.label}`}
                  >
                    +
                  </button>
                </div>
                {open && (
                  <>
                    {s.items
                      .filter((it) => canManageBilling || it.href !== "/dashboard/billing?tab=invoices")
                      .map(renderItem)}
                    {customItems.map((c) => (
                      <div className="nav-item" key={c.id}>
                        <div className={`nav-row custom${isActive(c.href) ? " active" : ""}`}>
                          <span className="nav-caret-spacer" />
                          <Link href={c.href} title={c.label} className="nav-link">
                            <span className="nav-tx">{c.label}</span>
                          </Link>
                          <button
                            type="button"
                            className="nav-remove"
                            onClick={() => removeCustom(s.key, c.id)}
                            title="Remove shortcut"
                            aria-label="Remove shortcut"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                    {adding === s.key && (
                      <div className="nav-add-form">
                        <input
                          className="nav-add-input"
                          autoFocus
                          placeholder="Shortcut name…"
                          value={addLabel}
                          onChange={(e) => setAddLabel(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveAdd(s.key);
                            if (e.key === "Escape") setAdding(null);
                          }}
                        />
                        <select
                          className="nav-add-select"
                          value={addHref}
                          onChange={(e) => setAddHref(e.target.value)}
                        >
                          {DESTINATIONS.map((d) => (
                            <option key={d.href} value={d.href}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <div className="nav-add-actions">
                          <button type="button" className="nav-add-save" onClick={() => saveAdd(s.key)} disabled={!addLabel.trim()}>
                            Add
                          </button>
                          <button type="button" className="nav-add-cancel" onClick={() => setAdding(null)}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          <div className="user-card">
            <div className="user-avatar" title={userName}>{initials}</div>
            <div className="user-actions">
              <ThemeToggle />
              <Link
                href="/dashboard/settings"
                className={`signout-icon${isActive("/dashboard/settings") ? " active" : ""}`}
                title="Settings"
                aria-label="Settings"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="signout-icon" title="Sign out" aria-label="Sign out">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export default function Sidebar({ userName }: { userName: string }) {
  return (
    <Suspense fallback={<aside className="sidebar" />}>
      <SidebarInner userName={userName} />
    </Suspense>
  );
}
