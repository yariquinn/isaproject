"use client";

import ThemeToggle from "../ThemeToggle";
import { usePortal } from "../PortalProvider";

export default function SettingsPage() {
  const { userName } = usePortal();

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="panel" style={{ marginBottom: "1.5rem" }}>
        <h2 className="panel-title">Appearance</h2>
        <div className="settings-row">
          <div>
            <div className="settings-label">Theme</div>
            <p className="field-note">Switch between light and dark.</p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      <div className="panel">
        <h2 className="panel-title">Account</h2>
        <dl className="cc-fields">
          <div>
            <dt>Signed in as</dt>
            <dd>{userName}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
