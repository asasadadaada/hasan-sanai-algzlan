"""Spare parts inventory router."""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List

from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import SparePart

router = APIRouter(prefix="/api/spare-parts", tags=["spare_parts"])


class SparePartReq(BaseModel):
    name: str
    type: str = "original"
    device_name: str
    compatible_devices: List[str] = []
    location: str
    quantity: int = 0
    low_stock_threshold: int = 2
    cost_price: float = 0.0
    sell_price: float = 0.0
    notes: str | None = None


@router.get("")
async def list_parts(q: str = Query(None), user: dict = Depends(get_current_user)):
    db = get_db()
    filt = {"tenant_id": user["tenant_id"]}
    if q:
        filt["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"device_name": {"$regex": q, "$options": "i"}},
            {"location": {"$regex": q, "$options": "i"}},
            {"compatible_devices": {"$regex": q, "$options": "i"}},
        ]
    cursor = db.spare_parts.find(filt, {"_id": 0}).sort("created_at", -1)
    return await cursor.to_list(1000)


@router.post("")
async def create_part(req: SparePartReq, user: dict = Depends(get_current_user)):
    db = get_db()
    p = SparePart(tenant_id=user["tenant_id"], **req.model_dump())
    doc = p.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.spare_parts.insert_one(doc)
    await audit_log(db, user, "created", "spare_part", p.id, p.name)
    doc.pop("_id", None)
    return doc


@router.patch("/{pid}")
async def update_part(pid: str, req: SparePartReq, user: dict = Depends(get_current_user)):
    db = get_db()
    r = await db.spare_parts.update_one(
        {"id": pid, "tenant_id": user["tenant_id"]},
        {"$set": req.model_dump()},
    )
    if r.matched_count == 0:
        raise HTTPException(404, "Not found")
    await audit_log(db, user, "updated", "spare_part", pid)
    return {"ok": True}


@router.delete("/{pid}")
async def delete_part(pid: str, user: dict = Depends(require_roles("owner", "manager"))):
    db = get_db()
    r = await db.spare_parts.delete_one({"id": pid, "tenant_id": user["tenant_id"]})
    if r.deleted_count == 0:
        raise HTTPException(404, "Not found")
    await audit_log(db, user, "deleted", "spare_part", pid)
    return {"ok": True}


class UseReq(BaseModel):
    qty: int = Field(1, ge=1)


@router.post("/{pid}/use")
async def use_part(pid: str, req: UseReq, user: dict = Depends(get_current_user)):
    """Decrement stock manually (outside maintenance flow)."""
    db = get_db()
    p = await db.spare_parts.find_one({"id": pid, "tenant_id": user["tenant_id"]})
    if not p:
        raise HTTPException(404, "Not found")
    if p["quantity"] < req.qty:
        raise HTTPException(400, "الكمية غير كافية")
    await db.spare_parts.update_one({"id": pid}, {"$inc": {"quantity": -req.qty}})
    await audit_log(db, user, "used", "spare_part", pid, f"qty={req.qty}")
    return {"ok": True}
