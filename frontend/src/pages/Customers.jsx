import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Trash2, X, Phone } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail, fmtMoney } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function CustomerForm({ initial, onClose, onSaved }) {
  const { t } = useApp();
  const [form, setForm] = useState(initial || { name: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (initial?.id) await api.patch(`/customers/${initial.id}`, form);
      else await api.post("/customers", form);
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()} data-testid="customer-form">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{initial?.id ? t("edit") : t("add")}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("name")}</label>
            <input data-testid="c-name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="premium-input" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("phone")}</label>
            <input data-testid="c-phone" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="premium-input" />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("notes")}</label>
            <textarea data-testid="c-notes" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="premium-input" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-9">{t("cancel")}</button>
            <button type="submit" data-testid="c-submit" disabled={saving} className="btn-primary h-9">{t("save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Customers() {
  const { t, lang } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState({});

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams(); if (q) params.set("q", q);
    const { data } = await api.get(`/customers?${params}`);
    setItems(data);
  }, [q]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const del = async (c) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/customers/${c.id}`); toast.success(t("saved")); fetchData(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const cur = settings.currency || "IQD";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight">{t("customers")}</h1>
        <button onClick={() => setEditing({})} data-testid="add-customer-btn" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> {t("add")}
        </button>
      </div>
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute top-2.5 start-3 text-muted-foreground" />
        <input data-testid="customer-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="premium-input h-9 ps-9" />
      </div>
      <div className="swiss-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr><th>{t("name")}</th><th>{t("phone")}</th><th>{t("kpi_debt_total")}</th><th>{t("notes")}</th><th className="text-end">{t("actions")}</th></tr>
          </thead>
          <tbody data-testid="customers-table">
            {items.length === 0 && <tr><td colSpan={5} className="text-center py-10 text-muted-foreground">{t("empty_state")}</td></tr>}
            {items.map((c) => (
              <tr key={c.id} data-testid={`customer-row-${c.id}`}>
                <td className="font-medium">{c.name}</td>
                <td className="font-mono text-sm"><a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:underline"><Phone className="w-3 h-3" />{c.phone}</a></td>
                <td className={`tabular ${c.total_debt > 0 ? "text-warning font-medium" : ""}`}>{fmtMoney(c.total_debt, cur, lang)}</td>
                <td className="text-xs text-muted-foreground max-w-[220px] truncate">{c.notes || "—"}</td>
                <td>
                  <div className="flex justify-end gap-1">
                    <button onClick={() => setEditing(c)} data-testid={`edit-customer-${c.id}`} data-tip={t("edit")} className="action-btn action-btn-edit tip"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => del(c)} data-testid={`delete-customer-${c.id}`} data-tip={t("delete")} className="action-btn action-btn-delete tip"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CustomerForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={fetchData} />}
    </div>
  );
}
