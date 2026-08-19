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
  { href: "/dashboard/documents", label: "Documents" },
];

export default function Sidebar({ userName }: { userName: string }) {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        Isa Abdur-Rahman
        <span>PLLC · Portal</span>
      </div>

      <nav className="sidebar-nav">
        {LINKS.map((l) => {
          const active =
            l.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={active ? "active" : undefined}
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
