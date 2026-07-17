import hmac
from datetime import date, datetime
from flask import Blueprint, current_app, jsonify, request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import joinedload
from collections import defaultdict
from .database import db
from .extensions import limiter
from .models import BudgetGoal, Category, Transaction


ALLOWED_CATEGORY_TYPES = {"income", "expense", "investment", "withdrawal"}
JSON_BODY_METHODS = {"POST", "PUT"}

api_bp = Blueprint("api", __name__)


@api_bp.before_request
def guard_api_requests():
    if request.method == "OPTIONS" or request.endpoint == "api.healthcheck":
        return None

    configured_key = current_app.config.get("API_KEY")
    if configured_key:
        provided_key = request.headers.get("X-API-Key", "")
        if not hmac.compare_digest(provided_key, configured_key):
            return _error("Unauthorized", 401)

    # Cross-site <form>/no-cors requests can't set a JSON content type, so
    # rejecting anything else here closes the classic CSRF vector even when
    # no API key is configured.
    if request.method in JSON_BODY_METHODS and not request.is_json:
        return _error("Content-Type must be application/json", 415)

    return None


def _parse_month_window(month_token: str):
    if not month_token:
        return None, None
    try:
        start = datetime.strptime(month_token, "%Y-%m").date().replace(day=1)
    except ValueError as exc:
        raise ValueError("month must use YYYY-MM format") from exc

    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end


def _apply_month_filter(query, column, month_token):
    start, end = _parse_month_window(month_token)
    if start and end:
        query = query.filter(column >= start, column < end)
    return query


def _month_token(value: date) -> str:
    return value.strftime("%Y-%m")


def _year_bucket(value: date) -> int:
    return value.year


def _error(message, status_code=400):
    return jsonify({"error": message}), status_code


@api_bp.get("/health")
@limiter.exempt
def healthcheck():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}


@api_bp.get("/categories")
def list_categories():
    categories = Category.query.order_by(Category.name.asc()).all()
    return jsonify([category.to_dict() for category in categories])


@api_bp.post("/categories")
def create_category():
    payload = request.get_json() or {}
    name = (payload.get("name") or "").strip()
    cat_type = (payload.get("type") or "").lower()

    if not name:
        return _error("Category name is required")
    if cat_type not in ALLOWED_CATEGORY_TYPES:
        allowed = ", ".join(sorted(ALLOWED_CATEGORY_TYPES))
        return _error(f"Category type must be one of: {allowed}")
    if Category.query.filter_by(name=name).first():
        return _error("Category already exists", 409)

    category = Category(name=name, type=cat_type)
    db.session.add(category)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Category already exists", 409)
    return category.to_dict(), 201


@api_bp.get("/transactions")
def list_transactions():
    month_token = request.args.get("month")
    query = Transaction.query.options(joinedload(Transaction.category)).order_by(Transaction.occurred_on.desc())
    if month_token:
        try:
            query = _apply_month_filter(query, Transaction.occurred_on, month_token)
        except ValueError as err:
            return _error(str(err))
    transactions = query.all()
    return jsonify([transaction.to_dict() for transaction in transactions])


@api_bp.post("/transactions")
def create_transaction():
    payload = request.get_json() or {}
    description = (payload.get("description") or "").strip()
    amount = payload.get("amount")
    category_id = payload.get("category_id")
    occurred_on = payload.get("occurred_on")

    if not description:
        return _error("Description is required")
    try:
        amount_value = float(amount)
    except (TypeError, ValueError):
        return _error("Amount must be a number")
    if amount_value <= 0:
        return _error("Amount must be positive")
    category = Category.query.get(category_id)
    if not category:
        return _error("Category not found", 404)

    if occurred_on:
        try:
            occurred = datetime.strptime(occurred_on, "%Y-%m-%d").date()
        except ValueError:
            return _error("Dates must use YYYY-MM-DD format")
    else:
        occurred = date.today()

    transaction = Transaction(
        description=description,
        amount=amount_value,
        occurred_on=occurred,
        category_id=category.id,
    )
    db.session.add(transaction)
    db.session.commit()
    return transaction.to_dict(), 201


@api_bp.delete("/transactions/<int:transaction_id>")
def delete_transaction(transaction_id: int):
    transaction = Transaction.query.get(transaction_id)
    if not transaction:
        return _error("Transaction not found", 404)
    db.session.delete(transaction)
    db.session.commit()
    return {"status": "deleted"}


@api_bp.get("/goals")
def list_goals():
    goals = BudgetGoal.query.all()
    return jsonify([goal.to_dict() for goal in goals])


@api_bp.post("/goals")
def create_goal():
    payload = request.get_json() or {}
    category_id = payload.get("category_id")
    monthly_limit = payload.get("monthly_limit")
    category = Category.query.get(category_id)
    if not category:
        return _error("Category not found", 404)
    if category.type != "expense":
        return _error("Goals can only be attached to expense categories")
    try:
        limit_value = float(monthly_limit)
    except (TypeError, ValueError):
        return _error("Monthly limit must be a number")
    if limit_value <= 0:
        return _error("Monthly limit must be positive")
    if BudgetGoal.query.filter_by(category_id=category_id).first():
        return _error("Goal already exists for this category", 409)

    goal = BudgetGoal(category_id=category_id, monthly_limit=limit_value)
    db.session.add(goal)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _error("Goal already exists for this category", 409)
    return goal.to_dict(), 201


@api_bp.put("/goals/<int:goal_id>")
def update_goal(goal_id: int):
    goal = BudgetGoal.query.get(goal_id)
    if not goal:
        return _error("Goal not found", 404)
    payload = request.get_json() or {}
    try:
        limit_value = float(payload.get("monthly_limit"))
    except (TypeError, ValueError):
        return _error("Monthly limit must be a number")
    if limit_value <= 0:
        return _error("Monthly limit must be positive")
    goal.monthly_limit = limit_value
    db.session.commit()
    return goal.to_dict()


@api_bp.delete("/goals/<int:goal_id>")
def delete_goal(goal_id: int):
    goal = BudgetGoal.query.get(goal_id)
    if not goal:
        return _error("Goal not found", 404)
    db.session.delete(goal)
    db.session.commit()
    return {"status": "deleted"}


@api_bp.get("/summary")
def monthly_summary():
    month_token = request.args.get("month")
    query = db.session.query(Transaction, Category).join(Category)
    if month_token:
        try:
            query = _apply_month_filter(query, Transaction.occurred_on, month_token)
        except ValueError as err:
            return _error(str(err))

    totals = {"income": 0.0, "expense": 0.0, "investment": 0.0, "withdrawal": 0.0}
    category_totals = {}

    for transaction, category in query.all():
        if category.type not in totals:
            totals[category.type] = 0.0
        totals[category.type] += transaction.amount
        category_totals.setdefault(category.name, 0.0)
        category_totals[category.name] += transaction.amount

    income_total = totals.get("income", 0.0)
    expense_total = totals.get("expense", 0.0)
    investment_total = totals.get("investment", 0.0)
    withdrawal_total = totals.get("withdrawal", 0.0)
    net_investment = investment_total - withdrawal_total
    totals["investment"] = net_investment

    net = income_total - expense_total - net_investment

    # Progress for expense goals in the selected window (or lifetime if none)
    def _goal_spent(goal: BudgetGoal):
        goal_query = db.session.query(func.coalesce(func.sum(Transaction.amount), 0.0)).join(Category)
        goal_query = goal_query.filter(Category.id == goal.category_id)
        if month_token:
            goal_query = _apply_month_filter(goal_query, Transaction.occurred_on, month_token)
        return goal_query.scalar() or 0.0

    goal_payload = []
    for goal in BudgetGoal.query.all():
        spent_value = _goal_spent(goal)
        progress = spent_value / goal.monthly_limit if goal.monthly_limit else 0
        goal_payload.append(
            {
                "goal": goal.to_dict(),
                "spent": round(spent_value, 2),
                "progress": round(progress, 3),
            }
        )

    response = {
        "totals": {k: round(v, 2) for k, v in totals.items()},
        "net": round(net, 2),
        "by_category": {name: round(value, 2) for name, value in category_totals.items()},
        "goals": goal_payload,
    }
    return jsonify(response)


@api_bp.get("/months")
def list_months():
    date_rows = db.session.query(Transaction.occurred_on).distinct().all()
    tokens = sorted({_month_token(row[0]) for row in date_rows if row[0]}, reverse=True)
    return jsonify({"months": tokens})


@api_bp.get("/sankey")
def sankey_snapshot():
    month_token = request.args.get("month")
    query = (
        db.session.query(
            Category.name.label("name"),
            Category.type.label("type"),
            func.sum(Transaction.amount).label("total"),
        )
        .join(Transaction)
        .group_by(Category.id)
    )

    if month_token:
        try:
            query = _apply_month_filter(query, Transaction.occurred_on, month_token)
        except ValueError as err:
            return _error(str(err))

    category_totals = query.all()
    if not category_totals:
        return jsonify({"nodes": [], "links": []})

    income_rows = [row for row in category_totals if row.type == "income" and row.total]
    withdrawal_rows = [row for row in category_totals if row.type == "withdrawal" and row.total]
    expense_rows = [row for row in category_totals if row.type == "expense" and row.total]
    investment_rows = [row for row in category_totals if row.type == "investment" and row.total]

    if not income_rows and not withdrawal_rows and not expense_rows and not investment_rows:
        return jsonify({"nodes": [], "links": []})

    nodes = []
    node_index = {}

    def _node_id(label: str, kind: str = "category") -> int:
        if label not in node_index:
            node_index[label] = len(nodes)
            nodes.append({"name": label, "type": kind})
        return node_index[label]

    links = []
    income_pool_id = _node_id("Income Pool", "pool")

    total_income = 0.0
    for row in income_rows:
        cat_id = _node_id(row.name, "income")
        value = round(float(row.total or 0.0), 2)
        if value <= 0:
            continue
        total_income += value
        links.append({"source": cat_id, "target": income_pool_id, "value": value})

    total_withdrawal = 0.0
    for row in withdrawal_rows:
        cat_id = _node_id(row.name, "withdrawal")
        value = round(float(row.total or 0.0), 2)
        if value <= 0:
            continue
        total_withdrawal += value
        links.append({"source": cat_id, "target": income_pool_id, "value": value})

    total_expense = 0.0
    for row in expense_rows:
        cat_id = _node_id(row.name, "expense")
        value = round(float(row.total or 0.0), 2)
        if value <= 0:
            continue
        total_expense += value
        links.append({"source": income_pool_id, "target": cat_id, "value": value})

    total_investment = 0.0
    for row in investment_rows:
        cat_id = _node_id(row.name, "investment")
        value = round(float(row.total or 0.0), 2)
        if value <= 0:
            continue
        total_investment += value
        links.append({"source": income_pool_id, "target": cat_id, "value": value})

    net = round(total_income + total_withdrawal - total_expense - total_investment, 2)
    if net > 0:
        savings_id = _node_id("Net Savings", "savings")
        links.append({"source": income_pool_id, "target": savings_id, "value": net})
    elif net < 0:
        gap_id = _node_id("Shortfall", "shortfall")
        links.append({"source": gap_id, "target": income_pool_id, "value": abs(net)})

    return jsonify({"nodes": nodes, "links": links})


@api_bp.get("/yearly-summary")
def yearly_summary():
    rows = db.session.query(Transaction, Category).join(Category).all()
    if not rows:
        return jsonify([])

    buckets = defaultdict(lambda: {"income": 0.0, "expense": 0.0, "investment": 0.0, "withdrawal": 0.0})
    for transaction, category in rows:
        bucket = buckets[_year_bucket(transaction.occurred_on)]
        bucket.setdefault(category.type, 0.0)
        bucket[category.type] += transaction.amount

    response = []
    for year in sorted(buckets.keys(), reverse=True):
        data = buckets[year]
        income = data.get("income", 0.0)
        withdrawal = data.get("withdrawal", 0.0)
        expense = data.get("expense", 0.0)
        investment_total = data.get("investment", 0.0)
        investment_net = investment_total - withdrawal
        net = income - expense - investment_net
        response.append(
            {
                "year": year,
                "income": round(income, 2),
                "expense": round(expense, 2),
                "investment": round(investment_net, 2),
                "net": round(net, 2),
            }
        )

    return jsonify(response)
