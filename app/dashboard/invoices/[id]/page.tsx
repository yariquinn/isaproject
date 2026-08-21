"use client";

import Link from "next/link";
import InvoiceEditor from "../../InvoiceEditor";

export default function InvoicePage({ params }: { params: { id: string } }) {
  return (
    <div>
      <Link href="/dashboard/billing" className="back-link">← Billing</Link>
      <InvoiceEditor invoiceId={params.id} fullPage />
    </div>
  );
}
