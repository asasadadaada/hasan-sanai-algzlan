"""Pydantic models for all domain entities. UUIDs only - NEVER ObjectId."""
from datetime import datetime, timezone
from typing import List, Optional, Literal
import uuid
from pydantic import BaseModel, Field, EmailStr


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return str(uuid.uuid4())


# ============ AUTH / TENANT / USER ============
Role = Literal["owner", "manager", "staff"]


class Tenant(BaseModel):
    id: str = Field(default_factory=_uid)
    name: str
    phone: Optional[str] = None
    address: Optional[str] = None
    currency: str = "IQD"
    whatsapp_number: Optional[str] = None
    whatsapp_complete_template: str = "مرحباً {customer_name}، جهازكم جاهز للاستلام. شكراً لثقتكم بنا."
    whatsapp_followup_template: str = "مرحباً {customer_name}، نأمل أن يعمل جهازكم بشكل ممتاز بعد الصيانة. هل تواجه أي مشكلة؟ نحن في خدمتكم."
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None
    telegram_notify_maintenance: bool = True
    telegram_notify_debts: bool = True
    telegram_notify_daily: bool = True
    follow_up_enabled: bool = True
    follow_up_hours: int = 24
    created_at: datetime = Field(default_factory=_now)


class User(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    username: str
    email: Optional[str] = None
    name: str
    role: Role = "staff"
    password_hash: str
    is_active: bool = True
    created_at: datetime = Field(default_factory=_now)


# ============ DOMAIN ============
class Customer(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    name: str
    phone: str
    notes: Optional[str] = None
    total_debt: float = 0.0
    created_at: datetime = Field(default_factory=_now)


class SparePartUsage(BaseModel):
    part_id: Optional[str] = None
    name: str
    qty: int = 1
    price: float = 0.0


MaintenanceStatus = Literal["in_progress", "completed", "delivered", "cancelled"]


class Maintenance(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    device_type: str
    device_model: Optional[str] = None
    issue: str
    parts_used: List[SparePartUsage] = Field(default_factory=list)
    parts_cost: float = 0.0
    agreed_price: float = 0.0
    paid_amount: float = 0.0
    debt_amount: float = 0.0
    profit: float = 0.0
    status: MaintenanceStatus = "in_progress"
    received_at: datetime = Field(default_factory=_now)
    completed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    follow_up_due_at: Optional[datetime] = None
    follow_up_sent: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


DebtStatus = Literal["open", "partially_paid", "paid"]


class Debt(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    customer_id: str
    customer_name: str
    customer_phone: str
    maintenance_id: Optional[str] = None
    amount_total: float
    amount_paid: float = 0.0
    amount_remaining: float
    due_date: Optional[datetime] = None
    notes: Optional[str] = None
    status: DebtStatus = "open"
    created_at: datetime = Field(default_factory=_now)


PartType = Literal["original", "copy"]


class SparePart(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    name: str
    type: PartType = "original"
    device_name: str
    compatible_devices: List[str] = Field(default_factory=list)
    location: str
    quantity: int = 0
    low_stock_threshold: int = 2
    cost_price: float = 0.0
    sell_price: float = 0.0
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)


class AuditLog(BaseModel):
    id: str = Field(default_factory=_uid)
    tenant_id: str
    user_id: str
    user_email: Optional[str] = None
    action: str  # created/updated/deleted/settled
    entity: str  # maintenance/debt/spare_part/user/settings
    entity_id: Optional[str] = None
    summary: Optional[str] = None
    created_at: datetime = Field(default_factory=_now)
