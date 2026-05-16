"""Database migration gate tests."""

from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect

from app.db.migration_check import (
    DatabaseMigrationError,
    ensure_database_at_head,
    get_alembic_head_revision,
)


def test_get_alembic_head_revision() -> None:
    head = get_alembic_head_revision()
    assert head


def test_ensure_database_at_head_passes_when_migrated(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "migrated.db"
    database_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.delenv("SKIP_DB_MIGRATION_CHECK", raising=False)

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    ensure_database_at_head(database_url)


def test_migration_creates_inventory_line_element_ids_table(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "element_ids.db"
    database_url = f"sqlite:///{db_path}"
    monkeypatch.setenv("DATABASE_URL", database_url)

    config = Config("alembic.ini")
    command.upgrade(config, "head")

    engine = create_engine(database_url)
    try:
        columns = {
            column["name"]
            for column in inspect(engine).get_columns("inventory_line_element_ids")
        }
    finally:
        engine.dispose()
    assert {
        "id",
        "set_part_inventory_line_id",
        "minifig_part_inventory_line_id",
        "element_id",
    }.issubset(columns)


def test_ensure_database_at_head_fails_when_empty(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_path = tmp_path / "empty.db"
    database_url = f"sqlite:///{db_path}"
    monkeypatch.delenv("SKIP_DB_MIGRATION_CHECK", raising=False)

    with pytest.raises(DatabaseMigrationError, match="no Alembic revision"):
        ensure_database_at_head(database_url)
