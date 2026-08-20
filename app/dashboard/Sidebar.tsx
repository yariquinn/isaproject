"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import TimeTracker from "./TimeTracker";
import { logoutAction } from "./actions";

const GROUPS: {
  label?: string;
  items: { href: string; label: string; sub?: boolean }[];
}[] = [
  {
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/dashboard/clients", label: "Clients" },
      { href: "/dashboard/matters", label: "Matters" },
    ],
  },
  {
    items: [
      { href: "/dashboard/todo", label: "Tasks" },
      { href: "/dashboard/reports", label: "Reports" },
    ],
  },
  {
    items: [
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/intake", label: "Intake" },
    ],
  },
  {
    items: [
      { href: "/dashboard/calendar", label: "Calendar" },
      { href: "/dashboard/deadlines", label: "Deadlines", sub: true },
    ],
  },
  {
    items: [{ href: "/dashboard/documents", label: "Documents" }],
  },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const initials =
    userName
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

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
          {GROUPS.map((g, i) => (
            <div className="nav-group" key={i}>
              {g.label && <div className="nav-group-label">{g.label}</div>}
              {g.items.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  title={l.label}
                  className={`${isActive(l.href) ? "active" : ""}${l.sub ? " sub" : ""}`}
                >
                  <span className="nav-ic">{l.label[0]}</span>
                  <span className="nav-tx">{l.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-tracker">
          <TimeTracker />
        </div>

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
