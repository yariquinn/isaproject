import Link from "next/link";
import Disclaimer from "../../Disclaimer";

export const metadata = { title: "Templates · Portal" };

const TEMPLATES = [
  { name: "Residential Purchase Agreement", area: "Real Estate" },
  { name: "Operating Agreement (LLC)", area: "Business Law" },
  { name: "Last Will & Testament", area: "Family Estates" },
  { name: "Retainer / Engagement Letter", area: "General" },
  { name: "Deed of Sale", area: "Real Estate" },
];

export default function TemplatesPage() {
  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Document Templates</h1>
        <Link href="/dashboard/documents" className="link-btn">
          ← Documents
        </Link>
      </div>
      <Disclaimer>
        Templates are demo entries — generating a document from a template is
        not functional yet.
      </Disclaimer>

      <div className="table-wrap" style={{ marginTop: "1.25rem" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Template</th>
              <th>Practice Area</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {TEMPLATES.map((t) => (
              <tr key={t.name}>
                <td className="strong-cell">{t.name}</td>
                <td>{t.area}</td>
                <td className="actions-cell">
                  <button className="link-btn" type="button" disabled>
                    Use template
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
