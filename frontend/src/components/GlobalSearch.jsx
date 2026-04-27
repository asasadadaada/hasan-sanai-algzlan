import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, Wrench, Banknote, PackageSearch } from "lucide-react";
import { api } from "@/lib/api";
import { useApp } from "@/contexts/AppContext";

export default function GlobalSearch({ open, onClose }) {
  const { t } = useApp();
  const [q, setQ] = useState("");
  const [res, setRes] = useState({ customers: [], maintenance: [], debts: [], parts: [] });
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) { setQ(""); setRes({ customers: [], maintenance: [], debts: [], parts: [] }); }
  }, [open]);

  useEffect(() => {
    if (!open || !q || q.length < 1) return;
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get(`/dashboard/search?q=${encodeURIComponent(q)}`);
        setRes(data);
      } catch {}
    }, 200);
    return () => clearTimeout(id);
  }, [q, open]);

  if (!open) return null;

  const go = (path) => { onClose(); navigate(path); };

  const sections = [
    { key: "customers", icon: Users, items: res.customers, label: t("customers"), path: "/customers" },
    { key: "maintenance", icon: Wrench, items: res.maintenance, label: t("maintenance"), path: "/maintenance" },
    { key: "debts", icon: Banknote, items: res.debts, label: t("debts"), path: "/debts" },
    { key: "parts", icon: PackageSearch, items: res.parts, label: t("spare_parts"), path: "/spare-parts" },
  ];
  const hasAny = sections.some((s) => s.items?.length);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/50 backdrop-blur-sm" onClick={onClose} data-testid="global-search-modal">
      <div className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-xl mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 h-14 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input
            autoFocus
            data-testid="global-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("global_search") + "..."}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <button onClick={onClose} className="text-xs text-muted-foreground">ESC</button>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {!q && <div className="p-8 text-center text-sm text-muted-foreground">{t("cmd_k_hint")}</div>}
          {q && !hasAny && <div className="p-8 text-center text-sm text-muted-foreground">{t("no_results")}</div>}
          {sections.map((s) => s.items?.length ? (
            <div key={s.key} className="py-2">
              <div className="px-4 py-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
                <s.icon className="w-3 h-3" />{s.label}
              </div>
              {s.items.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  onClick={() => go(s.path)}
                  data-testid={`search-result-${s.key}-${item.id}`}
                  className="w-full px-4 py-2 hover:bg-muted text-start flex justify-between items-center gap-4 text-sm transition-colors"
                >
                  <div className="truncate">
                    <div className="font-medium">
                      {item.name || item.customer_name}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {item.phone || item.customer_phone || item.device_name || item.location}
                      {item.device_type ? ` · ${item.device_type}` : ""}
                      {item.amount_remaining != null ? ` · ${item.amount_remaining}` : ""}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : null)}
        </div>
      </div>
    </div>
  );
}
