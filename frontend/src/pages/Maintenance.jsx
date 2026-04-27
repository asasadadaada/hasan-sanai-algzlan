import React, { useEffect, useState, useCallback } from "react";
import { Plus, Search, Edit, Trash2, Printer, CheckCircle2, MessageCircle, DollarSign, X } from "lucide-react";
import { toast } from "sonner";
import { api, fmtMoney, buildWhatsappUrl, formatApiErrorDetail } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const emptyForm = () => ({
  customer_name: "", customer_phone: "", device_type: "", device_model: "", issue: "",
  parts_used: [], agreed_price: 0, paid_amount: 0, status: "in_progress",
});

function MaintenanceForm({ initial, onClose, onSaved }) {
  const { t } = useApp();
  const [form, setForm] = useState(initial || emptyForm());
  const [parts, setParts] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/spare-parts").then((r) => setParts(r.data)).catch(() => {});
  }, []);

  const addPart = () => setForm((f) => ({ ...f, parts_used: [...f.parts_used, { part_id: "", name: "", qty: 1, price: 0 }] }));
  const rmPart = (i) => setForm((f) => ({ ...f, parts_used: f.parts_used.filter((_, idx) => idx !== i) }));
  const updPart = (i, key, val) => setForm((f) => {
    const pu = [...f.parts_used]; pu[i] = { ...pu[i], [key]: val };
    if (key === "part_id" && val) {
      const p = parts.find((x) => x.id === val);
      if (p) { pu[i].name = p.name; pu[i].price = p.sell_price; }
    }
    return { ...f, parts_used: pu };
  });

  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = {
        ...form,
        agreed_price: Number(form.agreed_price) || 0,
        paid_amount: Number(form.paid_amount) || 0,
        parts_used: form.parts_used.map((p) => ({ ...p, qty: Number(p.qty)||1, price: Number(p.price)||0 })),
      };
      if (initial?.id) await api.patch(`/maintenance/${initial.id}`, payload);
      else await api.post("/maintenance", payload);
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) {
      toast.error(formatApiErrorDetail(e2.response?.data?.detail) || e2.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid="maintenance-form-modal">
        <div className="p-5 border-b border-border flex items-center justify-between sticky top-0 bg-card">
          <h3 className="font-semibold">{initial?.id ? t("edit") : t("add_maintenance")}</h3>
          <button onClick={onClose} data-testid="close-maintenance-form"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("customer_name")} testId="m-cust-name" required value={form.customer_name} onChange={(v) => setForm({ ...form, customer_name: v })} />
            <Field label={t("customer_phone")} testId="m-cust-phone" required value={form.customer_phone} onChange={(v) => setForm({ ...form, customer_phone: v })} />
            <Field label={t("device_type")} testId="m-device-type" required value={form.device_type} onChange={(v) => setForm({ ...form, device_type: v })} />
            <Field label={t("device_model")} testId="m-device-model" value={form.device_model} onChange={(v) => setForm({ ...form, device_model: v })} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block">{t("issue")}</label>
            <textarea data-testid="m-issue" required value={form.issue} onChange={(e) => setForm({ ...form, issue: e.target.value })} className="premium-input" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium">{t("parts_used")}</label>
              <button type="button" onClick={addPart} data-testid="m-add-part" className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">+ {t("add")}</button>
            </div>
            <div className="space-y-2">
              {form.parts_used.map((p, i) => (
                <div key={i} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2 items-end" data-testid={`m-part-${i}`}>
                  <div>
                    <select value={p.part_id || ""} onChange={(e) => updPart(i, "part_id", e.target.value)} data-testid={`m-part-select-${i}`} className="w-full h-9 rounded-xl border border-border bg-transparent px-2 text-xs">
                      <option value="">— {t("part_name")} —</option>
                      {parts.map((x) => (<option key={x.id} value={x.id}>{x.name} ({x.quantity})</option>))}
                    </select>
                    {!p.part_id && (
                      <input placeholder={t("part_name")} value={p.name} onChange={(e) => updPart(i, "name", e.target.value)} className="mt-1 w-full h-9 rounded-xl border border-border bg-transparent px-2 text-xs" />
                    )}
                  </div>
                  <input type="number" min="1" value={p.qty} onChange={(e) => updPart(i, "qty", e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-2 text-xs tabular" placeholder={t("quantity")} />
                  <input type="number" min="0" step="0.01" value={p.price} onChange={(e) => updPart(i, "price", e.target.value)} className="h-9 rounded-xl border border-border bg-transparent px-2 text-xs tabular" placeholder={t("cost_price")} />
                  <button type="button" onClick={() => rmPart(i)} className="h-9 w-9 rounded-md border border-border hover:bg-destructive/10"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label={t("agreed_price")} type="number" testId="m-agreed" value={form.agreed_price} onChange={(v) => setForm({ ...form, agreed_price: v })} />
            <Field label={t("paid_amount")} type="number" testId="m-paid" value={form.paid_amount} onChange={(v) => setForm({ ...form, paid_amount: v })} />
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("status")}</label>
              <select data-testid="m-status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="premium-input">
                <option value="in_progress">{t("in_progress")}</option>
                <option value="completed">{t("completed")}</option>
                <option value="delivered">{t("delivered")}</option>
                <option value="cancelled">{t("cancelled")}</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button type="button" onClick={onClose} className="btn-outline h-9">{t("cancel")}</button>
            <button type="submit" disabled={saving} data-testid="m-submit" className="px-4 h-9 rounded-xl bg-primary text-primary-foreground text-sm font-medium">{saving ? t("loading") : t("save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, testId, type = "text", value, onChange, required }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">{label}</label>
      <input data-testid={testId} type={type} required={required} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="premium-input" />
    </div>
  );
}

function PayModal({ mid, onClose, onSaved }) {
  const { t } = useApp();
  const [amount, setAmount] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/maintenance/${mid}/pay`, { amount: Number(amount) });
      toast.success(t("saved")); onSaved(); onClose();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} data-testid="pay-modal">
        <h3 className="font-semibold mb-4">{t("payment")}</h3>
        <form onSubmit={submit}>
          <input data-testid="pay-amount" autoFocus required type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t("enter_amount")} className="w-full h-10 px-3 rounded-xl border border-border bg-transparent text-sm mb-3" />
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="btn-outline h-9 flex-1">{t("cancel")}</button>
            <button type="submit" data-testid="pay-submit" className="btn-primary h-9 flex-1">{t("pay")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Maintenance() {
  const { t, lang } = useApp();
  const [items, setItems] = useState([]);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [editing, setEditing] = useState(null);
  const [paying, setPaying] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (statusFilter) params.set("status", statusFilter);
      const { data } = await api.get(`/maintenance?${params}`);
      setItems(data);
    } finally { setLoading(false); }
  }, [q, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const del = async (m) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/maintenance/${m.id}`); toast.success(t("saved")); fetchData(); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const complete = async (m) => {
    try {
      const { data } = await api.post(`/maintenance/${m.id}/complete`);
      fetchData();
      const url = buildWhatsappUrl(data.whatsapp_phone, data.whatsapp_message);
      window.open(url, "_blank");
      toast.success(t("saved"));
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const sendFollowup = async (m) => {
    try {
      const { data } = await api.post(`/maintenance/${m.id}/followup-sent`);
      fetchData();
      const url = buildWhatsappUrl(data.whatsapp_phone, data.whatsapp_message);
      window.open(url, "_blank");
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
  };

  const printInvoice = (m) => {
    window.open(`${BACKEND_URL}/api/invoices/maintenance/${m.id}`, "_blank");
  };

  const cur = settings.currency || "IQD";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-semibold tracking-tight">{t("maintenance")}</h1>
        <button onClick={() => setEditing({})} data-testid="add-maintenance-btn" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium active:scale-[0.98]">
          <Plus className="w-4 h-4" /> {t("add_maintenance")}
        </button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute top-2.5 start-3 text-muted-foreground" />
          <input data-testid="maint-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="premium-input h-9 ps-9" />
        </div>
        <select data-testid="maint-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="premium-input h-9 w-auto px-3">
          <option value="">{t("all")}</option>
          <option value="in_progress">{t("in_progress")}</option>
          <option value="completed">{t("completed")}</option>
          <option value="delivered">{t("delivered")}</option>
          <option value="cancelled">{t("cancelled")}</option>
        </select>
      </div>

      <div className="swiss-card overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("customer")}</th>
              <th>{t("device_type")}</th>
              <th>{t("issue")}</th>
              <th>{t("status")}</th>
              <th>{t("agreed_price")}</th>
              <th>{t("paid_amount")}</th>
              <th>{t("debt_amount")}</th>
              <th className="text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody data-testid="maintenance-table">
            {loading && <tr><td colSpan={8} className="text-center text-muted-foreground py-10">{t("loading")}</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={8} className="text-center text-muted-foreground py-10">{t("empty_state")}</td></tr>}
            {items.map((m) => (
              <tr key={m.id} data-testid={`maint-row-${m.id}`}>
                <td>
                  <div className="font-medium">{m.customer_name}</div>
                  <div className="text-xs text-muted-foreground">{m.customer_phone}</div>
                </td>
                <td>{m.device_type}<div className="text-xs text-muted-foreground">{m.device_model || ""}</div></td>
                <td className="max-w-[200px] truncate">{m.issue}</td>
                <td><span className="text-xs px-2 py-0.5 rounded-full border border-border">{t(m.status)}</span></td>
                <td className="tabular">{fmtMoney(m.agreed_price, cur, lang)}</td>
                <td className="tabular">{fmtMoney(m.paid_amount, cur, lang)}</td>
                <td className={`tabular ${m.debt_amount > 0 ? "text-warning font-medium" : ""}`}>{fmtMoney(m.debt_amount, cur, lang)}</td>
                <td>
                  <div className="flex items-center justify-end gap-1">
                    {m.debt_amount > 0 && (
                      <button title={t("pay")} onClick={() => setPaying(m.id)} data-testid={`pay-${m.id}`} className="p-1.5 rounded-lg hover:bg-muted press transition-colors"><DollarSign className="w-4 h-4" /></button>
                    )}
                    {(m.status === "in_progress" || m.status === "completed") && (
                      <button title={t("mark_complete")} onClick={() => complete(m)} data-testid={`complete-${m.id}`} className="p-1.5 rounded hover:bg-muted text-[hsl(var(--whatsapp))]"><CheckCircle2 className="w-4 h-4" /></button>
                    )}
                    {m.status === "delivered" && !m.follow_up_sent && (
                      <button title={t("send_followup")} onClick={() => sendFollowup(m)} data-testid={`followup-${m.id}`} className="p-1.5 rounded hover:bg-muted text-[hsl(var(--whatsapp))]"><MessageCircle className="w-4 h-4" /></button>
                    )}
                    <button title={t("print")} onClick={() => printInvoice(m)} data-testid={`print-${m.id}`} className="p-1.5 rounded-lg hover:bg-muted press transition-colors"><Printer className="w-4 h-4" /></button>
                    <button title={t("edit")} onClick={() => setEditing(m)} data-testid={`edit-${m.id}`} className="p-1.5 rounded-lg hover:bg-muted press transition-colors"><Edit className="w-4 h-4" /></button>
                    <button title={t("delete")} onClick={() => del(m)} data-testid={`delete-${m.id}`} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive press transition-colors"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <MaintenanceForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={fetchData} />}
      {paying && <PayModal mid={paying} onClose={() => setPaying(null)} onSaved={fetchData} />}
    </div>
  );
}
