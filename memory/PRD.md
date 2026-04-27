# RepairOS — Phone Repair Shop Enterprise SaaS

## Original Problem Statement
Multi-tenant SaaS for managing phone repair shops:
- Maintenance management with auto-debt logic and parts inventory coupling
- Debt management (partial/full settlement, due-date alerts)
- Spare parts inventory with location, compatibility, and stock tracking
- Dashboard with KPIs + 30-day charts + global search
- WhatsApp integration (complete-ticket + 24h follow-up message flow)
- Telegram Bot notifications (configurable per tenant)
- RBAC (Owner / Manager / Staff), JWT + Refresh cookies
- Audit logs, PDF invoices, Arabic + English (RTL), IQD-default currency

## Architecture
- **Backend:** FastAPI, modular (`app/routers`, `app/security`, `app/deps`, `app/models`, `app/telegram_service`, `app/scheduler_service`)
- **Database:** MongoDB (Motor). UUID-only document ids. Indexed by `tenant_id`.
- **Multi-tenant:** Every document has `tenant_id`; all queries are filtered through `get_current_user` scope.
- **Frontend:** React + React Router v7 + Tailwind + shadcn + Recharts + IBM Plex Sans Arabic. Right-aligned sidebar for RTL, Swiss/Stripe-inspired Layout. Dark/Light mode + Arabic/English toggle.
- **Scheduler:** APScheduler. `mark_followups_due` (15 min), `check_due_debts` (30 min).
- **Security:** bcrypt, JWT access (15m) + refresh (7d) in httpOnly/SameSite=none/secure cookies, slowapi limiter, brute-force lockout keyed by email (5 attempts / 15-min), RBAC via FastAPI Depends, audit_logs collection.

## Personas
- **Owner** — creates workspace, manages users, settings, full CRUD.
- **Manager** — CRUD of customers/maintenance/debts/parts, invites staff, cannot delete users or create managers.
- **Staff** — CRUD create/update, cannot delete tickets/parts/debts.

## Implemented (2026-04-27)
- ✅ Auth: register / login / logout / me / refresh, brute-force lockout (proxy-aware via XFF + email key), RBAC, user invites
- ✅ Customers: CRUD + tenant isolation + auto-resolve by phone + cascade-protect on open debts
- ✅ Spare Parts: CRUD + use-stock endpoint + low-stock threshold + compatibility list
- ✅ Maintenance: CRUD + auto-debt on partial payment + parts cost deduction + profit calculation + restore/reapply parts on edit + pay endpoint + complete (sets follow-up window + returns WA template) + followup-sent (returns WA template)
- ✅ Debts: CRUD + partial/full pay + sync linked maintenance + auto-recalc customer total_debt
- ✅ Dashboard: stats aggregation (customers/tickets/debts/profit/revenue/low-stock/followups), 30-day area chart data, global search, audit logs feed
- ✅ Settings: tenant profile, WhatsApp templates, Telegram bot config + test, follow-up toggle & hours
- ✅ PDF invoices via reportlab
- ✅ Telegram notifications for maintenance/debts with per-category toggles
- ✅ Frontend: Login / Register / Dashboard / Maintenance / Debts / Spare Parts / Customers / Reports / Settings
- ✅ Global search (Cmd-K), Dark/Light, AR/EN, RTL
- ✅ WhatsApp wa.me URL generation + automatic open on complete + follow-up button

## Test Results (iteration_1)
- Backend: **28/28 pytest tests passing** (auth + RBAC + all CRUD + multi-tenant isolation + stats + PDF + settings)
- One HIGH bug found and **fixed**: brute-force lockout was keyed by `request.client.host` which resolved to ingress pod IP; now keyed by email (proxy-aware). Verified 5-attempt → 429 lockout.

## Backlog / P1
- Add `jti`/`iat` to JWT claims for true rotation on refresh
- Atomic parts reservation: fail maintenance creation if stock insufficient (currently silently allows)
- Rate-limit `/auth/register` to prevent tenant-spam
- Lock `parts_used.price` to spare_parts.sell_price when part_id is set (anti-profit-fraud)
- Dashboard payload caching (30s TTL) for high-volume tenants
- Telegram bot inbound commands (/profits /debts /reports /inventory) via webhook
- Sora / image upload for device condition photos
- Export reports to Excel/CSV
- Stripe subscription integration (SaaS billing) — scaffolded via tenant model

## Deployment
- Uses Emergent managed preview (React :3000 + FastAPI :8001 + MongoDB local). Deployable to any container platform with env vars: `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
