"use client";

import { useMemo, useState } from "react";

const PLACEHOLDER_DOCS = [
  { name: "Kent Ave — Purchase Agreement.pdf", matter: "Kent Ave Acquisition", updated: "2d ago" },
  { name: "Okafor — Last Will & Testament (draft).docx", matter: "Okafor Estate Plan", updated: "4d ago" },
  { name: "Crescent Center — Title Report.pdf", matter: "Crescent Center Purchase", updated: "1w ago" },
];

const FIRM_DOCS = [
  { name: "Engagement / Retainer Agreement Template.docx", category: "Templates", updated: "1w ago" },
  { name: "Employee Handbook.pdf", category: "HR / Policy", updated: "3w ago" },
  { name: "Firm Letterhead.docx", category: "Branding", updated: "1mo ago" },
  { name: "Trust Account (IOLTA) Reconciliation.xlsx", category: "Accounting", updated: "2d ago" },
  { name: "Conflict Check Policy.pdf", category: "Compliance", updated: "2mo ago" },
  { name: "Fee Schedule 2026.pdf", category: "Billing", updated: "5d ago" },
];

const TEMPLATES = [
  { name: "Residential Purchase Agreement", area: "Real Estate" },
  { name: "Operating Agreement (LLC)", area: "Business Law" },
  { name: "Last Will & Testament", area: "Family Estates" },
  { name: "Retainer / Engagement Letter", area: "General" },
  { name: "Deed of Sale", area: "Real Estate" },
];

type Esign = {
  doc: string;
  type: string;
  client: string;
  sent: string;
  signers: string[];
  status: "signed" | "awaiting";
};

const ESIGN: Esign[] = [
  { doc: "Engagement Letter", type: "LETTER", client: "The Okafor Family Estate", sent: "Aug 18th", signers: ["Ada Okafor"], status: "signed" },
  { doc: "Last Will & Testament", type: "WILL", client: "The Okafor Family Estate", sent: "Aug 18th", signers: ["Ada Okafor", "Chike Okafor"], status: "signed" },
  { doc: "Durable Power of Attorney", type: "POA", client: "The Okafor Family Estate", sent: "Aug 17th", signers: ["Chike Okafor"], status: "awaiting" },
  { doc: "Operating Agreement", type: "LLC", client: "Greenpoint Holdings LLC", sent: "Aug 15th", signers: ["Marcus Vale"], status: "awaiting" },
  { doc: "Engagement Letter", type: "LETTER", client: "Crescent Faith Center", sent: "Aug 12th", signers: ["Yusuf Bello"], status: "signed" },
  { doc: "Trust Agreement", type: "TRUST", client: "The Okafor Family Estate", sent: "Aug 9th", signers: ["Ada Okafor", "Chike Okafor"], status: "signed" },
  { doc: "Healthcare Proxy", type: "PROXY", client: "Crescent Faith Center", sent: "Aug 6th", signers: ["Yusuf Bello"], status: "signed" },
];

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function DocumentsPage() {
  const [tab, setTab] = useState<"documents" | "firm" | "templates" | "esign">("documents");
  const [esTab, setEsTab] = useState<"all" | "awaiting" | "signed">("all");
  const [clientFilter, setClientFilter] = useState<string>("all");

  const clientsList = useMemo(
    () => Array.from(new Set(ESIGN.map((e) => e.client))).sort(),
    [],
  );
  const counts = useMemo(
    () => ({
      all: ESIGN.length,
      awaiting: ESIGN.filter((e) => e.status === "awaiting").length,
      signed: ESIGN.filter((e) => e.status === "signed").length,
    }),
    [],
  );
  const esRows = useMemo(
    () =>
      ESIGN.filter((e) => (esTab === "all" ? true : e.status === esTab)).filter(
        (e) => (clientFilter === "all" ? true : e.client === clientFilter),
      ),
    [esTab, clientFilter],
  );

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Documents</h1>
      </div>

      <div className="doc-tabs">
        <button
          className={tab === "documents" ? "active" : undefined}
          onClick={() => setTab("documents")}
          type="button"
        >
          Client Documents
        </button>
        <button
          className={tab === "firm" ? "active" : undefined}
          onClick={() => setTab("firm")}
          type="button"
        >
          Firm Documents
        </button>
        <button
          className={tab === "templates" ? "active" : undefined}
          onClick={() => setTab("templates")}
          type="button"
        >
          Templates
        </button>
        <button
          className={tab === "esign" ? "active" : undefined}
          onClick={() => setTab("esign")}
          type="button"
        >
          E-Signature
        </button>
      </div>

      {tab === "templates" ? (
        <div className="table-wrap">
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
          <p className="muted-line" style={{ marginTop: "1rem" }}>
            Templates are demo entries — generating a document from a template is
            not functional yet.
          </p>
        </div>
      ) : tab === "documents" ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Matter</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {PLACEHOLDER_DOCS.map((d) => (
                <tr key={d.name}>
                  <td className="strong-cell">{d.name}</td>
                  <td>{d.matter}</td>
                  <td>{d.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted-line" style={{ marginTop: "1rem" }}>
            Document storage is a placeholder for this mockup.
          </p>
        </div>
      ) : tab === "firm" ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Category</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {FIRM_DOCS.map((d) => (
                <tr key={d.name}>
                  <td className="strong-cell">{d.name}</td>
                  <td>{d.category}</td>
                  <td>{d.updated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted-line" style={{ marginTop: "1rem" }}>
            Firm-wide documents (policies, templates, accounting) — placeholder for this mockup.
          </p>
        </div>
      ) : (
        <>
          <div className="es-head">
            <label className="es-filter">
              Client
              <select
                value={clientFilter}
                onChange={(e) => setClientFilter(e.target.value)}
              >
                <option value="all">All clients</option>
                {clientsList.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap">
            <table className="data-table es-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Client</th>
                  <th>Sent</th>
                  <th>Signers</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {esRows.map((e, i) => {
                  const total = e.signers.length;
                  const signed = e.status === "signed" ? total : 0;
                  return (
                    <tr key={`${e.doc}-${i}`}>
                      <td className="strong-cell">
                        {e.doc} <span className="es-type">{e.type}</span>
                      </td>
                      <td>{e.client}</td>
                      <td>{e.sent}</td>
                      <td>
                        {total > 1 ? (
                          <span className="es-signers">
                            {e.signers.map((s) => (
                              <span
                                key={s}
                                className={`es-avatar${e.status === "signed" ? " done" : ""}`}
                                title={s}
                              >
                                {initials(s)}
                              </span>
                            ))}
                            <span className="es-frac">
                              {signed}/{total}
                            </span>
                          </span>
                        ) : (
                          e.signers[0]
                        )}
                      </td>
                      <td>
                        <span className={`es-status es-${e.status}`}>
                          {e.status === "signed" ? "Signed" : "Awaiting client"}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="es-open">
                          {e.status === "signed" ? "View signed" : "Open"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted-line" style={{ marginTop: "1rem" }}>
            E-signature sending is a placeholder for this mockup.
          </p>
        </>
      )}
    </div>
  );
}
