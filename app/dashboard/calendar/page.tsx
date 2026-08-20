export const metadata = { title: "Calendar · Portal" };

export default function CalendarPage() {
  return (
    <div>
      <h1 className="page-title">Calendar</h1>
      <div className="drive-panel">
        <div className="drive-icon">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
        </div>
        <h2>Connect Google Calendar</h2>
        <p>
          See your deadlines, hearings, and appointments alongside your matters.
          This connection will be set up later.
        </p>
        <button className="btn" type="button" disabled>
          Connect Google Calendar
        </button>
        <p className="muted-line">Not connected yet.</p>
      </div>
    </div>
  );
}
