"""Dashboard / Analytics router."""
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from fastapi import APIRouter, Depends

from app.deps import get_db, get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats(user: dict = Depends(get_current_user)):
    db = get_db()
    tid = user["tenant_id"]

    customers_count = await db.customers.count_documents({"tenant_id": tid})
    maint_total = await db.maintenance.count_documents({"tenant_id": tid})
    maint_active = await db.maintenance.count_documents({"tenant_id": tid, "status": {"$in": ["in_progress", "completed"]}})
    maint_delivered = await db.maintenance.count_documents({"tenant_id": tid, "status": "delivered"})
    parts_count = await db.spare_parts.count_documents({"tenant_id": tid})

    # low stock parts
    low_stock_cursor = db.spare_parts.find({
        "tenant_id": tid,
        "$expr": {"$lte": ["$quantity", "$low_stock_threshold"]},
    }, {"_id": 0}).limit(20)
    low_stock = await low_stock_cursor.to_list(20)

    # debt totals
    open_debts_count = await db.debts.count_documents({"tenant_id": tid, "status": {"$in": ["open", "partially_paid"]}})
    debt_agg = db.debts.aggregate([
        {"$match": {"tenant_id": tid, "status": {"$in": ["open", "partially_paid"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount_remaining"}}},
    ])
    debt_total = 0.0
    async for row in debt_agg:
        debt_total = row.get("total", 0) or 0

    # profit: sum of maintenance profits
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()
    prof_total_agg = db.maintenance.aggregate([
        {"$match": {"tenant_id": tid}},
        {"$group": {"_id": None, "p": {"$sum": "$profit"}, "r": {"$sum": "$agreed_price"}}},
    ])
    profit_total = 0.0
    revenue_total = 0.0
    async for row in prof_total_agg:
        profit_total = row.get("p", 0) or 0
        revenue_total = row.get("r", 0) or 0

    prof_month_agg = db.maintenance.aggregate([
        {"$match": {"tenant_id": tid, "created_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "p": {"$sum": "$profit"}, "r": {"$sum": "$agreed_price"}}},
    ])
    profit_month = 0.0
    revenue_month = 0.0
    async for row in prof_month_agg:
        profit_month = row.get("p", 0) or 0
        revenue_month = row.get("r", 0) or 0

    # chart: last 30 days
    since = (now - timedelta(days=29)).replace(hour=0, minute=0, second=0, microsecond=0)
    chart_cursor = db.maintenance.find({
        "tenant_id": tid,
        "created_at": {"$gte": since.isoformat()},
    }, {"_id": 0, "created_at": 1, "profit": 1, "agreed_price": 1})
    buckets = defaultdict(lambda: {"profit": 0.0, "revenue": 0.0, "count": 0})
    async for m in chart_cursor:
        ts = m["created_at"][:10]
        buckets[ts]["profit"] += m.get("profit", 0) or 0
        buckets[ts]["revenue"] += m.get("agreed_price", 0) or 0
        buckets[ts]["count"] += 1
    chart = []
    for i in range(30):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        b = buckets.get(d, {"profit": 0.0, "revenue": 0.0, "count": 0})
        chart.append({"date": d, **b})

    # pending followups count
    pending_followups = await db.maintenance.count_documents({
        "tenant_id": tid,
        "follow_up_sent": False,
        "follow_up_due_at": {"$lte": now.isoformat(), "$ne": None},
        "status": "delivered",
    })

    return {
        "customers_count": customers_count,
        "maint_total": maint_total,
        "maint_active": maint_active,
        "maint_delivered": maint_delivered,
        "parts_count": parts_count,
        "low_stock_count": len(low_stock),
        "low_stock": low_stock,
        "open_debts_count": open_debts_count,
        "debt_total": round(debt_total, 2),
        "profit_total": round(profit_total, 2),
        "revenue_total": round(revenue_total, 2),
        "profit_month": round(profit_month, 2),
        "revenue_month": round(revenue_month, 2),
        "pending_followups": pending_followups,
        "chart_30d": chart,
    }


@router.get("/search")
async def global_search(q: str, user: dict = Depends(get_current_user)):
    if not q or len(q) < 1:
        return {"customers": [], "maintenance": [], "debts": [], "parts": []}
    db = get_db()
    tid = user["tenant_id"]
    regex = {"$regex": q, "$options": "i"}

    customers = await db.customers.find({
        "tenant_id": tid,
        "$or": [{"name": regex}, {"phone": regex}],
    }, {"_id": 0}).limit(10).to_list(10)

    maint = await db.maintenance.find({
        "tenant_id": tid,
        "$or": [{"customer_name": regex}, {"customer_phone": regex}, {"device_type": regex}, {"issue": regex}],
    }, {"_id": 0}).limit(10).to_list(10)

    debts = await db.debts.find({
        "tenant_id": tid,
        "$or": [{"customer_name": regex}, {"customer_phone": regex}],
    }, {"_id": 0}).limit(10).to_list(10)

    parts = await db.spare_parts.find({
        "tenant_id": tid,
        "$or": [{"name": regex}, {"device_name": regex}, {"location": regex}, {"compatible_devices": regex}],
    }, {"_id": 0}).limit(10).to_list(10)

    return {"customers": customers, "maintenance": maint, "debts": debts, "parts": parts}


@router.get("/audit-logs")
async def audit_logs(limit: int = 50, user: dict = Depends(get_current_user)):
    db = get_db()
    cursor = db.audit_logs.find({"tenant_id": user["tenant_id"]}, {"_id": 0}).sort("created_at", -1).limit(min(limit, 200))
    return await cursor.to_list(limit)
