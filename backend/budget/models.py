from datetime import date
from uuid import uuid4
from sqlalchemy import CheckConstraint, UniqueConstraint
from .database import db


def generate_transaction_uid():
    return str(uuid4())


def dollars_to_cents(value: float) -> int:
    return int(round(value * 100))


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)
    type = db.Column(db.String(20), nullable=False)  # income, expense, investment, withdrawal

    transactions = db.relationship("Transaction", backref="category", lazy=True)
    goals = db.relationship("BudgetGoal", backref="category", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "type": self.type}


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    uid = db.Column(db.String(36), unique=True, nullable=False, default=generate_transaction_uid)
    description = db.Column(db.String(120), nullable=False)
    amount_cents = db.Column(db.Integer, nullable=False)
    occurred_on = db.Column(db.Date, nullable=False, default=date.today)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    __table_args__ = (CheckConstraint("amount_cents > 0", name="check_amount_positive"),)

    @property
    def amount(self):
        return self.amount_cents / 100

    def to_dict(self):
        return {
            "uid": self.uid,
            "id": self.id,
            "description": self.description,
            "amount": round(self.amount_cents / 100, 2),
            "occurred_on": self.occurred_on.isoformat(),
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "type": self.category.type if self.category else None,
        }


class BudgetGoal(db.Model):
    __tablename__ = "budget_goals"

    id = db.Column(db.Integer, primary_key=True)
    monthly_limit_cents = db.Column(db.Integer, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    __table_args__ = (
        CheckConstraint("monthly_limit_cents > 0", name="check_limit_positive"),
        UniqueConstraint("category_id", name="uq_category_goal"),
    )

    @property
    def monthly_limit(self):
        return self.monthly_limit_cents / 100

    def to_dict(self):
        return {
            "id": self.id,
            "monthly_limit": round(self.monthly_limit_cents / 100, 2),
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
        }
