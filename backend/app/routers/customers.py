"""Customers router."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import Customer

router = APIRouter(prefix="/api/customers", tags=["customers"])


class CustomerReq(BaseModel):
    name: str = Field(..., min_length=1)
    phone: str = Field(..., min_length=1)
    notes: str | None = None


@router.get("")
async def list_customers(q: str = Query(None), user: dict = Depends(get_current_user)):
    db = get_db()
    filt = {"tenant_id": user["tenant_id"]}
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"phone": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.customers.find(filt, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(500)


@router.post("")
async def create_customer(req: CustomerReq, user: dict = Depends(get_current_user)):
    db = get_db()
    existing = await db.customers.find_one({"tenant_id": user["tenant_id"], "phone": req.phone}, {"_id": 0})
    if existing:
        return existing
    c = Customer(tenant_id=user["tenant_id"], name=req.name, phone=req.phone, notes=req.notes)
    doc = c.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.customers.insert_one(doc)
    await audit_log(db, user, "created", "customer", c.id, req.name)
    doc.pop("_id", None)
    return doc


@router.patch("/{cid}")
async def update_customer(cid: str, req: CustomerReq, user: dict = Depends(get_current_user)):
    db = get_db()
    r = await db.customers.update_one(
        {"id": cid, "tenant_id": user["tenant_id"]},
        {"$set": {"name": req.name, "phone": req.phone, "notes": req.notes}},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    await audit_log(db, user, "updated", "customer", cid)
    return {"ok": True}


@router.delete("/{cid}")
async def delete_customer(cid: str, user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    # cascade: prevent delete if has open debts
    has_debts = await db.debts.find_one({"tenant_id": user["tenant_id"], "customer_id": cid, "status": {"$ne": "paid"}})
    if has_debts:
        raise HTTPException(400, "لا يمكن حذف زبون لديه ديون مفتوحة")
    r = await db.customers.delete_one({"id": cid, "tenant_id": user["tenant_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await audit_log(db, user, "deleted", "customer", cid)
    return {"ok": True}


@router.get("/{cid}")
async def get_customer(cid: str, user: dict = Depends(get_current_user)):
    db = get_db()
    c = await db.customers.find_one({"id": cid, "tenant_id": user["tenant_id"]}, {"_id": 0})
    if not c:
        raise HTTPException(404, "Not found")
    maints = await db.maintenance.find({"tenant_id": user["tenant_id"], "customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    debts = await db.debts.find({"tenant_id": user["tenant_id"], "customer_id": cid}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return {"customer": c, "maintenance": maints, "debts": debts}
