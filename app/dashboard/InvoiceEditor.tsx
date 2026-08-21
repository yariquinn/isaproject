"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Firm identity for the invoice header. (Will become editable in Settings later.)
const FIRM = {
  name: "Law Offices of Isa Abdur-Rahman",
  line1: "123 Court Street, Suite 400",
  line2: "Brooklyn, NY 11201",
  email: "billing@isalaw.com",
  phone: "(347) 555-0100",
};

type Invoice = {
  id: string;
  matter_id: string | null;
  client_id: string | null;
  number: string | null;
  status: string | null;
  issued_date: string | null;
  due_date: string | null;
  notes: string | null;
  bill_to: string | null;
  terms: string | null;
  tax_rate: number | null;
  amount: number | null;
};
type Item = {
  id: string;
  invoice_id: string;
  item_date: string | null;
  description: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number | null;
  sort_order: number;
};

const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d: string | null) =>
  d ? new Date(d.slice(0, 10) + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

export default function InvoiceEditor({
  invoiceId,
  onClose,
  fullPage,
}: {
  invoiceId: string;
  onClose?: () => void;
  fullPage?: boolean;
}) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [matterName, setMatterName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");

  const load = useCallback(async () => {
    const { data: i } = await supabase.from("invoices").select("*").eq("id", invoiceId).single();
    const invoice = i as Invoice | null;
    setInv(invoice);
    const { data: it } = await supabase.from("invoice_items").select("*").eq("invoice_id", invoiceId).order("sort_order");
    setItems((it as Item[]) ?? []);
    if (invoice?.client_id) {
      const { data: c } = await supabase.from("clients").select("name").eq("id", invoice.client_id).single();
      setClientName((c as { name: string } | null)?.name ?? "");
    }
    if (invoice?.matter_id) {
      const { data: m } = await supabase.from("matters").select("name").eq("id", invoice.matter_id).single();
      setMatterName((m as { name: string } | null)?.name ?? "");
    }
    setLoading(false);
  }, [invoiceId]);
  useEffect(() => { load(); }, [load]);

  const subtotal = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  const taxRate = Number(inv?.tax_rate) || 0;
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  const patchInv = async (changes: Partial<Invoice>) => {
    if (!inv) return;
    setInv({ ...inv, ...changes });
    setSaving("saving");
    await supabase.from("invoices").update(changes).eq("id", inv.id);
    setSaving("saved");
  };
  // keep the invoice total in sync with the line items
  useEffect(() => {
    if (!inv || loading) return;
    if (Number(inv.amount) !== Number(total.toFixed(2))) {
      supabase.from("invoices").update({ amount: Number(total.toFixed(2)) }).eq("id", inv.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const addItem = async () => {
    if (!inv) return;
    const { data } = await supabase
      .from("invoice_items")
      .insert({ invoice_id: inv.id, item_date: new Date().toISOString().slice(0, 10), description: "", quantity: 1, rate: 0, amount: 0, sort_order: items.length })
      .select().single();
    if (data) setItems((prev) => [...prev, data as Item]);
  };
  const patchItem = async (id: string, changes: Partial<Item>) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const next = { ...it, ...changes };
      // recompute amount from qty * rate unless amount was directly edited
      if (("quantity" in changes || "rate" in changes)) {
        next.amount = Number(((Number(next.quantity) || 0) * (Number(next.rate) || 0)).toFixed(2));
      }
      return next;
    }));
    const it = items.find((x) => x.id === id);
    const merged = { ...it, ...changes } as Item;
    if ("quantity" in changes || "rate" in changes) {
      merged.amount = Number(((Number(merged.quantity) || 0) * (Number(merged.rate) || 0)).toFixed(2));
    }
    await supabase.from("invoice_items").update({
      item_date: merged.item_date, description: merged.description,
      quantity: merged.quantity, rate: merged.rate, amount: merged.amount,
    }).eq("id", id);
  };
  const removeItem = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
    await supabase.from("invoice_items").delete().eq("id", id);
  };

  // Pull this matter's time entries in as line items (one-time helper).
  const seedFromTime = async () => {
    if (!inv?.matter_id) return;
    const { data: te } = await supabase.from("time_entries").select("*").eq("matter_id", inv.matter_id);
    const { data: m } = await supabase.from("matters").select("hourly_rate,rate_type").eq("id", inv.matter_id).single();
    const rate = (m as { hourly_rate: number | null; rate_type: string | null } | null);
    const hourly = rate?.rate_type === "flat" ? 0 : (rate?.hourly_rate ?? 0);
    const rows = ((te as { activity: string | null; note: string | null; duration_seconds: number; logged_at: string; rate: number | null }[]) ?? []).map((e, idx) => {
      const hrs = Number((e.duration_seconds / 3600).toFixed(2));
      const r = e.rate ?? hourly;
      return {
        invoice_id: inv.id,
        item_date: e.logged_at.slice(0, 10),
        description: [e.activity, e.note].filter(Boolean).join(" — "),
        quantity: hrs,
        rate: r,
        amount: Number((hrs * r).toFixed(2)),
        sort_order: items.length + idx,
      };
    });
    if (rows.length === 0) return;
    const { data } = await supabase.from("invoice_items").insert(rows).select();
    if (data) setItems((prev) => [...prev, ...(data as Item[])]);
  };

  if (loading) return <p className="muted-line" style={{ padding: "2rem" }}>Loading invoice…</p>;
  if (!inv) return <p className="muted-line" style={{ padding: "2rem" }}>Invoice not found.</p>;

  return (
    <div className={`inv-editor${fullPage ? " inv-editor-full" : ""}`}>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <span className={`pill inv-${inv.status}`}>{inv.status}</span>
          <span className="inv-save-state">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}</span>
        </div>
        <div className="inv-toolbar-right">
          <button type="button" className="ghost sm" onClick={() => window.print()}>Print / PDF</button>
          {!fullPage && (
            <a className="ghost sm" href={`/dashboard/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer">Open full page ↗</a>
          )}
          {onClose && <button type="button" className="ghost sm" onClick={onClose}>Close</button>}
        </div>
      </div>

      <div className="inv-sheet">
        {/* Header */}
        <div className="inv-head">
          <div className="inv-firm">
            <div className="inv-firm-name">{FIRM.name}</div>
            <div className="inv-firm-line">{FIRM.line1}</div>
            <div className="inv-firm-line">{FIRM.line2}</div>
            <div className="inv-firm-line">{FIRM.email} · {FIRM.phone}</div>
          </div>
          <div className="inv-meta">
            <div className="inv-word">INVOICE</div>
            <div className="inv-meta-row"><span>Invoice #</span><input value={inv.number ?? ""} onChange={(e) => patchInv({ number: e.target.value })} /></div>
            <div className="inv-meta-row"><span>Date</span><input type="date" value={inv.issued_date?.slice(0, 10) ?? ""} onChange={(e) => patchInv({ issued_date: e.target.value || null })} /></div>
            <div className="inv-meta-row"><span>Due</span><input type="date" value={inv.due_date?.slice(0, 10) ?? ""} onChange={(e) => patchInv({ due_date: e.target.value || null })} /></div>
            <div className="inv-meta-row"><span>Status</span>
              <select value={inv.status ?? "draft"} onChange={(e) => patchInv({ status: e.target.value })}>
                {["draft", "sent", "viewed", "overdue", "paid"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Bill to */}
        <div className="inv-billto">
          <div className="inv-billto-label">Bill To</div>
          <textarea
            className="inv-billto-box"
            rows={3}
            placeholder={clientName || "Client name & address"}
            value={inv.bill_to ?? ""}
            onChange={(e) => patchInv({ bill_to: e.target.value })}
          />
          {matterName && <div className="inv-matter-ref">Re: {matterName}</div>}
        </div>

        {/* Line items */}
        <table className="inv-items">
          <thead>
            <tr>
              <th className="ii-date">Date</th>
              <th className="ii-desc">Description</th>
              <th className="ii-qty">Qty / Hrs</th>
              <th className="ii-rate">Rate</th>
              <th className="ii-amt">Amount</th>
              <th className="ii-x" aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr><td colSpan={6} className="muted-line" style={{ padding: "0.9rem" }}>No line items yet.</td></tr>
            )}
            {items.map((it) => (
              <tr key={it.id}>
                <td><input type="date" value={it.item_date?.slice(0, 10) ?? ""} onChange={(e) => patchItem(it.id, { item_date: e.target.value || null })} /></td>
                <td><input className="ii-desc-input" value={it.description ?? ""} placeholder="Description of service" onChange={(e) => patchItem(it.id, { description: e.target.value })} /></td>
                <td><input type="number" step="0.01" value={it.quantity ?? 0} onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) })} /></td>
                <td><input type="number" step="1" value={it.rate ?? 0} onChange={(e) => patchItem(it.id, { rate: Number(e.target.value) })} /></td>
                <td className="ii-amt-cell">{money(Number(it.amount) || 0)}</td>
                <td><button type="button" className="ct-del" aria-label="Remove line" onClick={() => removeItem(it.id)}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="inv-items-actions">
          <button type="button" className="ghost sm" onClick={addItem}>+ Add line</button>
          {inv.matter_id && <button type="button" className="ghost sm" onClick={seedFromTime}>Pull time entries</button>}
        </div>

        {/* Totals */}
        <div className="inv-totals">
          <div className="inv-total-row"><span>Subtotal</span><span>{money(subtotal)}</span></div>
          <div className="inv-total-row">
            <span>Tax
              <input className="inv-tax-input" type="number" step="0.1" value={inv.tax_rate ?? 0} onChange={(e) => patchInv({ tax_rate: Number(e.target.value) })} />%
            </span>
            <span>{money(tax)}</span>
          </div>
          <div className="inv-total-row inv-total-grand"><span>Total Due</span><span>{money(total)}</span></div>
        </div>

        {/* Terms / notes */}
        <div className="inv-terms">
          <div className="inv-terms-label">Notes / Payment Terms</div>
          <textarea rows={3} value={inv.terms ?? inv.notes ?? ""} placeholder="Payment due within 30 days. Make checks payable to the firm." onChange={(e) => patchInv({ terms: e.target.value })} />
        </div>
      </div>
    </div>
  );
}
