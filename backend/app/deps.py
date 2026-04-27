"""FastAPI dependency helpers: db, current user, tenant scope, RBAC."""
import os
from fastapi import Request, HTTPException, Depends
from motor.motor_asyncio import AsyncIOMotorClient
import jwt as pyjwt

from app.security import decode_token

_client = None
_db = None


def get_db():
    global _client, _db
    if _client is None:
        _client = AsyncIOMotorClient(os.environ["MONGO_URL"])
        _db = _client[os.environ["DB_NAME"]]
    return _db


async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = decode_token(token)
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("type") != "access":
        raise HTTPException(status_code=401, detail="Invalid token type")
    db = get_db()
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or disabled")
    return user


def require_roles(*roles: str):
    async def _check(user: dict = Depends(get_current_user)):
        if user.get("role") not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user
    return _check


async def audit_log(db, user: dict, action: str, entity: str, entity_id: str = None, summary: str = None):
    from app.models import AuditLog
    log = AuditLog(
        tenant_id=user["tenant_id"],
        user_id=user["id"],
        user_email=user.get("username") or user.get("email"),
        action=action,
        entity=entity,
        entity_id=entity_id,
        summary=summary,
    )
    doc = log.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.audit_logs.insert_one(doc)
