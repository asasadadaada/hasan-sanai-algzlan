import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, UserPlus, Edit, Trash2, X, Save } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function Section({ title, children, testId }) {
  return (
    <div className="swiss-card p-6 space-y-4" data-testid={testId}>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, testId, type = "text", value, onChange, placeholder }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">{label}</label>
      <input data-testid={testId} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm" />
    </div>
  );
}

function TextField({ label, testId, value, onChange, rows = 3 }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block">{label}</label>
      <textarea data-testid={testId} rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 rounded-md border border-border bg-transparent text-sm font-mono" />
    </div>
  );
}

function Toggle({ label, checked, onChange, testId }) {
  return (
    <label className="flex items-center justify-between py-2">
      <span className="text-sm">{label}</span>
      <button type="button" onClick={() => onChange(!checked)} data-testid={testId} className={`relative w-10 h-5 rounded-full transition-colors ${checked ? "bg-foreground" : "bg-muted"}`}>
        <span className={`absolute top-0.5 w-4 h-4 bg-background rounded-full transition-transform ${checked ? "translate-x-0.5 rtl:-translate-x-0.5" : "translate-x-5 rtl:-translate-x-5"}`} />
      </button>
    </label>
  );
}

function UsersTab() {
  const { t, user } = useApp();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "staff" });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/auth/users"); setUsers(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try { await api.post("/auth/users", form); toast.success(t("saved")); setAdding(false); setForm({ email: "", name: "", password: "", role: "staff" }); load(); }
    catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
  };
  const del = async (u) => {
    if (!window.confirm(t("confirm_delete"))) return;
    try { await api.delete(`/auth/users/${u.id}`); toast.success(t("saved")); load(); }
    catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
  };

  const canManage = user?.role === "owner" || user?.role === "manager";
  if (!canManage) return <div className="text-sm text-muted-foreground">{t("role_owner")} / {t("role_manager")}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{users.length} {t("users_management").toLowerCase()}</div>
        <button onClick={() => setAdding(true)} data-testid="add-user-btn" className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-foreground text-background text-xs font-medium"><UserPlus className="w-3.5 h-3.5" />{t("add")}</button>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{t("name")}</th><th>{t("email")}</th><th>{t("role")}</th><th className="text-end">{t("actions")}</th></tr></thead>
          <tbody data-testid="users-list">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-sm">{u.email}</td>
                <td><span className="text-xs px-2 py-0.5 rounded-full border border-border">{t(`role_${u.role}`)}</span></td>
                <td>
                  <div className="flex justify-end">
                    {u.role !== "owner" && user?.role === "owner" && (
                      <button onClick={() => del(u)} data-testid={`delete-user-${u.id}`} className="p-1.5 rounded hover:bg-destructive/10 text-destructive"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setAdding(false)}>
          <div className="bg-card border border-border rounded-lg w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()} data-testid="user-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">{t("add")}</h3>
              <button onClick={() => setAdding(false)}><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <Field label={t("name")} testId="u-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label={t("email")} type="email" testId="u-email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label={t("password")} type="password" testId="u-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} />
              <div>
                <label className="text-xs font-medium mb-1.5 block">{t("role")}</label>
                <select data-testid="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm">
                  {user?.role === "owner" && <option value="manager">{t("role_manager")}</option>}
                  <option value="staff">{t("role_staff")}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(false)} className="h-9 px-4 rounded-md border border-border text-sm">{t("cancel")}</button>
                <button type="submit" data-testid="u-submit" className="h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium">{t("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { t, user } = useApp();
  const [tab, setTab] = useState("shop");
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)); }, []);

  const upd = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await api.patch("/settings", settings);
      toast.success(t("saved"));
    } catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const testTelegram = async () => {
    setTesting(true);
    try { await save(); await api.post("/settings/telegram/test"); toast.success("Telegram ✓"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setTesting(false); }
  };

  if (!settings) return <div className="text-muted-foreground text-sm">{t("loading")}</div>;

  const tabs = [
    { key: "shop", label: t("shop_settings") },
    { key: "whatsapp", label: t("whatsapp_settings") },
    { key: "telegram", label: t("telegram_settings") },
    { key: "users", label: t("users_management") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold tracking-tight">{t("settings")}</h1>
        {tab !== "users" && (
          <button onClick={save} disabled={saving} data-testid="save-settings" className="inline-flex items-center gap-2 h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium"><Save className="w-4 h-4" />{t("save")}</button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto">
        {tabs.map((x) => (
          <button key={x.key} onClick={() => setTab(x.key)} data-testid={`tab-${x.key}`} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === x.key ? "border-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{x.label}</button>
        ))}
      </div>

      {tab === "shop" && (
        <Section title={t("shop_settings")} testId="shop-settings">
          <Field label={t("shop_name")} testId="s-name" value={settings.name} onChange={(v) => upd({ name: v })} />
          <Field label={t("phone")} testId="s-phone" value={settings.phone} onChange={(v) => upd({ phone: v })} />
          <Field label={t("address")} testId="s-address" value={settings.address} onChange={(v) => upd({ address: v })} />
          <Field label={t("currency")} testId="s-currency" value={settings.currency} onChange={(v) => upd({ currency: v })} />
        </Section>
      )}

      {tab === "whatsapp" && (
        <Section title={t("whatsapp_settings")} testId="whatsapp-settings">
          <Field label={t("phone")} testId="w-phone" placeholder="9647XXXXXXXXX" value={settings.whatsapp_number} onChange={(v) => upd({ whatsapp_number: v })} />
          <TextField label={t("template_complete")} testId="w-complete" value={settings.whatsapp_complete_template} onChange={(v) => upd({ whatsapp_complete_template: v })} />
          <TextField label={t("template_followup")} testId="w-followup" value={settings.whatsapp_followup_template} onChange={(v) => upd({ whatsapp_followup_template: v })} />
          <Toggle label={t("follow_up_enabled")} checked={!!settings.follow_up_enabled} onChange={(v) => upd({ follow_up_enabled: v })} testId="w-followup-toggle" />
          <Field label={t("follow_up_hours")} type="number" testId="w-hours" value={settings.follow_up_hours} onChange={(v) => upd({ follow_up_hours: Number(v) })} />
          <p className="text-xs text-muted-foreground">استخدم <code>{"{customer_name}"}</code> و <code>{"{device}"}</code> كمتغيرات</p>
        </Section>
      )}

      {tab === "telegram" && (
        <Section title={t("telegram_settings")} testId="telegram-settings">
          <Field label={t("bot_token")} testId="tg-token" value={settings.telegram_bot_token} onChange={(v) => upd({ telegram_bot_token: v })} placeholder="123456:AAA..." />
          <Field label={t("chat_id")} testId="tg-chat" value={settings.telegram_chat_id} onChange={(v) => upd({ telegram_chat_id: v })} placeholder="-1001..." />
          <Toggle label={t("notify_maintenance")} checked={!!settings.telegram_notify_maintenance} onChange={(v) => upd({ telegram_notify_maintenance: v })} testId="tg-notify-m" />
          <Toggle label={t("notify_debts")} checked={!!settings.telegram_notify_debts} onChange={(v) => upd({ telegram_notify_debts: v })} testId="tg-notify-d" />
          <Toggle label={t("notify_daily")} checked={!!settings.telegram_notify_daily} onChange={(v) => upd({ telegram_notify_daily: v })} testId="tg-notify-day" />
          <button onClick={testTelegram} disabled={testing} data-testid="tg-test" className="inline-flex items-center gap-2 h-9 px-4 rounded-md border border-border text-sm hover:bg-muted"><Send className="w-4 h-4" />{t("test_connection")}</button>
        </Section>
      )}

      {tab === "users" && (<Section title={t("users_management")} testId="users-section"><UsersTab /></Section>)}
    </div>
  );
}
