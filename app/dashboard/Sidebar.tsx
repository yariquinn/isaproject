"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "./ThemeToggle";
import TimeTracker from "./TimeTracker";
import { logoutAction } from "./actions";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/clients", label: "Clients" },
  { href: "/dashboard/matters", label: "Matters" },
  { href: "/dashboard/time-entries", label: "Time Entries" },
  { href: "/dashboard/todo", label: "Tasks" },
  { href: "/dashboard/deadlines", label: "Deadlines" },
  { href: "/dashboard/calendar", label: "Calendar" },
  { href: "/dashboard/billing", label: "Billing" },
  { href: "/dashboard/intake", label: "Intake" },
  { href: "/dashboard/reports", label: "Reports" },
  { href: "/dashboard/documents", label: "Documents" },
  { href: "/dashboard/documents/templates", label: "Templates", sub: true },
  { href: "/dashboard/esignature", label: "E-Signature" },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="portal-switch" title="Client portal coming soon">
        <span>Employee Portal</span>
        <span className="portal-caret">▾</span>
      </div>

      <div className="sidebar-brand">
        Isa Abdur-Rahman
        <span>PLLC</span>
      </div>

      <nav className="sidebar-nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`${active ? "active" : ""}${l.sub ? " sub" : ""}`}
            >
              {l.label}
            </Link>
          );
        })}
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
