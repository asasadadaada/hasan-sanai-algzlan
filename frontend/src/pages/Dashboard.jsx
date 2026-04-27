import React, { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from "recharts";
import {
  Users, Wrench, Banknote, PackageSearch, TrendingUp, AlertTriangle,
  CircleDollarSign, Bell, ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api, fmtMoney } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

function KPI({ icon: Icon, label, value, hint, accent = false, testId }) {
  return (
    <div className="kpi-card" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center">
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        {accent && <ArrowUpRight className="w-4 h-4 text-muted-foreground" />}
      </div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="text-2xl font-semibold tabular mt-1 tracking-tight">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-1.5">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const { t, user, lang } = useApp();
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, st, r] = await Promise.all([
          api.get("/dashboard/stats"),
          api.get("/settings"),
          api.get("/maintenance"),
        ]);
        setStats(s.data); setSettings(st.data); setRecent(r.data.slice(0, 6));
      } catch {}
    })();
  }, []);

  if (!stats || !settings) return <div className="text-muted-foreground text-sm">{t("loading")}</div>;
  const cur = settings.currency || "IQD";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("dashboard")}</h1>
          <p className="text-muted-foreground text-sm mt-1">{settings.name} · {new Date().toLocaleDateString(lang === "ar" ? "ar-IQ" : "en-US")}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 stagger">
        <KPI testId="kpi-customers" icon={Users} label={t("kpi_customers")} value={stats.customers_count} />
        <KPI testId="kpi-active" icon={Wrench} label={t("kpi_active_maint")} value={stats.maint_active} hint={`${stats.maint_total} ${t("total").toLowerCase()}`} />
        <KPI testId="kpi-debt" icon={Banknote} label={t("kpi_debt_total")} value={fmtMoney(stats.debt_total, cur, lang)} hint={`${stats.open_debts_count} ${t("kpi_open_debts")}`} />
        <KPI testId="kpi-profit" icon={TrendingUp} label={t("kpi_profit_total")} value={fmtMoney(stats.profit_total, cur, lang)} accent />
        <KPI testId="kpi-profit-month" icon={CircleDollarSign} label={t("kpi_profit_month")} value={fmtMoney(stats.profit_month, cur, lang)} hint={fmtMoney(stats.revenue_month, cur, lang) + " " + t("revenue").toLowerCase()} />
        <KPI testId="kpi-parts" icon={PackageSearch} label={t("kpi_parts")} value={stats.parts_count} hint={`${stats.low_stock_count} ${t("kpi_low_stock")}`} />
        <KPI testId="kpi-low-stock" icon={AlertTriangle} label={t("kpi_low_stock")} value={stats.low_stock_count} />
        <KPI testId="kpi-followups" icon={Bell} label={t("kpi_followups")} value={stats.pending_followups} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="swiss-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold">{t("profit_chart")}</h3>
              <p className="text-xs text-muted-foreground">{t("last_30_days")}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.chart_30d} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pgrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent))" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.slice(5)} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Area type="monotone" dataKey="profit" stroke="hsl(var(--accent))" fill="url(#pgrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="swiss-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">{t("low_stock_items")}</h3>
            <Link to="/spare-parts" className="text-xs text-muted-foreground hover:text-foreground">→</Link>
          </div>
          <div className="space-y-2">
            {stats.low_stock.length === 0 && <div className="text-xs text-muted-foreground py-8 text-center">{t("empty_state")}</div>}
            {stats.low_stock.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm py-2 border-b border-border last:border-0">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.device_name} · {p.location}</div>
                </div>
                <div className="text-sm tabular font-medium text-warning">{p.quantity}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="swiss-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{t("recent_maintenance")}</h3>
          <Link to="/maintenance" className="text-xs text-muted-foreground hover:text-foreground">→</Link>
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("customer")}</th>
              <th>{t("device_type")}</th>
              <th>{t("status")}</th>
              <th>{t("agreed_price")}</th>
              <th>{t("debt_amount")}</th>
            </tr>
          </thead>
          <tbody>
            {recent.length === 0 && <tr><td colSpan={5} className="text-center text-muted-foreground py-8">{t("empty_state")}</td></tr>}
            {recent.map((m) => (
              <tr key={m.id}>
                <td className="font-medium">{m.customer_name}<div className="text-xs text-muted-foreground">{m.customer_phone}</div></td>
                <td>{m.device_type}</td>
                <td><span className="text-xs px-2 py-0.5 rounded-full border border-border">{t(m.status)}</span></td>
                <td className="tabular">{fmtMoney(m.agreed_price, cur, lang)}</td>
                <td className="tabular">{fmtMoney(m.debt_amount, cur, lang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
