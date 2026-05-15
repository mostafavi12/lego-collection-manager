"""Store and serve JPEG/PNG images in SQLite BLOB columns."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.config.image_settings import get_max_image_bytes, normalize_content_type
from app.db.models import CatalogSet, Part


class ImageBlobError(Exception):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


@dataclass(frozen=True)
class StoredImage:
    content: bytes
    content_type: str


def validate_image_upload(content: bytes, content_type: str) -> str:
    normalized = normalize_content_type(content_type)
    if normalized is None:
        raise ImageBlobError("File must be JPEG or PNG")
    if len(content) > get_max_image_bytes():
        raise ImageBlobError("Image file too large", status_code=413)
    return normalized


def part_has_image(part: Part) -> bool:
    return part.image_blob is not None and part.image_content_type is not None


def catalog_set_has_image(catalog_set: CatalogSet) -> bool:
    return (
        catalog_set.image_blob is not None
        and catalog_set.image_content_type is not None
    )


def get_part_image(session: Session, part_id: int) -> StoredImage | None:
    part = session.get(Part, part_id)
    if part is None or not part_has_image(part):
        return None
    assert part.image_blob is not None
    assert part.image_content_type is not None
    return StoredImage(content=part.image_blob, content_type=part.image_content_type)


def set_part_image(
    session: Session,
    part_id: int,
    *,
    content: bytes,
    content_type: str,
) -> Part:
    part = session.get(Part, part_id)
    if part is None:
        raise ImageBlobError("Part not found", status_code=404)
    normalized = validate_image_upload(content, content_type)
    part.image_blob = content
    part.image_content_type = normalized
    part.image_byte_size = len(content)
    session.flush()
    return part


def clear_part_image(session: Session, part_id: int) -> Part:
    part = session.get(Part, part_id)
    if part is None:
        raise ImageBlobError("Part not found", status_code=404)
    part.image_blob = None
    part.image_content_type = None
    part.image_byte_size = None
    session.flush()
    return part


def get_catalog_set_image(session: Session, catalog_set_id: int) -> StoredImage | None:
    catalog_set = session.get(CatalogSet, catalog_set_id)
    if catalog_set is None or not catalog_set_has_image(catalog_set):
        return None
    assert catalog_set.image_blob is not None
    assert catalog_set.image_content_type is not None
    return StoredImage(
        content=catalog_set.image_blob,
        content_type=catalog_set.image_content_type,
    )


def set_catalog_set_image(
    session: Session,
    catalog_set_id: int,
    *,
    content: bytes,
    content_type: str,
) -> CatalogSet:
    catalog_set = session.get(CatalogSet, catalog_set_id)
    if catalog_set is None:
        raise ImageBlobError("Catalog set not found", status_code=404)
    normalized = validate_image_upload(content, content_type)
    catalog_set.image_blob = content
    catalog_set.image_content_type = normalized
    catalog_set.image_byte_size = len(content)
    session.flush()
    return catalog_set


def clear_catalog_set_image(session: Session, catalog_set_id: int) -> CatalogSet:
    catalog_set = session.get(CatalogSet, catalog_set_id)
    if catalog_set is None:
        raise ImageBlobError("Catalog set not found", status_code=404)
    catalog_set.image_blob = None
    catalog_set.image_content_type = None
    catalog_set.image_byte_size = None
    session.flush()
    return catalog_set
