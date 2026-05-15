import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.importers.csv_import_service import import_set_list
from app.schemas.imports import CsvImportResponse, CsvTokenError

router = APIRouter(prefix="/imports", tags=["imports"])

MAX_CSV_BYTES = int(os.environ.get("CSV_IMPORT_MAX_BYTES", 1_048_576))


@router.post("/csv", response_model=CsvImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> CsvImportResponse:
    raw = await file.read()
    if len(raw) > MAX_CSV_BYTES:
        raise HTTPException(status_code=413, detail="CSV file too large")
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="File must be UTF-8") from exc

    result = import_set_list(db, content)
    return CsvImportResponse(
        instances_created=result.instances_created,
        catalog_stubs_created=result.catalog_stubs_created,
        errors=[
            CsvTokenError(
                token_index=e.token_index,
                raw=e.raw,
                message=e.message,
            )
            for e in result.errors
        ],
    )
