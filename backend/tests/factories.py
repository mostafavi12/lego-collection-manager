"""Minimal model factories for tests."""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.models import (
    CatalogSet,
    Color,
    OwnedSet,
    Part,
    SetPartInventoryLine,
    Theme,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def add_theme(session: Session, *, external_id: int = 1, name: str = "Town") -> Theme:
    theme = Theme(
        external_id=external_id,
        name=name,
        source="rebrickable",
        fetched_at=utc_now(),
    )
    session.add(theme)
    session.flush()
    return theme


def add_catalog_set(
    session: Session,
    *,
    set_num: str = "6024-1",
    theme: Theme | None = None,
) -> CatalogSet:
    catalog_set = CatalogSet(
        set_num=set_num,
        name="Police Car",
        year=1980,
        theme_id=theme.id if theme else None,
        source="rebrickable",
        source_ref=set_num,
        fetched_at=utc_now(),
    )
    session.add(catalog_set)
    session.flush()
    return catalog_set


def add_owned_set(
    session: Session,
    catalog_set: CatalogSet,
    *,
    investigated: bool = False,
    label: str | None = None,
) -> OwnedSet:
    owned_set = OwnedSet(
        catalog_set_id=catalog_set.id,
        investigated=investigated,
        label=label,
        created_at=utc_now(),
    )
    session.add(owned_set)
    session.flush()
    return owned_set


def add_part(session: Session, *, part_num: str = "3024") -> Part:
    part = Part(
        part_num=part_num,
        name="Plate 1 x 1",
        source="rebrickable",
        source_ref=part_num,
        fetched_at=utc_now(),
    )
    session.add(part)
    session.flush()
    return part


def add_color(session: Session, *, external_id: int = 0, name: str = "Black") -> Color:
    color = Color(
        external_id=external_id,
        name=name,
        source="rebrickable",
        fetched_at=utc_now(),
    )
    session.add(color)
    session.flush()
    return color


def add_set_part_inventory_line(
    session: Session,
    *,
    catalog_set: CatalogSet,
    part: Part,
    color: Color,
    quantity: int = 4,
) -> SetPartInventoryLine:
    line = SetPartInventoryLine(
        catalog_set_id=catalog_set.id,
        part_id=part.id,
        color_id=color.id,
        quantity=quantity,
        source="rebrickable",
        fetched_at=utc_now(),
    )
    session.add(line)
    session.flush()
    return line
