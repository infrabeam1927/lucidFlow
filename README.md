# LucidFlow Budget App

> A lightweight, open-source personal budgeting stack with a Flask API, SQLite storage, and a static HTML/CSS/JS dashboard (no framework build step required).

## Feature Highlights
- **Unified dashboard** with income, expenses, investments, and inferred savings summary cards.
- **Dynamic forms** for transactions, categories (income/expense/investment), and expense goals with automatic resets.
- **Goal tracking** that visualizes progress toward monthly caps for every expense category.
- **Plotly-powered Sankey** diagram embedded on the main page showing how each income stream fans out to expenses, investments, and savings/shortfalls.
- **Month filters** shared across summaries, tables, and the Sankey so you can focus on a single period.

## Tech Stack
| Layer | Details |
| --- | --- |
| Backend | Flask 3, Flask-CORS, Flask-SQLAlchemy, SQLite (via SQLAlchemy) |
| Frontend | Plain HTML, CSS, and vanilla JS + Plotly CDN (no bundler needed) |
| Data | SQLite database in `backend/instance/budget.db` (auto-created) |

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
- Static assets: served from `../frontend` so you can simply open `http://localhost:5000/` after the server starts.

### 2. Optional standalone frontend server
If you prefer to run the dashboard separately (while Flask handles only the API):
```powershell
cd frontend
python -m http.server 4173
```
Then edit `API_BASE_URL` in `frontend/app.js` to point at your API host (default `http://localhost:5000/api`).

## API Overview

| Endpoint | Method(s) | Notes |
| --- | --- | --- |
| `/api/health` | GET | Basic heartbeat with timestamp |
| `/api/categories` | GET, POST | Manage income, expense, and investment categories (unique names enforced) |
| `/api/transactions` | GET, POST, DELETE | CRUD for transactions (positive amounts only) with optional `month=YYYY-MM` filter |
| `/api/goals` | GET, POST, PUT, DELETE | Monthly limits attached to **expense** categories only |
| `/api/summary` | GET | Aggregated totals (income/expense/investment), inferred savings, category totals, and goal progress. Accepts `month=YYYY-MM`. |
| `/api/sankey` | GET | Returns nodes/links for the Plotly Sankey diagram. Accepts `month=YYYY-MM`. |

All responses are JSON. Errors return `{ "error": "message" }` plus an HTTP status code (400/404/409, etc.).

## Data Model

| Table | Key Fields | Notes |
| --- | --- | --- |
| `categories` | `id`, `name`, `type` (`income`\|`expense`\|`investment`) | Drives both transactions and goals |
| `transactions` | `id`, `uid`, `description`, `amount`, `occurred_on`, `category_id` | Amounts must be positive; sign is inferred from category type. `uid` is a UUID exposed to clients. |
| `budget_goals` | `id`, `monthly_limit`, `category_id` | One goal per expense category enforced by a uniqueness constraint |

## Investments & Sankey Flow

- Creating a category with `type = investment` treats the outflow as an asset allocation instead of an expense. These amounts show up in their own summary card and Sankey branch but are excluded from expense goals.
- Savings = Income − Expenses − Investments. When positive, the Sankey adds a `Net Savings` sink; when negative, a `Shortfall` node points back into the pool so you can diagnose overspending quickly.
- The Sankey always aggregates categories by type:
  - **Income sources → Income Pool**
  - **Income Pool → Expense categories / Investment categories**
  - **Income Pool → Net Savings** (if cash remains)
  - **Shortfall → Income Pool** (if spending exceeds total income)

## Development Notes
- Forms rely on `fetch` + JSON; no CSRF protection is included (add auth before deploying publicly).
- The frontend is static: feel free to swap it into any hosting environment or migrate to a framework later.
- `.gitignore` excludes the virtualenv, compiled Python files, `.env`, and the SQLite database (`backend/instance/`).

## Roadmap Ideas
1. Authentication / multi-user separation.
2. Better reporting exports (CSV/PDF) and additional charts.
3. Automated tests (pytest for backend, Playwright/Cypress for the UI).
4. Deployment scripts or containerization for reproducible environments.

---

Questions or ideas? Open an issue or keep iterating—LucidFlow is intentionally simple so you can extend it in any direction.
