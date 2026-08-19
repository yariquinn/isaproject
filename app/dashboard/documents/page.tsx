"use client";

import Link from "next/link";
import { useState } from "react";

const PLACEHOLDER_DOCS = [
  { name: "Kent Ave — Purchase Agreement.pdf", matter: "Kent Ave Acquisition", updated: "2d ago" },
  { name: "Okafor — Last Will & Testament (draft).docx", matter: "Okafor Estate Plan", updated: "4d ago" },
  { name: "Crescent Center — Title Report.pdf", matter: "Crescent Center Purchase", updated: "1w ago" },
];

export default function DocumentsPage() {
  const [tab, setTab] = useState<"documents" | "drive">("documents");

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
          className={tab === "drive" ? "active" : undefined}
          onClick={() => setTab("drive")}
          type="button"
        >
          Google Drive
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
        <div className="drive-panel">
          <div className="drive-icon">▲</div>
          <h2>Connect Google Drive</h2>
          <p>
            View and manage matter documents directly from Google Drive. This
            connection will be set up later.
          </p>
          <button className="btn" type="button" disabled>
            Open Google Drive
          </button>
          <p className="muted-line">Not connected yet.</p>
        </div>
      )}
    </div>
  );
}
