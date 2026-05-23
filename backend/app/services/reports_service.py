"""Collection reporting aggregates."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    CatalogSet,
    MinifigPartInventoryLine,
    OwnedSet,
    OwnedSetInventoryLine,
    SetPartInventoryLine,
    Theme,
)
from app.schemas.reports import (
    IncompleteSetMissingLine,
    IncompleteSetReportItem,
    IncompleteSetsReportResponse,
    ReportsSummaryResponse,
)
from app.services.catalog_state import resolve_part_image_url
from app.services.instance_inventory import count_lines_with_missing
from app.services.instance_labels import copy_index_map, display_label


def get_summary(session: Session) -> ReportsSummaryResponse:
    total_sets = int(session.scalar(select(func.count()).select_from(OwnedSet)) or 0)

    investigated_sets = int(
        session.scalar(
            select(func.count())
            .select_from(OwnedSet)
            .where(OwnedSet.investigated.is_(True))
        )
        or 0
    )

    incomplete_owned_set_ids = (
        select(OwnedSetInventoryLine.owned_set_id)
        .where(OwnedSetInventoryLine.quantity_missing > 0)
        .distinct()
    )
    complete_sets = int(
        session.scalar(
            select(func.count())
            .select_from(OwnedSet)
            .where(
                OwnedSet.investigated.is_(True),
                OwnedSet.id.not_in(incomplete_owned_set_ids),
            )
        )
        or 0
    )

    total_parts, missing_parts = session.execute(
        select(
            func.coalesce(func.sum(OwnedSetInventoryLine.quantity), 0),
            func.coalesce(func.sum(OwnedSetInventoryLine.quantity_missing), 0),
        )
    ).one()

    return ReportsSummaryResponse(
        total_sets=total_sets,
        investigated_sets=investigated_sets,
        complete_sets=complete_sets,
        total_parts=int(total_parts),
        missing_parts=int(missing_parts),
    )


def _incomplete_owned_set_ids_subquery():
    return (
        select(OwnedSetInventoryLine.owned_set_id)
        .where(OwnedSetInventoryLine.quantity_missing > 0)
        .distinct()
    )


def _element_ids_for_catalog_line(
    line: SetPartInventoryLine | MinifigPartInventoryLine,
) -> list[str]:
    return sorted(element.element_id for element in line.element_ids)


def _missing_line_from_instance(
    instance_line: OwnedSetInventoryLine,
) -> IncompleteSetMissingLine | None:
    if instance_line.quantity_missing <= 0:
        return None

    if instance_line.set_part_inventory_line is not None:
        catalog_line = instance_line.set_part_inventory_line
        part = catalog_line.part
        color = catalog_line.color
        image_url = catalog_line.image_url or resolve_part_image_url(part)
    elif instance_line.minifig_part_inventory_line is not None:
        catalog_line = instance_line.minifig_part_inventory_line
        part = catalog_line.part
        color = catalog_line.color
        image_url = catalog_line.image_url or resolve_part_image_url(part)
    else:
        return None

    return IncompleteSetMissingLine(
        part_id=part.id,
        part_num=part.part_num,
        part_name=part.name,
        color_id=color.external_id,
        color_name=color.name,
        quantity_missing=instance_line.quantity_missing,
        element_ids=_element_ids_for_catalog_line(catalog_line),
        part_image_url=image_url,
    )


def list_incomplete_sets(
    session: Session,
    *,
    limit: int = 50,
    offset: int = 0,
) -> IncompleteSetsReportResponse:
    incomplete_ids = _incomplete_owned_set_ids_subquery()

    total = int(
        session.scalar(
            select(func.count()).select_from(OwnedSet).where(OwnedSet.id.in_(incomplete_ids))
        )
        or 0
    )

    rows = session.execute(
        select(OwnedSet, CatalogSet, Theme.name)
        .join(CatalogSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .outerjoin(Theme, CatalogSet.theme_id == Theme.id)
        .where(OwnedSet.id.in_(incomplete_ids))
        .order_by(CatalogSet.set_number.asc(), OwnedSet.id.asc())
        .limit(limit)
        .offset(offset)
    ).all()

    owned_ids = [owned_set.id for owned_set, _, _ in rows]
    if not owned_ids:
        return IncompleteSetsReportResponse(items=[], total=total)

    catalog_ids = list({catalog_set.id for _, catalog_set, _ in rows})
    index_map = copy_index_map(session, catalog_ids)
    missing_line_counts = count_lines_with_missing(session, owned_ids)

    instance_lines = session.scalars(
        select(OwnedSetInventoryLine)
        .where(
            OwnedSetInventoryLine.owned_set_id.in_(owned_ids),
            OwnedSetInventoryLine.quantity_missing > 0,
        )
        .options(
            selectinload(OwnedSetInventoryLine.set_part_inventory_line).selectinload(
                SetPartInventoryLine.part
            ),
            selectinload(OwnedSetInventoryLine.set_part_inventory_line).selectinload(
                SetPartInventoryLine.color
            ),
            selectinload(OwnedSetInventoryLine.set_part_inventory_line).selectinload(
                SetPartInventoryLine.element_ids
            ),
            selectinload(OwnedSetInventoryLine.minifig_part_inventory_line).selectinload(
                MinifigPartInventoryLine.part
            ),
            selectinload(OwnedSetInventoryLine.minifig_part_inventory_line).selectinload(
                MinifigPartInventoryLine.color
            ),
            selectinload(OwnedSetInventoryLine.minifig_part_inventory_line).selectinload(
                MinifigPartInventoryLine.element_ids
            ),
        )
    ).all()

    lines_by_owned_set: dict[int, list[IncompleteSetMissingLine]] = defaultdict(list)
    missing_parts_totals: dict[int, int] = defaultdict(int)
    for instance_line in instance_lines:
        missing_line = _missing_line_from_instance(instance_line)
        if missing_line is None:
            continue
        lines_by_owned_set[instance_line.owned_set_id].append(missing_line)
        missing_parts_totals[instance_line.owned_set_id] += instance_line.quantity_missing

    items: list[IncompleteSetReportItem] = []
    for owned_set, catalog_set, _theme_name in rows:
        copy_idx = index_map.get(catalog_set.id, {}).get(owned_set.id, 1)
        missing_lines = sorted(
            lines_by_owned_set.get(owned_set.id, []),
            key=lambda line: (
                line.part_name or "",
                line.part_num,
                line.color_name or "",
            ),
        )
        items.append(
            IncompleteSetReportItem(
                id=owned_set.id,
                set_num=catalog_set.set_number,
                name=catalog_set.name,
                display_label=display_label(owned_set.label, copy_idx),
                investigated=owned_set.investigated,
                missing_line_count=missing_line_counts.get(owned_set.id, 0),
                missing_parts_total=missing_parts_totals.get(owned_set.id, 0),
                missing_lines=missing_lines,
            )
        )

    return IncompleteSetsReportResponse(items=items, total=total)
