"""APScheduler jobs: follow-up marking, due-date alerts, daily summaries."""
from datetime import datetime, timezone
from apscheduler.schedulers.asyncio import AsyncIOScheduler
import logging

from app.deps import get_db
from app.telegram_service import notify_tenant

log = logging.getLogger(__name__)
_scheduler = None


async def mark_followups_due():
    """Flag delivered maintenance records that have passed their follow-up window.
    The actual WhatsApp send happens client-side when user opens dashboard
    (so no WhatsApp business API needed). We only mark & notify via telegram."""
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = db.maintenance.find({
        "follow_up_sent": False,
        "status": "delivered",
        "follow_up_due_at": {"$lte": now, "$ne": None},
    })
    async for m in cursor:
        tenant_id = m.get("tenant_id")
        name = m.get("customer_name", "")
        await notify_tenant(
            db, tenant_id,
            f"⏰ <b>متابعة مطلوبة</b>\nالزبون: {name}\nالهاتف: {m.get('customer_phone','')}\nالرجاء الضغط على زر المتابعة في النظام.",
            category="maintenance",
        )


async def check_due_debts():
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = db.debts.find({
        "status": {"$in": ["open", "partially_paid"]},
        "due_date": {"$lte": now, "$ne": None},
        "due_alert_sent": {"$ne": True},
    })
    async for d in cursor:
        tenant_id = d.get("tenant_id")
        await notify_tenant(
            db, tenant_id,
            f"🔔 <b>دين مستحق</b>\nالزبون: {d.get('customer_name','')}\nالمتبقي: {d.get('amount_remaining',0)} IQD",
            category="debt",
        )
        await db.debts.update_one({"id": d["id"]}, {"$set": {"due_alert_sent": True}})


def start_scheduler():
    global _scheduler
    if _scheduler is not None:
        return _scheduler
    _scheduler = AsyncIOScheduler(timezone="UTC")
    _scheduler.add_job(mark_followups_due, "interval", minutes=15, id="followups")
    _scheduler.add_job(check_due_debts, "interval", minutes=30, id="due_debts")
    _scheduler.start()
    log.info("Scheduler started")
    return _scheduler


def stop_scheduler():
    global _scheduler
    if _scheduler:
        _scheduler.shutdown()
        _scheduler = None
