"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import InvoiceEditor from "../../InvoiceEditor";

export default function InvoicePage({ params }: { params: { id: string } }) {
  // Back link honors where we came from: a matter opens back to that matter,
  // otherwise fall back to the general Billing page.
  const [back, setBack] = useState<{ href: string; label: string }>({
    href: "/dashboard/billing",
    label: "Billing",
  });
  useEffect(() => {
    try {
      const from = new URLSearchParams(window.location.search).get("from");
      if (from && from.startsWith("/dashboard/")) {
        setBack({ href: from, label: from.includes("/matters/") ? "Matter" : "Back" });
      }
    } catch { /* ignore */ }
  }, []);

  return (
    <div>
      <Link href={back.href} className="back-link">← {back.label}</Link>
      <InvoiceEditor invoiceId={params.id} fullPage />
    </div>
  );
}
