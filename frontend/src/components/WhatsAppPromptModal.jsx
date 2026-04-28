import React from "react";
import { MessageCircle, X, Phone, User } from "lucide-react";

/**
 * Premium WhatsApp prompt modal — opens after marking complete / followup.
 * Fixes popup-blocker because the wa.me window.open is triggered by a DIRECT user click.
 */
export default function WhatsAppPromptModal({ open, phone, message, customerName, title, subtitle, onClose }) {
  if (!open) return null;

  const send = () => {
    const clean = String(phone || "").replace(/\D/g, "");
    const url = `https://wa.me/${clean}?text=${encodeURIComponent(message || "")}`;
    window.open(url, "_blank", "noopener,noreferrer");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4 fade-in" onClick={onClose} data-testid="whatsapp-prompt-modal">
      <div
        className="bg-card border border-border rounded-2xl w-full max-w-md overflow-hidden fade-in-up"
        style={{ boxShadow: "0 25px 60px -10px rgb(0 0 0 / 0.4)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 pb-5 bg-gradient-to-br from-[hsl(var(--whatsapp))]/15 to-transparent">
          <button onClick={onClose} className="absolute top-4 end-4 w-8 h-8 rounded-lg bg-card border border-border flex items-center justify-center hover:bg-muted press">
            <X className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[hsl(var(--whatsapp))] to-[hsl(142_70%_38%)] flex items-center justify-center text-white shadow-lg shadow-[hsl(var(--whatsapp))]/30 mb-3">
            <MessageCircle className="w-7 h-7" strokeWidth={2} />
          </div>
          <h3 className="text-lg font-bold tracking-tight">{title || "إرسال رسالة WhatsApp"}</h3>
          {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>

        {/* Body */}
        <div className="px-6 pb-2 space-y-3">
          {customerName && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50 border border-border">
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{customerName}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1.5"><Phone className="w-3 h-3" />{phone}</div>
              </div>
            </div>
          )}
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">معاينة الرسالة</div>
            <div className="text-sm bg-muted/40 border border-border rounded-xl p-3.5 leading-relaxed whitespace-pre-wrap" dir="rtl">{message}</div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-5 pt-4 flex items-center gap-2">
          <button onClick={onClose} data-testid="whatsapp-cancel" className="flex-1 h-11 rounded-xl border border-border text-sm font-medium hover:bg-muted press">إلغاء</button>
          <button
            onClick={send}
            data-testid="whatsapp-send"
            className="flex-[2] h-11 rounded-xl bg-gradient-to-r from-[hsl(var(--whatsapp))] to-[hsl(142_70%_40%)] text-white font-semibold text-sm shadow-lg shadow-[hsl(var(--whatsapp))]/25 hover:shadow-xl hover:shadow-[hsl(var(--whatsapp))]/35 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            إرسال الرسالة
          </button>
        </div>
      </div>
    </div>
  );
}
