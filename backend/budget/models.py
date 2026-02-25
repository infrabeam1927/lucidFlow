from datetime import date
from sqlalchemy import CheckConstraint, UniqueConstraint
from .database import db


class Category(db.Model):
    __tablename__ = "categories"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False, unique=True)
    type = db.Column(db.String(20), nullable=False)  # income or expense

    transactions = db.relationship("Transaction", backref="category", lazy=True)
    goals = db.relationship("BudgetGoal", backref="category", lazy=True)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "type": self.type}


class Transaction(db.Model):
    __tablename__ = "transactions"

    id = db.Column(db.Integer, primary_key=True)
    description = db.Column(db.String(120), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    occurred_on = db.Column(db.Date, nullable=False, default=date.today)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    __table_args__ = (CheckConstraint("amount > 0", name="check_amount_positive"),)

    def to_dict(self):
        return {
            "id": self.id,
            "description": self.description,
            "amount": self.amount,
            "occurred_on": self.occurred_on.isoformat(),
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
            "type": self.category.type if self.category else None,
        }


class BudgetGoal(db.Model):
    __tablename__ = "budget_goals"

    id = db.Column(db.Integer, primary_key=True)
    monthly_limit = db.Column(db.Float, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey("categories.id"), nullable=False)

    __table_args__ = (
        CheckConstraint("monthly_limit > 0", name="check_limit_positive"),
        UniqueConstraint("category_id", name="uq_category_goal"),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "monthly_limit": self.monthly_limit,
            "category_id": self.category_id,
            "category_name": self.category.name if self.category else None,
        }
