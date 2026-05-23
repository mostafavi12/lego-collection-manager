from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.reports import IncompleteSetsReportResponse, ReportsSummaryResponse
from app.services.reports_service import get_summary, list_incomplete_sets

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportsSummaryResponse)
def reports_summary(db: Session = Depends(get_db)) -> ReportsSummaryResponse:
    return get_summary(db)


@router.get("/incomplete-sets", response_model=IncompleteSetsReportResponse)
def reports_incomplete_sets(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> IncompleteSetsReportResponse:
    return list_incomplete_sets(db, limit=limit, offset=offset)
