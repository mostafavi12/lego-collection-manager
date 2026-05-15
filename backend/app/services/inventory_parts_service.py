"""Upsert catalog set-part lines and attach them to owned-set instances."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Color, OwnedSet, OwnedSetInventoryLine, Part, SetPartInventoryLine
from app.schemas.manual_add import ManualAddPartInput

MANUAL_SOURCE = "user"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _upsert_user_color(
    session: Session,
    *,
    external_id: int,
    color_name: str | None,
    fetched_at: datetime,
) -> Color:
    color = session.scalar(select(Color).where(Color.external_id == external_id))
    name = (color_name or "").strip() or f"Color {external_id}"
    if color is None:
        color = Color(
            external_id=external_id,
            name=name,
            rgb=None,
            source=MANUAL_SOURCE,
            fetched_at=fetched_at,
        )
        session.add(color)
    else:
        if color_name and color_name.strip():
            color.name = color_name.strip()
        color.fetched_at = fetched_at
    session.flush()
    return color


def _upsert_user_part(
    session: Session,
    *,
    part_num: str,
    part_name: str | None,
    fetched_at: datetime,
) -> Part:
    trimmed = part_num.strip()
    if not trimmed:
        raise InventoryPartsError("Part number is required")
    part = session.scalar(select(Part).where(Part.part_num == trimmed))
    if part is None:
        part = Part(
            part_num=trimmed,
            name=part_name.strip() if part_name and part_name.strip() else None,
            image_url=None,
            source=MANUAL_SOURCE,
            source_ref=trimmed,
            fetched_at=fetched_at,
        )
        session.add(part)
    else:
        if part_name and part_name.strip():
            part.name = part_name.strip()
        part.fetched_at = fetched_at
    session.flush()
    return part


class InventoryPartsError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def upsert_set_part_catalog_line(
    session: Session,
    catalog_set_id: int,
    line: ManualAddPartInput,
    *,
    fetched_at: datetime | None = None,
) -> SetPartInventoryLine:
    when = fetched_at or utc_now()
    part = _upsert_user_part(
        session,
        part_num=line.part_num,
        part_name=line.part_name,
        fetched_at=when,
    )
    color = _upsert_user_color(
        session,
        external_id=line.color_id,
        color_name=line.color_name,
        fetched_at=when,
    )
    existing = session.scalar(
        select(SetPartInventoryLine).where(
            SetPartInventoryLine.catalog_set_id == catalog_set_id,
            SetPartInventoryLine.part_id == part.id,
            SetPartInventoryLine.color_id == color.id,
        )
    )
    if existing is None:
        existing = SetPartInventoryLine(
            catalog_set_id=catalog_set_id,
            part_id=part.id,
            color_id=color.id,
            quantity=line.quantity,
            image_url=None,
            source=MANUAL_SOURCE,
            source_ref=None,
            fetched_at=when,
        )
        session.add(existing)
    else:
        existing.quantity = max(existing.quantity, line.quantity)
        existing.fetched_at = when
    session.flush()
    return existing


def add_set_part_to_owned_set(
    session: Session,
    owned_set_id: int,
    line: ManualAddPartInput,
) -> OwnedSetInventoryLine:
    owned_set = session.get(OwnedSet, owned_set_id)
    if owned_set is None:
        raise InventoryPartsError("Owned set not found", status_code=404)

    catalog_line = upsert_set_part_catalog_line(
        session,
        owned_set.catalog_set_id,
        line,
    )

    existing_instance = session.scalar(
        select(OwnedSetInventoryLine).where(
            OwnedSetInventoryLine.owned_set_id == owned_set_id,
            OwnedSetInventoryLine.set_part_inventory_line_id == catalog_line.id,
        )
    )
    if existing_instance is not None:
        raise InventoryPartsError(
            "This part is already in the inventory for this instance",
            status_code=409,
        )

    instance_line = OwnedSetInventoryLine(
        owned_set_id=owned_set_id,
        set_part_inventory_line_id=catalog_line.id,
        minifig_part_inventory_line_id=None,
        quantity=line.quantity,
        quantity_missing=0,
    )
    session.add(instance_line)
    session.flush()
    return instance_line
