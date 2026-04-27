"""Settings router - tenant configuration."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.deps import get_db, get_current_user, require_roles, audit_log
from app.telegram_service import send_telegram_message

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingsReq(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = None
    whatsapp_number: Optional[str] = None
    whatsapp_complete_template: Optional[str] = None
    whatsapp_followup_template: Optional[str] = None
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_notify_maintenance: Optional[bool] = None
    telegram_notify_debts: Optional[bool] = None
    telegram_notify_daily: Optional[bool] = None
    follow_up_enabled: Optional[bool] = None
    follow_up_hours: Optional[int] = None


@router.get("")
async def get_settings(user: dict = Depends(get_current_user)):
    db = get_db()
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not t:
        raise HTTPException(404, "Tenant not found")
    return t


@router.patch("")
async def update_settings(req: SettingsReq, user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    if not patch:
        return {"ok": True}
    await db.tenants.update_one({"id": user["tenant_id"]}, {"$set": patch})
    await audit_log(db, user, "updated", "settings", user["tenant_id"], f"fields: {list(patch.keys())}")
    return {"ok": True}


@router.post("/telegram/test")
async def test_telegram(user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    t = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    if not t or not t.get("telegram_bot_token") or not t.get("telegram_chat_id"):
        raise HTTPException(400, "لم يتم ضبط Telegram Token أو Chat ID")
    ok = await send_telegram_message(
        t["telegram_bot_token"], t["telegram_chat_id"],
        f"✅ <b>اختبار اتصال ناجح</b>\nتم ربط البوت بنظام {t.get('name','')} بنجاح."
    )
    if not ok:
        raise HTTPException(400, "فشل الإرسال - تحقق من Token و Chat ID")
    return {"ok": True}
