"""Upsert Rebrickable DTOs into ORM catalog tables."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import delete, select

from app.db.models import OwnedSetInventoryLine
from sqlalchemy.orm import Session

from app.db.models import (
    CatalogMinifig,
    CatalogSet,
    Color,
    MissingItem,
    MinifigPartInventoryLine,
    Part,
    PartAlias,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
    Theme,
)
from app.rebrickable.dto import (
    CatalogSetDTO,
    ColorDTO,
    MinifigPartLineDTO,
    PartDTO,
    SetMinifigLineDTO,
    SetPartLineDTO,
    ThemeDTO,
)

SOURCE = "rebrickable"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def upsert_theme(session: Session, dto: ThemeDTO, *, fetched_at: datetime) -> Theme:
    theme = session.scalar(select(Theme).where(Theme.external_id == dto.external_id))
    if theme is None:
        theme = Theme(
            external_id=dto.external_id,
            name=dto.name,
            source=SOURCE,
            fetched_at=fetched_at,
        )
        session.add(theme)
    else:
        theme.name = dto.name
        theme.fetched_at = fetched_at
    session.flush()
    return theme


def upsert_color(session: Session, dto: ColorDTO, *, fetched_at: datetime) -> Color:
    color = session.scalar(select(Color).where(Color.external_id == dto.external_id))
    if color is None:
        color = Color(
            external_id=dto.external_id,
            name=dto.name,
            rgb=dto.rgb,
            source=SOURCE,
            fetched_at=fetched_at,
        )
        session.add(color)
    else:
        color.name = dto.name
        color.rgb = dto.rgb
        color.fetched_at = fetched_at
    session.flush()
    return color


def upsert_part_counting(session: Session, dto: PartDTO, *, fetched_at: datetime) -> tuple[Part, bool]:
    """Return (part, True if newly created)."""
    part = session.scalar(select(Part).where(Part.part_num == dto.part_num))
    created = part is None
    if created:
        part = Part(
            part_num=dto.part_num,
            name=dto.name,
            image_url=dto.image_url,
            source=SOURCE,
            source_ref=dto.part_num,
            fetched_at=fetched_at,
        )
        session.add(part)
    else:
        part.name = dto.name
        part.image_url = dto.image_url
        part.fetched_at = fetched_at

    session.flush()

    for alias in dto.aliases:
        if alias == dto.part_num:
            continue
        exists = session.scalar(
            select(PartAlias.id).where(
                PartAlias.part_id == part.id,
                PartAlias.alias == alias,
                PartAlias.source == SOURCE,
            )
        )
        if exists is None:
            session.add(PartAlias(part_id=part.id, alias=alias, source=SOURCE))

    session.flush()
    return part, created


def upsert_catalog_set(
    session: Session,
    dto: CatalogSetDTO,
    *,
    theme_id: int | None,
    fetched_at: datetime,
) -> CatalogSet:
    catalog_set = session.scalar(select(CatalogSet).where(CatalogSet.set_num == dto.set_num))
    if catalog_set is None:
        catalog_set = CatalogSet(
            set_num=dto.set_num,
            name=dto.name,
            year=dto.year,
            theme_id=theme_id,
            num_parts=dto.num_parts,
            image_url=dto.image_url,
            source=SOURCE,
            source_ref=dto.set_num,
            fetched_at=fetched_at,
        )
        session.add(catalog_set)
    else:
        catalog_set.name = dto.name
        catalog_set.year = dto.year
        catalog_set.theme_id = theme_id
        catalog_set.num_parts = dto.num_parts
        catalog_set.image_url = dto.image_url
        catalog_set.source = SOURCE
        catalog_set.source_ref = dto.set_num
        catalog_set.fetched_at = fetched_at
    session.flush()
    return catalog_set


def upsert_catalog_minifig(
    session: Session,
    dto: SetMinifigLineDTO,
    *,
    fetched_at: datetime,
) -> CatalogMinifig:
    minifig = session.scalar(
        select(CatalogMinifig).where(CatalogMinifig.minifig_num == dto.minifig_num)
    )
    if minifig is None:
        minifig = CatalogMinifig(
            minifig_num=dto.minifig_num,
            name=dto.name,
            image_url=dto.image_url,
            source=SOURCE,
            fetched_at=fetched_at,
        )
        session.add(minifig)
    else:
        minifig.name = dto.name
        minifig.image_url = dto.image_url
        minifig.fetched_at = fetched_at
    session.flush()
    return minifig


def replace_set_part_inventory(
    session: Session,
    catalog_set_id: int,
    lines: list[SetPartLineDTO],
    *,
    fetched_at: datetime,
) -> tuple[int, int]:
    """Upsert set part lines; return (parts_upserted, lines_written)."""
    parts_upserted = 0
    lines_written = 0
    new_keys: set[tuple[int, int, bool, bool]] = set()

    for line in lines:
        part, created = upsert_part_counting(session, line.part, fetched_at=fetched_at)
        if created:
            parts_upserted += 1
        color = upsert_color(session, line.color, fetched_at=fetched_at)

        key = (part.id, color.id, line.is_spare, line.is_alternate)
        new_keys.add(key)

        existing = session.scalar(
            select(SetPartInventoryLine).where(
                SetPartInventoryLine.catalog_set_id == catalog_set_id,
                SetPartInventoryLine.part_id == part.id,
                SetPartInventoryLine.color_id == color.id,
                SetPartInventoryLine.is_spare == line.is_spare,
                SetPartInventoryLine.is_alternate == line.is_alternate,
            )
        )
        source_ref = str(line.inventory_id) if line.inventory_id is not None else None
        if existing is None:
            session.add(
                SetPartInventoryLine(
                    catalog_set_id=catalog_set_id,
                    part_id=part.id,
                    color_id=color.id,
                    quantity=line.quantity,
                    is_spare=line.is_spare,
                    is_alternate=line.is_alternate,
                    image_url=line.image_url,
                    source=SOURCE,
                    source_ref=source_ref,
                    fetched_at=fetched_at,
                )
            )
        else:
            existing.quantity = line.quantity
            existing.image_url = line.image_url
            existing.source_ref = source_ref
            existing.fetched_at = fetched_at
        lines_written += 1

    existing_lines = session.scalars(
        select(SetPartInventoryLine).where(
            SetPartInventoryLine.catalog_set_id == catalog_set_id
        )
    ).all()
    for existing in existing_lines:
        key = (
            existing.part_id,
            existing.color_id,
            existing.is_spare,
            existing.is_alternate,
        )
        if key in new_keys:
            continue
        session.execute(
            delete(OwnedSetInventoryLine).where(
                OwnedSetInventoryLine.set_part_inventory_line_id == existing.id
            )
        )
        session.delete(existing)

    session.flush()
    return parts_upserted, lines_written


def replace_set_minifig_inventory(
    session: Session,
    catalog_set_id: int,
    minifigs: list[SetMinifigLineDTO],
    *,
    fetched_at: datetime,
) -> int:
    session.execute(
        delete(SetMinifigInventoryLine).where(
            SetMinifigInventoryLine.catalog_set_id == catalog_set_id
        )
    )
    lines_written = 0
    for dto in minifigs:
        catalog_minifig = upsert_catalog_minifig(session, dto, fetched_at=fetched_at)
        session.add(
            SetMinifigInventoryLine(
                catalog_set_id=catalog_set_id,
                catalog_minifig_id=catalog_minifig.id,
                quantity=dto.quantity,
                source=SOURCE,
                fetched_at=fetched_at,
            )
        )
        lines_written += 1
    session.flush()
    return lines_written


def replace_minifig_part_inventory(
    session: Session,
    catalog_minifig_id: int,
    lines: list[MinifigPartLineDTO],
    *,
    fetched_at: datetime,
) -> tuple[int, int]:
    parts_upserted = 0
    lines_written = 0
    new_keys: set[tuple[int, int, bool]] = set()

    for line in lines:
        part, created = upsert_part_counting(session, line.part, fetched_at=fetched_at)
        if created:
            parts_upserted += 1
        color = upsert_color(session, line.color, fetched_at=fetched_at)
        key = (part.id, color.id, line.is_spare)
        new_keys.add(key)

        existing = session.scalar(
            select(MinifigPartInventoryLine).where(
                MinifigPartInventoryLine.catalog_minifig_id == catalog_minifig_id,
                MinifigPartInventoryLine.part_id == part.id,
                MinifigPartInventoryLine.color_id == color.id,
                MinifigPartInventoryLine.is_spare == line.is_spare,
            )
        )
        if existing is None:
            session.add(
                MinifigPartInventoryLine(
                    catalog_minifig_id=catalog_minifig_id,
                    part_id=part.id,
                    color_id=color.id,
                    quantity=line.quantity,
                    is_spare=line.is_spare,
                    image_url=line.image_url,
                    source=SOURCE,
                    fetched_at=fetched_at,
                )
            )
        else:
            existing.quantity = line.quantity
            existing.image_url = line.image_url
            existing.fetched_at = fetched_at
        lines_written += 1

    existing_lines = session.scalars(
        select(MinifigPartInventoryLine).where(
            MinifigPartInventoryLine.catalog_minifig_id == catalog_minifig_id
        )
    ).all()
    for existing in existing_lines:
        key = (existing.part_id, existing.color_id, existing.is_spare)
        if key in new_keys:
            continue
        session.execute(
            delete(OwnedSetInventoryLine).where(
                OwnedSetInventoryLine.minifig_part_inventory_line_id == existing.id
            )
        )
        session.delete(existing)

    session.flush()
    return parts_upserted, lines_written
