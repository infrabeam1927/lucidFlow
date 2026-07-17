from flask_migrate import stamp, upgrade
from sqlalchemy import inspect, text
from flask_sqlalchemy import SQLAlchemy


db = SQLAlchemy()

# The revision generated to represent the final state of the old hand-rolled
# ALTER TABLE migrations. A pre-Alembic database that already matches this
# schema is stamped at this specific revision -- never at "head" -- so that a
# later migration (once one exists) still runs against it instead of being
# silently skipped.
BASELINE_REVISION = "18318fd43ddb"


def init_db():
    inspector = inspect(db.engine)
    existing_tables = set(inspector.get_table_names())

    if "alembic_version" not in existing_tables and "categories" in existing_tables:
        _adopt_pre_alembic_database(inspector)

    upgrade()
    _ensure_investment_withdraw_category()


def _adopt_pre_alembic_database(inspector):
    """Stamp a pre-Alembic database as already being at the baseline revision.

    Older LucidFlow versions migrated the schema by hand (ALTER TABLE calls in
    this module). The baseline Alembic revision reflects the final state of
    those hand-rolled steps, so an existing database that already went
    through them can be adopted in place rather than re-running CREATE TABLE
    against tables that already exist.
    """
    required_tables = {"transactions", "budget_goals"}
    existing_tables = set(inspector.get_table_names())
    if not required_tables.issubset(existing_tables):
        raise RuntimeError(
            "Found a pre-Alembic database missing the 'transactions' and/or 'budget_goals' "
            "tables entirely. This doesn't look like a database LucidFlow has ever fully "
            "initialized; delete it and let this version create it fresh, or restore a "
            "working backup."
        )

    transaction_columns = {col["name"] for col in inspector.get_columns("transactions")}
    goal_columns = {col["name"] for col in inspector.get_columns("budget_goals")}
    expected_transaction_columns = {"uid", "amount_cents"}
    expected_goal_columns = {"monthly_limit_cents"}

    if not expected_transaction_columns.issubset(transaction_columns) or not expected_goal_columns.issubset(
        goal_columns
    ):
        raise RuntimeError(
            "Found a pre-Alembic database on an older schema than this version expects "
            "(missing uid/amount_cents/monthly_limit_cents columns). Upgrade through a "
            "previous LucidFlow release first so those hand-rolled migrations can run, "
            "then upgrade to this version."
        )

    with db.engine.connect() as conn:
        incomplete_transactions = conn.execute(
            text(
                "SELECT COUNT(*) FROM transactions WHERE uid IS NULL OR uid = '' OR amount_cents IS NULL"
            )
        ).scalar()
        incomplete_goals = conn.execute(
            text("SELECT COUNT(*) FROM budget_goals WHERE monthly_limit_cents IS NULL")
        ).scalar()

    if incomplete_transactions or incomplete_goals:
        raise RuntimeError(
            "Found a pre-Alembic database with the expected columns present but not fully "
            "backfilled (some transactions are missing uid/amount_cents, or some goals are "
            "missing monthly_limit_cents) -- it looks like a previous migration was "
            "interrupted partway through. Upgrade through a previous LucidFlow release first "
            "so those hand-rolled migrations can finish, then upgrade to this version."
        )

    stamp(revision=BASELINE_REVISION)


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
