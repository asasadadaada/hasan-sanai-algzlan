"""Maintenance router - core business logic with auto-debt + parts deduction + telegram notify."""
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional

from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import Maintenance, SparePartUsage, Debt, Customer
from app.telegram_service import notify_tenant

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])


class PartUsageIn(BaseModel):
    part_id: Optional[str] = None
    name: str
    qty: int = 1
    price: float = 0.0


class MaintReq(BaseModel):
    customer_id: Optional[str] = None
    customer_name: str
    customer_phone: str
    device_type: str
    device_model: Optional[str] = None
    issue: str
    parts_used: List[PartUsageIn] = []
    agreed_price: float = 0.0
    paid_amount: float = 0.0
    status: str = "in_progress"


async def _resolve_customer(db, tenant_id: str, customer_id: Optional[str], name: str, phone: str) -> str:
    if customer_id:
        c = await db.customers.find_one({"id": customer_id, "tenant_id": tenant_id})
        if c:
            return customer_id
    existing = await db.customers.find_one({"tenant_id": tenant_id, "phone": phone})
    if existing:
        return existing["id"]
    c = Customer(tenant_id=tenant_id, name=name, phone=phone)
    doc = c.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.customers.insert_one(doc)
    return c.id


async def _deduct_parts(db, tenant_id: str, parts: List[PartUsageIn]):
    for p in parts:
        if p.part_id:
            await db.spare_parts.update_one(
                {"id": p.part_id, "tenant_id": tenant_id, "quantity": {"$gte": p.qty}},
                {"$inc": {"quantity": -p.qty}},
            )


async def _restore_parts(db, tenant_id: str, parts: List[dict]):
    for p in parts:
        pid = p.get("part_id")
        if pid:
            await db.spare_parts.update_one(
                {"id": pid, "tenant_id": tenant_id},
                {"$inc": {"quantity": p.get("qty", 0)}},
            )


async def _recalc_customer_debt(db, tenant_id: str, customer_id: str):
    total = 0.0
    cursor = db.debts.find({"tenant_id": tenant_id, "customer_id": customer_id, "status": {"$in": ["open", "partially_paid"]}})
    async for d in cursor:
        total += d.get("amount_remaining", 0)
    await db.customers.update_one({"id": customer_id, "tenant_id": tenant_id}, {"$set": {"total_debt": round(total, 2)}})


@router.get("")
async def list_maintenance(q: str = Query(None), status: str = Query(None), user: dict = Depends(get_current_user)):
    db = get_db()
    filt = {"tenant_id": user["tenant_id"]}
    if status:
        filt["status"] = status
    if q:
        filt["$or"] = [
            {"customer_name": {"$regex": q, "$options": "i"}},
            {"customer_phone": {"$regex": q, "$options": "i"}},
            {"device_type": {"$regex": q, "$options": "i"}},
            {"device_model": {"$regex": q, "$options": "i"}},
            {"issue": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.maintenance.find(filt, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@router.post("")
async def create_maintenance(req: MaintReq, user: dict = Depends(get_current_user)):
    db = get_db()
    cid = await _resolve_customer(db, user["tenant_id"], req.customer_id, req.customer_name, req.customer_phone)

    parts_list = [SparePartUsage(**p.model_dump()) for p in req.parts_used]
    parts_cost = sum(p.price * p.qty for p in parts_list)
    agreed = max(0.0, req.agreed_price)
    paid = max(0.0, min(req.paid_amount, agreed))
    debt = round(agreed - paid, 2)
    profit = round(agreed - parts_cost, 2)

    m = Maintenance(
        tenant_id=user["tenant_id"],
        customer_id=cid,
        customer_name=req.customer_name,
        customer_phone=req.customer_phone,
        device_type=req.device_type,
        device_model=req.device_model,
        issue=req.issue,
        parts_used=parts_list,
        parts_cost=round(parts_cost, 2),
        agreed_price=agreed,
        paid_amount=round(paid, 2),
        debt_amount=debt,
        profit=profit,
        status=req.status,
        created_by=user["id"],
    )
    doc = m.model_dump()
    doc["received_at"] = doc["received_at"].isoformat()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.maintenance.insert_one(doc)

    await _deduct_parts(db, user["tenant_id"], req.parts_used)

    if debt > 0:
        d = Debt(
            tenant_id=user["tenant_id"],
            customer_id=cid,
            customer_name=req.customer_name,
            customer_phone=req.customer_phone,
            maintenance_id=m.id,
            amount_total=debt,
            amount_paid=0.0,
            amount_remaining=debt,
            notes=f"صيانة {req.device_type} - {req.issue[:40]}",
        )
        ddoc = d.model_dump()
        ddoc["created_at"] = ddoc["created_at"].isoformat()
        await db.debts.insert_one(ddoc)
    await _recalc_customer_debt(db, user["tenant_id"], cid)

    await audit_log(db, user, "created", "maintenance", m.id, f"{req.customer_name} - {req.device_type}")
    await notify_tenant(db, user["tenant_id"],
        f"🛠 <b>صيانة جديدة</b>\nالزبون: {req.customer_name}\nالجهاز: {req.device_type}\nالسعر: {agreed} | المدفوع: {paid} | الدين: {debt}",
        category="maintenance")

    doc.pop("_id", None)
    return doc


@router.get("/{mid}")
async def get_maintenance(mid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    m = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]}, {"_id": 0})
    if not m:
        raise HTTPException(404, "Not found")
    return m


@router.patch("/{mid}")
async def update_maintenance(mid: str, req: MaintReq, user: dict = Depends(get_current_user)):
    db = get_db()
    existing = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]})
    if not existing:
        raise HTTPException(404, "Not found")

    # restore old parts stock first
    await _restore_parts(db, user["tenant_id"], existing.get("parts_used", []))

    parts_list = [SparePartUsage(**p.model_dump()) for p in req.parts_used]
    parts_cost = sum(p.price * p.qty for p in parts_list)
    agreed = max(0.0, req.agreed_price)
    paid = max(0.0, min(req.paid_amount, agreed))
    debt = round(agreed - paid, 2)
    profit = round(agreed - parts_cost, 2)

    patch = {
        "customer_name": req.customer_name,
        "customer_phone": req.customer_phone,
        "device_type": req.device_type,
        "device_model": req.device_model,
        "issue": req.issue,
        "parts_used": [p.model_dump() for p in parts_list],
        "parts_cost": round(parts_cost, 2),
        "agreed_price": agreed,
        "paid_amount": round(paid, 2),
        "debt_amount": debt,
        "profit": profit,
        "status": req.status,
    }
    await db.maintenance.update_one({"id": mid}, {"$set": patch})
    await _deduct_parts(db, user["tenant_id"], req.parts_used)

    # sync/rebuild linked debt
    cid = existing["customer_id"]
    linked = await db.debts.find_one({"maintenance_id": mid, "tenant_id": user["tenant_id"]})
    if debt > 0:
        if linked:
            newly_paid = linked.get("amount_paid", 0.0)
            newly_remaining = max(0.0, round(debt - newly_paid, 2))
            new_status = "paid" if newly_remaining == 0 else ("partially_paid" if newly_paid > 0 else "open")
            await db.debts.update_one({"id": linked["id"]}, {"$set": {
                "amount_total": debt,
                "amount_remaining": newly_remaining,
                "customer_name": req.customer_name,
                "customer_phone": req.customer_phone,
                "status": new_status,
            }})
        else:
            d = Debt(tenant_id=user["tenant_id"], customer_id=cid,
                     customer_name=req.customer_name, customer_phone=req.customer_phone,
                     maintenance_id=mid, amount_total=debt, amount_remaining=debt)
            ddoc = d.model_dump()
            ddoc["created_at"] = ddoc["created_at"].isoformat()
            await db.debts.insert_one(ddoc)
    else:
        if linked:
            await db.debts.delete_one({"id": linked["id"]})

    await _recalc_customer_debt(db, user["tenant_id"], cid)
    await audit_log(db, user, "updated", "maintenance", mid)
    return {"ok": True}


@router.delete("/{mid}")
async def delete_maintenance(mid: str, user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    existing = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]})
    if not existing:
        raise HTTPException(404, "Not found")
    await _restore_parts(db, user["tenant_id"], existing.get("parts_used", []))
    # remove linked debt if unpaid
    linked = await db.debts.find_one({"maintenance_id": mid, "tenant_id": user["tenant_id"]})
    if linked and linked.get("amount_paid", 0) == 0:
        await db.debts.delete_one({"id": linked["id"]})
    await db.maintenance.delete_one({"id": mid})
    await _recalc_customer_debt(db, user["tenant_id"], existing["customer_id"])
    await audit_log(db, user, "deleted", "maintenance", mid)
    await notify_tenant(db, user["tenant_id"], f"🗑 تم حذف صيانة: {existing.get('customer_name','')}", category="maintenance")
    return {"ok": True}


class PayReq(BaseModel):
    amount: float = Field(..., gt=0)


@router.post("/{mid}/pay")
async def pay_maintenance(mid: str, req: PayReq, user: dict = Depends(get_current_user)):
    db = get_db()
    m = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]})
    if not m:
        raise HTTPException(404, "Not found")
    new_paid = round(min(m["agreed_price"], m["paid_amount"] + req.amount), 2)
    new_debt = round(m["agreed_price"] - new_paid, 2)
    await db.maintenance.update_one({"id": mid}, {"$set": {"paid_amount": new_paid, "debt_amount": new_debt}})

    linked = await db.debts.find_one({"maintenance_id": mid, "tenant_id": user["tenant_id"]})
    if linked:
        d_paid = round(linked["amount_paid"] + req.amount, 2)
        d_remain = max(0.0, round(linked["amount_total"] - d_paid, 2))
        status = "paid" if d_remain == 0 else "partially_paid"
        await db.debts.update_one({"id": linked["id"]}, {"$set": {
            "amount_paid": d_paid, "amount_remaining": d_remain, "status": status,
        }})

    await _recalc_customer_debt(db, user["tenant_id"], m["customer_id"])
    await audit_log(db, user, "paid", "maintenance", mid, f"amount={req.amount}")
    return {"ok": True, "paid": new_paid, "debt": new_debt}


@router.post("/{mid}/complete")
async def complete_maintenance(mid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    m = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]})
    if not m:
        raise HTTPException(404, "Not found")
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0})
    now = datetime.now(timezone.utc)
    follow_hours = tenant.get("follow_up_hours", 24) if tenant else 24
    follow_enabled = tenant.get("follow_up_enabled", True) if tenant else True
    follow_due = (now + timedelta(hours=follow_hours)).isoformat() if follow_enabled else None
    await db.maintenance.update_one({"id": mid}, {"$set": {
        "status": "delivered",
        "completed_at": now.isoformat(),
        "delivered_at": now.isoformat(),
        "follow_up_due_at": follow_due,
        "follow_up_sent": False,
    }})

    template = (tenant or {}).get("whatsapp_complete_template") or "مرحباً {customer_name}، جهازكم جاهز للاستلام."
    message = template.replace("{customer_name}", m["customer_name"]).replace("{device}", m.get("device_type", ""))
    await audit_log(db, user, "completed", "maintenance", mid)
    await notify_tenant(db, user["tenant_id"],
        f"✅ <b>تم التسليم</b>\n{m['customer_name']} - {m.get('device_type','')}", category="maintenance")
    return {"ok": True, "whatsapp_phone": m["customer_phone"], "whatsapp_message": message}


class FollowUpMarkReq(BaseModel):
    success: bool = True


@router.post("/{mid}/followup-sent")
async def mark_followup_sent(mid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    m = await db.maintenance.find_one({"id": mid, "tenant_id": user["tenant_id"]})
    if not m:
        raise HTTPException(404, "Not found")
    await db.maintenance.update_one({"id": mid}, {"$set": {"follow_up_sent": True}})
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0}) or {}
    template = tenant.get("whatsapp_followup_template") or "مرحباً {customer_name}، هل تعاني من أي مشكلة بعد الصيانة؟"
    message = template.replace("{customer_name}", m["customer_name"])
    return {"ok": True, "whatsapp_phone": m["customer_phone"], "whatsapp_message": message}


@router.get("/pending/followups")
async def pending_followups(user: dict = Depends(get_current_user)):
    db = get_db()
    now = datetime.now(timezone.utc).isoformat()
    cursor = db.maintenance.find({
        "tenant_id": user["tenant_id"],
        "follow_up_sent": False,
        "follow_up_due_at": {"$lte": now, "$ne": None},
        "status": "delivered",
    }, {"_id": 0}).sort("follow_up_due_at", 1)
    return await cursor.to_list(200)
