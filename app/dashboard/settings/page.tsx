"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { USER_ROLES, type UserSettings } from "@/lib/types";
import ThemeToggle from "../ThemeToggle";
import { usePortal } from "../PortalProvider";

type Section = "general" | "rates" | "permissions" | "notifications" | "timeline" | "integrations";
const SECTIONS: { key: Section; label: string }[] = [
  { key: "general", label: "General" },
  { key: "rates", label: "User Rates" },
  { key: "permissions", label: "Permissions" },
  { key: "notifications", label: "Notifications & Alerts" },
  { key: "timeline", label: "Case Timeline" },
  { key: "integrations", label: "Integrations" },
];

export default function SettingsPage() {
  const { userName } = usePortal();
  const [section, setSection] = useState<Section>("general");
  const [users, setUsers] = useState<UserSettings[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data } = await supabase.from("user_settings").select("*").order("name");
    setUsers((data as UserSettings[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const patch = async (name: string, changes: Partial<UserSettings>) => {
    setUsers((prev) => prev.map((u) => (u.name === name ? { ...u, ...changes } : u)));
    await supabase.from("user_settings").update(changes).eq("name", name);
  };

  const me = users.find((u) => u.name === userName);
  const canManageUsers = me?.can_manage_users ?? true;

  return (
    <div>
      <h1 className="page-title">Settings</h1>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              className={`settings-nav-item${section === s.key ? " active" : ""}`}
              onClick={() => setSection(s.key)}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-body">
          {section === "general" && (
            <>
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
                  <div><dt>Signed in as</dt><dd>{userName}</dd></div>
                  <div><dt>Role</dt><dd>{me?.role ?? "—"}</dd></div>
                </dl>
              </div>
            </>
          )}

          {section === "rates" && (
            <div className="panel">
              <h2 className="panel-title">User Rates</h2>
              <p className="field-note" style={{ marginBottom: "1rem" }}>
                Default hourly rate applied to each user&apos;s time entries.
              </p>
              {loading ? <p className="muted-line">Loading…</p> : (
                <table className="data-table">
                  <thead><tr><th>User</th><th>Role</th><th style={{ width: 160 }}>Hourly Rate</th></tr></thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.name}>
                        <td className="strong-cell">{u.name}</td>
                        <td>{u.role}</td>
                        <td>
                          <div className="rate-input">
                            <span>$</span>
                            <input
                              type="number" min={0} step={25} value={u.hourly_rate}
                              onChange={(e) => patch(u.name, { hourly_rate: Number(e.target.value) })}
                              disabled={!canManageUsers}
                            />
                            <span>/hr</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {section === "permissions" && (
            <div className="panel">
              <h2 className="panel-title">User Permissions</h2>
              {!canManageUsers && <p className="field-note" style={{ marginBottom: "1rem", color: "#c0392b" }}>You don&apos;t have permission to manage users.</p>}
              {loading ? <p className="muted-line">Loading…</p> : (
                <table className="data-table perms-table">
                  <thead>
                    <tr>
                      <th>User</th><th>Role</th><th>Billing</th><th>Users</th><th>Matters</th><th>Reports</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.name}>
                        <td className="strong-cell">{u.name}</td>
                        <td>
                          <select value={u.role} disabled={!canManageUsers} onChange={(e) => patch(u.name, { role: e.target.value })}>
                            {USER_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                        </td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.can_manage_billing} disabled={!canManageUsers} onChange={(e) => patch(u.name, { can_manage_billing: e.target.checked })} /></td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.can_manage_users} disabled={!canManageUsers} onChange={(e) => patch(u.name, { can_manage_users: e.target.checked })} /></td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.can_manage_matters} disabled={!canManageUsers} onChange={(e) => patch(u.name, { can_manage_matters: e.target.checked })} /></td>
                        <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.can_view_reports} disabled={!canManageUsers} onChange={(e) => patch(u.name, { can_view_reports: e.target.checked })} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {section === "notifications" && (
            <div className="panel">
              <h2 className="panel-title">Notifications &amp; Alerts</h2>
              <p className="field-note" style={{ marginBottom: "1rem" }}>
                Choose how each user is alerted about deadlines, tasks, and new activity.
              </p>
              {loading ? <p className="muted-line">Loading…</p> : (
                <table className="data-table">
                  <thead><tr><th>User</th><th style={{ textAlign: "center" }}>Email</th><th style={{ textAlign: "center" }}>Text</th><th style={{ textAlign: "center" }}>Website popup</th></tr></thead>
                  <tbody>
                    {users.map((u) => {
                      const editable = canManageUsers || u.name === userName;
                      return (
                        <tr key={u.name}>
                          <td className="strong-cell">{u.name}</td>
                          <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.notify_email} disabled={!editable} onChange={(e) => patch(u.name, { notify_email: e.target.checked })} /></td>
                          <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.notify_text} disabled={!editable} onChange={(e) => patch(u.name, { notify_text: e.target.checked })} /></td>
                          <td style={{ textAlign: "center" }}><input type="checkbox" checked={u.notify_popup} disabled={!editable} onChange={(e) => patch(u.name, { notify_popup: e.target.checked })} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {section === "timeline" && (
            <div className="panel">
              <h2 className="panel-title">Case Timeline</h2>
              <p className="field-note" style={{ marginBottom: "1rem" }}>
                Practice-area playbooks — LLC Formation, Estate Planning, Real Estate,
                and more — each carry their own timeline of checklists and tasks. Toggle
                a timeline on within a matter to guide the case step by step.
              </p>
              <div className="report-placeholder">Coming soon</div>
            </div>
          )}

          {section === "integrations" && (
            <div className="panel">
              <h2 className="panel-title">Integrations</h2>
              <p className="field-note" style={{ marginBottom: "1rem" }}>
                Connect external tools to sync calendars and email.
              </p>
              <div className="integration-row">
                <div>
                  <div className="settings-label">Google Calendar</div>
                  <p className="field-note">Two-way sync of events and deadlines.</p>
                </div>
                <button type="button" className="ghost sm" disabled>Coming soon</button>
              </div>
              <div className="integration-row">
                <div>
                  <div className="settings-label">Gmail</div>
                  <p className="field-note">Log client email against matters.</p>
                </div>
                <button type="button" className="ghost sm" disabled>Coming soon</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
