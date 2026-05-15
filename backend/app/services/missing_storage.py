"""Filesystem storage for missing-part images."""

from __future__ import annotations

from pathlib import Path

from app.config.upload_settings import (
    ALLOWED_IMAGE_CONTENT_TYPES,
    get_upload_root,
)


def extension_for_content_type(content_type: str) -> str | None:
    return ALLOWED_IMAGE_CONTENT_TYPES.get(content_type.split(";")[0].strip().lower())


def resolve_uploaded_path(image_path: str | None) -> Path | None:
    if not image_path:
        return None
    root = get_upload_root()
    candidate = (root / image_path).resolve()
    root_resolved = root.resolve()
    if not str(candidate).startswith(str(root_resolved)):
        return None
    return candidate


def delete_image_file(image_path: str | None) -> None:
    path = resolve_uploaded_path(image_path)
    if path is not None and path.is_file():
        path.unlink()


def save_missing_image(
    missing_item_id: int,
    content: bytes,
    content_type: str,
) -> str:
    ext = extension_for_content_type(content_type)
    if ext is None:
        raise ValueError("unsupported content type")

    root = get_upload_root()
    filename = f"{missing_item_id}{ext}"
    target = root / filename
    target.write_bytes(content)
    return filename
