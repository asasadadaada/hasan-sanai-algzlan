"""Telegram notification service. Sends messages using per-tenant bot tokens."""
import httpx
import logging

log = logging.getLogger(__name__)


async def send_telegram_message(bot_token: str, chat_id: str, text: str) -> bool:
    if not bot_token or not chat_id:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    try:
        async with httpx.AsyncClient(timeout=10.0) as c:
            r = await c.post(url, json=payload)
            if r.status_code != 200:
                log.warning("Telegram send failed: %s %s", r.status_code, r.text[:200])
                return False
            return True
    except Exception as e:
        log.exception("Telegram exception: %s", e)
        return False


async def notify_tenant(db, tenant_id: str, text: str, category: str = "maintenance"):
    """Lookup tenant, check notification flag, send message."""
    tenant = await db.tenants.find_one({"id": tenant_id}, {"_id": 0})
    if not tenant:
        return False
    token = tenant.get("telegram_bot_token")
    chat = tenant.get("telegram_chat_id")
    if not token or not chat:
        return False
    flag_map = {
        "maintenance": "telegram_notify_maintenance",
        "debt": "telegram_notify_debts",
        "daily": "telegram_notify_daily",
    }
    if not tenant.get(flag_map.get(category, "telegram_notify_maintenance"), True):
        return False
    return await send_telegram_message(token, chat, text)
