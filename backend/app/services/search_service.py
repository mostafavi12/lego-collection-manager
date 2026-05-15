"""Search the user's collection (set copies) and parts appearing in their inventories."""

from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.db.models import (
    CatalogSet,
    OwnedSet,
    Part,
    PartAlias,
    SetPartInventoryLine,
)
from app.schemas.search import SearchPartResult, SearchResponse, SearchSetResult


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
    rows = session.execute(
        select(OwnedSet, CatalogSet)
        .join(CatalogSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .where(CatalogSet.set_num.startswith(q))
        .order_by(OwnedSet.id)
        .limit(limit)
        .offset(offset)
    ).all()
    return [
        SearchSetResult(
            owned_set_id=owned.id,
            set_num=catalog.set_num,
            name=catalog.name,
            investigated=owned.investigated,
            label=owned.label,
        )
        for owned, catalog in rows
    ]


def _search_parts(
    session: Session,
    *,
    q: str,
    limit: int,
    offset: int,
) -> list[SearchPartResult]:
    owned_catalog_ids = select(OwnedSet.catalog_set_id).distinct()

    part_match = or_(Part.part_num.startswith(q), PartAlias.alias.startswith(q))

    rows = session.execute(
        select(Part)
        .distinct()
        .outerjoin(PartAlias, Part.id == PartAlias.part_id)
        .join(SetPartInventoryLine, SetPartInventoryLine.part_id == Part.id)
        .where(
            SetPartInventoryLine.catalog_set_id.in_(owned_catalog_ids),
            part_match,
        )
        .order_by(Part.part_num)
        .limit(limit)
        .offset(offset)
    ).scalars().all()

    return [
        SearchPartResult(
            part_num=part.part_num,
            name=part.name,
            image_url=part.image_url,
        )
        for part in rows
    ]
