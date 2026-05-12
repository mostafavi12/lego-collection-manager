"""SQLAlchemy declarative base (models will register here in later migrations)."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
