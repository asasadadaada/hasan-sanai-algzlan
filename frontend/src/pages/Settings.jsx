import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, UserPlus, Trash2, X, Save, User, KeyRound, Store } from "lucide-react";
import { api, formatApiErrorDetail } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function Section({ title, children, testId, icon: Icon }) {
  return (
    <div className="swiss-card p-6 space-y-4" data-testid={testId}>
      <div className="flex items-center gap-3 pb-1">
        {Icon && (
          <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon className="w-4 h-4" strokeWidth={2} />
          </div>
        )}
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, testId, type = "text", value, onChange, placeholder, icon: Icon }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block text-muted-foreground">{label}</label>
      <div className="relative">
        {Icon && <Icon className="w-4 h-4 absolute top-3.5 start-3.5 text-muted-foreground pointer-events-none" />}
        <input
          data-testid={testId} type={type} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={`premium-input ${Icon ? "ps-10" : ""}`}
        />
      </div>
    </div>
  );
}

function TextField({ label, testId, value, onChange, rows = 3 }) {
  return (
    <div>
      <label className="text-xs font-medium mb-1.5 block text-muted-foreground">{label}</label>
      <textarea data-testid={testId} rows={rows} value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="premium-input font-mono text-xs leading-relaxed" style={{ height: "auto" }} />
    </div>
  );
}

function Toggle({ label, checked, onChange, testId }) {
  return (
    <label className="flex items-center justify-between py-2.5 cursor-pointer select-none">
      <span className="text-sm font-medium">{label}</span>
      <button type="button" onClick={() => onChange(!checked)} data-testid={testId} className={`relative w-11 h-6 rounded-full transition-all ${checked ? "bg-primary shadow-md shadow-primary/30" : "bg-muted"}`}>
        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform ${checked ? "translate-x-0.5 rtl:-translate-x-0.5" : "translate-x-5 rtl:-translate-x-5"}`} />
      </button>
    </label>
  );
}

function AccountTab() {
  const { t, user, checkAuth } = useApp();
  const [u, setU] = useState({ username: "", current_password: "" });
  const [p, setP] = useState({ current_password: "", new_password: "", confirm: "" });
  const [n, setN] = useState({ name: "" });
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    setU({ username: user?.username || "", current_password: "" });
    setN({ name: user?.name || "" });
  }, [user]);

  const saveUsername = async (e) => {
    e.preventDefault();
    if (!u.current_password) return toast.error(t("current_password"));
    setBusy("username");
    try {
      await api.post("/auth/me/change-username", u);
      toast.success(t("saved"));
      setU((x) => ({ ...x, current_password: "" }));
      checkAuth();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setBusy(null); }
  };
  const savePassword = async (e) => {
    e.preventDefault();
    if (p.new_password !== p.confirm) return toast.error("كلمة المرور غير متطابقة");
    if (p.new_password.length < 6) return toast.error("6 أحرف على الأقل");
    setBusy("password");
    try {
      await api.post("/auth/me/change-password", { current_password: p.current_password, new_password: p.new_password });
      toast.success(t("saved"));
      setP({ current_password: "", new_password: "", confirm: "" });
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setBusy(null); }
  };
  const saveName = async (e) => {
    e.preventDefault();
    setBusy("name");
    try { await api.patch("/auth/me/profile", n); toast.success(t("saved")); checkAuth(); }
    catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
    finally { setBusy(null); }
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Section title={t("profile")} testId="account-profile" icon={User}>
        <form onSubmit={saveName} className="space-y-3">
          <Field label={t("name")} testId="a-name" value={n.name} onChange={(v) => setN({ name: v })} icon={User} />
          <button disabled={busy === "name"} data-testid="save-name" className="btn-primary w-full">
            {busy === "name" ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />{t("save")}</>}
          </button>
        </form>
      </Section>

      <Section title={t("update_username")} testId="account-username" icon={User}>
        <form onSubmit={saveUsername} className="space-y-3">
          <Field label={t("username")} testId="a-username" value={u.username} onChange={(v) => setU({ ...u, username: v.toLowerCase() })} icon={User} placeholder="admin" />
          <Field label={t("current_password")} testId="a-username-cp" type="password" value={u.current_password} onChange={(v) => setU({ ...u, current_password: v })} icon={KeyRound} />
          <button disabled={busy === "username"} data-testid="save-username" className="btn-primary w-full">
            {busy === "username" ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />{t("save")}</>}
          </button>
        </form>
      </Section>

      <Section title={t("update_password")} testId="account-password" icon={KeyRound}>
        <form onSubmit={savePassword} className="space-y-3">
          <Field label={t("current_password")} testId="a-pw-current" type="password" value={p.current_password} onChange={(v) => setP({ ...p, current_password: v })} icon={KeyRound} />
          <Field label={t("new_password")} testId="a-pw-new" type="password" value={p.new_password} onChange={(v) => setP({ ...p, new_password: v })} icon={KeyRound} />
          <Field label={t("confirm")} testId="a-pw-confirm" type="password" value={p.confirm} onChange={(v) => setP({ ...p, confirm: v })} icon={KeyRound} />
          <button disabled={busy === "password"} data-testid="save-password" className="btn-primary w-full">
            {busy === "password" ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />{t("save")}</>}
          </button>
        </form>
      </Section>
    </div>
  );
}

function UsersTab() {
  const { t, user } = useApp();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "staff" });
  const [adding, setAdding] = useState(false);

  const load = async () => {
    try { const { data } = await api.get("/auth/users"); setUsers(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/auth/users", { ...form, username: form.username.toLowerCase().trim() });
      toast.success(t("saved")); setAdding(false);
      setForm({ username: "", name: "", password: "", role: "staff" });
      load();
    } catch (e2) { toast.error(formatApiErrorDetail(e2.response?.data?.detail)); }
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
        <button onClick={() => setAdding(true)} data-testid="add-user-btn" className="btn-primary h-9 px-3 text-xs"><UserPlus className="w-3.5 h-3.5" />{t("add")}</button>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead><tr><th>{t("name")}</th><th>{t("username")}</th><th>{t("role")}</th><th className="text-end">{t("actions")}</th></tr></thead>
          <tbody data-testid="users-list">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td className="text-sm font-mono">@{u.username}</td>
                <td><span className="text-xs px-2.5 py-0.5 rounded-full border border-border font-medium">{t(`role_${u.role}`)}</span></td>
                <td>
                  <div className="flex justify-end">
                    {u.role !== "owner" && user?.role === "owner" && (
                      <button onClick={() => del(u)} data-testid={`delete-user-${u.id}`} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive press"><Trash2 className="w-4 h-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 fade-in" onClick={() => setAdding(false)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-5 fade-in-up" onClick={(e) => e.stopPropagation()} data-testid="user-form-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold">{t("add")}</h3>
              <button onClick={() => setAdding(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={create} className="space-y-3">
              <Field label={t("name")} testId="u-name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
              <Field label={t("username")} testId="u-username" value={form.username} onChange={(v) => setForm({ ...form, username: v.toLowerCase() })} icon={User} />
              <Field label={t("password")} type="password" testId="u-password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} icon={KeyRound} />
              <div>
                <label className="text-xs font-medium mb-1.5 block text-muted-foreground">{t("role")}</label>
                <select data-testid="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="premium-input">
                  {user?.role === "owner" && <option value="manager">{t("role_manager")}</option>}
                  <option value="staff">{t("role_staff")}</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setAdding(false)} className="btn-outline">{t("cancel")}</button>
                <button type="submit" data-testid="u-submit" className="btn-primary">{t("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const { t } = useApp();
  const [tab, setTab] = useState("account");
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)); }, []);

  const upd = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const save = async () => {
    setSaving(true);
    try { await api.patch("/settings", settings); toast.success(t("saved")); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setSaving(false); }
  };

  const testTelegram = async () => {
    setTesting(true);
    try { await save(); await api.post("/settings/telegram/test"); toast.success("Telegram ✓"); }
    catch (e) { toast.error(formatApiErrorDetail(e.response?.data?.detail)); }
    finally { setTesting(false); }
  };

  if (!settings) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-7 h-7 border-2 border-border border-t-primary rounded-full animate-spin" /></div>;
  }

  const tabs = [
    { key: "account", label: t("account"), icon: User },
    { key: "shop", label: t("shop_settings"), icon: Store },
    { key: "whatsapp", label: t("whatsapp_settings") },
    { key: "telegram", label: t("telegram_settings") },
    { key: "users", label: t("users_management") },
  ];

  const showSaveBar = tab === "shop" || tab === "whatsapp" || tab === "telegram";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">{t("settings")}</h1>
        {showSaveBar && (
          <button onClick={save} disabled={saving} data-testid="save-settings" className="btn-primary">
            {saving ? <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />{t("save")}</>}
          </button>
        )}
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto pb-0">
        {tabs.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            data-testid={`tab-${x.key}`}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap -mb-px flex items-center gap-2 ${
              tab === x.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {x.icon && <x.icon className="w-4 h-4" />}
            {x.label}
          </button>
        ))}
      </div>

      {tab === "account" && <AccountTab />}

      {tab === "shop" && (
        <Section title={t("shop_settings")} testId="shop-settings" icon={Store}>
          <Field label={t("system_name")} testId="s-name" value={settings.name} onChange={(v) => upd({ name: v })} placeholder="مركز ام الكبر والغزلان" />
          <Field label={t("phone")} testId="s-phone" value={settings.phone} onChange={(v) => upd({ phone: v })} />
          <Field label={t("address")} testId="s-address" value={settings.address} onChange={(v) => upd({ address: v })} />
          <Field label={t("currency")} testId="s-currency" value={settings.currency} onChange={(v) => upd({ currency: v })} placeholder="IQD" />
        </Section>
      )}

      {tab === "whatsapp" && (
        <Section title={t("whatsapp_settings")} testId="whatsapp-settings">
          <Field label={t("phone")} testId="w-phone" placeholder="9647XXXXXXXXX" value={settings.whatsapp_number} onChange={(v) => upd({ whatsapp_number: v })} />
          <TextField label={t("template_complete")} testId="w-complete" value={settings.whatsapp_complete_template} onChange={(v) => upd({ whatsapp_complete_template: v })} />
          <TextField label={t("template_followup")} testId="w-followup" value={settings.whatsapp_followup_template} onChange={(v) => upd({ whatsapp_followup_template: v })} />
          <Toggle label={t("follow_up_enabled")} checked={!!settings.follow_up_enabled} onChange={(v) => upd({ follow_up_enabled: v })} testId="w-followup-toggle" />
          <Field label={t("follow_up_hours")} type="number" testId="w-hours" value={settings.follow_up_hours} onChange={(v) => upd({ follow_up_hours: Number(v) })} />
          <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">استخدم <code className="font-mono bg-background px-1.5 py-0.5 rounded">{"{customer_name}"}</code> و <code className="font-mono bg-background px-1.5 py-0.5 rounded">{"{device}"}</code> كمتغيرات</p>
        </Section>
      )}

      {tab === "telegram" && (
        <Section title={t("telegram_settings")} testId="telegram-settings">
          <Field label={t("bot_token")} testId="tg-token" value={settings.telegram_bot_token} onChange={(v) => upd({ telegram_bot_token: v })} placeholder="123456:AAA..." />
          <Field label={t("chat_id")} testId="tg-chat" value={settings.telegram_chat_id} onChange={(v) => upd({ telegram_chat_id: v })} placeholder="-1001..." />
          <Toggle label={t("notify_maintenance")} checked={!!settings.telegram_notify_maintenance} onChange={(v) => upd({ telegram_notify_maintenance: v })} testId="tg-notify-m" />
          <Toggle label={t("notify_debts")} checked={!!settings.telegram_notify_debts} onChange={(v) => upd({ telegram_notify_debts: v })} testId="tg-notify-d" />
          <Toggle label={t("notify_daily")} checked={!!settings.telegram_notify_daily} onChange={(v) => upd({ telegram_notify_daily: v })} testId="tg-notify-day" />
          <button onClick={testTelegram} disabled={testing} data-testid="tg-test" className="btn-outline"><Send className="w-4 h-4" />{t("test_connection")}</button>
        </Section>
      )}

      {tab === "users" && (<Section title={t("users_management")} testId="users-section"><UsersTab /></Section>)}
    </div>
  );
}
