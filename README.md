# LucidFlow Budget App

> A lightweight, open-source personal budgeting stack with a Flask API, SQLite storage, and a static HTML/CSS/JS dashboard (no framework build step required).

## Feature Highlights
- **Unified dashboard** with income, expenses, net investments, and inferred savings summary cards.
- **Dynamic forms** for transactions, categories (income/expense/investment/withdrawal), and expense goals with automatic resets and inline client-side validation (bad input is caught before it ever reaches the server).
- **Full CRUD** — categories can be renamed, retyped, and deleted (blocked while transactions/goals still reference them), and transactions can be edited in place, not just created and deleted.
- **Goal tracking** that visualizes progress toward monthly caps for every expense category.
- **Plotly-powered Sankey** diagram embedded on the main page showing how each income stream fans out to expenses, investments, and savings/shortfalls.
- **Month filters** shared across summaries, tables, and the Sankey so you can focus on a single period, with stale/superseded requests cancelled automatically so rapid filter changes never leave the UI showing outdated data.
- **Built-in Investment Withdrawal category** (type `withdrawal`) so you can tag cash coming back from invested funds without extra setup.
- **Opt-in security controls** — API key auth, a CORS origin allowlist, and per-IP rate limiting — all off by default for zero-config local dev, and easy to turn on with a few environment variables before deploying publicly (see Getting Started below).

## Tech Stack
| Layer | Details |
| --- | --- |
| Backend | Flask 3, Flask-CORS, Flask-Limiter, Flask-Migrate (Alembic), Flask-SQLAlchemy, SQLite (via SQLAlchemy) |
| Frontend | Plain HTML, CSS, and vanilla JS + Plotly CDN (no bundler needed) |
| Data | SQLite database in `backend/instance/budget.db` (auto-created and migrated on startup) |

## UI Preview
![LucidFlow dashboard preview](Screenshot%202026-02-25%20at%2012-33-26%20LucidFlow%20Budget.png)

> The dashboard highlights month filters, summary cards, category tables, and the Plotly Sankey diagram in a single view.

## Getting Started

### 1. Backend API
```powershell
cd backend
..\venv\Scripts\activate.ps1   # activate your virtualenv (or python -m venv venv)
pip install -r requirements.txt
python app.py                    # serves API + static frontend at http://localhost:5000
```

Environment defaults:
- Database path: `instance/budget.db` (created automatically)
- Port: `5000` (override with `PORT` env var)
- Debug mode: off by default. Set `LUCIDFLOW_DEBUG=1` to enable Flask's debug reloader/tracebacks for local development — never enable this outside localhost, as it exposes the Werkzeug interactive debugger (arbitrary code execution).
- Static assets: served from `../frontend` so you can simply open `http://localhost:5000/` after the server starts.
- API authentication: set `LUCIDFLOW_API_KEY` to require an `X-API-Key` header on every `/api/*` request (except `/api/health`). If unset, the API runs without authentication — fine for local-only use, but set this before exposing the app beyond localhost. Enter the same value in the "API key" field in the dashboard header; it's stored in the browser's `localStorage` and sent on every request.
- CORS: set `LUCIDFLOW_ALLOWED_ORIGINS` to a comma-separated list of allowed origins (e.g. `http://localhost:4173,https://mybudget.example.com`) for `/api/*`. If unset, all origins are allowed — convenient for local dev (including the standalone frontend server below), but set this before exposing the app beyond localhost.
- Rate limiting: every `/api/*` request except `/api/health` is limited to `60 per minute` per client IP by default; override with `LUCIDFLOW_RATE_LIMIT` (e.g. `"30 per minute"`). Limits are tracked in-memory per process, so they reset on restart and aren't shared across multiple worker processes — fine for the single-process dev server this app ships with, but worth a shared store (e.g. Redis) if you run multiple workers in production.

### 2. Optional standalone frontend server
If you prefer to run the dashboard separately (while Flask handles only the API):
```powershell
cd frontend
python -m http.server 4173
```
By default the dashboard calls the API at its own origin (`window.location.origin + "/api"`), so no configuration is needed when Flask serves both — it works regardless of host/port. When running the frontend on its own (as above), set the "API base URL" field in the dashboard header to your API host (e.g. `http://localhost:5000/api`); it's saved in the browser's `localStorage` so you only need to set it once. Remember to add that origin (e.g. `http://localhost:4173`) to `LUCIDFLOW_ALLOWED_ORIGINS` on the API side.

## API Overview

| Endpoint | Method(s) | Notes |
| --- | --- | --- |
| `/api/health` | GET | Basic heartbeat with timestamp |
| `/api/categories` | GET, POST, PUT, DELETE | Manage income, expense, investment, and withdrawal categories (unique names enforced). Deleting requires no existing transactions/goals reference it; changing `type` away from `expense` requires no existing goal. |
| `/api/transactions` | GET, POST, PUT, DELETE | CRUD for transactions (positive amounts only) with optional `month=YYYY-MM` filter. `PUT` updates only the fields provided (description/amount/category_id/occurred_on). |
| `/api/goals` | GET, POST, PUT, DELETE | Monthly limits attached to **expense** categories only |
| `/api/summary` | GET | Aggregated totals (income/expense/net investment/withdrawal), inferred savings, category totals, and goal progress. Accepts `month=YYYY-MM`. |
| `/api/sankey` | GET | Returns nodes/links for the Plotly Sankey diagram. Accepts `month=YYYY-MM`. |

All responses are JSON. Errors return `{ "error": "message" }` plus an HTTP status code (400/404/409, etc.).

`GET /api/categories` and `GET /api/transactions` return a plain array by default. Pass `page` and/or `per_page` (max 200) to opt into pagination instead: the response becomes `{ "items": [...], "page", "per_page", "total", "total_pages" }`.

## Data Model

| Table | Key Fields | Notes |
| --- | --- | --- |
| `categories` | `id`, `name`, `type` (`income`\|`expense`\|`investment`\|`withdrawal`) | Drives both transactions and goals |
| `transactions` | `id`, `uid`, `description`, `amount_cents`, `occurred_on`, `category_id` | Amounts must be positive; sign is inferred from category type. `uid` is a UUID exposed to clients. Money is stored as integer cents internally to avoid floating-point rounding drift — the API still speaks plain decimal dollars (e.g. `12.34`) on the wire. |
| `budget_goals` | `id`, `monthly_limit_cents`, `category_id` | One goal per expense category enforced by a uniqueness constraint. Same integer-cents storage as `transactions.amount_cents`. |

## Investments & Sankey Flow

- Creating a category with `type = investment` treats the outflow as an asset allocation instead of an expense. These amounts show up in their own summary card and Sankey branch but are excluded from expense goals. The investment card always displays **net contributions** (investments − withdrawals) so you can see how much cash stayed deployed.
- Creating a category with `type = withdrawal` captures cash returning from investments. Withdrawals flow into the Sankey pool the same way income does and still appear in transaction/filter views.
- The backend seeds an **Investment Withdrawal** category (type `withdrawal`) automatically; use it to represent money moving from investments back into your cash pool.
- Savings = Income − Expenses − Net Investments, where Net Investments = Investments − Withdrawals. When positive, the Sankey adds a `Net Savings` sink; when negative, a `Shortfall` node points back into the pool so you can diagnose overspending quickly.
- The Sankey always aggregates categories by type:
  - **Income sources → Income Pool**
  - **Income Pool → Expense categories / Investment categories**
  - **Income Pool → Net Savings** (if cash remains)
  - **Shortfall → Income Pool** (if spending exceeds total income)

## Development Notes
- Forms rely on `fetch` + JSON. There's no session/cookie-based auth for a cross-site request to ride along on, and every `POST`/`PUT` requires an `application/json` body — something a cross-site `<form>` or `no-cors` request cannot send — so classic CSRF doesn't apply to this API's design. Still set `LUCIDFLOW_API_KEY` and `LUCIDFLOW_ALLOWED_ORIGINS` before deploying publicly, since those control who can call the API at all.
- The frontend is static: feel free to swap it into any hosting environment or migrate to a framework later.
- `.gitignore` excludes the virtualenv, compiled Python files, `.env`, and the SQLite database (`backend/instance/`).
- Schema changes are managed with [Flask-Migrate](https://flask-migrate.readthedocs.io/) (Alembic) under `backend/migrations/`. The app runs pending migrations automatically on startup — no manual step needed for normal use. When you change a model, generate a new revision from `backend/` with `FLASK_APP=app.py flask db migrate -m "description"`, review the generated file, then commit it alongside the model change.

## Roadmap Ideas
1. True multi-user accounts. `LUCIDFLOW_API_KEY` covers single-user access control today, but there's no concept of separate users/logins yet.
2. Better reporting exports (CSV/PDF) and additional charts.
3. Automated tests (pytest for backend, Playwright/Cypress for the UI).
4. Deployment scripts or containerization for reproducible environments.
5. Split `frontend/app.js` into modules as it keeps growing — it's a single file today with no build step.

---

Questions or ideas? Open an issue or keep iterating—LucidFlow is intentionally simple so you can extend it in any direction.
