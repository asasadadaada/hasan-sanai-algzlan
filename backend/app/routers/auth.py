"""Auth router: register (creates tenant + owner), login, logout, me, refresh, invite."""
import os
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, EmailStr, Field

from app.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, decode_token,
)
from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import Tenant, User

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


class RegisterReq(BaseModel):
    shop_name: str = Field(..., min_length=2)
    name: str = Field(..., min_length=2)
    email: EmailStr
    password: str = Field(..., min_length=6)
    phone: str | None = None


class LoginReq(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    tenant_id: str
    tenant_name: str | None = None


def _sanitize(user_doc: dict, tenant_name: str | None = None) -> dict:
    return {
        "id": user_doc["id"],
        "email": user_doc["email"],
        "name": user_doc["name"],
        "role": user_doc["role"],
        "tenant_id": user_doc["tenant_id"],
        "tenant_name": tenant_name,
    }


@router.post("/register", response_model=UserOut)
async def register(req: RegisterReq, response: Response):
    db = get_db()
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="البريد الإلكتروني مسجل مسبقاً")

    # create tenant first
    tenant = Tenant(name=req.shop_name, phone=req.phone)
    tdoc = tenant.model_dump()
    tdoc["created_at"] = tdoc["created_at"].isoformat()
    await db.tenants.insert_one(tdoc)

    user = User(
        tenant_id=tenant.id,
        email=email,
        name=req.name,
        role="owner",
        password_hash=hash_password(req.password),
    )
    udoc = user.model_dump()
    udoc["created_at"] = udoc["created_at"].isoformat()
    await db.users.insert_one(udoc)

    access = create_access_token(user.id, tenant.id, user.role)
    refresh = create_refresh_token(user.id, tenant.id)
    set_auth_cookies(response, access, refresh)
    return _sanitize(udoc, tenant.name)


@router.post("/login", response_model=UserOut)
async def login(req: LoginReq, request: Request, response: Response):
    db = get_db()
    email = req.email.lower().strip()
    xff = request.headers.get("x-forwarded-for", "")
    ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")
    # Key by email only so a distributed ingress cannot bypass lockout by splitting across pods.
    # IP is still recorded for audit/RCA via last_attempt_ip.
    key = f"email:{email}"

    # brute force check
    now = datetime.now(timezone.utc)
    attempts = await db.login_attempts.find_one({"identifier": key})
    if attempts and attempts.get("locked_until"):
        locked_iso = attempts["locked_until"]
        if isinstance(locked_iso, str):
            locked_dt = datetime.fromisoformat(locked_iso)
        else:
            locked_dt = locked_iso
        if locked_dt > now:
            raise HTTPException(status_code=429, detail="الحساب محظور مؤقتاً. حاول لاحقاً.")

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(req.password, user["password_hash"]):
        count = (attempts.get("count", 0) if attempts else 0) + 1
        update = {"identifier": key, "count": count, "last_attempt": now.isoformat(), "last_attempt_ip": ip}
        if count >= MAX_ATTEMPTS:
            update["locked_until"] = (now + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
            update["count"] = 0
        await db.login_attempts.update_one({"identifier": key}, {"$set": update}, upsert=True)
        raise HTTPException(status_code=401, detail="بيانات الدخول غير صحيحة")

    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="الحساب معطل")

    await db.login_attempts.delete_one({"identifier": key})
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0, "name": 1})

    access = create_access_token(user["id"], user["tenant_id"], user["role"])
    refresh = create_refresh_token(user["id"], user["tenant_id"])
    set_auth_cookies(response, access, refresh)
    return _sanitize(user, tenant["name"] if tenant else None)


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    clear_auth_cookies(response)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    db = get_db()
    tenant = await db.tenants.find_one({"id": user["tenant_id"]}, {"_id": 0, "name": 1})
    return _sanitize(user, tenant["name"] if tenant else None)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    access = create_access_token(user["id"], user["tenant_id"], user["role"])
    new_refresh = create_refresh_token(user["id"], user["tenant_id"])
    set_auth_cookies(response, access, new_refresh)
    return {"ok": True}


# ============ USER MANAGEMENT (Owner/Manager) ============
class InviteReq(BaseModel):
    email: EmailStr
    name: str
    password: str = Field(..., min_length=6)
    role: str = "staff"


@router.post("/users", response_model=UserOut)
async def create_user(req: InviteReq, current=Depends(require_roles("owner", "manager"))):
    db = get_db()
    if req.role not in ["manager", "staff"]:
        raise HTTPException(400, "Role must be manager or staff")
    if current["role"] == "manager" and req.role == "manager":
        raise HTTPException(403, "Managers cannot create other managers")
    email = req.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "البريد مسجل مسبقاً")
    user = User(
        tenant_id=current["tenant_id"],
        email=email,
        name=req.name,
        role=req.role,
        password_hash=hash_password(req.password),
    )
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.users.insert_one(doc)
    await audit_log(db, current, "created", "user", user.id, f"Invited {email} as {req.role}")
    return _sanitize(doc)


@router.get("/users")
async def list_users(current=Depends(require_roles("owner", "manager"))):
    db = get_db()
    cursor = db.users.find({"tenant_id": current["tenant_id"]}, {"_id": 0, "password_hash": 0})
    return await cursor.to_list(200)


class UpdateUserReq(BaseModel):
    name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    password: str | None = None


@router.patch("/users/{user_id}")
async def update_user(user_id: str, req: UpdateUserReq, current=Depends(require_roles("owner"))):
    db = get_db()
    existing = await db.users.find_one({"id": user_id, "tenant_id": current["tenant_id"]})
    if not existing:
        raise HTTPException(404, "User not found")
    patch = {}
    if req.name: patch["name"] = req.name
    if req.role in ["owner", "manager", "staff"]: patch["role"] = req.role
    if req.is_active is not None: patch["is_active"] = req.is_active
    if req.password: patch["password_hash"] = hash_password(req.password)
    if patch:
        await db.users.update_one({"id": user_id}, {"$set": patch})
    await audit_log(db, current, "updated", "user", user_id, f"Updated fields: {list(patch.keys())}")
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, current=Depends(require_roles("owner"))):
    if user_id == current["id"]:
        raise HTTPException(400, "لا يمكن حذف نفسك")
    db = get_db()
    r = await db.users.delete_one({"id": user_id, "tenant_id": current["tenant_id"], "role": {"$ne": "owner"}})
    if r.deleted_count == 0:
        raise HTTPException(404, "User not found")
    await audit_log(db, current, "deleted", "user", user_id)
    return {"ok": True}
