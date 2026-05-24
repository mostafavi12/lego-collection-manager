"""Database migration helpers for portable and dev runtimes."""

from __future__ import annotations

from alembic import command
from alembic.config import Config

from app.runtime_paths import get_alembic_ini_path


def upgrade_database_to_head() -> None:
    config = Config(str(get_alembic_ini_path()))
    command.upgrade(config, "head")
