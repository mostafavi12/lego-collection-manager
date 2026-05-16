"""Download remote image URLs into existing SQLite BLOB image columns."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import httpx
from sqlalchemy.orm import Session

from app.db.models import CatalogSet, Part
from app.services.image_blob import (
    ImageBlobError,
    catalog_set_has_image,
    part_has_image,
    set_catalog_set_image,
    set_part_image,
)


class ImageDownloadError(Exception):
    """Raised when a remote image could not be fetched or stored."""


@dataclass(frozen=True)
class DownloadedImage:
    content: bytes
    content_type: str


class ImageDownloader(Protocol):
    def download(self, url: str) -> DownloadedImage: ...


class HttpxImageDownloader:
    def __init__(self, *, timeout_seconds: float = 20.0) -> None:
        self.timeout_seconds = timeout_seconds

    def download(self, url: str) -> DownloadedImage:
        if not url.startswith(("http://", "https://")):
            raise ImageDownloadError("Image URL must be HTTP(S)")
        try:
            response = httpx.get(url, timeout=self.timeout_seconds, follow_redirects=True)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise ImageDownloadError(str(exc)) from exc
        return DownloadedImage(
            content=response.content,
            content_type=response.headers.get("content-type", ""),
        )


def download_catalog_set_image(
    session: Session,
    catalog_set: CatalogSet,
    downloader: ImageDownloader,
) -> bool:
    if not catalog_set.image_url or catalog_set_has_image(catalog_set):
        return False
    image = downloader.download(catalog_set.image_url)
    try:
        set_catalog_set_image(
            session,
            catalog_set.id,
            content=image.content,
            content_type=image.content_type,
        )
    except ImageBlobError as exc:
        raise ImageDownloadError(str(exc)) from exc
    return True


def download_part_image(
    session: Session,
    part: Part,
    downloader: ImageDownloader,
) -> bool:
    if not part.image_url or part_has_image(part):
        return False
    image = downloader.download(part.image_url)
    try:
        set_part_image(
            session,
            part.id,
            content=image.content,
            content_type=image.content_type,
        )
    except ImageBlobError as exc:
        raise ImageDownloadError(str(exc)) from exc
    return True
