"""Search the user's collection (set copies) and parts appearing in their inventories."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import cast, func, or_, select, String
from sqlalchemy.orm import Session, selectinload

from app.db.models import (
    CatalogSet,
    MinifigPartInventoryLine,
    OwnedSet,
    Part,
    PartAlias,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
)
from app.schemas.search import (
    SearchPartDisplayLine,
    SearchPartResult,
    SearchPartSetOccurrence,
    SearchResponse,
    SearchSetResult,
)
from app.services.catalog_state import resolve_part_image_url


def search(
    session: Session,
    *,
    q: str,
    search_type: str = "all",
    limit: int = 20,
    offset: int = 0,
) -> SearchResponse:
    sets: list[SearchSetResult] = []
    parts: list[SearchPartResult] = []

    if search_type in ("set", "all"):
        sets = _search_sets(session, q=q, limit=limit, offset=offset)

    if search_type in ("part", "all"):
        parts = _search_parts(session, q=q, limit=limit, offset=offset)

    return SearchResponse(sets=sets, parts=parts)


def _search_sets(
    session: Session,
    *,
    q: str,
    limit: int,
    offset: int,
) -> list[SearchSetResult]:
    set_prefix = cast(CatalogSet.set_number, String).like(f"{q}%")
    rows = session.execute(
        select(OwnedSet, CatalogSet)
        .join(CatalogSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .where(set_prefix)
        .order_by(OwnedSet.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        SearchSetResult(
            owned_set_id=owned.id,
            set_num=catalog.set_number,
            name=catalog.name,
            investigated=owned.investigated,
            label=owned.label,
        )
        for owned, catalog in rows
    ]


def _owned_catalog_ids_subquery():
    return select(OwnedSet.catalog_set_id).distinct().scalar_subquery()


def _quantities_by_catalog_set(session: Session, *, part_id: int) -> dict[int, int]:
    """Sum template quantities per catalog set (set-level lines + minifig BOM × minifig count)."""
    owned = _owned_catalog_ids_subquery()
    totals: dict[int, int] = defaultdict(int)

    for cid, qty in session.execute(
        select(
            SetPartInventoryLine.catalog_set_id,
            func.sum(SetPartInventoryLine.quantity),
        )
        .where(
            SetPartInventoryLine.part_id == part_id,
            SetPartInventoryLine.catalog_set_id.in_(owned),
        )
        .group_by(SetPartInventoryLine.catalog_set_id)
    ).all():
        if cid is not None and qty is not None:
            totals[cid] += int(qty)

    for cid, qty in session.execute(
        select(
            SetMinifigInventoryLine.catalog_set_id,
            func.sum(
                SetMinifigInventoryLine.quantity * MinifigPartInventoryLine.quantity
            ),
        )
        .select_from(MinifigPartInventoryLine)
        .join(
            SetMinifigInventoryLine,
            SetMinifigInventoryLine.catalog_minifig_id
            == MinifigPartInventoryLine.catalog_minifig_id,
        )
        .where(
            MinifigPartInventoryLine.part_id == part_id,
            SetMinifigInventoryLine.catalog_set_id.in_(owned),
        )
        .group_by(SetMinifigInventoryLine.catalog_set_id)
    ).all():
        if cid is not None and qty is not None:
            totals[cid] += int(qty)

    return {k: v for k, v in totals.items() if v > 0}


def _occurrences_for_part(session: Session, *, part_id: int) -> list[SearchPartSetOccurrence]:
    totals = _quantities_by_catalog_set(session, part_id=part_id)
    if not totals:
        return []

    cats = session.scalars(
        select(CatalogSet).where(CatalogSet.id.in_(totals.keys()))
    ).all()
    by_id = {c.id: c for c in cats}

    def sort_key(cid: int) -> tuple[int, int]:
        c = by_id[cid]
        return (c.set_number, c.set_variant)

    out: list[SearchPartSetOccurrence] = []
    for cid in sorted(totals.keys(), key=sort_key):
        cat = by_id[cid]
        owned_set_id = session.scalar(
            select(OwnedSet.id)
            .where(OwnedSet.catalog_set_id == cid)
            .order_by(OwnedSet.id)
            .limit(1)
        )
        if owned_set_id is None:
            continue
        out.append(
            SearchPartSetOccurrence(
                set_num=cat.set_number,
                quantity=totals[cid],
                owned_set_id=owned_set_id,
            )
        )
    return out


def _search_parts(
    session: Session,
    *,
    q: str,
    limit: int,
    offset: int,
) -> list[SearchPartResult]:
    owned = _owned_catalog_ids_subquery()

    part_match = or_(Part.part_num.startswith(q), PartAlias.alias.startswith(q))

    part_ids = [
        row[0]
        for row in session.execute(
            select(Part.id)
            .join(SetPartInventoryLine, SetPartInventoryLine.part_id == Part.id)
            .outerjoin(PartAlias, PartAlias.part_id == Part.id)
            .where(
                SetPartInventoryLine.catalog_set_id.in_(owned),
                part_match,
            )
            .group_by(Part.id, Part.part_num)
            .order_by(Part.part_num)
            .limit(limit)
            .offset(offset)
        ).all()
    ]

    if not part_ids:
        return []

    parts = session.scalars(
        select(Part)
        .options(selectinload(Part.aliases))
        .where(Part.id.in_(part_ids))
    ).all()
    by_id = {p.id: p for p in parts}
    ordered_parts = [by_id[pid] for pid in part_ids if pid in by_id]

    results: list[SearchPartResult] = []
    for part in ordered_parts:
        occurrences = _occurrences_for_part(session, part_id=part.id)
        lines: list[SearchPartDisplayLine] = [
            SearchPartDisplayLine(display_part_num=part.part_num, sets=list(occurrences))
        ]
        for alias in sorted(part.aliases, key=lambda a: a.alias.casefold()):
            lines.append(
                SearchPartDisplayLine(display_part_num=alias.alias, sets=list(occurrences))
            )

        results.append(
            SearchPartResult(
                part_num=part.part_num,
                name=part.name,
                image_url=resolve_part_image_url(part),
                lines=lines,
            )
        )

    return results
