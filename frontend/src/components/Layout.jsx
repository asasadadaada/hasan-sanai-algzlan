import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wrench, Banknote, PackageSearch, Users,
  BarChart3, Settings as SettingsIcon, Sun, Moon, Languages,
  LogOut, Search, Bell, Sparkles,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { api, fmtMoney } from "@/lib/api";
import GlobalSearch from "@/components/GlobalSearch";

export default function Layout() {
  const { user, t, theme, lang, toggleTheme, toggleLang, logout } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/maintenance/pending/followups");
        setPendingCount(data.length);
      } catch {}
    })();
  }, []);

  const navItems = [
    { to: "/", icon: LayoutDashboard, key: "dashboard", end: true },
    { to: "/maintenance", icon: Wrench, key: "maintenance" },
    { to: "/debts", icon: Banknote, key: "debts" },
    { to: "/spare-parts", icon: PackageSearch, key: "spare_parts" },
    { to: "/customers", icon: Users, key: "customers" },
    { to: "/reports", icon: BarChart3, key: "reports" },
  ];

  const logoSide = lang === "ar" ? "right-0 border-s" : "left-0 border-e";
  const contentPad = lang === "ar" ? "lg:pr-64" : "lg:pl-64";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className={`fixed top-0 ${logoSide} w-64 h-screen border-border bg-card flex flex-col z-40 hidden lg:flex`} data-testid="sidebar">
        <div className="h-16 flex items-center px-5 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-background" strokeWidth={2} />
          </div>
          <div className="ms-3">
            <div className="font-bold text-base tracking-tight">RepairOS</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate max-w-[140px]">{user?.tenant_name || ""}</div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`nav-${item.key}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-4 h-4" strokeWidth={1.75} />
              <span>{t(item.key)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <NavLink
            to="/settings"
            data-testid="nav-settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                isActive ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <SettingsIcon className="w-4 h-4" strokeWidth={1.75} />
            <span>{t("settings")}</span>
          </NavLink>
          <div className="flex items-center gap-1 pt-2">
            <button
              onClick={toggleTheme}
              data-testid="toggle-theme"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              title={theme === "dark" ? t("light_mode") : t("dark_mode")}
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              onClick={toggleLang}
              data-testid="toggle-lang"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Languages className="w-4 h-4" />
              <span className="text-[10px]">{lang === "ar" ? "EN" : "AR"}</span>
            </button>
            <button
              onClick={async () => { await logout(); navigate("/login"); }}
              data-testid="btn-logout"
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-destructive hover:bg-destructive/10 transition-colors"
              title={t("logout")}
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          <div className="pt-2 px-2">
            <div className="text-xs font-medium truncate">{user?.name}</div>
            <div className="text-[10px] text-muted-foreground">{user?.email} · {t(`role_${user?.role}`)}</div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className={`${contentPad} min-h-screen flex flex-col`}>
        {/* Top bar */}
        <header className="h-16 border-b border-border px-5 flex items-center justify-between bg-background/70 backdrop-blur-md sticky top-0 z-30">
          <button
            onClick={() => setSearchOpen(true)}
            data-testid="open-search"
            className="flex items-center gap-2 px-3 h-9 rounded-md border border-border text-sm text-muted-foreground hover:bg-muted transition-colors min-w-[220px]"
          >
            <Search className="w-4 h-4" />
            <span>{t("global_search")}</span>
            <span className="ms-auto text-[10px] border border-border rounded px-1.5 py-0.5">Ctrl K</span>
          </button>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 text-[hsl(var(--warning))] text-xs font-medium" data-testid="pending-followups-badge">
                <Bell className="w-3 h-3" />
                <span>{pendingCount} {t("kpi_followups")}</span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-5 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
