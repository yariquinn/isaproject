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
      { href: "/dashboard/reports", label: "Reports", sub: true },
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
  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Isa Abdur-Rahman
        <span>Employee Portal</span>
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
        <div className="sidebar-user">
          <span>
            Signed in as <strong>{userName}</strong>
          </span>
          <ThemeToggle />
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
