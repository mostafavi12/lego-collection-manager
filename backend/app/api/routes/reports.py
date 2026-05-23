from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.reports import ReportsSummaryResponse
from app.services.reports_service import get_summary

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=ReportsSummaryResponse)
def reports_summary(db: Session = Depends(get_db)) -> ReportsSummaryResponse:
    return get_summary(db)
