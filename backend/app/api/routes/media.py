from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.services.missing_items_service import resolve_missing_image_for_serving

router = APIRouter(prefix="/media", tags=["media"])


@router.get("/missing/{missing_item_id}")
def get_missing_image(
    missing_item_id: int,
    db: Session = Depends(get_db),
) -> FileResponse:
    resolved = resolve_missing_image_for_serving(db, missing_item_id)
    if resolved is None:
        raise HTTPException(status_code=404, detail="Image not found")
    path, media_type = resolved
    return FileResponse(path, media_type=media_type)
