"""Missing-part tracking and local image storage."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import (
    MinifigPartInventoryLine,
    MissingItem,
    OwnedSet,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
)
from app.schemas.missing import MissingImageResponse, MissingUpsertRequest, MissingUpsertResponse
from app.services.catalog_state import missing_image_url
from app.services.missing_storage import (
    delete_image_file,
    extension_for_content_type,
    resolve_uploaded_path,
    save_missing_image,
)


class MissingItemError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def upsert_missing(
    session: Session,
    owned_set_id: int,
    body: MissingUpsertRequest,
) -> MissingUpsertResponse:
    owned_set = session.get(OwnedSet, owned_set_id)
    if owned_set is None:
        raise MissingItemError("Owned set not found", status_code=404)

    if body.quantity_missing == 0:
        missing = _find_missing_for_line(session, owned_set_id, body)
        cleared_id = 0
        if missing is not None:
            cleared_id = missing.id
            delete_image_file(missing.image_path)
            session.delete(missing)
            session.flush()
        return MissingUpsertResponse(
            owned_set_id=owned_set_id,
            missing_item_id=cleared_id,
            updated_lines=1,
        )

    max_quantity = _validate_line_for_owned_set(session, owned_set, body)
    if body.quantity_missing > max_quantity:
        raise MissingItemError(
            f"quantity_missing cannot exceed inventory quantity ({max_quantity})"
        )

    missing = _find_missing_for_line(session, owned_set_id, body)
    if missing is None:
        missing = MissingItem(
            owned_set_id=owned_set_id,
            set_part_inventory_line_id=body.set_part_inventory_line_id,
            minifig_part_inventory_line_id=body.minifig_part_inventory_line_id,
            quantity_missing=body.quantity_missing,
            image_path=None,
            created_at=utc_now(),
            updated_at=utc_now(),
        )
        session.add(missing)
    else:
        missing.quantity_missing = body.quantity_missing
        missing.updated_at = utc_now()

    session.flush()
    return MissingUpsertResponse(
        owned_set_id=owned_set_id,
        missing_item_id=missing.id,
        updated_lines=1,
    )


def upload_missing_image(
    session: Session,
    owned_set_id: int,
    missing_item_id: int,
    *,
    content: bytes,
    content_type: str,
) -> MissingImageResponse:
    missing = _get_missing_for_owned_set(session, owned_set_id, missing_item_id)

    if extension_for_content_type(content_type) is None:
        raise MissingItemError("File must be JPEG or PNG")
    if not content:
        raise MissingItemError("Empty file")

    delete_image_file(missing.image_path)
    missing.image_path = save_missing_image(missing_item_id, content, content_type)
    missing.updated_at = utc_now()
    session.flush()

    return MissingImageResponse(
        missing_item_id=missing.id,
        missing_image_url=missing_image_url(missing.id, missing.image_path),
    )


def delete_missing_image(
    session: Session,
    owned_set_id: int,
    missing_item_id: int,
) -> MissingImageResponse:
    missing = _get_missing_for_owned_set(session, owned_set_id, missing_item_id)
    delete_image_file(missing.image_path)
    missing.image_path = None
    missing.updated_at = utc_now()
    session.flush()
    return MissingImageResponse(missing_item_id=missing.id, missing_image_url=None)


def resolve_missing_image_for_serving(
    session: Session,
    missing_item_id: int,
) -> tuple[Path, str] | None:
    missing = session.get(MissingItem, missing_item_id)
    if missing is None or not missing.image_path:
        return None

    path = resolve_uploaded_path(missing.image_path)
    if path is None or not path.is_file():
        return None

    suffix = path.suffix.lower()
    if suffix in (".jpg", ".jpeg"):
        media_type = "image/jpeg"
    elif suffix == ".png":
        media_type = "image/png"
    else:
        return None

    return path, media_type


def _get_missing_for_owned_set(
    session: Session,
    owned_set_id: int,
    missing_item_id: int,
) -> MissingItem:
    missing = session.scalar(
        select(MissingItem).where(
            MissingItem.id == missing_item_id,
            MissingItem.owned_set_id == owned_set_id,
        )
    )
    if missing is None:
        raise MissingItemError("Missing item not found", status_code=404)
    return missing


def _find_missing_for_line(
    session: Session,
    owned_set_id: int,
    body: MissingUpsertRequest,
) -> MissingItem | None:
    if body.set_part_inventory_line_id is not None:
        return session.scalar(
            select(MissingItem).where(
                MissingItem.owned_set_id == owned_set_id,
                MissingItem.set_part_inventory_line_id == body.set_part_inventory_line_id,
            )
        )
    return session.scalar(
        select(MissingItem).where(
            MissingItem.owned_set_id == owned_set_id,
            MissingItem.minifig_part_inventory_line_id
            == body.minifig_part_inventory_line_id,
        )
    )


def _validate_line_for_owned_set(
    session: Session,
    owned_set: OwnedSet,
    body: MissingUpsertRequest,
) -> int:
    if body.set_part_inventory_line_id is not None:
        line = session.get(SetPartInventoryLine, body.set_part_inventory_line_id)
        if line is None or line.catalog_set_id != owned_set.catalog_set_id:
            raise MissingItemError("Inventory line does not belong to this owned set")
        return line.quantity

    line = session.get(MinifigPartInventoryLine, body.minifig_part_inventory_line_id)
    if line is None:
        raise MissingItemError("Inventory line does not belong to this owned set")

    in_set = session.scalar(
        select(SetMinifigInventoryLine.id).where(
            SetMinifigInventoryLine.catalog_set_id == owned_set.catalog_set_id,
            SetMinifigInventoryLine.catalog_minifig_id == line.catalog_minifig_id,
        )
    )
    if in_set is None:
        raise MissingItemError("Inventory line does not belong to this owned set")
    return line.quantity
