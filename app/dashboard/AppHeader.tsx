"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePortal, type Crumb } from "./PortalProvider";

const SECTION: Record<string, string> = {
  matters: "Matters",
  clients: "Clients",
  todo: "Tasks",
  reports: "Reports",
  billing: "Billing",
  intake: "Intake",
  calendar: "Calendar",
  deadlines: "Deadlines",
  documents: "Documents",
  settings: "Settings",
  "time-entries": "Time Entries",
};

export default function AppHeader() {
  const pathname = usePathname();
  const { crumbs } = usePortal();

  // Fall back to a path-derived crumb when a page hasn't set its own.
  const auto: Crumb[] = (() => {
    const parts = pathname.replace(/^\/dashboard\/?/, "").split("/").filter(Boolean);
    if (parts.length === 0) return [{ label: "Overview" }];
    const section = SECTION[parts[0]] ?? parts[0];
    return [{ label: section, href: `/dashboard/${parts[0]}` }];
  })();

  const items: Crumb[] = crumbs.length > 0 ? crumbs : auto;

  return (
    <header className="app-header">
      <nav className="app-crumbs" aria-label="Breadcrumb">
        {items.map((c, i) => {
          const isLast = i === items.length - 1;
          return (
            <span className="app-crumb" key={`${c.label}-${i}`}>
              {i > 0 && <span className="crumb-sep">/</span>}
              {c.href && !isLast ? (
                <Link href={c.href}>{c.label}</Link>
              ) : (
                <span className={isLast ? "crumb-current" : undefined}>{c.label}</span>
              )}
            </span>
          );
        })}
      </nav>
    </header>
  );
}
