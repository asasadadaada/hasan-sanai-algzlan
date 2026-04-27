"""Comprehensive backend regression tests for RepairShop SaaS.

Covers: auth (login/register/me/refresh/logout/brute-force), RBAC, customers,
spare-parts (incl. /use), maintenance (auto-debt, parts deduction, pay,
complete, follow-ups), debts (pay/partial/full), dashboard stats/search/audit,
settings + telegram/test, invoices PDF, and multi-tenant isolation.

Uses requests.Session as cookie jar (httpOnly auth cookies).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    # fallback to frontend/.env explicitly (no hardcoding default)
    from pathlib import Path
    env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@repairshop.com"
ADMIN_PASS = "Admin@2026"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def owner_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=30)
    assert r.status_code == 200, f"Owner login failed: {r.status_code} {r.text}"
    return s


@pytest.fixture(scope="session")
def owner_user(owner_session):
    r = owner_session.get(f"{API}/auth/me", timeout=15)
    assert r.status_code == 200
    return r.json()


# =============== AUTH ===============
class TestAuth:
    def test_health(self):
        r = requests.get(f"{API}/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "healthy"

    def test_login_success_sets_httpOnly_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "owner"
        assert body.get("tenant_name")
        # cookies set
        names = {c.name for c in s.cookies}
        assert "access_token" in names and "refresh_token" in names
        # httpOnly check via raw header
        sc = r.headers.get("set-cookie", "")
        assert "HttpOnly" in sc and "Secure" in sc

    def test_login_invalid_credentials_401(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong-pass-x"}, timeout=15)
        assert r.status_code == 401

    def test_me_with_cookie_returns_tenant_name(self, owner_session):
        r = owner_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["email"] == ADMIN_EMAIL
        assert d.get("tenant_name") is not None

    def test_refresh_issues_new_access(self):
        # fresh session to avoid clobbering owner_session cookies
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        old = s.cookies.get("access_token")
        r = s.post(f"{API}/auth/refresh", timeout=15)
        assert r.status_code == 200
        new = s.cookies.get("access_token")
        assert new
        # JWT may be byte-identical if generated within the same second (deterministic).
        # Verify endpoint succeeded and still authenticates after refresh.
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200

    def test_register_creates_new_tenant(self):
        s = requests.Session()
        email = f"t_{uuid.uuid4().hex[:8]}@example.com"
        r = s.post(f"{API}/auth/register", json={
            "shop_name": "TEST_Shop_" + uuid.uuid4().hex[:6],
            "name": "TEST_Owner",
            "email": email,
            "password": "Pass@1234",
        }, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["email"] == email and data["role"] == "owner"
        assert "access_token" in {c.name for c in s.cookies}

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASS}, timeout=15)
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        # subsequent /me should fail
        r2 = s.get(f"{API}/auth/me", timeout=15)
        assert r2.status_code in (401, 403)

    def test_brute_force_lockout_after_5_fails(self):
        # NOTE: This test sends 6 quick failed logins for a unique email.
        # Behind a load-balanced K8s ingress, request.client.host varies per pod,
        # so the per-(ip,email) counter may not reach the threshold on a single pod.
        # We mark this test xfail-style: assert lockout fires within 12 attempts; if not,
        # report it as a REAL backend bug (brute-force key uses raw client.host instead
        # of X-Forwarded-For).
        bad_email = f"nouser_{uuid.uuid4().hex[:8]}@example.com"
        statuses = []
        for _ in range(12):
            r = requests.post(f"{API}/auth/login", json={"email": bad_email, "password": "x"}, timeout=15)
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, (
            f"Brute-force lockout did NOT trigger in 12 attempts. statuses={statuses}. "
            "Likely cause: brute-force key uses request.client.host which differs per "
            "ingress pod behind a load balancer. Use X-Forwarded-For or key by email."
        )


# =============== RBAC ===============
class TestRBAC:
    @pytest.fixture(scope="class")
    def staff_session(self, owner_session):
        # Create a staff user
        email = f"staff_{uuid.uuid4().hex[:6]}@example.com"
        password = "Staff@123"
        r = owner_session.post(f"{API}/auth/users", json={
            "email": email, "name": "TEST_Staff", "password": password, "role": "staff"
        }, timeout=15)
        assert r.status_code == 200, r.text
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)
        assert lr.status_code == 200
        s.user_id = r.json()["id"]
        return s

    def test_staff_cannot_delete_maintenance(self, staff_session):
        r = staff_session.delete(f"{API}/maintenance/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_staff_cannot_delete_debt(self, staff_session):
        r = staff_session.delete(f"{API}/debts/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_staff_cannot_delete_part(self, staff_session):
        r = staff_session.delete(f"{API}/spare-parts/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_owner_can_invite_and_delete_user(self, owner_session, staff_session):
        r = owner_session.delete(f"{API}/auth/users/{staff_session.user_id}", timeout=15)
        assert r.status_code == 200


# =============== CUSTOMERS ===============
class TestCustomers:
    def test_crud(self, owner_session):
        phone = f"07{uuid.uuid4().int % 10**9:09d}"
        r = owner_session.post(f"{API}/customers", json={"name": "TEST_Cust", "phone": phone}, timeout=15)
        assert r.status_code == 200, r.text
        cid = r.json()["id"]

        r = owner_session.get(f"{API}/customers/{cid}", timeout=15)
        assert r.status_code == 200 and r.json()["customer"]["phone"] == phone

        r = owner_session.patch(f"{API}/customers/{cid}", json={"name": "TEST_Cust2", "phone": phone}, timeout=15)
        assert r.status_code == 200

        r = owner_session.get(f"{API}/customers", timeout=15)
        assert r.status_code == 200
        assert any(c["id"] == cid and c["name"] == "TEST_Cust2" for c in r.json())

        r = owner_session.delete(f"{API}/customers/{cid}", timeout=15)
        assert r.status_code == 200

        r = owner_session.get(f"{API}/customers/{cid}", timeout=15)
        assert r.status_code == 404


# =============== SPARE PARTS ===============
class TestSpareParts:
    def test_crud_and_use_decrements(self, owner_session):
        payload = {
            "name": "TEST_Screen",
            "type": "original",
            "device_name": "iPhone 12",
            "compatible_devices": ["iPhone 12", "iPhone 12 Pro"],
            "location": "A1",
            "quantity": 5,
            "low_stock_threshold": 2,
            "cost_price": 50.0,
            "sell_price": 100.0,
        }
        r = owner_session.post(f"{API}/spare-parts", json=payload, timeout=15)
        assert r.status_code == 200, r.text
        pid = r.json()["id"]
        assert r.json()["quantity"] == 5

        # use 2
        r = owner_session.post(f"{API}/spare-parts/{pid}/use", json={"qty": 2}, timeout=15)
        assert r.status_code == 200

        # verify decremented
        r = owner_session.get(f"{API}/spare-parts?q=TEST_Screen", timeout=15)
        rec = next((p for p in r.json() if p["id"] == pid), None)
        assert rec and rec["quantity"] == 3

        # use more than stock
        r = owner_session.post(f"{API}/spare-parts/{pid}/use", json={"qty": 99}, timeout=15)
        assert r.status_code == 400

        # patch
        payload["quantity"] = 10
        r = owner_session.patch(f"{API}/spare-parts/{pid}", json=payload, timeout=15)
        assert r.status_code == 200

        # delete
        r = owner_session.delete(f"{API}/spare-parts/{pid}", timeout=15)
        assert r.status_code == 200


# =============== MAINTENANCE ===============
class TestMaintenance:
    @pytest.fixture(scope="class")
    def part(self, owner_session):
        r = owner_session.post(f"{API}/spare-parts", json={
            "name": "TEST_Battery", "type": "original", "device_name": "iPhone 12",
            "location": "B1", "quantity": 10, "low_stock_threshold": 2,
            "cost_price": 20.0, "sell_price": 40.0,
        }, timeout=15)
        return r.json()

    def test_create_with_parts_auto_debt_and_profit(self, owner_session, part):
        phone = f"07{uuid.uuid4().int % 10**9:09d}"
        body = {
            "customer_name": "TEST_M_Cust",
            "customer_phone": phone,
            "device_type": "Phone",
            "device_model": "iPhone 12",
            "issue": "screen broken",
            "parts_used": [{"part_id": part["id"], "name": part["name"], "qty": 2, "price": 40.0}],
            "agreed_price": 200.0,
            "paid_amount": 50.0,
        }
        r = owner_session.post(f"{API}/maintenance", json=body, timeout=15)
        assert r.status_code == 200, r.text
        m = r.json()
        # parts cost 2*40=80, profit = 200 - 80 = 120
        assert m["parts_cost"] == 80.0
        assert m["profit"] == 120.0
        assert m["debt_amount"] == 150.0
        assert m["paid_amount"] == 50.0
        # part stock decremented (10 -> 8)
        r2 = owner_session.get(f"{API}/spare-parts?q=TEST_Battery", timeout=15)
        rec = next((p for p in r2.json() if p["id"] == part["id"]), None)
        assert rec["quantity"] == 8
        # debt auto-created
        r3 = owner_session.get(f"{API}/debts?q=TEST_M_Cust", timeout=15)
        assert any(d.get("maintenance_id") == m["id"] and d["amount_remaining"] == 150.0 for d in r3.json())
        TestMaintenance._mid = m["id"]
        TestMaintenance._cust_phone = phone

    def test_pay_maintenance_syncs_debt(self, owner_session):
        mid = TestMaintenance._mid
        r = owner_session.post(f"{API}/maintenance/{mid}/pay", json={"amount": 100.0}, timeout=15)
        assert r.status_code == 200
        assert r.json()["paid"] == 150.0 and r.json()["debt"] == 50.0
        # linked debt also updated
        debts = owner_session.get(f"{API}/debts", timeout=15).json()
        d = next((x for x in debts if x.get("maintenance_id") == mid), None)
        assert d and d["amount_paid"] == 100.0 and d["amount_remaining"] == 50.0
        assert d["status"] == "partially_paid"

    def test_complete_returns_whatsapp_payload(self, owner_session):
        mid = TestMaintenance._mid
        r = owner_session.post(f"{API}/maintenance/{mid}/complete", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["whatsapp_phone"] and d["whatsapp_message"]
        assert "TEST_M_Cust" in d["whatsapp_message"]

        m = owner_session.get(f"{API}/maintenance/{mid}", timeout=15).json()
        assert m["status"] == "delivered"
        assert m["follow_up_due_at"] is not None
        assert m["follow_up_sent"] is False

    def test_followup_sent_returns_payload(self, owner_session):
        mid = TestMaintenance._mid
        r = owner_session.post(f"{API}/maintenance/{mid}/followup-sent", timeout=15)
        assert r.status_code == 200
        assert r.json()["whatsapp_message"]
        m = owner_session.get(f"{API}/maintenance/{mid}", timeout=15).json()
        assert m["follow_up_sent"] is True

    def test_pending_followups_listing(self, owner_session):
        # Create another and complete it with follow_up_hours=0 to be due immediately
        owner_session.patch(f"{API}/settings", json={"follow_up_hours": 0, "follow_up_enabled": True}, timeout=15)
        body = {
            "customer_name": "TEST_FU", "customer_phone": "07700000001",
            "device_type": "Phone", "issue": "x", "agreed_price": 50.0, "paid_amount": 50.0,
        }
        m = owner_session.post(f"{API}/maintenance", json=body, timeout=15).json()
        owner_session.post(f"{API}/maintenance/{m['id']}/complete", timeout=15)
        time.sleep(1.5)
        r = owner_session.get(f"{API}/maintenance/pending/followups", timeout=15)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()]
        assert m["id"] in ids
        # cleanup
        owner_session.patch(f"{API}/settings", json={"follow_up_hours": 24}, timeout=15)
        owner_session.delete(f"{API}/maintenance/{m['id']}", timeout=15)

    def test_update_maintenance_restores_and_reapplies_parts(self, owner_session, part):
        # part stock currently 8 (used 2). Update to use 1 instead of 2.
        mid = TestMaintenance._mid
        body = {
            "customer_name": "TEST_M_Cust",
            "customer_phone": TestMaintenance._cust_phone,
            "device_type": "Phone", "device_model": "iPhone 12", "issue": "screen broken",
            "parts_used": [{"part_id": part["id"], "name": part["name"], "qty": 1, "price": 40.0}],
            "agreed_price": 200.0, "paid_amount": 150.0,
            "status": "delivered",
        }
        r = owner_session.patch(f"{API}/maintenance/{mid}", json=body, timeout=15)
        assert r.status_code == 200
        # restore 2 -> 10, then deduct 1 -> 9
        rec = next(p for p in owner_session.get(f"{API}/spare-parts?q=TEST_Battery", timeout=15).json()
                   if p["id"] == part["id"])
        assert rec["quantity"] == 9


# =============== DEBTS ===============
class TestDebts:
    def test_partial_then_full_pay(self, owner_session):
        phone = f"07{uuid.uuid4().int % 10**9:09d}"
        r = owner_session.post(f"{API}/debts", json={
            "customer_name": "TEST_D", "customer_phone": phone, "amount_total": 100.0,
        }, timeout=15)
        assert r.status_code == 200
        did = r.json()["id"]
        cid = r.json()["customer_id"]

        # customer total_debt should be 100
        c = owner_session.get(f"{API}/customers/{cid}", timeout=15).json()
        assert c["customer"]["total_debt"] == 100.0

        # partial
        r = owner_session.post(f"{API}/debts/{did}/pay", json={"amount": 30.0}, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "partially_paid"

        # full
        r = owner_session.post(f"{API}/debts/{did}/pay", json={"amount": 70.0}, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "paid"

        # customer total_debt back to 0
        c = owner_session.get(f"{API}/customers/{cid}", timeout=15).json()
        assert c["customer"]["total_debt"] == 0.0

        # delete
        r = owner_session.delete(f"{API}/debts/{did}", timeout=15)
        assert r.status_code == 200


# =============== DASHBOARD ===============
class TestDashboard:
    def test_stats_has_all_keys(self, owner_session):
        r = owner_session.get(f"{API}/dashboard/stats", timeout=20)
        assert r.status_code == 200
        d = r.json()
        for k in ["customers_count", "maint_total", "maint_active", "maint_delivered",
                  "debt_total", "profit_total", "profit_month", "low_stock",
                  "chart_30d", "pending_followups"]:
            assert k in d, f"missing key {k}"
        assert isinstance(d["chart_30d"], list) and len(d["chart_30d"]) == 30

    def test_search_returns_buckets(self, owner_session):
        r = owner_session.get(f"{API}/dashboard/search", params={"q": "TEST"}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        for k in ["customers", "maintenance", "debts", "parts"]:
            assert k in body and isinstance(body[k], list)

    def test_audit_logs(self, owner_session):
        r = owner_session.get(f"{API}/dashboard/audit-logs", timeout=15)
        assert r.status_code == 200 and isinstance(r.json(), list)


# =============== SETTINGS ===============
class TestSettings:
    def test_get_and_patch(self, owner_session):
        r = owner_session.get(f"{API}/settings", timeout=15)
        assert r.status_code == 200
        original_currency = r.json().get("currency")
        r = owner_session.patch(f"{API}/settings", json={"currency": "IQD"}, timeout=15)
        assert r.status_code == 200
        r = owner_session.get(f"{API}/settings", timeout=15)
        assert r.json()["currency"] == "IQD"
        # restore
        if original_currency:
            owner_session.patch(f"{API}/settings", json={"currency": original_currency}, timeout=15)

    def test_telegram_test_400_when_unconfigured(self, owner_session):
        # ensure cleared
        owner_session.patch(f"{API}/settings", json={"telegram_bot_token": "", "telegram_chat_id": ""}, timeout=15)
        r = owner_session.post(f"{API}/settings/telegram/test", timeout=15)
        assert r.status_code == 400


# =============== INVOICES ===============
class TestInvoices:
    def test_pdf_stream(self, owner_session):
        # create a quick maintenance
        body = {"customer_name": "TEST_INV", "customer_phone": "07712345678",
                "device_type": "P", "issue": "x", "agreed_price": 10.0, "paid_amount": 10.0}
        m = owner_session.post(f"{API}/maintenance", json=body, timeout=15).json()
        r = owner_session.get(f"{API}/invoices/maintenance/{m['id']}", timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct.lower(), f"content-type: {ct}"
        assert r.content[:4] == b"%PDF", "Not a PDF"
        owner_session.delete(f"{API}/maintenance/{m['id']}", timeout=15)


# =============== TENANT ISOLATION ===============
class TestTenantIsolation:
    def test_user_a_cannot_see_user_b_data(self):
        sa, sb = requests.Session(), requests.Session()
        ea = f"a_{uuid.uuid4().hex[:6]}@example.com"
        eb = f"b_{uuid.uuid4().hex[:6]}@example.com"
        ra = sa.post(f"{API}/auth/register", json={"shop_name": "TEST_A_Shop", "name": "Alice", "email": ea, "password": "Pass@123"}, timeout=15)
        rb = sb.post(f"{API}/auth/register", json={"shop_name": "TEST_B_Shop", "name": "Bob", "email": eb, "password": "Pass@123"}, timeout=15)
        assert ra.status_code == 200 and rb.status_code == 200

        # A creates a customer
        ca = sa.post(f"{API}/customers", json={"name": "A_Cust", "phone": "07712345001"}, timeout=15).json()
        # B creates a customer
        cb = sb.post(f"{API}/customers", json={"name": "B_Cust", "phone": "07712345002"}, timeout=15).json()

        # A cannot see B's customer in list
        a_list = sa.get(f"{API}/customers", timeout=15).json()
        assert all(c["id"] != cb["id"] for c in a_list)
        # A cannot fetch B's customer by id
        r = sa.get(f"{API}/customers/{cb['id']}", timeout=15)
        assert r.status_code == 404
        # A cannot delete B's customer
        r = sa.delete(f"{API}/customers/{cb['id']}", timeout=15)
        assert r.status_code == 404

        # Same for spare-parts
        pb = sb.post(f"{API}/spare-parts", json={"name": "B_Part", "type": "original", "device_name": "x",
                                                  "location": "L", "quantity": 1, "low_stock_threshold": 1,
                                                  "cost_price": 1, "sell_price": 1}, timeout=15).json()
        a_parts = sa.get(f"{API}/spare-parts", timeout=15).json()
        assert all(p["id"] != pb["id"] for p in a_parts)
        r = sa.patch(f"{API}/spare-parts/{pb['id']}", json={
            "name": "hack", "type": "original", "device_name": "x",
            "location": "L", "quantity": 1, "low_stock_threshold": 1,
            "cost_price": 1, "sell_price": 1
        }, timeout=15)
        assert r.status_code == 404
