from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config.upload_settings import get_max_missing_image_bytes
from app.db.deps import get_db
from app.schemas.missing import (
    MissingImageResponse,
    MissingUpsertRequest,
    MissingUpsertResponse,
)
from app.schemas.owned_sets import (
    OwnedSetDetailResponse,
    OwnedSetDuplicateResponse,
    OwnedSetListItem,
    OwnedSetListResponse,
    OwnedSetUpdateRequest,
)
from app.services.missing_items_service import (
    MissingItemError,
    delete_missing_image,
    upload_missing_image,
    upsert_missing,
)
from app.services.owned_sets_service import (
    duplicate_owned_set,
    get_owned_set_detail,
    list_owned_sets,
    update_owned_set,
)

router = APIRouter(prefix="/owned-sets", tags=["owned-sets"])


@router.get("", response_model=OwnedSetListResponse)
def get_owned_sets(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    investigated: bool | None = None,
    db: Session = Depends(get_db),
) -> OwnedSetListResponse:
    return list_owned_sets(db, limit=limit, offset=offset, investigated=investigated)


@router.get("/{owned_set_id}", response_model=OwnedSetDetailResponse)
def get_owned_set(
    owned_set_id: int,
    db: Session = Depends(get_db),
) -> OwnedSetDetailResponse:
    detail = get_owned_set_detail(db, owned_set_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return detail


@router.patch("/{owned_set_id}", response_model=OwnedSetListItem)
def patch_owned_set(
    owned_set_id: int,
    body: OwnedSetUpdateRequest,
    db: Session = Depends(get_db),
) -> OwnedSetListItem:
    updated = update_owned_set(db, owned_set_id, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return updated


@router.post("/{owned_set_id}/duplicate", response_model=OwnedSetDuplicateResponse, status_code=201)
def post_duplicate_owned_set(
    owned_set_id: int,
    db: Session = Depends(get_db),
) -> OwnedSetDuplicateResponse:
    duplicated = duplicate_owned_set(db, owned_set_id)
    if duplicated is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return duplicated


def _raise_missing_error(exc: MissingItemError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.patch("/{owned_set_id}/missing", response_model=MissingUpsertResponse)
def patch_missing_item(
    owned_set_id: int,
    body: MissingUpsertRequest,
    db: Session = Depends(get_db),
) -> MissingUpsertResponse:
    try:
        return upsert_missing(db, owned_set_id, body)
    except MissingItemError as exc:
        _raise_missing_error(exc)
    raise AssertionError("unreachable")


@router.put(
    "/{owned_set_id}/missing/{missing_item_id}/image",
    response_model=MissingImageResponse,
)
async def put_missing_image(
    owned_set_id: int,
    missing_item_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> MissingImageResponse:
    raw = await file.read()
    max_bytes = get_max_missing_image_bytes()
    if len(raw) > max_bytes:
        raise HTTPException(status_code=413, detail="Image file too large")
    content_type = file.content_type or ""
    try:
        return upload_missing_image(
            db,
            owned_set_id,
            missing_item_id,
            content=raw,
            content_type=content_type,
        )
    except MissingItemError as exc:
        _raise_missing_error(exc)
    raise AssertionError("unreachable")


@router.delete(
    "/{owned_set_id}/missing/{missing_item_id}/image",
    response_model=MissingImageResponse,
)
def delete_missing_image_route(
    owned_set_id: int,
    missing_item_id: int,
    db: Session = Depends(get_db),
) -> MissingImageResponse:
    try:
        return delete_missing_image(db, owned_set_id, missing_item_id)
    except MissingItemError as exc:
        _raise_missing_error(exc)
    raise AssertionError("unreachable")
