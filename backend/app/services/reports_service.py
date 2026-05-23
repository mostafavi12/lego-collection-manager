"""Collection reporting aggregates."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import OwnedSet, OwnedSetInventoryLine
from app.schemas.reports import ReportsSummaryResponse


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
