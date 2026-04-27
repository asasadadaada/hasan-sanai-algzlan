# مركز ام الكبر والغزلان — Repair Management SaaS

## Original Problem Statement
Multi-tenant SaaS for managing phone/device repair shops with:
- Maintenance + auto-debt + parts inventory
- Debts (partial/full settlement, due-date alerts)
- Spare parts inventory (location, type, compatibility, low-stock)
- Dashboard with KPIs + 30-day chart + global search
- WhatsApp completion + 24h follow-up flow
- Telegram bot notifications (per-tenant config)
- RBAC (Owner/Manager/Staff), JWT + Refresh cookies
- Audit logs, PDF invoices, AR + EN (RTL), IQD currency
- **Username-only login (no email/@), Account self-service settings**
- **Brand: "مركز ام الكبر والغزلان"**

## Architecture
- **Backend:** FastAPI modular (`app/routers`, `app/security`, `app/deps`, `app/models`, `app/telegram_service`, `app/scheduler_service`)
- **DB:** MongoDB (Motor), UUID-only ids, `tenant_id` indexed
- **Frontend:** React 19 + React Router v7 + Tailwind 3 + shadcn + Recharts + IBM Plex Sans Arabic
- **Auth:** username + password, bcrypt, JWT access (15m) + refresh (7d) httpOnly/SameSite=none, brute-force lockout per username (5 attempts / 15-min)
- **Scheduler:** APScheduler (`mark_followups_due` 15m, `check_due_debts` 30m)

## Implemented (sessions 1-3)
- ✅ Username-only login (no email anywhere)
- ✅ Brand "مركز ام الكبر والغزلان" in HTML title, sidebar, login, footer
- ✅ Account tab in Settings: change name, username, password (with current_password verification)
- ✅ Premium UI: gradient login, soft shadows, rounded-xl, focus glow, hover lift, smooth page transitions
- ✅ Dashboard KPI cards all clickable → navigate to corresponding pages
- ✅ Mobile hamburger menu
- ✅ All CRUD: Customers, Maintenance, Debts, Spare Parts (with full search/filters)
- ✅ Auto-debt logic, parts deduction, profit calc, complete-with-WA, follow-up sent
- ✅ Telegram notifications + test endpoint
- ✅ PDF invoices (reportlab)
- ✅ Audit logs collection + Reports page
- ✅ Dark/Light + AR/EN toggle persisted in localStorage

## Test Results
- **iteration_1:** 28/28 pass — found brute-force IP-key bug (HIGH) → **fixed**
- **iteration_2:** 30/30 pass — username migration verified, register endpoint removed (404), self-service profile endpoints all green

## Backlog (P1 — not blocking)
- Rotate cookies after `/me/change-password` (currently old cookies still valid for 15-min window)
- Stronger password policy beyond `min_length=6`
- Cookie rotation invalidation via `token_version` field
- Brute-force key combine IP + username (currently username-only allows targeted DoS lockout)
- JWT `jti`/`iat` for refresh rotation
- Atomic parts reservation (fail maintenance if insufficient stock)
- Excel/CSV export on Reports
- Telegram inbound commands webhook (/profits, /debts, /reports, /inventory)
- Stripe subscription billing (tenant model already SaaS-ready)

## Default Credentials
- **Username:** `admin`
- **Password:** `Admin@2026`
- **Tenant:** "مركز ام الكبر والغزلان"
