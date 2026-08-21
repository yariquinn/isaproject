import Disclaimer from "../Disclaimer";
import ReportsClient from "./ReportsClient";

export const metadata = { title: "Reports · Portal" };

export default function ReportsPage() {
  return (
    <div>
      <h1 className="page-title">Reports</h1>
      <Disclaimer>
        Reports are generated from live invoice data. Figures reflect the demo
        dataset in this environment.
      </Disclaimer>

      <ReportsClient />
    </div>
  );
}
