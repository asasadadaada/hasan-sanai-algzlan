import React, { useEffect, useState, useCallback, useRef } from "react";
import { Plus, Search, Edit, Trash2, X, Send, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { api, formatApiErrorDetail, fmtMoney } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

// Convert a local phone (e.g. 07701234567) to WhatsApp international (9647701234567).
// If the phone already starts with "+" or a country-code digit pattern, strip non-digits only.
function phoneToWa(phone) {
  let p = String(phone || "").replace(/\D/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "964" + p.slice(1); // default Iraq
  return p;
}

function waUrl(phone, message) {
  const p = phoneToWa(phone);
  if (!p) return "";
  const base = `https://wa.me/${p}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

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

function BulkWhatsAppModal({ items, onClose }) {
  const { lang } = useApp();
  const ar = lang === "ar";
  const [selected, setSelected] = useState(() => new Set(items.map((c) => c.id)));
  const [message, setMessage] = useState(
    ar
      ? "السلام عليكم، شكراً لتعاملكم مع مركز ام الكبر والغزلان."
      : "Hello, thank you for choosing Um Al-Kabar & Al-Ghazlan Center."
  );
  const [delay, setDelay] = useState(8);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, currentName: "" });
  const cancelRef = useRef(false);

  const toggle = (id) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(items.map((c) => c.id)));
  };

  const start = async () => {
    const list = items.filter((c) => selected.has(c.id) && c.phone);
    if (list.length === 0) {
      toast.error(ar ? "لم يتم اختيار أي زبون" : "No customer selected");
      return;
    }
    if (!message.trim()) {
      toast.error(ar ? "الرسالة فارغة" : "Message is empty");
      return;
    }
    const sec = Math.max(1, Math.min(120, parseInt(delay, 10) || 8));
    cancelRef.current = false;
    setSending(true);
    setProgress({ done: 0, total: list.length, currentName: list[0]?.name || "" });

    for (let i = 0; i < list.length; i++) {
      if (cancelRef.current) break;
      const c = list[i];
      const personalized = message.replace(/\{name\}/g, c.name || "").replace(/\{الاسم\}/g, c.name || "");
      const url = waUrl(c.phone, personalized);
      if (url) {
        const w = window.open(url, "_blank", "noopener,noreferrer");
        if (!w && i === 0) {
          toast.error(ar ? "الرجاء السماح بالنوافذ المنبثقة في المتصفح" : "Please allow pop-ups in your browser");
          setSending(false);
          return;
        }
      }
      setProgress({ done: i + 1, total: list.length, currentName: list[i + 1]?.name || "" });
      if (i < list.length - 1) {
        await new Promise((r) => setTimeout(r, sec * 1000));
      }
    }
    setSending(false);
    toast.success(ar ? `تم إرسال ${progress.done || list.length} رسالة` : `Sent ${list.length} messages`);
    if (!cancelRef.current) onClose();
  };

  const cancel = () => { cancelRef.current = true; };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={sending ? undefined : onClose}>
      <div className="bg-card border border-border rounded-2xl w-full max-w-2xl p-5 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()} data-testid="bulk-wa-modal">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-[hsl(var(--whatsapp))]" />
            {ar ? "إرسال واتساب جماعي" : "Bulk WhatsApp"}
          </h3>
          <button onClick={onClose} disabled={sending}><X className="w-4 h-4" /></button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <div>
            <label className="text-xs font-medium mb-1.5 block">
              {ar ? "نص الرسالة" : "Message"}
              <span className="text-muted-foreground ms-2 font-normal">
                {ar ? "(يمكنك استخدام {name} لإضافة اسم الزبون)" : "(use {name} for customer name)"}
              </span>
            </label>
            <textarea
              data-testid="bulk-wa-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="premium-input"
              disabled={sending}
            />
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium mb-1.5 block">
                {ar ? "الثواني بين كل رسالة" : "Seconds between messages"}
              </label>
              <input
                data-testid="bulk-wa-delay"
                type="number"
                min={1}
                max={120}
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                className="premium-input"
                disabled={sending}
              />
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                {ar
                  ? "ينصح بـ 8-15 ثانية لتجنب حظر واتساب."
                  : "Recommended 8-15 sec to avoid WhatsApp blocking."}
              </p>
            </div>
            <div className="rounded-xl bg-muted/50 border border-border p-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{ar ? "المحددون" : "Selected"}</span>
                <span className="font-mono font-bold text-primary">{selected.size} / {items.length}</span>
              </div>
              <button
                onClick={toggleAll}
                disabled={sending}
                data-testid="bulk-wa-toggle-all"
                className="mt-2 w-full h-8 rounded-lg border border-border text-xs font-medium hover:bg-muted press"
              >
                {allSelected ? (ar ? "إلغاء تحديد الكل" : "Deselect all") : (ar ? "تحديد الكل" : "Select all")}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto border border-border rounded-xl mb-3" style={{ maxHeight: "260px" }}>
          <table className="w-full text-sm">
            <tbody>
              {items.length === 0 && (
                <tr><td className="text-center py-6 text-muted-foreground text-xs">{ar ? "لا يوجد زبائن" : "No customers"}</td></tr>
              )}
              {items.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2 w-8">
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      disabled={sending}
                      data-testid={`bulk-wa-check-${c.id}`}
                      className="w-4 h-4 accent-primary"
                    />
                  </td>
                  <td className="px-2 py-2 font-medium truncate">{c.name}</td>
                  <td className="px-2 py-2 font-mono text-xs text-muted-foreground ltr-nums">{c.phone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {sending && (
          <div className="mb-3 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-medium">
                {ar ? "جاري الإرسال…" : "Sending…"} {progress.currentName ? `· ${progress.currentName}` : ""}
              </span>
              <span className="font-mono font-bold">{progress.done} / {progress.total}</span>
            </div>
            <div className="h-1.5 rounded-full bg-primary/15 overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          {sending ? (
            <button onClick={cancel} data-testid="bulk-wa-cancel" className="h-10 px-4 rounded-xl border border-destructive/40 text-destructive font-medium text-sm hover:bg-destructive/10">
              {ar ? "إيقاف" : "Stop"}
            </button>
          ) : (
            <>
              <button onClick={onClose} className="btn-outline h-10 px-4">{ar ? "إلغاء" : "Cancel"}</button>
              <button
                onClick={start}
                data-testid="bulk-wa-start"
                disabled={selected.size === 0}
                className="h-10 px-5 rounded-xl bg-[hsl(var(--whatsapp))] text-white font-semibold text-sm inline-flex items-center gap-2 disabled:opacity-50 hover:brightness-105 shadow-md"
              >
                <Send className="w-4 h-4" />
                {ar ? `إرسال إلى ${selected.size}` : `Send to ${selected.size}`}
              </button>
            </>
          )}
        </div>
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
  const [bulkOpen, setBulkOpen] = useState(false);

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
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setBulkOpen(true)}
            data-testid="bulk-wa-btn"
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[hsl(var(--whatsapp))] text-white text-sm font-medium shadow-md disabled:opacity-50 hover:brightness-105"
          >
            <MessageCircle className="w-4 h-4" />
            {lang === "ar" ? "واتساب جماعي" : "Bulk WhatsApp"}
          </button>
          <button onClick={() => setEditing({})} data-testid="add-customer-btn" className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            <Plus className="w-4 h-4" /> {t("add")}
          </button>
        </div>
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
                <td className="font-mono text-sm">
                  <a
                    href={waUrl(c.phone)}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid={`wa-phone-${c.id}`}
                    title={lang === "ar" ? "فتح محادثة واتساب" : "Open WhatsApp chat"}
                    className="inline-flex items-center gap-1.5 text-[hsl(var(--whatsapp))] hover:underline"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span className="ltr-nums">{c.phone}</span>
                  </a>
                </td>
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
      {bulkOpen && <BulkWhatsAppModal items={items} onClose={() => setBulkOpen(false)} />}
    </div>
  );
}
