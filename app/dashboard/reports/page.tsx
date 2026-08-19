import Disclaimer from "../Disclaimer";

export const metadata = { title: "Reports · Portal" };

const CARDS = [
  { label: "Revenue by month", note: "Bar chart" },
  { label: "Hours by attorney", note: "Breakdown" },
  { label: "Matters by practice area", note: "Pie chart" },
  { label: "Realization rate", note: "Billed vs. logged" },
];

export default function ReportsPage() {
  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <Disclaimer>
        Reporting is a demo — these cards are placeholders for charts that will
        be generated from live data later.
      </Disclaimer>

      <div className="cards" style={{ marginTop: "1.25rem" }}>
        {CARDS.map((c) => (
          <div className="card" key={c.label}>
            <h3>{c.label}</h3>
            <p>{c.note}</p>
            <div className="report-placeholder">Chart coming soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}
