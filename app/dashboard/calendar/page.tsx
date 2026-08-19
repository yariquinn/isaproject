export const metadata = { title: "Calendar · Portal" };

export default function CalendarPage() {
  return (
    <div>
      <h1 className="page-title">Calendar</h1>
      <div className="drive-panel">
        <div className="drive-icon">📅</div>
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
