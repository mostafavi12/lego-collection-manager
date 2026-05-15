"""Orchestrate Rebrickable catalog sync for owned sets."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

logger = logging.getLogger(__name__)

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import CatalogSet, OwnedSet, SetMinifigInventoryLine
from app.services.instance_inventory import ensure_instance_inventory_for_catalog
from app.importers.rebrickable_catalog import (
    SOURCE,
    replace_minifig_part_inventory,
    replace_set_part_inventory,
    upsert_catalog_minifig,
    upsert_catalog_set,
    upsert_theme,
    utc_now,
)
from app.rebrickable.client import RebrickableClient
from app.rebrickable.dto import CatalogSetDTO, ThemeDTO
from app.rebrickable.exceptions import RebrickableAPIError


class RebrickableReader(Protocol):
    def get_set(self, set_num: str) -> CatalogSetDTO: ...

    def get_theme(self, theme_id: int) -> ThemeDTO: ...

    def iter_set_parts(self, set_num: str): ...

    def iter_set_minifigs(self, set_num: str): ...

    def iter_minifig_parts(self, minifig_num: str): ...


@dataclass
class SetSyncFailure:
    set_num: str
    message: str


@dataclass
class RebrickableSyncResult:
    sets_synced: int = 0
    sets_failed: list[SetSyncFailure] = field(default_factory=list)
    parts_upserted: int = 0
    inventory_lines_written: int = 0


def resolve_set_nums(session: Session, owned_set_ids: list[int] | None) -> list[str]:
    stmt = (
        select(CatalogSet.set_num)
        .join(OwnedSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .distinct()
        .order_by(CatalogSet.set_num)
    )
    if owned_set_ids is not None:
        stmt = stmt.where(OwnedSet.id.in_(owned_set_ids))
    return list(session.scalars(stmt))


def sync_catalog_for_set_nums(
    session: Session,
    client: RebrickableReader,
    set_nums: list[str],
) -> RebrickableSyncResult:
    result = RebrickableSyncResult()
    logger.info("Rebrickable sync started set_count=%s", len(set_nums))
    for set_num in set_nums:
        try:
            with session.begin_nested():
                parts, lines = _sync_one_set(session, client, set_num)
            result.sets_synced += 1
            result.parts_upserted += parts
            result.inventory_lines_written += lines
            logger.info(
                "Rebrickable sync set_ok set_num=%s parts_upserted=%s inventory_lines=%s",
                set_num,
                parts,
                lines,
            )
        except RebrickableAPIError as exc:
            session.rollback()
            message = _format_api_error(exc)
            logger.warning(
                "Rebrickable sync set_failed set_num=%s error=%s",
                set_num,
                message,
            )
            result.sets_failed.append(
                SetSyncFailure(set_num=set_num, message=message)
            )
        except Exception as exc:
            session.rollback()
            logger.exception(
                "Rebrickable sync set_failed set_num=%s",
                set_num,
            )
            result.sets_failed.append(
                SetSyncFailure(set_num=set_num, message=str(exc))
            )
    logger.info(
        "Rebrickable sync finished sets_synced=%s sets_failed=%s "
        "parts_upserted=%s inventory_lines_written=%s",
        result.sets_synced,
        len(result.sets_failed),
        result.parts_upserted,
        result.inventory_lines_written,
    )
    return result


def sync_rebrickable(
    session: Session,
    *,
    owned_set_ids: list[int] | None = None,
    client: RebrickableReader | None = None,
) -> RebrickableSyncResult:
    """Sync catalog data for owned sets. Opens client when not provided."""
    set_nums = resolve_set_nums(session, owned_set_ids)
    if not set_nums:
        logger.info("Rebrickable sync skipped: no owned sets to sync")
        return RebrickableSyncResult()

    if client is not None:
        return sync_catalog_for_set_nums(session, client, set_nums)

    with RebrickableClient() as rb_client:
        return sync_catalog_for_set_nums(session, rb_client, set_nums)


def _sync_one_set(
    session: Session,
    client: RebrickableReader,
    set_num: str,
) -> tuple[int, int]:
    fetched_at = utc_now()
    set_dto = client.get_set(set_num)

    theme_id = None
    if set_dto.theme_external_id is not None:
        theme_dto = client.get_theme(set_dto.theme_external_id)
        theme = upsert_theme(session, theme_dto, fetched_at=fetched_at)
        theme_id = theme.id

    catalog_set = upsert_catalog_set(
        session, set_dto, theme_id=theme_id, fetched_at=fetched_at
    )

    if set_dto.age is not None:
        for owned in session.scalars(
            select(OwnedSet).where(OwnedSet.catalog_set_id == catalog_set.id)
        ).all():
            owned.age = set_dto.age

    parts_upserted = 0
    inventory_lines = 0

    set_parts = list(client.iter_set_parts(set_num))
    p, lines = replace_set_part_inventory(
        session, catalog_set.id, set_parts, fetched_at=fetched_at
    )
    parts_upserted += p
    inventory_lines += lines

    set_minifigs = list(client.iter_set_minifigs(set_num))
    session.execute(
        delete(SetMinifigInventoryLine).where(
            SetMinifigInventoryLine.catalog_set_id == catalog_set.id
        )
    )
    for minifig_line in set_minifigs:
        catalog_minifig = upsert_catalog_minifig(
            session, minifig_line, fetched_at=fetched_at
        )
        session.add(
            SetMinifigInventoryLine(
                catalog_set_id=catalog_set.id,
                catalog_minifig_id=catalog_minifig.id,
                quantity=minifig_line.quantity,
                source=SOURCE,
                fetched_at=fetched_at,
            )
        )
        inventory_lines += 1

        minifig_parts = list(client.iter_minifig_parts(minifig_line.minifig_num))
        p, lines = replace_minifig_part_inventory(
            session,
            catalog_minifig.id,
            minifig_parts,
            fetched_at=fetched_at,
        )
        parts_upserted += p
        inventory_lines += lines

    ensure_instance_inventory_for_catalog(session, catalog_set.id)

    return parts_upserted, inventory_lines


def _format_api_error(exc: RebrickableAPIError) -> str:
    if exc.status_code is not None:
        return f"HTTP {exc.status_code} from Rebrickable"
    return str(exc)


def ensure_api_key_configured() -> None:
    """Raise RebrickableConfigError if API key is missing."""
    from app.rebrickable.config import load_rebrickable_settings

    load_rebrickable_settings()
