"""Main FastAPI application - Repair Shop Enterprise SaaS."""
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env")

import os
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

from app.deps import get_db
from app.scheduler_service import start_scheduler, stop_scheduler
from app.routers import auth, customers, maintenance, debts, spare_parts, dashboard, settings as settings_router, invoices

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("repairshop")

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])


async def _ensure_indexes():
    db = get_db()
    await db.users.create_index("email", unique=True)
    await db.users.create_index([("tenant_id", 1)])
    await db.tenants.create_index("id", unique=True)
    await db.customers.create_index([("tenant_id", 1), ("phone", 1)])
    await db.customers.create_index([("tenant_id", 1), ("id", 1)])
    await db.maintenance.create_index([("tenant_id", 1), ("status", 1)])
    await db.maintenance.create_index([("tenant_id", 1), ("customer_id", 1)])
    await db.debts.create_index([("tenant_id", 1), ("status", 1)])
    await db.spare_parts.create_index([("tenant_id", 1), ("name", 1)])
    await db.audit_logs.create_index([("tenant_id", 1), ("created_at", -1)])
    await db.login_attempts.create_index("identifier")


async def _seed_demo():
    """Seed a demo tenant + owner if DB empty, for testing."""
    from app.models import Tenant, User
    from app.security import hash_password, verify_password
    db = get_db()
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@repairshop.test")
    admin_pass = os.environ.get("ADMIN_PASSWORD", "Admin@2026")

    existing = await db.users.find_one({"email": admin_email})
    if existing:
        # Ensure password matches .env (idempotent)
        if not verify_password(admin_pass, existing["password_hash"]):
            await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_pass)}})
        return

    tenant = Tenant(name=os.environ.get("DEFAULT_TENANT_NAME", "Demo Repair Shop"))
    tdoc = tenant.model_dump(); tdoc["created_at"] = tdoc["created_at"].isoformat()
    await db.tenants.insert_one(tdoc)

    user = User(
        tenant_id=tenant.id, email=admin_email, name="Owner",
        role="owner", password_hash=hash_password(admin_pass),
    )
    udoc = user.model_dump(); udoc["created_at"] = udoc["created_at"].isoformat()
    await db.users.insert_one(udoc)
    log.info("Seeded demo owner: %s", admin_email)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await _ensure_indexes()
    await _seed_demo()
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Repair Shop SaaS", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
if not origins:
    origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/api/")
async def root():
    return {"name": "Repair Shop Enterprise SaaS", "status": "ok"}


@app.get("/api/health")
async def health():
    return {"status": "healthy"}


app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(maintenance.router)
app.include_router(debts.router)
app.include_router(spare_parts.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)
app.include_router(invoices.router)
