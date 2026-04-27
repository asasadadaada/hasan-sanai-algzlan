import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Languages, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login, t, lang, theme, toggleLang, toggleTheme } = useApp();
  const [email, setEmail] = useState("admin@repairshop.com");
  const [password, setPassword] = useState("Admin@2026");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await login(email, password);
      toast.success(t("welcome_back"));
      navigate("/");
    } catch (e2) {
      const msg = formatApiErrorDetail(e2.response?.data?.detail) || e2.message;
      setErr(msg);
      toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left side — Form */}
      <div className="flex flex-col items-center justify-center p-8 relative">
        <div className="absolute top-5 end-5 flex items-center gap-1">
          <button onClick={toggleTheme} data-testid="login-toggle-theme" className="p-2 rounded-md border border-border hover:bg-muted">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button onClick={toggleLang} data-testid="login-toggle-lang" className="p-2 rounded-md border border-border hover:bg-muted flex items-center gap-1 text-xs">
            <Languages className="w-4 h-4" />{lang === "ar" ? "EN" : "ع"}
          </button>
        </div>
        <div className="w-full max-w-sm fade-in-up">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-background" />
            </div>
            <div>
              <div className="font-bold text-xl tracking-tight">RepairOS</div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Enterprise SaaS</div>
            </div>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{t("welcome_back")}</h1>
          <p className="text-muted-foreground text-sm mt-2 mb-8">{lang === "ar" ? "سجل الدخول لإدارة محلك" : "Sign in to manage your shop"}</p>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("email")}</label>
              <input
                data-testid="login-email"
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
              />
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block">{t("password")}</label>
              <input
                data-testid="login-password"
                type="password" required value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20 transition-all"
              />
            </div>
            {err && <div className="text-xs text-destructive" data-testid="login-error">{err}</div>}
            <button
              data-testid="login-submit"
              type="submit" disabled={loading}
              className="w-full h-10 rounded-md bg-foreground text-background font-medium text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {loading ? t("loading") : t("login")}
            </button>
          </form>
          <div className="text-sm text-muted-foreground text-center mt-6">
            {t("no_account")} <Link to="/register" data-testid="go-to-register" className="text-foreground underline underline-offset-4 font-medium">{t("create_account_cta")}</Link>
          </div>
          <div className="mt-8 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Demo credentials</div>
            admin@repairshop.com / Admin@2026
          </div>
        </div>
      </div>

      {/* Right side — Visual */}
      <div className="hidden lg:flex bg-foreground items-center justify-center p-10 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{backgroundImage: "radial-gradient(circle at 25% 25%, hsl(var(--accent)) 0%, transparent 50%)"}} />
        <div className="relative z-10 text-background max-w-md fade-in-up">
          <div className="text-xs uppercase tracking-[0.3em] opacity-60 mb-4">Repair Shop OS</div>
          <div className="text-4xl font-semibold leading-tight tracking-tight mb-6">
            {lang === "ar" ? "إدارة متكاملة لمحل الصيانة. من صيانة، ديون، ومخزون — في مكان واحد." : "Every repair, every debt, every part — one operational source of truth."}
          </div>
          <div className="flex flex-wrap gap-2 pt-4">
            {["Multi-tenant", "RBAC", "Telegram", "WhatsApp", "PDF Invoices", "Audit Logs"].map((s) => (
              <span key={s} className="text-xs px-2.5 py-1 rounded-full border border-background/20 opacity-80">{s}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
