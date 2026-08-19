"use client";

import Link from "next/link";
import { useState } from "react";

const PLACEHOLDER_DOCS = [
  { name: "Kent Ave — Purchase Agreement.pdf", matter: "Kent Ave Acquisition", updated: "2d ago" },
  { name: "Okafor — Last Will & Testament (draft).docx", matter: "Okafor Estate Plan", updated: "4d ago" },
  { name: "Crescent Center — Title Report.pdf", matter: "Crescent Center Purchase", updated: "1w ago" },
];

const ESIGN_DOCS = [
  { name: "Okafor — Last Will & Testament", matter: "Okafor Estate Plan", signer: "Ada Okafor", status: "signed" },
  { name: "Okafor — Durable Power of Attorney", matter: "Okafor Estate Plan", signer: "Chike Okafor", status: "awaiting" },
  { name: "Greenpoint — Operating Agreement", matter: "Greenpoint Formation", signer: "Marcus Vale", status: "sent" },
];

export default function DocumentsPage() {
  const [tab, setTab] = useState<"documents" | "esign">("documents");

  return (
    <div>
      <div className="page-head">
        <h1 className="page-title">Documents</h1>
        <Link href="/dashboard/documents/templates" className="btn">
          Templates
        </Link>
      </div>

      <div className="doc-tabs">
        <button
          className={tab === "documents" ? "active" : undefined}
          onClick={() => setTab("documents")}
          type="button"
        >
          Documents
        </button>
        <button
          className={tab === "esign" ? "active" : undefined}
          onClick={() => setTab("esign")}
          type="button"
        >
          E-Signature
        </button>
      </div>

      {tab === "documents" ? (
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
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Document</th>
                <th>Matter</th>
                <th>Signer</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ESIGN_DOCS.map((d) => (
                <tr key={d.name}>
                  <td className="strong-cell">{d.name}</td>
                  <td>{d.matter}</td>
                  <td>{d.signer}</td>
                  <td>
                    <span className={`pill esign-${d.status}`}>
                      {d.status === "signed"
                        ? "Signed"
                        : d.status === "awaiting"
                          ? "Awaiting"
                          : "Sent"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted-line" style={{ marginTop: "1rem" }}>
            E-signature sending is a placeholder for this mockup.
          </p>
        </div>
      )}
    </div>
  );
}
