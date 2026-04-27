"""Backend regression tests for RepairShop SaaS — username-based auth.

Covers: auth (login/me/refresh/logout/profile self-service/change username/change password),
register removed (404), RBAC, customers, spare-parts, maintenance,
debts, dashboard, settings, invoices.

Uses requests.Session as cookie jar (httpOnly auth cookies).
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    from pathlib import Path
    env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_USERNAME = "admin"
ADMIN_PASS = "Admin@2026"
EXPECTED_TENANT_NAME = "مركز ام الكبر والغزلان"


# ---------------- Fixtures ----------------
@pytest.fixture(scope="session")
def owner_session():
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=30)
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

    def test_login_username_success_sets_httpOnly_cookies(self):
        s = requests.Session()
        r = s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        assert r.status_code == 200
        body = r.json()
        assert body["username"] == ADMIN_USERNAME
        assert body["role"] == "owner"
        assert body.get("tenant_name") == EXPECTED_TENANT_NAME, f"got {body.get('tenant_name')!r}"
        # email should not be required in payload
        assert "email" not in body or body.get("email") in (None, "")
        # cookies set
        names = {c.name for c in s.cookies}
        assert "access_token" in names and "refresh_token" in names
        sc = r.headers.get("set-cookie", "")
        assert "HttpOnly" in sc and "Secure" in sc

    def test_login_invalid_credentials_401(self):
        r = requests.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": "wrong-pass-x"}, timeout=15)
        assert r.status_code == 401

    def test_login_unknown_user_401(self):
        r = requests.post(f"{API}/auth/login", json={"username": f"nope_{uuid.uuid4().hex[:6]}", "password": "x"}, timeout=15)
        assert r.status_code == 401

    def test_register_endpoint_removed_404(self):
        r = requests.post(f"{API}/auth/register", json={
            "shop_name": "X", "name": "X", "email": "x@x.com", "password": "Pass@1234"
        }, timeout=15)
        assert r.status_code == 404, f"/auth/register should be removed but got {r.status_code}: {r.text[:200]}"

    def test_me_returns_username_and_tenant(self, owner_session):
        r = owner_session.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert d["username"] == ADMIN_USERNAME
        assert d.get("tenant_name") == EXPECTED_TENANT_NAME
        assert d["role"] == "owner"
        assert "tenant_id" in d and "name" in d

    def test_refresh_keeps_session(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        r = s.post(f"{API}/auth/refresh", timeout=15)
        assert r.status_code == 200
        me = s.get(f"{API}/auth/me", timeout=15)
        assert me.status_code == 200

    def test_logout_clears_cookies(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        r = s.post(f"{API}/auth/logout", timeout=15)
        assert r.status_code == 200
        r2 = s.get(f"{API}/auth/me", timeout=15)
        assert r2.status_code in (401, 403)

    def test_brute_force_lockout_per_username(self):
        # New unique username so lockout counter starts fresh
        bad_username = f"nouser_{uuid.uuid4().hex[:8]}"
        statuses = []
        for _ in range(8):
            r = requests.post(f"{API}/auth/login", json={"username": bad_username, "password": "x"}, timeout=15)
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
        assert 429 in statuses, (
            f"Brute-force lockout did NOT trigger in 8 attempts. statuses={statuses}. "
            "Auth router keys lockout by `user:<username>` — should fire after 5 fails."
        )


# =============== Profile self-service ===============
class TestProfile:
    """Tests for /me/change-username, /me/change-password, /me/profile.

    These mutate the admin account, so they revert at the end.
    """

    def test_change_password_wrong_current_returns_401(self, owner_session):
        r = owner_session.post(f"{API}/auth/me/change-password", json={
            "current_password": "wrong-old-pass", "new_password": "Newpass@123"
        }, timeout=15)
        assert r.status_code == 401

    def test_change_password_success_then_revert(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        new_pass = "Temp@1234"
        r = s.post(f"{API}/auth/me/change-password", json={
            "current_password": ADMIN_PASS, "new_password": new_pass
        }, timeout=15)
        assert r.status_code == 200, r.text
        # login with new password
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": new_pass}, timeout=15)
        assert r2.status_code == 200, "login with new password failed"
        # old password fails
        r3 = requests.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        assert r3.status_code == 401, "old password should no longer work"
        # revert
        r4 = s2.post(f"{API}/auth/me/change-password", json={
            "current_password": new_pass, "new_password": ADMIN_PASS
        }, timeout=15)
        assert r4.status_code == 200

    def test_change_username_invalid_400(self, owner_session):
        for bad in ["a", "ab", "has@sign", "with space", "way_too_long_" + "x" * 40]:
            r = owner_session.post(f"{API}/auth/me/change-username", json={
                "username": bad, "current_password": ADMIN_PASS,
            }, timeout=15)
            assert r.status_code == 400, f"username {bad!r} should 400 got {r.status_code}"

    def test_change_username_wrong_password_401(self, owner_session):
        r = owner_session.post(f"{API}/auth/me/change-username", json={
            "username": "newadminx", "current_password": "wrong",
        }, timeout=15)
        assert r.status_code == 401

    def test_change_username_success_then_revert(self):
        s = requests.Session()
        s.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15)
        new_username = f"adm_{uuid.uuid4().hex[:6]}"
        r = s.post(f"{API}/auth/me/change-username", json={
            "username": new_username, "current_password": ADMIN_PASS,
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json().get("username") == new_username
        # /me reflects new username
        me = s.get(f"{API}/auth/me", timeout=15).json()
        assert me["username"] == new_username
        # login with new username works
        s2 = requests.Session()
        r2 = s2.post(f"{API}/auth/login", json={"username": new_username, "password": ADMIN_PASS}, timeout=15)
        assert r2.status_code == 200, "login with new username failed"
        # revert via the s2 session
        r3 = s2.post(f"{API}/auth/me/change-username", json={
            "username": ADMIN_USERNAME, "current_password": ADMIN_PASS,
        }, timeout=15)
        assert r3.status_code == 200
        # final sanity — original works
        s3 = requests.Session()
        assert s3.post(f"{API}/auth/login", json={"username": ADMIN_USERNAME, "password": ADMIN_PASS}, timeout=15).status_code == 200

    def test_update_profile_name(self, owner_session, owner_user):
        original = owner_user["name"]
        new_name = f"TEST_NAME_{uuid.uuid4().hex[:5]}"
        r = owner_session.patch(f"{API}/auth/me/profile", json={"name": new_name}, timeout=15)
        assert r.status_code == 200
        me = owner_session.get(f"{API}/auth/me", timeout=15).json()
        assert me["name"] == new_name
        # revert
        owner_session.patch(f"{API}/auth/me/profile", json={"name": original}, timeout=15)


# =============== RBAC / Users ===============
class TestRBAC:
    @pytest.fixture(scope="class")
    def staff_session(self, owner_session):
        username = f"staff_{uuid.uuid4().hex[:6]}"
        password = "Staff@123"
        r = owner_session.post(f"{API}/auth/users", json={
            "username": username, "name": "TEST_Staff", "password": password, "role": "staff"
        }, timeout=15)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["username"] == username
        assert body["role"] == "staff"
        s = requests.Session()
        lr = s.post(f"{API}/auth/login", json={"username": username, "password": password}, timeout=15)
        assert lr.status_code == 200
        s.user_id = body["id"]
        return s

    def test_create_user_invalid_username_400(self, owner_session):
        r = owner_session.post(f"{API}/auth/users", json={
            "username": "a@b", "name": "X", "password": "Pass@123", "role": "staff"
        }, timeout=15)
        assert r.status_code == 400

    def test_list_users_returns_username_no_email(self, owner_session, staff_session):
        r = owner_session.get(f"{API}/auth/users", timeout=15)
        assert r.status_code == 200
        users = r.json()
        assert isinstance(users, list) and len(users) >= 2
        for u in users:
            assert "username" in u
            assert "password_hash" not in u

    def test_staff_cannot_delete_maintenance(self, staff_session):
        r = staff_session.delete(f"{API}/maintenance/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_staff_cannot_delete_debt(self, staff_session):
        r = staff_session.delete(f"{API}/debts/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_staff_cannot_delete_part(self, staff_session):
        r = staff_session.delete(f"{API}/spare-parts/{uuid.uuid4()}", timeout=15)
        assert r.status_code == 403

    def test_owner_can_delete_user(self, owner_session, staff_session):
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

        r = owner_session.post(f"{API}/spare-parts/{pid}/use", json={"qty": 2}, timeout=15)
        assert r.status_code == 200

        r = owner_session.get(f"{API}/spare-parts?q=TEST_Screen", timeout=15)
        rec = next((p for p in r.json() if p["id"] == pid), None)
        assert rec and rec["quantity"] == 3

        r = owner_session.post(f"{API}/spare-parts/{pid}/use", json={"qty": 99}, timeout=15)
        assert r.status_code == 400

        payload["quantity"] = 10
        r = owner_session.patch(f"{API}/spare-parts/{pid}", json=payload, timeout=15)
        assert r.status_code == 200

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
        assert m["parts_cost"] == 80.0
        assert m["profit"] == 120.0
        assert m["debt_amount"] == 150.0
        assert m["paid_amount"] == 50.0
        r2 = owner_session.get(f"{API}/spare-parts?q=TEST_Battery", timeout=15)
        rec = next((p for p in r2.json() if p["id"] == part["id"]), None)
        assert rec["quantity"] == 8
        r3 = owner_session.get(f"{API}/debts?q=TEST_M_Cust", timeout=15)
        assert any(d.get("maintenance_id") == m["id"] and d["amount_remaining"] == 150.0 for d in r3.json())
        TestMaintenance._mid = m["id"]
        TestMaintenance._cust_phone = phone

    def test_pay_maintenance_syncs_debt(self, owner_session):
        mid = TestMaintenance._mid
        r = owner_session.post(f"{API}/maintenance/{mid}/pay", json={"amount": 100.0}, timeout=15)
        assert r.status_code == 200
        assert r.json()["paid"] == 150.0 and r.json()["debt"] == 50.0
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
        m = owner_session.get(f"{API}/maintenance/{mid}", timeout=15).json()
        assert m["status"] == "delivered"
        assert m["follow_up_due_at"] is not None
        assert m["follow_up_sent"] is False


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

        c = owner_session.get(f"{API}/customers/{cid}", timeout=15).json()
        assert c["customer"]["total_debt"] == 100.0

        r = owner_session.post(f"{API}/debts/{did}/pay", json={"amount": 30.0}, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "partially_paid"

        r = owner_session.post(f"{API}/debts/{did}/pay", json={"amount": 70.0}, timeout=15)
        assert r.status_code == 200 and r.json()["status"] == "paid"

        c = owner_session.get(f"{API}/customers/{cid}", timeout=15).json()
        assert c["customer"]["total_debt"] == 0.0

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
        if original_currency:
            owner_session.patch(f"{API}/settings", json={"currency": original_currency}, timeout=15)


# =============== INVOICES ===============
class TestInvoices:
    def test_pdf_stream(self, owner_session):
        body = {"customer_name": "TEST_INV", "customer_phone": "07712345678",
                "device_type": "P", "issue": "x", "agreed_price": 10.0, "paid_amount": 10.0}
        m = owner_session.post(f"{API}/maintenance", json=body, timeout=15).json()
        r = owner_session.get(f"{API}/invoices/maintenance/{m['id']}", timeout=20)
        assert r.status_code == 200
        ct = r.headers.get("content-type", "")
        assert "pdf" in ct.lower()
        assert r.content[:4] == b"%PDF"
        owner_session.delete(f"{API}/maintenance/{m['id']}", timeout=15)
