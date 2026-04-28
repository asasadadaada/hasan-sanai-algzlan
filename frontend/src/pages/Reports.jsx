import React, { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api, fmtMoney } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

export default function Reports() {
  const { t, lang } = useApp();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    (async () => {
      const [s, l, st] = await Promise.all([
        api.get("/dashboard/stats"),
        api.get("/dashboard/audit-logs?limit=50"),
        api.get("/settings"),
      ]);
      setStats(s.data); setLogs(l.data); setSettings(st.data);
    })();
  }, []);

  if (!stats) return <div className="text-muted-foreground text-sm">{t("loading")}</div>;
  const cur = settings.currency || "IQD";

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t("reports")}</h1>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="swiss-card p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("kpi_revenue_month")}</div>
          <div className="text-2xl font-semibold tabular mt-1">{fmtMoney(stats.revenue_month, cur, lang)}</div>
        </div>
        <div className="swiss-card p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("kpi_profit_month")}</div>
          <div className="text-2xl font-semibold tabular mt-1">{fmtMoney(stats.profit_month, cur, lang)}</div>
        </div>
        <div className="swiss-card p-5">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{t("kpi_debt_total")}</div>
          <div className="text-2xl font-semibold tabular mt-1">{fmtMoney(stats.debt_total, cur, lang)}</div>
        </div>
      </div>

      <div className="swiss-card p-5">
        <h3 className="font-semibold mb-4">{t("revenue")} — {t("last_30_days")}</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats.chart_30d}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={10} tickFormatter={(v) => v.slice(5)} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={10} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
            <Bar dataKey="revenue" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="swiss-card p-5">
        <h3 className="font-semibold mb-4">{t("audit_logs")}</h3>
        <div className="space-y-2 max-h-[400px] overflow-y-auto" data-testid="audit-logs-list">
          {logs.length === 0 && <div className="text-muted-foreground text-sm text-center py-6">{t("empty_state")}</div>}
          {logs.map((l) => (
            <div key={l.id} className="flex items-start gap-3 text-sm py-2 border-b border-border last:border-0">
              <div className="text-xs text-muted-foreground whitespace-nowrap tabular w-32">{new Date(l.created_at).toLocaleString(lang === "ar" ? "ar-IQ" : "en-US")}</div>
              <div className="flex-1">
                <span className="font-medium">{l.user_email}</span>
                <span className="text-muted-foreground mx-1.5">{l.action}</span>
                <span className="text-xs text-muted-foreground">{l.entity}</span>
                {l.summary && <div className="text-xs text-muted-foreground">{l.summary}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
