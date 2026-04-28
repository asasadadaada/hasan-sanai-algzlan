"""Debts router."""
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import Optional

from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import Debt, Customer
from app.telegram_service import notify_tenant

router = APIRouter(prefix="/api/debts", tags=["debts"])


class DebtReq(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    amount_total: float = Field(..., gt=0)
    due_date: Optional[str] = None
    notes: Optional[str] = None


async def _recalc_customer_debt(db, tenant_id: str, customer_id: str):
    total = 0.0
    cursor = db.debts.find({"tenant_id": tenant_id, "customer_id": customer_id, "status": {"$in": ["open", "partially_paid"]}})
    async for d in cursor:
        total += d.get("amount_remaining", 0)
    await db.customers.update_one({"id": customer_id, "tenant_id": tenant_id}, {"$set": {"total_debt": round(total, 2)}})


async def _resolve_customer(db, tenant_id, cid, name, phone):
    if cid:
        c = await db.customers.find_one({"id": cid, "tenant_id": tenant_id})
        if c: return cid
    existing = await db.customers.find_one({"tenant_id": tenant_id, "phone": phone})
    if existing: return existing["id"]
    c = Customer(tenant_id=tenant_id, name=name, phone=phone)
    doc = c.model_dump(); doc["created_at"] = doc["created_at"].isoformat()
    await db.customers.insert_one(doc)
    return c.id


@router.get("")
async def list_debts(q: str = Query(None), status: str = Query(None), user: dict = Depends(get_current_user)):
    db = get_db()
    filt = {"tenant_id": user["tenant_id"]}
    if status:
        filt["status"] = status
    if q:
        filt["$or"] = [
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"customer_phone": {"$regex": q, "$options": "i"}},
            {"notes": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.debts.find(filt, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@router.post("")
async def create_debt(req: DebtReq, user: dict = Depends(get_current_user)):
    db = get_db()
    cid = await _resolve_customer(db, user["tenant_id"], req.customer_id, req.customer_name, req.customer_phone)
    d = Debt(
        tenant_id=user["tenant_id"],
        customer_id=cid,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        amount_total=req.amount_total,
        amount_remaining=req.amount_total,
        due_date=datetime.fromisoformat(req.due_date) if req.due_date else None,
        notes=req.notes,
    )
    doc = d.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    if doc["due_date"]:
        doc["due_date"] = doc["due_date"].isoformat() if isinstance(doc["due_date"], datetime) else doc["due_date"]
    await db.debts.insert_one(doc)
    await _recalc_customer_debt(db, user["tenant_id"], cid)
    await audit_log(db, user, "created", "debt", d.id, f"{req.customer_name} {req.amount_total}")
    await notify_tenant(db, user["tenant_id"],
        f"💰 <b>دين جديد</b>\nالزبون: {req.customer_name}\nالمبلغ: {req.amount_total}", category="debt")
    doc.pop("_id", None)
    return doc


class PayDebtReq(BaseModel):
    amount: float = Field(..., gt=0)


@router.post("/{did}/pay")
async def pay_debt(did: str, req: PayDebtReq, user: dict = Depends(get_current_user)):
    db = get_db()
    d = await db.debts.find_one({"id": did, "tenant_id": user["tenant_id"]})
    if not d:
        raise HTTPException(404, "Not found")
    amt = round(min(d["amount_remaining"], req.amount), 2)
    new_paid = round(d["amount_paid"] + amt, 2)
    new_remain = round(d["amount_total"] - new_paid, 2)
    status = "paid" if new_remain <= 0 else "partially_paid"
    await db.debts.update_one({"id": did}, {"$set": {
        "amount_paid": new_paid, "amount_remaining": max(0, new_remain), "status": status,
    }})
    # sync maintenance if linked
    if d.get("maintenance_id"):
        m = await db.maintenance.find_one({"id": d["maintenance_id"], "tenant_id": user["tenant_id"]})
        if m:
            mp = round(m["paid_amount"] + amt, 2)
            md = round(m["agreed_price"] - mp, 2)
            await db.maintenance.update_one({"id": m["id"]}, {"$set": {"paid_amount": mp, "debt_amount": md}})
    await _recalc_customer_debt(db, user["tenant_id"], d["customer_id"])
    await audit_log(db, user, "paid", "debt", did, f"amount={amt}")
    await notify_tenant(db, user["tenant_id"],
        f"✅ <b>تسديد دين</b>\n{d['customer_name']} سدد {amt} | متبقي: {max(0, new_remain)}",
        category="debt")
    return {"ok": True, "remaining": max(0, new_remain), "status": status}


@router.patch("/{did}")
async def update_debt(did: str, req: DebtReq, user: dict = Depends(get_current_user)):
    db = get_db()
    d = await db.debts.find_one({"id": did, "tenant_id": user["tenant_id"]})
    if not d:
        raise HTTPException(404, "Not found")
    new_total = req.amount_total
    new_remain = max(0.0, round(new_total - d.get("amount_paid", 0), 2))
    status = "paid" if new_remain == 0 else ("partially_paid" if d.get("amount_paid", 0) > 0 else "open")
    patch = {
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "amount_total": new_total,
        "amount_remaining": new_remain,
        "notes": req.notes,
        "status": status,
        "due_alert_sent": False,
    }
    if req.due_date:
        patch["due_date"] = req.due_date
    await db.debts.update_one({"id": did}, {"$set": patch})
    await _recalc_customer_debt(db, user["tenant_id"], d["customer_id"])
    await audit_log(db, user, "updated", "debt", did)
    return {"ok": True}


@router.delete("/{did}")
async def delete_debt(did: str, user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    d = await db.debts.find_one({"id": did, "tenant_id": user["tenant_id"]})
    if not d:
        raise HTTPException(404, "Not found")
    await db.debts.delete_one({"id": did})
    await _recalc_customer_debt(db, user["tenant_id"], d["customer_id"])
    await audit_log(db, user, "deleted", "debt", did)
    return {"ok": True}
