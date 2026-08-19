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
      { href: "/dashboard/time-entries", label: "Time Entries" },
      { href: "/dashboard/todo", label: "Tasks" },
    ],
  },
  {
    label: "Schedule",
    items: [
      { href: "/dashboard/deadlines", label: "Deadlines" },
      { href: "/dashboard/calendar", label: "Calendar" },
    ],
  },
  {
    label: "Business",
    items: [
      { href: "/dashboard/billing", label: "Billing" },
      { href: "/dashboard/intake", label: "Intake" },
      { href: "/dashboard/reports", label: "Reports" },
    ],
  },
  {
    label: "Documents",
    items: [
      { href: "/dashboard/documents", label: "Documents" },
      { href: "/dashboard/documents/templates", label: "Templates", sub: true },
      { href: "/dashboard/esignature", label: "E-Signature" },
    ],
  },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="sidebar-portal">Employee Portal</div>
        <div className="sidebar-firm">Isa Abdur-Rahman, PLLC</div>
      </div>

      <nav className="sidebar-nav">
        {GROUPS.map((g, i) => (
          <div className="nav-group" key={i}>
            {g.label && <div className="nav-group-label">{g.label}</div>}
            {g.items.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`${isActive(l.href) ? "active" : ""}${l.sub ? " sub" : ""}`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-tracker">
        <TimeTracker />
      </div>

      <div className="sidebar-foot">
        <ThemeToggle />
        <div className="sidebar-user">
          Signed in as
          <strong>{userName}</strong>
        </div>
        <form action={logoutAction}>
          <button type="submit" className="logout-btn">
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
