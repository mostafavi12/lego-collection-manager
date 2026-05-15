"""Create owned-set instances manually (new catalog or additional copy)."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    CatalogSet,
    Color,
    OwnedSet,
    Part,
    SetPartInventoryLine,
    Theme,
)
from app.schemas.manual_add import (
    AddPreviewPartLine,
    ManualAddCatalogInput,
    ManualAddPartInput,
    OwnedSetAddPreviewResponse,
    OwnedSetCreateRequest,
    OwnedSetCreateResponse,
)
from app.services.catalog_state import resolve_catalog_image_url
from app.services.instance_inventory import clone_instance_inventory
from app.services.instance_labels import (
    copy_index_for_owned_set,
    count_owned_instances,
    display_label,
    suggested_copy_label,
)
from app.services.owned_sets_service import (
    OwnedSetServiceError,
    USER_THEME_SOURCE,
    _apply_catalog_theme_name,
    _apply_shared_age,
    _to_list_item,
    utc_now,
)

MANUAL_SOURCE = "user"


def normalize_set_num(set_num: str) -> str:
    trimmed = set_num.strip()
    if not trimmed:
        raise OwnedSetServiceError("Set number is required")
    return trimmed


def _shared_age_for_catalog(session: Session, catalog_set_id: int) -> int | None:
    return session.scalar(
        select(OwnedSet.age)
        .where(OwnedSet.catalog_set_id == catalog_set_id, OwnedSet.age.is_not(None))
        .limit(1)
    )


def _catalog_part_lines(session: Session, catalog_set_id: int) -> list[AddPreviewPartLine]:
    rows = session.execute(
        select(SetPartInventoryLine, Part, Color)
        .join(Part, SetPartInventoryLine.part_id == Part.id)
        .join(Color, SetPartInventoryLine.color_id == Color.id)
        .where(SetPartInventoryLine.catalog_set_id == catalog_set_id)
        .order_by(Part.part_num, Color.name, SetPartInventoryLine.id)
    ).all()
    return [
        AddPreviewPartLine(
            part_num=part.part_num,
            part_name=part.name,
            color_name=color.name,
            quantity=line.quantity,
            is_spare=line.is_spare,
            is_alternate=line.is_alternate,
        )
        for line, part, color in rows
    ]


def get_add_preview(session: Session, set_num: str) -> OwnedSetAddPreviewResponse:
    normalized = normalize_set_num(set_num)
    catalog = session.scalar(
        select(CatalogSet)
        .where(CatalogSet.set_num == normalized)
        .options(selectinload(CatalogSet.theme))
    )
    if catalog is None:
        return OwnedSetAddPreviewResponse(
            set_num=normalized,
            catalog_exists=False,
            set_name=None,
            existing_copy_count=0,
            suggested_label=suggested_copy_label(0),
        )

    count = count_owned_instances(session, catalog.id)
    theme_name = catalog.theme.name if catalog.theme else None
    return OwnedSetAddPreviewResponse(
        set_num=normalized,
        catalog_exists=True,
        set_name=catalog.name,
        existing_copy_count=count,
        suggested_label=suggested_copy_label(count),
        theme_name=theme_name,
        year=catalog.year,
        num_parts=catalog.num_parts,
        age=_shared_age_for_catalog(session, catalog.id),
        image_url=resolve_catalog_image_url(catalog),
        set_parts=_catalog_part_lines(session, catalog.id),
    )


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
        raise OwnedSetServiceError("Part number is required")
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


def _add_catalog_part_line(
    session: Session,
    catalog_set_id: int,
    line: ManualAddPartInput,
    *,
    fetched_at: datetime,
) -> None:
    part = _upsert_user_part(
        session,
        part_num=line.part_num,
        part_name=line.part_name,
        fetched_at=fetched_at,
    )
    color = _upsert_user_color(
        session,
        external_id=line.color_id,
        color_name=line.color_name,
        fetched_at=fetched_at,
    )
    existing = session.scalar(
        select(SetPartInventoryLine).where(
            SetPartInventoryLine.catalog_set_id == catalog_set_id,
            SetPartInventoryLine.part_id == part.id,
            SetPartInventoryLine.color_id == color.id,
            SetPartInventoryLine.is_spare == line.is_spare,
            SetPartInventoryLine.is_alternate == line.is_alternate,
        )
    )
    if existing is None:
        session.add(
            SetPartInventoryLine(
                catalog_set_id=catalog_set_id,
                part_id=part.id,
                color_id=color.id,
                quantity=line.quantity,
                is_spare=line.is_spare,
                is_alternate=line.is_alternate,
                image_url=None,
                source=MANUAL_SOURCE,
                source_ref=None,
                fetched_at=fetched_at,
            )
        )
    else:
        existing.quantity = line.quantity
        existing.fetched_at = fetched_at
    session.flush()


def _apply_catalog_metadata(
    session: Session,
    catalog_set: CatalogSet,
    catalog: ManualAddCatalogInput | None,
) -> None:
    if catalog is None:
        return
    if catalog.name is not None:
        catalog_set.name = catalog.name.strip() or None
    if catalog.year is not None:
        catalog_set.year = catalog.year
    if catalog.num_parts is not None:
        catalog_set.num_parts = catalog.num_parts
    if catalog.theme_name is not None:
        _apply_catalog_theme_name(session, catalog_set, catalog.theme_name)


def create_owned_set_manual(
    session: Session,
    body: OwnedSetCreateRequest,
) -> OwnedSetCreateResponse:
    set_num = normalize_set_num(body.set_num)
    catalog = session.scalar(
        select(CatalogSet)
        .where(CatalogSet.set_num == set_num)
        .options(selectinload(CatalogSet.theme))
    )
    now = utc_now()
    catalog_created = False

    if catalog is not None:
        if body.catalog is not None or body.parts:
            raise OwnedSetServiceError(
                "Set number already exists; omit catalog and parts to add another copy",
            )
    else:
        catalog = CatalogSet(
            set_num=set_num,
            name=None,
            year=None,
            theme_id=None,
            num_parts=None,
            image_url=None,
            source=MANUAL_SOURCE,
            source_ref=set_num,
            fetched_at=now,
        )
        session.add(catalog)
        session.flush()
        catalog_created = True
        _apply_catalog_metadata(session, catalog, body.catalog)
        if body.parts:
            for part_line in body.parts:
                _add_catalog_part_line(
                    session,
                    catalog.id,
                    part_line,
                    fetched_at=now,
                )

    resolved_label = (body.label or "").strip() or suggested_copy_label(
        count_owned_instances(session, catalog.id)
    )
    owned = OwnedSet(
        catalog_set_id=catalog.id,
        investigated=False,
        label=resolved_label or None,
        age=body.age,
        notes=None,
        created_at=now,
    )
    session.add(owned)
    session.flush()

    if body.age is not None:
        _apply_shared_age(session, catalog.id, body.age)

    clone_instance_inventory(session, owned.id)
    session.refresh(catalog, attribute_names=["theme"])
    theme_name = catalog.theme.name if catalog.theme else None
    copy_idx = copy_index_for_owned_set(session, owned)
    item = _to_list_item(owned, catalog, theme_name, 0, copy_idx)
    return OwnedSetCreateResponse(catalog_created=catalog_created, **item.model_dump())
