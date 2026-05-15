"""Derive catalog sync state for API responses."""

from app.db.models import CatalogSet, Part
from app.services.image_blob import catalog_set_has_image, part_has_image
from app.services.image_urls import catalog_set_image_url, part_image_url


def catalog_sync_state(catalog_set: CatalogSet) -> str:
    if catalog_set.source == "csv_import" and catalog_set.name is None:
        return "pending"
    return "ok"


def resolve_catalog_image_url(catalog_set: CatalogSet) -> str | None:
    if catalog_set_has_image(catalog_set):
        return catalog_set_image_url(catalog_set.id)
    return catalog_set.image_url


def resolve_part_image_url(part: Part) -> str | None:
    if part_has_image(part):
        return part_image_url(part.id)
    return part.image_url


def missing_image_url_for_part(part: Part, *, quantity_missing: int) -> str | None:
    if quantity_missing <= 0:
        return None
    return resolve_part_image_url(part)
