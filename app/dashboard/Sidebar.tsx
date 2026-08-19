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
            Isa Abdur-Rahman
            <span>Employee Portal</span>
          </div>
          <ThemeToggle />
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
            <div className="user-avatar">{initials}</div>
            <div className="user-meta">
              <span className="user-name">{userName}</span>
              <span className="user-sub">Employee</span>
            </div>
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
    </aside>
  );
}
