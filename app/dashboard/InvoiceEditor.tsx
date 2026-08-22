"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { usePortal } from "./PortalProvider";

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
  created_at: string | null;
  issued_date: string | null;
  due_date: string | null;
  notes: string | null;
  bill_to: string | null;
  terms: string | null;
  tax_rate: number | null;
  amount: number | null;
  sent_at: string | null;
  viewed_at: string | null;
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
  preview,
}: {
  invoiceId: string;
  onClose?: () => void;
  fullPage?: boolean;
  preview?: boolean;
}) {
  const { userName } = usePortal();
  // In `preview` mode the invoice opens as a read-only PDF-style view; the
  // Edit button flips it into the editable editor.
  const [editing, setEditing] = useState(!preview);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [clientName, setClientName] = useState<string>("");
  const [matterName, setMatterName] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  // Always-present blank row at the bottom of the line items for adding inline.
  const emptyDraft = { item_date: new Date().toISOString().slice(0, 10), description: "", quantity: "", rate: "" };
  const [draft, setDraft] = useState(emptyDraft);

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
  // Commit the inline draft row into a real line item, then reset it.
  const commitDraft = async () => {
    if (!inv) return;
    const qty = Number(draft.quantity) || 0;
    const rate = Number(draft.rate) || 0;
    if (!draft.description.trim() && !qty && !rate) return;
    const { data } = await supabase
      .from("invoice_items")
      .insert({
        invoice_id: inv.id,
        item_date: draft.item_date || null,
        description: draft.description.trim(),
        quantity: qty,
        rate: rate,
        amount: Number((qty * rate).toFixed(2)),
        sort_order: items.length,
      })
      .select().single();
    if (data) setItems((prev) => [...prev, data as Item]);
    // A billable line with hours is also recorded as a system time entry
    // (already invoiced, so it won't be pulled onto another invoice).
    if (inv.matter_id && qty > 0) {
      await supabase.from("time_entries").insert({
        matter_id: inv.matter_id,
        activity: null,
        lawyer: userName,
        duration_seconds: Math.round(qty * 3600),
        note: draft.description.trim() || null,
        billable: true,
        invoiced: true,
        rate: rate || null,
        logged_at: new Date((draft.item_date || new Date().toISOString().slice(0, 10)) + "T12:00:00").toISOString(),
      });
    }
    setDraft({ ...emptyDraft });
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

  // Pull this matter's UN-invoiced time entries within a date range as line
  // items, then mark them invoiced so they can't land on another invoice.
  const [pullFrom, setPullFrom] = useState("");
  const [pullTo, setPullTo] = useState("");
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState("");
  const pullRange = async () => {
    if (!inv?.matter_id || pulling) return;
    setPulling(true);
    setPullMsg("");
    let q = supabase.from("time_entries").select("*").eq("matter_id", inv.matter_id).eq("invoiced", false);
    if (pullFrom) q = q.gte("logged_at", pullFrom);
    if (pullTo) q = q.lte("logged_at", pullTo + "T23:59:59");
    const { data: te } = await q.order("logged_at");
    const entries = (te as { id: string; activity: string | null; note: string | null; duration_seconds: number; logged_at: string; rate: number | null }[]) ?? [];
    if (entries.length === 0) {
      setPulling(false);
      setPullMsg("No un-invoiced entries in that range.");
      setTimeout(() => setPullMsg(""), 4000);
      return;
    }
    const { data: m } = await supabase.from("matters").select("hourly_rate,rate_type").eq("id", inv.matter_id).single();
    const rate = (m as { hourly_rate: number | null; rate_type: string | null } | null);
    // On a flat-fee matter the time entries are documented at $0 and the flat
    // fee is billed once as its own separate line item.
    const isFlat = rate?.rate_type === "flat";
    const hourly = isFlat ? 0 : (rate?.hourly_rate ?? 0);
    const rows = entries.map((e, idx) => {
      const hrs = Number((e.duration_seconds / 3600).toFixed(2));
      const r = isFlat ? 0 : (e.rate ?? hourly);
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
    // Flat fee: add it once, separate from the time entries.
    const flatAmount = rate?.hourly_rate ?? 0;
    const hasFlatFee = items.some((it) => (it.description ?? "").toLowerCase().startsWith("flat fee"));
    if (isFlat && flatAmount > 0 && !hasFlatFee) {
      rows.push({
        invoice_id: inv.id,
        item_date: new Date().toISOString().slice(0, 10),
        description: "Flat fee",
        quantity: 1,
        rate: flatAmount,
        amount: Number(flatAmount.toFixed(2)),
        sort_order: items.length + rows.length,
      });
    }
    const { data } = await supabase.from("invoice_items").insert(rows).select();
    if (data) setItems((prev) => [...prev, ...(data as Item[])]);
    await supabase.from("time_entries").update({ invoiced: true }).in("id", entries.map((e) => e.id));
    setPulling(false);
    setPullMsg(`Pulled ${entries.length} entr${entries.length === 1 ? "y" : "ies"}${isFlat && flatAmount > 0 && !hasFlatFee ? " + flat fee" : ""}.`);
    setTimeout(() => setPullMsg(""), 4000);
  };

  if (loading) return <p className="muted-line" style={{ padding: "2rem" }}>Loading invoice…</p>;
  if (!inv) return <p className="muted-line" style={{ padding: "2rem" }}>Invoice not found.</p>;

  // Status is derived, never hand-edited: paid > overdue > viewed > sent > created.
  const derivedStatus: string = (() => {
    if (inv.status === "paid") return "paid";
    const overdue = inv.due_date != null && inv.due_date.slice(0, 10) < new Date().toISOString().slice(0, 10);
    if (overdue) return "overdue";
    if (inv.viewed_at || inv.status === "viewed") return "viewed";
    if (inv.sent_at || inv.status === "sent") return "sent";
    return "created";
  })();

  return (
    <div className={`inv-editor${fullPage ? " inv-editor-full" : ""}`}>
      <div className="inv-toolbar">
        <div className="inv-toolbar-left">
          <span className={`pill inv-${derivedStatus}`}>{derivedStatus}</span>
          <span className="inv-save-state">{saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}</span>
        </div>
        <div className="inv-toolbar-right">
          {preview && (
            editing ? (
              <button type="button" className="ghost sm" onClick={() => setEditing(false)}>Done editing</button>
            ) : (
              <button type="button" className="btn sm" onClick={() => setEditing(true)}>Edit</button>
            )
          )}
          <button type="button" className="ghost sm" onClick={() => window.print()}>Print / PDF</button>
          {!fullPage && (
            <a className="ghost sm" href={`/dashboard/invoices/${inv.id}`} target="_blank" rel="noopener noreferrer">Open full page ↗</a>
          )}
          {onClose && <button type="button" className="ghost sm" onClick={onClose}>Close</button>}
        </div>
      </div>

      <div className={`inv-sheet printable${editing ? " inv-sheet-editing" : " inv-sheet-preview"}`}>
        {/* Header */}
        <div className="inv-head">
          <div className="inv-head-left">
            <div className="inv-firm">
              <div className="inv-firm-name">{FIRM.name}</div>
              <div className="inv-firm-line">{FIRM.line1}</div>
              <div className="inv-firm-line">{FIRM.line2}</div>
              <div className="inv-firm-line">{FIRM.email} · {FIRM.phone}</div>
            </div>
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
          </div>
          <div className="inv-meta">
            <div className="inv-word">INVOICE</div>
            <div className="inv-meta-row"><span>Invoice #</span><input value={inv.number ?? ""} onChange={(e) => patchInv({ number: e.target.value })} /></div>
            <div className="inv-meta-row"><span>Created</span><input type="date" value={inv.created_at?.slice(0, 10) ?? ""} onChange={(e) => patchInv({ created_at: e.target.value || null })} /></div>
            <div className="inv-meta-row"><span>Due</span><input type="date" value={inv.due_date?.slice(0, 10) ?? ""} onChange={(e) => patchInv({ due_date: e.target.value || null })} /></div>
            <div className="inv-meta-row"><span>Status</span><span className="inv-meta-static">{derivedStatus}</span></div>
          </div>
        </div>

        {/* Pull time entries by date range (marks them invoiced) */}
        {editing && inv.matter_id && (
          <div className="inv-pull-range">
            <span className="inv-pull-label">Pull time entries</span>
            <label>From<input type="date" value={pullFrom} onChange={(e) => setPullFrom(e.target.value)} /></label>
            <label>To<input type="date" value={pullTo} onChange={(e) => setPullTo(e.target.value)} /></label>
            <button type="button" className="ghost sm" onClick={pullRange} disabled={pulling}>
              {pulling ? "Pulling…" : "Pull"}
            </button>
            {pullMsg && <span className="inv-pull-msg">{pullMsg}</span>}
          </div>
        )}

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
            {editing && (
              <tr className="ii-draft-row" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitDraft(); } }}>
                <td><input type="date" value={draft.item_date} onChange={(e) => setDraft({ ...draft, item_date: e.target.value })} /></td>
                <td><input className="ii-desc-input" value={draft.description} placeholder="Add a line…" onChange={(e) => setDraft({ ...draft, description: e.target.value })} onBlur={commitDraft} /></td>
                <td><input type="number" step="0.01" value={draft.quantity} placeholder="0" onChange={(e) => setDraft({ ...draft, quantity: e.target.value })} onBlur={commitDraft} /></td>
                <td><input type="number" step="1" value={draft.rate} placeholder="0" onChange={(e) => setDraft({ ...draft, rate: e.target.value })} onBlur={commitDraft} /></td>
                <td className="ii-amt-cell">{money((Number(draft.quantity) || 0) * (Number(draft.rate) || 0))}</td>
                <td aria-hidden="true" />
              </tr>
            )}
          </tbody>
        </table>

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
