import axios from "axios";

const BASE = process.env.REACT_APP_BACKEND_URL;

export const api = axios.create({
  baseURL: `${BASE}/api`,
  withCredentials: true,
});

// Auto-refresh on 401
let refreshing = null;
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && !original.url?.includes("/auth/")) {
      original._retry = true;
      try {
        refreshing = refreshing || api.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return api(original);
      } catch (e) {
        refreshing = null;
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "حدث خطأ. حاول مرة أخرى.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function fmtMoney(n, cur = "IQD", lang = "ar") {
  const v = Number(n || 0);
  const loc = lang === "ar" ? "ar-IQ" : "en-US";
  return `${v.toLocaleString(loc, { maximumFractionDigits: 0 })} ${cur}`;
}

export function fmtDate(d, lang = "ar") {
  if (!d) return "—";
  try {
    const dd = typeof d === "string" ? new Date(d) : d;
    return dd.toLocaleDateString(lang === "ar" ? "ar-IQ" : "en-US", {
      year: "numeric", month: "short", day: "numeric",
    });
  } catch { return "—"; }
}

export function buildWhatsappUrl(phone, message) {
  const clean = String(phone || "").replace(/\D/g, "");
  return `https://wa.me/${clean}?text=${encodeURIComponent(message || "")}`;
}
