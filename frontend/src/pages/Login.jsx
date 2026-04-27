import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Languages, Moon, Sun, Lock, User, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { formatApiErrorDetail } from "@/lib/api";

export default function Login() {
  const { login, t, lang, theme, toggleLang, toggleTheme } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      await login(email, password);
      toast.success(t("welcome_back"));
      navigate("/");
    } catch (e2) {
      const msg = formatApiErrorDetail(e2.response?.data?.detail) || e2.message;
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen login-gradient-bg flex items-center justify-center p-5 relative overflow-hidden">
      {/* Decorative orbs */}
      <div className="absolute top-0 end-0 w-[420px] h-[420px] rounded-full blur-3xl opacity-30" style={{ background: "radial-gradient(circle, hsl(217 91% 60%), transparent 70%)" }} />
      <div className="absolute bottom-0 start-0 w-[380px] h-[380px] rounded-full blur-3xl opacity-20" style={{ background: "radial-gradient(circle, hsl(160 84% 39%), transparent 70%)" }} />

      {/* Top-right controls */}
      <div className="absolute top-5 end-5 flex items-center gap-1.5 z-10">
        <button
          onClick={toggleTheme}
          data-testid="login-toggle-theme"
          className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md text-white hover:bg-white/20 flex items-center justify-center press"
          aria-label="toggle theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        <button
          onClick={toggleLang}
          data-testid="login-toggle-lang"
          className="h-10 px-3 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md text-white hover:bg-white/20 flex items-center gap-1.5 text-xs font-medium press"
        >
          <Languages className="w-4 h-4" />
          {lang === "ar" ? "EN" : "ع"}
        </button>
      </div>

      {/* Centered card */}
      <div className="relative z-10 w-full max-w-md fade-in-up">
        <div className="bg-card/95 backdrop-blur-xl border border-white/10 rounded-3xl p-8 md:p-10" style={{ boxShadow: "0 25px 50px -12px rgb(0 0 0 / 0.5)" }}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[hsl(226_64%_33%)] to-[hsl(217_91%_60%)] flex items-center justify-center mb-4 shadow-lg">
              <Sparkles className="w-7 h-7 text-white" strokeWidth={2} />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">RepairOS</h1>
            <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground mt-1">
              {lang === "ar" ? "نظام إدارة الصيانة" : "Repair Management System"}
            </p>
          </div>

          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold tracking-tight">{t("welcome_back")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === "ar" ? "يرجى إدخال بيانات الدخول للمتابعة" : "Please sign in to continue"}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                {lang === "ar" ? "اسم المستخدم" : "Username"}
              </label>
              <div className="relative">
                <User className="w-4 h-4 absolute top-3 start-3.5 text-muted-foreground pointer-events-none" />
                <input
                  data-testid="login-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="w-full h-11 ps-10 pe-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium mb-1.5 block text-muted-foreground">
                {lang === "ar" ? "كلمة المرور" : "Password"}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute top-3 start-3.5 text-muted-foreground pointer-events-none" />
                <input
                  data-testid="login-password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full h-11 ps-10 pe-3 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                />
              </div>
            </div>

            {err && (
              <div data-testid="login-error" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {err}
              </div>
            )}

            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-[hsl(226_64%_33%)] to-[hsl(217_91%_55%)] text-white font-semibold text-sm disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>{lang === "ar" ? "تسجيل الدخول" : "Sign in"}</span>
                  <ArrowLeft className={`w-4 h-4 ${lang === "ar" ? "" : "rotate-180"}`} />
                </>
              )}
            </button>
          </form>
        </div>

        <div className="text-center text-xs text-white/50 mt-6">
          {lang === "ar" ? "© 2026 RepairOS — نظام احترافي لإدارة الصيانة" : "© 2026 RepairOS — Enterprise Repair Management"}
        </div>
      </div>
    </div>
  );
}
