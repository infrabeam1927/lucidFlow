from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text
from sqlalchemy.exc import OperationalError


db = SQLAlchemy()


def init_db():
    db.create_all()
    _ensure_transaction_uid_column()
    _ensure_amount_cents_column()
    _ensure_monthly_limit_cents_column()
    _backfill_transaction_uids()
    _ensure_investment_withdraw_category()


def _ensure_transaction_uid_column():
    with db.engine.connect() as conn:
        column_rows = conn.execute(text("PRAGMA table_info(transactions)")).fetchall()
        has_uid = any(row[1] == "uid" for row in column_rows)
        if not has_uid:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN uid TEXT"))
        conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_transactions_uid ON transactions(uid)"))


def _backfill_transaction_uids():
    from uuid import uuid4
    from .models import Transaction

    updated = False
    for transaction in Transaction.query.filter((Transaction.uid.is_(None)) | (Transaction.uid == "")):
        transaction.uid = str(uuid4())
        updated = True
    if updated:
        db.session.commit()


def _ensure_amount_cents_column():
    """Migrate the legacy float `amount` column (dollars) to integer `amount_cents`."""
    with db.engine.connect() as conn:
        column_rows = conn.execute(text("PRAGMA table_info(transactions)")).fetchall()
        column_names = {row[1] for row in column_rows}
        if "amount_cents" not in column_names:
            conn.execute(text("ALTER TABLE transactions ADD COLUMN amount_cents INTEGER"))
            if "amount" in column_names:
                conn.execute(text("UPDATE transactions SET amount_cents = CAST(ROUND(amount * 100) AS INTEGER)"))
            conn.commit()
        if "amount" in column_names:
            try:
                conn.execute(text("ALTER TABLE transactions DROP COLUMN amount"))
                conn.commit()
            except OperationalError:
                pass  # older SQLite versions don't support DROP COLUMN; harmless leftover


def _ensure_monthly_limit_cents_column():
    """Migrate the legacy float `monthly_limit` column (dollars) to integer `monthly_limit_cents`."""
    with db.engine.connect() as conn:
        column_rows = conn.execute(text("PRAGMA table_info(budget_goals)")).fetchall()
        column_names = {row[1] for row in column_rows}
        if "monthly_limit_cents" not in column_names:
            conn.execute(text("ALTER TABLE budget_goals ADD COLUMN monthly_limit_cents INTEGER"))
            if "monthly_limit" in column_names:
                conn.execute(
                    text("UPDATE budget_goals SET monthly_limit_cents = CAST(ROUND(monthly_limit * 100) AS INTEGER)")
                )
            conn.commit()
        if "monthly_limit" in column_names:
            try:
                conn.execute(text("ALTER TABLE budget_goals DROP COLUMN monthly_limit"))
                conn.commit()
            except OperationalError:
                pass


def _ensure_investment_withdraw_category():
    from .models import Category

    name = "Investment Withdrawal"
    category = Category.query.filter_by(name=name).first()
    updated = False
    if category is None:
        category = Category(name=name, type="withdrawal")
        db.session.add(category)
        updated = True
    elif category.type != "withdrawal":
        category.type = "withdrawal"
        updated = True

    if updated:
        db.session.commit()
