import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { formatApiErrorDetail } from "@/lib/api";

export default function Register() {
  const { register, t, lang } = useApp();
  const [form, setForm] = useState({ shop_name: "", name: "", email: "", password: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const navigate = useNavigate();
  const upd = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault(); setErr(""); setLoading(true);
    try {
      await register(form);
      toast.success(t("welcome"));
      navigate("/");
    } catch (e2) {
      const msg = formatApiErrorDetail(e2.response?.data?.detail) || e2.message;
      setErr(msg); toast.error(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md fade-in-up">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-lg bg-foreground flex items-center justify-center"><Sparkles className="w-5 h-5 text-background" /></div>
          <div className="font-bold text-xl tracking-tight">RepairOS</div>
        </div>
        <div className="swiss-card p-7">
          <h1 className="text-2xl font-semibold tracking-tight">{t("create_workspace")}</h1>
          <p className="text-muted-foreground text-sm mt-1 mb-6">{lang === "ar" ? "أنشئ مساحة عمل جديدة لمحلك" : "Create your shop workspace"}</p>
          <form onSubmit={submit} className="space-y-3">
            {[
              { k: "shop_name", label: t("shop_name"), req: true },
              { k: "name", label: t("name"), req: true },
              { k: "email", label: t("email"), type: "email", req: true },
              { k: "password", label: t("password"), type: "password", req: true },
              { k: "phone", label: t("phone"), req: false },
            ].map((f) => (
              <div key={f.k}>
                <label className="text-xs font-medium mb-1.5 block">{f.label}</label>
                <input
                  data-testid={`register-${f.k}`}
                  type={f.type || "text"} required={f.req} value={form[f.k]}
                  onChange={upd(f.k)}
                  className="w-full h-10 px-3 rounded-md border border-border bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-foreground/20"
                />
              </div>
            ))}
            {err && <div className="text-xs text-destructive" data-testid="register-error">{err}</div>}
            <button data-testid="register-submit" disabled={loading} type="submit" className="w-full h-10 rounded-md bg-foreground text-background font-medium text-sm hover:opacity-90 active:scale-[0.99] transition-all disabled:opacity-50">
              {loading ? t("loading") : t("create_workspace")}
            </button>
          </form>
          <div className="text-sm text-muted-foreground text-center mt-4">
            {t("have_account")} <Link to="/login" data-testid="go-to-login" className="text-foreground underline underline-offset-4 font-medium">{t("login")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
