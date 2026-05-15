from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config.image_settings import get_max_image_bytes
from app.db.deps import get_db
from app.schemas.missing import (
    MissingImageResponse,
    MissingUpsertRequest,
    MissingUpsertResponse,
)
from app.schemas.instance_inventory import (
    InstanceInventoryLineResponse,
    InstanceInventoryLineUpdate,
)
from app.schemas.manual_add import (
    OwnedSetAddPreviewResponse,
    OwnedSetCreateRequest,
    OwnedSetCreateResponse,
)
from app.schemas.owned_sets import (
    DuplicatePreviewResponse,
    DuplicateRequest,
    OwnedSetDeleteResponse,
    OwnedSetDetailResponse,
    OwnedSetDuplicateResponse,
    OwnedSetListItem,
    OwnedSetListResponse,
    OwnedSetUpdateRequest,
)
from app.services.manual_add_service import create_owned_set_manual, get_add_preview
from app.services.missing_items_service import (
    MissingItemError,
    delete_missing_image,
    upload_missing_image,
    upsert_missing,
)
from app.services.instance_inventory import (
    InstanceInventoryError,
    update_instance_inventory_line,
)
from app.services.owned_sets_service import (
    OwnedSetServiceError,
    delete_owned_set,
    duplicate_owned_set,
    get_duplicate_preview,
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


@router.get("/add-preview", response_model=OwnedSetAddPreviewResponse)
def get_owned_set_add_preview(
    set_num: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
) -> OwnedSetAddPreviewResponse:
    try:
        return get_add_preview(db, set_num)
    except OwnedSetServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.post("", response_model=OwnedSetCreateResponse, status_code=201)
def post_owned_set(
    body: OwnedSetCreateRequest,
    db: Session = Depends(get_db),
) -> OwnedSetCreateResponse:
    try:
        return create_owned_set_manual(db, body)
    except OwnedSetServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc


@router.get("/{owned_set_id}", response_model=OwnedSetDetailResponse)
def get_owned_set(
    owned_set_id: int,
    db: Session = Depends(get_db),
) -> OwnedSetDetailResponse:
    detail = get_owned_set_detail(db, owned_set_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return detail


@router.patch(
    "/{owned_set_id}/inventory-lines/{instance_line_id}",
    response_model=InstanceInventoryLineResponse,
)
def patch_instance_inventory_line(
    owned_set_id: int,
    instance_line_id: int,
    body: InstanceInventoryLineUpdate,
    db: Session = Depends(get_db),
) -> InstanceInventoryLineResponse:
    if body.quantity is None and body.quantity_missing is None:
        raise HTTPException(
            status_code=400,
            detail="At least one of quantity or quantity_missing is required",
        )
    try:
        line = update_instance_inventory_line(
            db,
            owned_set_id,
            instance_line_id,
            quantity=body.quantity,
            quantity_missing=body.quantity_missing,
        )
    except InstanceInventoryError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return InstanceInventoryLineResponse(
        instance_line_id=line.id,
        quantity=line.quantity,
        quantity_missing=line.quantity_missing,
    )


@router.patch("/{owned_set_id}", response_model=OwnedSetListItem)
def patch_owned_set(
    owned_set_id: int,
    body: OwnedSetUpdateRequest,
    db: Session = Depends(get_db),
) -> OwnedSetListItem:
    try:
        updated = update_owned_set(db, owned_set_id, body)
    except OwnedSetServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    if updated is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return updated


@router.delete("/{owned_set_id}", response_model=OwnedSetDeleteResponse)
def delete_owned_set_route(
    owned_set_id: int,
    db: Session = Depends(get_db),
) -> OwnedSetDeleteResponse:
    deleted = delete_owned_set(db, owned_set_id)
    if deleted is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return deleted


@router.get(
    "/{owned_set_id}/duplicate-preview",
    response_model=DuplicatePreviewResponse,
)
def get_duplicate_preview_route(
    owned_set_id: int,
    db: Session = Depends(get_db),
) -> DuplicatePreviewResponse:
    preview = get_duplicate_preview(db, owned_set_id)
    if preview is None:
        raise HTTPException(status_code=404, detail="Owned set not found")
    return preview


@router.post("/{owned_set_id}/duplicate", response_model=OwnedSetDuplicateResponse, status_code=201)
def post_duplicate_owned_set(
    owned_set_id: int,
    body: DuplicateRequest | None = None,
    db: Session = Depends(get_db),
) -> OwnedSetDuplicateResponse:
    label = body.label if body is not None else None
    duplicated = duplicate_owned_set(db, owned_set_id, label=label)
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
    max_bytes = get_max_image_bytes()
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
