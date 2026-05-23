from pydantic import BaseModel


class ReportsSummaryResponse(BaseModel):
    total_sets: int
    investigated_sets: int
    complete_sets: int
    total_parts: int
    missing_parts: int
