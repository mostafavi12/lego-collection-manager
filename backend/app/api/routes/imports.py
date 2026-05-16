import os

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.importers.csv_import_service import import_set_list
from app.importers.rebrickable_sync_service import (
    ensure_api_key_configured,
    sync_rebrickable,
)
from app.rebrickable.exceptions import RebrickableConfigError
from app.schemas.imports import (
    CsvImportResponse,
    CsvImportSetFailure,
    CsvTokenError,
    ImageDownloadFailure,
    RebrickableSetSyncFailure,
    RebrickableSyncRequest,
    RebrickableSyncResponse,
)

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

    try:
        ensure_api_key_configured()
    except RebrickableConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    result = import_set_list(db, content)
    return CsvImportResponse(
        instances_created=result.instances_created,
        catalog_stubs_created=result.catalog_stubs_created,
        sets_fetched=result.sets_fetched,
        sets_failed=[
            CsvImportSetFailure(
                token_index=f.token_index,
                set_num=f.set_num,
                message=f.message,
            )
            for f in result.sets_failed
        ],
        errors=[
            CsvTokenError(
                token_index=e.token_index,
                raw=e.raw,
                message=e.message,
            )
            for e in result.errors
        ],
    )


@router.post("/rebrickable/sync", response_model=RebrickableSyncResponse)
def import_rebrickable_sync(
    body: RebrickableSyncRequest | None = None,
    db: Session = Depends(get_db),
) -> RebrickableSyncResponse:
    try:
        ensure_api_key_configured()
    except RebrickableConfigError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    owned_set_ids = body.owned_set_ids if body is not None else None
    part_image_mode = body.part_image_download_mode if body is not None else "none"
    result = sync_rebrickable(
        db,
        owned_set_ids=owned_set_ids,
        download_set_images=body.download_set_images if body is not None else False,
        download_missing_part_images=(
            part_image_mode == "missing"
            or (
                part_image_mode == "none"
                and (body.download_missing_part_images if body is not None else False)
            )
        ),
        download_all_part_images=part_image_mode == "all",
    )
    return RebrickableSyncResponse(
        sets_synced=result.sets_synced,
        sets_failed=[
            RebrickableSetSyncFailure(set_num=f.set_num, message=f.message)
            for f in result.sets_failed
        ],
        parts_upserted=result.parts_upserted,
        inventory_lines_written=result.inventory_lines_written,
        set_images_downloaded=result.set_images_downloaded,
        minifig_images_downloaded=result.minifig_images_downloaded,
        part_images_downloaded=result.part_images_downloaded,
        image_downloads_failed=[
            ImageDownloadFailure(
                target=f.target,
                url=f.url,
                message=f.message,
            )
            for f in result.image_downloads_failed
        ],
    )
