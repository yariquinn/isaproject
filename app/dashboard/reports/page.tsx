import ReportsClient from "./ReportsClient";

export const metadata = { title: "Reports · Portal" };

export default function ReportsPage() {
  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <ReportsClient />
    </div>
  );
}
