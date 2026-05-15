"""Derive catalog sync state for API responses."""

from app.db.models import CatalogSet


def catalog_sync_state(catalog_set: CatalogSet) -> str:
    if catalog_set.source == "csv_import" and catalog_set.name is None:
        return "pending"
    return "ok"


def missing_image_url(missing_item_id: int | None, image_path: str | None) -> str | None:
    if missing_item_id is not None and image_path:
        return f"/api/media/missing/{missing_item_id}"
    return None
