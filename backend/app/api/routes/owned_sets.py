from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.schemas.owned_sets import (
    OwnedSetDetailResponse,
    OwnedSetDuplicateResponse,
    OwnedSetListItem,
    OwnedSetListResponse,
    OwnedSetUpdateRequest,
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
