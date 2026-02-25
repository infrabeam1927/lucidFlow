from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text


db = SQLAlchemy()


def init_db():
    db.create_all()
    _ensure_transaction_uid_column()
    _backfill_transaction_uids()


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
