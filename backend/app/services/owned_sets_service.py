"""Read and update owned-set instances."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    CatalogMinifig,
    CatalogSet,
    Color,
    MinifigPartInventoryLine,
    MissingItem,
    OwnedSet,
    Part,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
    Theme,
)
from app.schemas.owned_sets import (
    CatalogBlock,
    InventoryBlock,
    MinifigInventoryBlock,
    MinifigPartLineDetail,
    OwnedSetDetailResponse,
    OwnedSetDuplicateResponse,
    OwnedSetListItem,
    OwnedSetListResponse,
    OwnedSetUpdateRequest,
    SetPartLineDetail,
)
from app.services.catalog_state import catalog_sync_state, missing_image_url


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _missing_counts(session: Session, owned_set_ids: list[int]) -> dict[int, int]:
    if not owned_set_ids:
        return {}
    rows = session.execute(
        select(MissingItem.owned_set_id, func.count())
        .where(MissingItem.owned_set_id.in_(owned_set_ids))
        .group_by(MissingItem.owned_set_id)
    ).all()
    return {owned_set_id: int(count) for owned_set_id, count in rows}


def _to_list_item(
    owned_set: OwnedSet,
    catalog_set: CatalogSet,
    theme_name: str | None,
    missing_count: int,
) -> OwnedSetListItem:
    return OwnedSetListItem(
        id=owned_set.id,
        set_num=catalog_set.set_num,
        name=catalog_set.name,
        year=catalog_set.year,
        theme_name=theme_name,
        image_url=catalog_set.image_url,
        catalog_sync_state=catalog_sync_state(catalog_set),
        investigated=owned_set.investigated,
        label=owned_set.label,
        missing_count=missing_count,
    )


def list_owned_sets(
    session: Session,
    *,
    limit: int = 50,
    offset: int = 0,
    investigated: bool | None = None,
) -> OwnedSetListResponse:
    base = (
        select(OwnedSet, CatalogSet, Theme.name)
        .join(CatalogSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .outerjoin(Theme, CatalogSet.theme_id == Theme.id)
    )
    if investigated is not None:
        base = base.where(OwnedSet.investigated == investigated)

    count_stmt = select(func.count(OwnedSet.id)).join(
        CatalogSet, OwnedSet.catalog_set_id == CatalogSet.id
    )
    if investigated is not None:
        count_stmt = count_stmt.where(OwnedSet.investigated == investigated)
    total = session.scalar(count_stmt) or 0

    rows = session.execute(
        base.order_by(OwnedSet.id).limit(limit).offset(offset)
    ).all()

    owned_ids = [row[0].id for row in rows]
    missing_map = _missing_counts(session, owned_ids)

    items = [
        _to_list_item(
            owned_set,
            catalog_set,
            theme_name,
            missing_map.get(owned_set.id, 0),
        )
        for owned_set, catalog_set, theme_name in rows
    ]
    return OwnedSetListResponse(items=items, total=total)


def get_owned_set_detail(
    session: Session,
    owned_set_id: int,
) -> OwnedSetDetailResponse | None:
    owned_set = session.scalar(
        select(OwnedSet)
        .where(OwnedSet.id == owned_set_id)
        .options(
            selectinload(OwnedSet.catalog_set).selectinload(CatalogSet.theme),
            selectinload(OwnedSet.missing_items),
        )
    )
    if owned_set is None:
        return None

    catalog_set = owned_set.catalog_set
    theme_name = catalog_set.theme.name if catalog_set.theme else None

    missing_by_set_line: dict[int, MissingItem] = {}
    missing_by_minifig_line: dict[int, MissingItem] = {}
    for item in owned_set.missing_items:
        if item.set_part_inventory_line_id is not None:
            missing_by_set_line[item.set_part_inventory_line_id] = item
        if item.minifig_part_inventory_line_id is not None:
            missing_by_minifig_line[item.minifig_part_inventory_line_id] = item

    set_part_rows = session.execute(
        select(SetPartInventoryLine, Part, Color)
        .join(Part, SetPartInventoryLine.part_id == Part.id)
        .join(Color, SetPartInventoryLine.color_id == Color.id)
        .where(SetPartInventoryLine.catalog_set_id == catalog_set.id)
        .order_by(SetPartInventoryLine.id)
    ).all()

    set_parts: list[SetPartLineDetail] = []
    for line, part, color in set_part_rows:
        missing = missing_by_set_line.get(line.id)
        set_parts.append(
            SetPartLineDetail(
                line_id=line.id,
                part_num=part.part_num,
                part_name=part.name,
                color_id=color.external_id,
                color_name=color.name,
                quantity=line.quantity,
                is_spare=line.is_spare,
                is_alternate=line.is_alternate,
                image_url=line.image_url,
                missing_quantity=missing.quantity_missing if missing else 0,
                missing_item_id=missing.id if missing else None,
                missing_image_url=missing_image_url(
                    missing.id if missing else None,
                    missing.image_path if missing else None,
                ),
            )
        )

    minifig_rows = session.execute(
        select(SetMinifigInventoryLine, CatalogMinifig)
        .join(
            CatalogMinifig,
            SetMinifigInventoryLine.catalog_minifig_id == CatalogMinifig.id,
        )
        .where(SetMinifigInventoryLine.catalog_set_id == catalog_set.id)
        .order_by(SetMinifigInventoryLine.id)
    ).all()

    minifigs: list[MinifigInventoryBlock] = []
    for mf_line, catalog_minifig in minifig_rows:
        part_rows = session.execute(
            select(MinifigPartInventoryLine, Part, Color)
            .join(Part, MinifigPartInventoryLine.part_id == Part.id)
            .join(Color, MinifigPartInventoryLine.color_id == Color.id)
            .where(MinifigPartInventoryLine.catalog_minifig_id == catalog_minifig.id)
            .order_by(MinifigPartInventoryLine.id)
        ).all()

        parts: list[MinifigPartLineDetail] = []
        for part_line, part, color in part_rows:
            missing = missing_by_minifig_line.get(part_line.id)
            parts.append(
                MinifigPartLineDetail(
                    line_id=part_line.id,
                    part_num=part.part_num,
                    part_name=part.name,
                    color_id=color.external_id,
                    color_name=color.name,
                    quantity=part_line.quantity,
                    missing_quantity=missing.quantity_missing if missing else 0,
                    missing_item_id=missing.id if missing else None,
                    missing_image_url=missing_image_url(
                        missing.id if missing else None,
                        missing.image_path if missing else None,
                    ),
                )
            )

        minifigs.append(
            MinifigInventoryBlock(
                line_id=mf_line.id,
                minifig_num=catalog_minifig.minifig_num,
                name=catalog_minifig.name,
                quantity=mf_line.quantity,
                parts=parts,
            )
        )

    return OwnedSetDetailResponse(
        id=owned_set.id,
        investigated=owned_set.investigated,
        label=owned_set.label,
        catalog=CatalogBlock(
            set_num=catalog_set.set_num,
            name=catalog_set.name,
            year=catalog_set.year,
            theme_name=theme_name,
            image_url=catalog_set.image_url,
            num_parts=catalog_set.num_parts,
        ),
        inventory=InventoryBlock(set_parts=set_parts, minifigs=minifigs),
    )


def update_owned_set(
    session: Session,
    owned_set_id: int,
    body: OwnedSetUpdateRequest,
) -> OwnedSetListItem | None:
    owned_set = session.scalar(
        select(OwnedSet)
        .where(OwnedSet.id == owned_set_id)
        .options(selectinload(OwnedSet.catalog_set).selectinload(CatalogSet.theme))
    )
    if owned_set is None:
        return None

    if body.investigated is not None:
        owned_set.investigated = body.investigated
    if body.label is not None:
        owned_set.label = body.label

    session.flush()
    catalog_set = owned_set.catalog_set
    theme_name = catalog_set.theme.name if catalog_set.theme else None
    missing_count = session.scalar(
        select(func.count())
        .select_from(MissingItem)
        .where(MissingItem.owned_set_id == owned_set_id)
    ) or 0
    return _to_list_item(owned_set, catalog_set, theme_name, int(missing_count))


def duplicate_owned_set(
    session: Session,
    source_id: int,
) -> OwnedSetDuplicateResponse | None:
    source = session.scalar(
        select(OwnedSet)
        .where(OwnedSet.id == source_id)
        .options(selectinload(OwnedSet.catalog_set).selectinload(CatalogSet.theme))
    )
    if source is None:
        return None

    new_owned = OwnedSet(
        catalog_set_id=source.catalog_set_id,
        investigated=False,
        label=None,
        notes=None,
        created_at=utc_now(),
    )
    session.add(new_owned)
    session.flush()

    catalog_set = source.catalog_set
    theme_name = catalog_set.theme.name if catalog_set.theme else None
    item = _to_list_item(new_owned, catalog_set, theme_name, 0)
    return OwnedSetDuplicateResponse(
        **item.model_dump(),
        duplicated_from_owned_set_id=source_id,
    )
