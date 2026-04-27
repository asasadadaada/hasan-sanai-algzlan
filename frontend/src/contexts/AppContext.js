import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null); // null=checking, false=unauth, object=ok
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "ar");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "light");
  const t = useT(lang);

  useEffect(() => {
    const d = document.documentElement;
    d.setAttribute("lang", lang);
    d.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    localStorage.setItem("lang", lang);
  }, [lang]);

  useEffect(() => {
    const d = document.documentElement;
    if (theme === "dark") d.classList.add("dark");
    else d.classList.remove("dark");
    localStorage.setItem("theme", theme);
  }, [theme]);

  const checkAuth = useCallback(async () => {
    try {
      const { data } = await api.get("/auth/me");
      setUser(data);
    } catch {
      setUser(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    setUser(data);
    return data;
  }, []);

  const register = useCallback(async (payload) => {
    const { data } = await api.post("/auth/register", payload);
    setUser(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post("/auth/logout"); } catch {}
    setUser(false);
  }, []);

  const value = useMemo(() => ({
    user, setUser, lang, setLang, theme, setTheme, t,
    login, register, logout, checkAuth,
    toggleTheme: () => setTheme((th) => (th === "dark" ? "light" : "dark")),
    toggleLang: () => setLang((l) => (l === "ar" ? "en" : "ar")),
  }), [user, lang, theme, t, login, register, logout, checkAuth]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used inside AppProvider");
  return ctx;
};
