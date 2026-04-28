import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Trash2, X, Minus } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail, fmtMoney } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const emptyForm = () => ({
  name: "", type: "original", device_name: "", compatible_devices: [], location: "",
  quantity: 0, low_stock_threshold: 2, cost_price: 0, sell_price: 0, notes: "",
});

function PartForm({ initial, onClose, onSaved }) {
  const { t } = useApp();
  const [form, setForm] = useState(initial || emptyForm());
  const [saving, setSaving] = useState(false);
  const [compatInput, setCompatInput] = useState("");

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        quantity: Number(form.quantity) || 0,
        low_stock_threshold: Number(form.low_stock_threshold) || 2,
        cost_price: Number(form.cost_price) || 0,
        sell_price: Number(form.sell_price) || 0,
        compatible_devices: form.compatible_devices || [],
      };
      if (initial?.id) await api.patch(`/spare-parts/${initial.id}`, payload);
      else await api.post("/spare-parts", payload);
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const addCompat = () => {
    const v = compatInput.trim(); if (!v) return;
    setForm({ ...form, compatible_devices: [...(form.compatible_devices || []), v] });
    setCompatInput("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()} data-testid="part-form">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{initial?.id ? t("edit") : t("add_part")}</h3>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <L label={t("part_name")} testId="p-name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("status")}</label>
              <select data-testid="p-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="premium-input">
                <option value="original">{t("type_original")}</option>
                <option value="copy">{t("type_copy")}</option>
              </select>
            </div>
            <L label={t("device_type")} testId="p-device" required value={form.device_name} onChange={(v) => setForm({ ...form, device_name: v })} />
            <L label={t("location")} testId="p-location" required value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
            <L label={t("quantity")} type="number" testId="p-qty" value={form.quantity} onChange={(v) => setForm({ ...form, quantity: v })} />
            <L label={t("cost_price")} type="number" testId="p-cost" value={form.cost_price} onChange={(v) => setForm({ ...form, cost_price: v })} />
            <L label={t("sell_price")} type="number" testId="p-sell" value={form.sell_price} onChange={(v) => setForm({ ...form, sell_price: v })} />
            <L label={t("kpi_low_stock")} type="number" testId="p-lowstock" value={form.low_stock_threshold} onChange={(v) => setForm({ ...form, low_stock_threshold: v })} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("compatible")}</label>
            <div className="flex gap-2 mb-2">
              <input data-testid="p-compat-input" value={compatInput} onChange={(e) => setCompatInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompat(); } }} placeholder="iPhone 13, 13 Pro..." className="flex-1 h-9 px-3 rounded-xl border border-border bg-transparent text-sm" />
              <button type="button" onClick={addCompat} data-testid="p-compat-add" className="h-9 px-3 rounded-xl border border-border text-xs">+</button>
            </div>
            <div className="flex flex-wrap gap-1">
              {(form.compatible_devices || []).map((d, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted">
                  {d}
                  <button type="button" onClick={() => setForm({ ...form, compatible_devices: form.compatible_devices.filter((_, idx) => idx !== i) })}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("notes")}</label>
            <textarea data-testid="p-notes" value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="premium-input" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-outline h-9">{t("cancel")}</button>
            <button type="submit" data-testid="p-submit" disabled={saving} className="btn-primary h-9">{t("save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function L({ label, testId, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">{label}</label>
      <input data-testid={testId} type={type} required={required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="premium-input" />
    </div>
  );
}

export default function SpareParts() {
  const { t, lang } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [settings, setSettings] = useState({});

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams(); if (q) params.set("q", q);
    const { data } = await api.get(`/spare-parts?${params}`);
    setItems(data);
  }, [q]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const del = async (p) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/spare-parts/${p.id}`); toast.success(t("saved")); fetchData(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };
  const use = async (p) => {
    try { await api.post(`/spare-parts/${p.id}/use`, { qty: 1 }); toast.success(t("saved")); fetchData(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const cur = settings.currency || "IQD";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight">{t("spare_parts")}</h1>
        <button onClick={() => setEditing({})} data-testid="add-part-btn" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
          <Plus className="w-4 h-4" /> {t("add_part")}
        </button>
      </div>
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute top-2.5 start-3 text-muted-foreground" />
        <input data-testid="parts-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="premium-input h-9 ps-9" />
      </div>
      <div className="swiss-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("part_name")}</th>
              <th>{t("device_type")}</th>
              <th>{t("compatible")}</th>
              <th>{t("location")}</th>
              <th>{t("quantity")}</th>
              <th>{t("sell_price")}</th>
              <th>{t("status")}</th>
              <th className="text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody data-testid="parts-table">
            {items.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-muted-foreground">{t("empty_state")}</td></tr>}
            {items.map((p) => (
              <tr key={p.id} data-testid={`part-row-${p.id}`}>
                <td><div className="font-medium">{p.name}</div>{p.notes && <div className="text-xs text-muted-foreground truncate max-w-[180px]">{p.notes}</div>}</td>
                <td>{p.device_name}</td>
                <td className="max-w-[200px]"><div className="flex flex-wrap gap-1">{(p.compatible_devices || []).slice(0, 3).map((d, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{d}</span>)}</div></td>
                <td className="text-xs"><span className="px-2 py-0.5 rounded bg-muted border border-border font-mono">{p.location}</span></td>
                <td className={`tabular font-medium ${p.quantity <= p.low_stock_threshold ? "text-warning" : ""}`}>{p.quantity}</td>
                <td className="tabular">{fmtMoney(p.sell_price, cur, lang)}</td>
                <td><span className={`text-xs px-2 py-0.5 rounded-full border ${p.type === "original" ? "border-success text-success" : "border-border"}`}>{t(`type_${p.type}`)}</span></td>
                <td>
                  <div className="flex justify-end gap-1">
                    {p.quantity > 0 && (
                      <button onClick={() => use(p)} data-testid={`use-part-${p.id}`} data-tip={t("use_part")} className="action-btn action-btn-pay tip"><Minus className="w-4 h-4" /></button>
                    )}
                    <button onClick={() => setEditing(p)} data-testid={`edit-part-${p.id}`} data-tip={t("edit")} className="action-btn action-btn-edit tip"><Edit className="w-4 h-4" /></button>
                    <button onClick={() => del(p)} data-testid={`delete-part-${p.id}`} data-tip={t("delete")} className="action-btn action-btn-delete tip"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <PartForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={fetchData} />}
    </div>
  );
}
