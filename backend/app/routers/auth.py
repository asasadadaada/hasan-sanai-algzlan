"""Auth router: username-based login (no email required), RBAC, profile endpoints."""
import re
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Response, Request, Depends
from pydantic import BaseModel, Field

from app.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    set_auth_cookies, clear_auth_cookies, decode_token,
)
from app.deps import get_db, get_current_user, require_roles, audit_log
from app.models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_ATTEMPTS = 5
LOCKOUT_MINUTES = 15

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")


def _validate_username(u: str) -> str:
    u = (u or "").strip().lower()
    if not USERNAME_RE.match(u):
        raise HTTPException(400, "اسم المستخدم يجب أن يكون 3-32 حرفاً (أحرف، أرقام، _ . -)")
    return u


class LoginReq(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    id: str
    username: str
    name: str
    role: str
    tenant_id: str
    tenant_name: str | None = None


def _sanitize(u: dict, tenant_name: str | None = None) -> dict:
    return {
        "id": u["id"],
        "username": u.get("username", ""),
        "name": u.get("name", ""),
        "role": u.get("role", "staff"),
        "tenant_id": u["tenant_id"],
        "tenant_name": tenant_name,
    }


@router.post("/login", response_model=UserOut)
async def login(req: LoginReq, request: Request, response: Response):
    db = get_db()
    username = (req.username or "").strip().lower()
    if not username:
        raise HTTPException(400, "اسم المستخدم مطلوب")

    xff = request.headers.get("x-forwarded-for", "")
    ip = xff.split(",")[0].strip() if xff else (request.client.host if request.client else "unknown")
    key = f"user:{username}"

    now = datetime.now(timezone.utc)
    attempts = await db.login_attempts.find_one({"identifier": key})
    if attempts and attempts.get("locked_until"):
        locked_iso = attempts["locked_until"]
        locked_dt = datetime.fromisoformat(locked_iso) if isinstance(locked_iso, str) else locked_iso
        if locked_dt > now:
            raise HTTPException(status_code=429, detail="الحساب محظور مؤقتاً. حاول لاحقاً.")

    user = await db.users.find_one({"username": username})
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
async def logout(response: Response):
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


# ============ Profile (self-service) ============
class ChangeUsernameReq(BaseModel):
    username: str
    current_password: str


@router.post("/me/change-username")
async def change_username(req: ChangeUsernameReq, current: dict = Depends(get_current_user)):
    db = get_db()
    new_username = _validate_username(req.username)
    if new_username == current.get("username"):
        return {"ok": True}
    me_doc = await db.users.find_one({"id": current["id"]})
    if not me_doc or not verify_password(req.current_password, me_doc["password_hash"]):
        raise HTTPException(401, "كلمة المرور الحالية غير صحيحة")
    if await db.users.find_one({"username": new_username, "id": {"$ne": current["id"]}}):
        raise HTTPException(400, "اسم المستخدم مستخدم مسبقاً")
    await db.users.update_one({"id": current["id"]}, {"$set": {"username": new_username}})
    await audit_log(db, current, "updated", "user", current["id"], "username changed")
    return {"ok": True, "username": new_username}


class ChangePasswordReq(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6)


@router.post("/me/change-password")
async def change_password(req: ChangePasswordReq, current: dict = Depends(get_current_user)):
    db = get_db()
    me_doc = await db.users.find_one({"id": current["id"]})
    if not me_doc or not verify_password(req.current_password, me_doc["password_hash"]):
        raise HTTPException(401, "كلمة المرور الحالية غير صحيحة")
    await db.users.update_one({"id": current["id"]}, {"$set": {"password_hash": hash_password(req.new_password)}})
    await audit_log(db, current, "updated", "user", current["id"], "password changed")
    return {"ok": True}


class UpdateProfileReq(BaseModel):
    name: str | None = None


@router.patch("/me/profile")
async def update_profile(req: UpdateProfileReq, current: dict = Depends(get_current_user)):
    db = get_db()
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    if patch:
        await db.users.update_one({"id": current["id"]}, {"$set": patch})
    return {"ok": True}


# ============ USER MANAGEMENT (Owner/Manager) ============
class InviteReq(BaseModel):
    username: str
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
    username = _validate_username(req.username)
    if await db.users.find_one({"username": username}):
        raise HTTPException(400, "اسم المستخدم مستخدم مسبقاً")
    user = User(
        tenant_id=current["tenant_id"],
        username=username,
        name=req.name,
        role=req.role,
        password_hash=hash_password(req.password),
    )
    doc = user.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.users.insert_one(doc)
    await audit_log(db, current, "created", "user", user.id, f"Invited {username} as {req.role}")
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
