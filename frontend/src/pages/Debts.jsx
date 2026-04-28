import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Trash2, DollarSign, X } from "lucide-react";
import { toast } from "sonner";
import { api, fmtMoney, fmtDate, formatApiErrorDetail } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const emptyForm = () => ({ customer_name: "", customer_phone: "", amount_total: 0, due_date: "", notes: "" });

function DebtForm({ initial, onClose, onSaved }) {
  const { t } = useApp();
  const [form, setForm] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form, amount_total: Number(form.amount_total) || 0 };
      if (!payload.due_date) delete payload.due_date;
      if (initial?.id) await api.patch(`/debts/${initial.id}`, payload);
      else await api.post("/debts", payload);
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="debt-form">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{initial?.id ? t("edit") : t("add_debt")}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Labeled label={t("customer_name")} required testId="d-name" value={form.customer_name} onChange={(v) => setForm({ ...form, customer_name: v })} />
          <Labeled label={t("customer_phone")} required testId="d-phone" value={form.customer_phone} onChange={(v) => setForm({ ...form, customer_phone: v })} />
          <Labeled label={t("amount")} type="number" required testId="d-amount" value={form.amount_total} onChange={(v) => setForm({ ...form, amount_total: v })} />
          <Labeled label={t("due_date")} type="date" testId="d-due" value={form.due_date ? form.due_date.slice(0, 10) : ""} onChange={(v) => setForm({ ...form, due_date: v ? `${v}T00:00:00+00:00` : "" })} />
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("notes")}</label>
            <textarea data-testid="d-notes" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="premium-input" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-outline h-9">{t("cancel")}</button>
            <button type="submit" data-testid="d-submit" disabled={saving} className="btn-primary h-9">{t("save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Labeled({ label, testId, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">{label}</label>
      <input data-testid={testId} type={type} required={required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="premium-input" />
    </div>
  );
}

function PayDebt({ did, onClose, onSaved }) {
  const { t } = useApp();
  const [amount, setAmount] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/debts/${did}/pay`, { amount: Number(amount) });
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} data-testid="pay-debt-modal">
        <h3 className="font-semibold mb-4">{t("settle")}</h3>
        <form onSubmit={submit}>
          <input data-testid="pay-debt-amount" autoFocus required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("enter_amount")} className="w-full h-10 px-3 rounded-xl border border-border bg-transparent text-sm mb-3" />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-9 flex-1">{t("cancel")}</button>
            <button type="submit" data-testid="pay-debt-submit" className="btn-primary h-9 flex-1">{t("pay")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Debts() {
  const { t, lang } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); if (q) params.set("q", q); if (status) params.set("status", status);
      const { data } = await api.get(`/debts?${params}`);
      setItems(data);
    } finally { setLoading(false); }
  }, [q, status]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const del = async (d) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/debts/${d.id}`); toast.success(t("saved")); fetchData(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const cur = settings.currency || "IQD";
  const badge = (s) => ({ open: "border-warning text-warning", partially_paid: "border-[hsl(var(--accent))] text-[hsl(var(--accent))]", paid: "border-success text-success" })[s] || "";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight">{t("debts")}</h1>
        <button onClick={() => setEditing({})} data-testid="add-debt-btn" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> {t("add_debt")}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute top-2.5 start-3 text-muted-foreground" />
          <input data-testid="debt-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="premium-input h-9 ps-9" />
        </div>
        <select data-testid="debt-status" value={status} onChange={(e) => setStatus(e.target.value)} className="premium-input h-9 w-auto px-3">
          <option value="">{t("all")}</option>
          <option value="open">{t("in_progress")}</option>
          <option value="partially_paid">{t("paid")}</option>
          <option value="paid">{t("completed")}</option>
        </select>
      </div>

      <div className="swiss-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("customer")}</th>
              <th>{t("total")}</th>
              <th>{t("paid")}</th>
              <th>{t("remaining")}</th>
              <th>{t("due_date")}</th>
              <th>{t("status")}</th>
              <th className="text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody data-testid="debts-table">
            {loading && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">{t("loading")}</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">{t("empty_state")}</td></tr>}
            {items.map((d) => (
              <tr key={d.id} data-testid={`debt-row-${d.id}`}>
                <td><div className="font-medium">{d.customer_name}</div><div className="text-xs text-muted-foreground">{d.customer_phone}</div></td>
                <td className="tabular">{fmtMoney(d.amount_total, cur, lang)}</td>
                <td className="tabular">{fmtMoney(d.amount_paid, cur, lang)}</td>
                <td className={`tabular font-medium ${d.amount_remaining > 0 ? "text-warning" : "text-success"}`}>{fmtMoney(d.amount_remaining, cur, lang)}</td>
                <td className="text-xs">{d.due_date ? fmtDate(d.due_date, lang) : "—"}</td>
                <td><span className={`text-xs px-2 py-0.5 rounded-full border ${badge(d.status)}`}>{d.status}</span></td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {d.amount_remaining > 0 && (
                      <button onClick={() => setPaying(d.id)} data-testid={`pay-debt-${d.id}`} data-tip={t("settle")} className="action-btn action-btn-pay tip"><DollarSign className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => setEditing(d)} data-testid={`edit-debt-${d.id}`} data-tip={t("edit")} className="action-btn action-btn-edit tip"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => del(d)} data-testid={`delete-debt-${d.id}`} data-tip={t("delete")} className="action-btn action-btn-delete tip"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <DebtForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={fetchData} />}
      {paying && <PayDebt did={paying} onClose={() => setPaying(null)} onSaved={fetchData} />}
    </div>
  );
}
