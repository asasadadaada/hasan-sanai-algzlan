import React, { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Wrench, Banknote, PackageSearch, Users,
  BarChart3, Settings as SettingsIcon, Sun, Moon, Languages,
  LogOut, Search, Bell, Sparkles, Menu, X,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { api } from "@/lib/api";
import GlobalSearch from "@/components/GlobalSearch";

export default function Layout() {
  const { user, t, theme, lang, toggleTheme, toggleLang, logout } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();

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

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/maintenance/pending/followups");
        setPendingCount(data.length);
      } catch {}
    })();
  }, []);

  const navItems = [
    { to: "/", icon: LayoutDashboard, key: "dashboard", end: true, color: "from-blue-500 to-indigo-600" },
    { to: "/maintenance", icon: Wrench, key: "maintenance", color: "from-sky-500 to-blue-600" },
    { to: "/debts", icon: Banknote, key: "debts", color: "from-amber-500 to-orange-600" },
    { to: "/spare-parts", icon: PackageSearch, key: "spare_parts", color: "from-purple-500 to-fuchsia-600" },
    { to: "/customers", icon: Users, key: "customers", color: "from-teal-500 to-emerald-600" },
    { to: "/reports", icon: BarChart3, key: "reports", color: "from-rose-500 to-pink-600" },
  ];

  const sidePos = lang === "ar" ? "right-0" : "left-0";
  const contentPad = lang === "ar" ? "lg:pr-64" : "lg:pl-64";

  const SidebarContent = () => (
    <>
      <div className="h-16 flex items-center justify-between px-5 border-b border-border">
        <div className="flex items-center">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[hsl(226_64%_33%)] to-[hsl(217_91%_60%)] flex items-center justify-center shadow-md">
            <Sparkles className="w-4.5 h-4.5 text-white" strokeWidth={2} />
          </div>
          <div className="ms-3">
            <div className="font-bold text-base tracking-tight">RepairOS</div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider truncate max-w-[130px]">
              {user?.tenant_name || ""}
            </div>
          </div>
        </div>
        <button
          className="lg:hidden p-2 rounded-lg hover:bg-muted"
          onClick={() => setMobileOpen(false)}
          data-testid="sidebar-close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={`nav-${item.key}`}
            className={({ isActive }) =>
              `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  isActive ? "bg-white/15" : `bg-gradient-to-br ${item.color} text-white`
                }`}>
                  <item.icon className="w-4 h-4" strokeWidth={2} />
                </span>
                <span>{t(item.key)}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="p-3 border-t border-border space-y-1">
        <NavLink
          to="/settings"
          data-testid="nav-settings"
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`
          }
        >
          <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white">
            <SettingsIcon className="w-4 h-4" strokeWidth={2} />
          </span>
          <span>{t("settings")}</span>
        </NavLink>

        <div className="flex items-center gap-1 pt-2">
          <button onClick={toggleTheme} data-testid="toggle-theme" title={theme === "dark" ? t("light_mode") : t("dark_mode")} className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center press">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={toggleLang} data-testid="toggle-lang" className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center gap-1 text-[10px] font-medium press">
            <Languages className="w-4 h-4" />{lang === "ar" ? "EN" : "AR"}
          </button>
          <button onClick={async () => { await logout(); navigate("/login"); }} data-testid="btn-logout" title={t("logout")} className="flex-1 h-9 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 flex items-center justify-center press">
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        <div className="pt-3 px-2 mt-1 border-t border-border">
          <div className="text-xs font-semibold truncate">{user?.name}</div>
          <div className="text-[10px] text-muted-foreground">{user?.email}</div>
          <div className="inline-block mt-1 text-[9px] uppercase tracking-wider bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded">{t(`role_${user?.role}`)}</div>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop sidebar */}
      <aside className={`fixed top-0 ${sidePos} w-64 h-screen bg-card border-border ${lang === "ar" ? "border-s" : "border-e"} flex-col z-40 hidden lg:flex`} data-testid="sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 fade-in" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <aside
            className={`absolute top-0 ${sidePos} w-72 h-screen bg-card flex flex-col shadow-2xl`}
            style={{ animation: "slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) both" }}
            onClick={(e) => e.stopPropagation()}
            data-testid="mobile-sidebar"
          >
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className={`${contentPad} min-h-screen flex flex-col`}>
        {/* Top bar */}
        <header className="h-16 border-b border-border px-4 md:px-5 flex items-center justify-between bg-background/80 backdrop-blur-md sticky top-0 z-30">
          <div className="flex items-center gap-2">
            <button
              className="lg:hidden p-2 rounded-lg hover:bg-muted"
              onClick={() => setMobileOpen(true)}
              data-testid="menu-toggle"
              aria-label="menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <button
              onClick={() => setSearchOpen(true)}
              data-testid="open-search"
              className="flex items-center gap-2 px-3 h-9 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted hover:border-foreground/20 min-w-[160px] md:min-w-[240px] press"
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">{t("global_search")}</span>
              <span className="ms-auto text-[10px] border border-border rounded px-1.5 py-0.5 hidden md:inline">Ctrl K</span>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/15 text-[hsl(var(--warning))] text-xs font-medium" data-testid="pending-followups-badge">
                <Bell className="w-3 h-3" />
                <span className="hidden sm:inline">{pendingCount} {t("kpi_followups")}</span>
                <span className="sm:hidden">{pendingCount}</span>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 page-enter" key={location.pathname}>
          <Outlet />
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
