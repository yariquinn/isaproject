"use client";

import { usePortal } from "./PortalProvider";

// Universal top bar. The breadcrumb lives in the page body; the header
// carries the "who's online" presence cluster on the right.
export default function AppHeader() {
  const { userName } = usePortal();
  const initials =
    (userName || "")
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";

  return (
    <header className="app-header">
      <div className="app-header-right">
        <span className="online-label">Online</span>
        <div className="online-people">
          <span className="online-avatar" title={`${userName} · online`}>
            {initials}
            <span className="online-dot" aria-hidden="true" />
          </span>
        </div>
      </div>
    </header>
  );
}
