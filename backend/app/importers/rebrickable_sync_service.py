"""Orchestrate Rebrickable catalog sync for the user's LEGO collection (distinct setNums from copies)."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

logger = logging.getLogger(__name__)

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import (
    CatalogSet,
    MinifigPartInventoryLine,
    OwnedSet,
    OwnedSetInventoryLine,
    Part,
    SetMinifigInventoryLine,
    SetPartInventoryLine,
)
from app.services.instance_inventory import ensure_instance_inventory_for_catalog
from app.importers.rebrickable_catalog import (
    SOURCE,
    replace_minifig_part_inventory,
    replace_set_part_inventory,
    upsert_catalog_minifig,
    upsert_catalog_set,
    upsert_theme,
    utc_now,
)
from app.domain.lego_set_number import LegoSetId, to_rebrickable_set_num
from app.rebrickable.client import RebrickableClient
from app.rebrickable.dto import CatalogSetDTO, ThemeDTO
from app.rebrickable.exceptions import RebrickableAPIError
from app.services.image_download import (
    HttpxImageDownloader,
    ImageDownloadError,
    ImageDownloader,
    download_catalog_set_image,
    download_part_image,
)


class RebrickableReader(Protocol):
    def get_set(self, set_num: str) -> CatalogSetDTO: ...

    def get_theme(self, theme_id: int) -> ThemeDTO: ...

    def iter_set_parts(self, set_num: str): ...

    def iter_set_minifigs(self, set_num: str): ...

    def iter_minifig_parts(self, minifig_num: str): ...


@dataclass
class SetSyncFailure:
    set_num: str
    message: str


@dataclass
class ImageSyncFailure:
    target: str
    url: str
    message: str


@dataclass
class RebrickableSyncResult:
    sets_synced: int = 0
    sets_failed: list[SetSyncFailure] = field(default_factory=list)
    parts_upserted: int = 0
    inventory_lines_written: int = 0
    set_images_downloaded: int = 0
    part_images_downloaded: int = 0
    image_downloads_failed: list[ImageSyncFailure] = field(default_factory=list)


def resolve_set_nums(session: Session, owned_set_ids: list[int] | None) -> list[str]:
    """Distinct Rebrickable ``set_num`` keys (e.g. ``6024-1``) for owned catalog rows."""
    stmt = (
        select(CatalogSet.set_number, CatalogSet.set_variant)
        .join(OwnedSet, OwnedSet.catalog_set_id == CatalogSet.id)
        .distinct()
        .order_by(CatalogSet.set_number, CatalogSet.set_variant)
    )
    if owned_set_ids is not None:
        stmt = stmt.where(OwnedSet.id.in_(owned_set_ids))
    keys: list[str] = []
    seen: set[str] = set()
    for num, var in session.execute(stmt):
        rb = to_rebrickable_set_num(LegoSetId(number=num, variant=var))
        if rb not in seen:
            seen.add(rb)
            keys.append(rb)
    return keys


def sync_catalog_for_set_nums(
    session: Session,
    client: RebrickableReader,
    set_nums: list[str],
    *,
    download_set_images: bool = False,
    download_missing_part_images: bool = False,
    download_all_part_images: bool = False,
    image_downloader: ImageDownloader | None = None,
) -> RebrickableSyncResult:
    result = RebrickableSyncResult()
    downloader = image_downloader or HttpxImageDownloader()
    logger.info("Rebrickable sync started set_count=%s", len(set_nums))
    for set_num in set_nums:
        try:
            with session.begin_nested():
                parts, lines, _age = sync_one_catalog_set(session, client, set_num)
            result.sets_synced += 1
            result.parts_upserted += parts
            result.inventory_lines_written += lines
            logger.info(
                "Rebrickable sync set_ok set_num=%s parts_upserted=%s inventory_lines=%s",
                set_num,
                parts,
                lines,
            )
            catalog = _catalog_for_rebrickable_key(session, set_num)
            if catalog is not None and download_set_images:
                _download_catalog_image(session, catalog, downloader, result)
            if catalog is not None and download_missing_part_images:
                _download_missing_part_images(session, catalog.id, downloader, result)
            if catalog is not None and download_all_part_images:
                _download_all_part_images(session, catalog.id, downloader, result)
        except RebrickableAPIError as exc:
            session.rollback()
            message = _format_api_error(exc)
            logger.warning(
                "Rebrickable sync set_failed set_num=%s error=%s",
                set_num,
                message,
            )
            result.sets_failed.append(
                SetSyncFailure(set_num=set_num, message=message)
            )
        except Exception as exc:
            session.rollback()
            logger.exception(
                "Rebrickable sync set_failed set_num=%s",
                set_num,
            )
            result.sets_failed.append(
                SetSyncFailure(set_num=set_num, message=str(exc))
            )
    logger.info(
        "Rebrickable sync finished sets_synced=%s sets_failed=%s "
        "parts_upserted=%s inventory_lines_written=%s",
        result.sets_synced,
        len(result.sets_failed),
        result.parts_upserted,
        result.inventory_lines_written,
    )
    return result


def sync_rebrickable(
    session: Session,
    *,
    owned_set_ids: list[int] | None = None,
    client: RebrickableReader | None = None,
    download_set_images: bool = False,
    download_missing_part_images: bool = False,
    download_all_part_images: bool = False,
    image_downloader: ImageDownloader | None = None,
) -> RebrickableSyncResult:
    """Sync catalog data for set copies (dedup by `set_num`). Opens client when not provided."""
    set_nums = resolve_set_nums(session, owned_set_ids)
    if not set_nums:
        logger.info("Rebrickable sync skipped: no set copies to sync")
        return RebrickableSyncResult()

    if client is not None:
        return sync_catalog_for_set_nums(
            session,
            client,
            set_nums,
            download_set_images=download_set_images,
            download_missing_part_images=download_missing_part_images,
            download_all_part_images=download_all_part_images,
            image_downloader=image_downloader,
        )

    with RebrickableClient() as rb_client:
        return sync_catalog_for_set_nums(
            session,
            rb_client,
            set_nums,
            download_set_images=download_set_images,
            download_missing_part_images=download_missing_part_images,
            download_all_part_images=download_all_part_images,
            image_downloader=image_downloader,
        )


def sync_one_catalog_set(
    session: Session,
    client: RebrickableReader,
    set_num: str,
    *,
    persist_image_urls: bool = True,
) -> tuple[int, int, int | None]:
    fetched_at = utc_now()
    set_dto = client.get_set(set_num)
    recommended_age = set_dto.age

    theme_id = None
    if set_dto.theme_external_id is not None:
        theme_dto = client.get_theme(set_dto.theme_external_id)
        theme = upsert_theme(session, theme_dto, fetched_at=fetched_at)
        theme_id = theme.id

    catalog_set = upsert_catalog_set(
        session,
        set_dto,
        theme_id=theme_id,
        fetched_at=fetched_at,
        persist_image_urls=persist_image_urls,
    )

    if recommended_age is not None:
        for owned in session.scalars(
            select(OwnedSet).where(OwnedSet.catalog_set_id == catalog_set.id)
        ).all():
            owned.age = recommended_age

    parts_upserted = 0
    inventory_lines = 0

    set_parts = list(client.iter_set_parts(set_num))
    p, lines = replace_set_part_inventory(
        session,
        catalog_set.id,
        set_parts,
        fetched_at=fetched_at,
        persist_image_urls=persist_image_urls,
    )
    parts_upserted += p
    inventory_lines += lines

    set_minifigs = list(client.iter_set_minifigs(set_num))
    session.execute(
        delete(SetMinifigInventoryLine).where(
            SetMinifigInventoryLine.catalog_set_id == catalog_set.id
        )
    )
    for minifig_line in set_minifigs:
        catalog_minifig = upsert_catalog_minifig(
            session,
            minifig_line,
            fetched_at=fetched_at,
            persist_image_urls=persist_image_urls,
        )
        session.add(
            SetMinifigInventoryLine(
                catalog_set_id=catalog_set.id,
                catalog_minifig_id=catalog_minifig.id,
                quantity=minifig_line.quantity,
                source=SOURCE,
                fetched_at=fetched_at,
            )
        )
        inventory_lines += 1

        minifig_parts = list(client.iter_minifig_parts(minifig_line.minifig_num))
        p, lines = replace_minifig_part_inventory(
            session,
            catalog_minifig.id,
            minifig_parts,
            fetched_at=fetched_at,
            persist_image_urls=persist_image_urls,
        )
        parts_upserted += p
        inventory_lines += lines

    ensure_instance_inventory_for_catalog(session, catalog_set.id)

    return parts_upserted, inventory_lines, recommended_age


def _format_api_error(exc: RebrickableAPIError) -> str:
    if exc.status_code is not None:
        return f"HTTP {exc.status_code} from Rebrickable"
    return str(exc)


def _catalog_for_rebrickable_key(session: Session, set_num: str) -> CatalogSet | None:
    number, variant = set_num.split("-", 1)
    if not number.isdigit() or not variant.isdigit():
        return None
    return session.scalar(
        select(CatalogSet).where(
            CatalogSet.set_number == int(number),
            CatalogSet.set_variant == int(variant),
        )
    )


def _download_catalog_image(
    session: Session,
    catalog: CatalogSet,
    downloader: ImageDownloader,
    result: RebrickableSyncResult,
) -> None:
    if not catalog.image_url:
        return
    try:
        if download_catalog_set_image(session, catalog, downloader):
            result.set_images_downloaded += 1
    except ImageDownloadError as exc:
        result.image_downloads_failed.append(
            ImageSyncFailure(
                target=f"catalog_set:{catalog.id}",
                url=catalog.image_url,
                message=str(exc),
            )
        )


def _missing_parts_for_catalog(session: Session, catalog_set_id: int) -> list[Part]:
    set_part_rows = (
        select(Part)
        .join(SetPartInventoryLine, SetPartInventoryLine.part_id == Part.id)
        .join(
            OwnedSetInventoryLine,
            OwnedSetInventoryLine.set_part_inventory_line_id == SetPartInventoryLine.id,
        )
        .where(
            SetPartInventoryLine.catalog_set_id == catalog_set_id,
            OwnedSetInventoryLine.quantity_missing > 0,
        )
    )
    minifig_rows = (
        select(Part)
        .join(MinifigPartInventoryLine, MinifigPartInventoryLine.part_id == Part.id)
        .join(
            OwnedSetInventoryLine,
            OwnedSetInventoryLine.minifig_part_inventory_line_id
            == MinifigPartInventoryLine.id,
        )
        .join(OwnedSet, OwnedSet.id == OwnedSetInventoryLine.owned_set_id)
        .where(
            OwnedSet.catalog_set_id == catalog_set_id,
            OwnedSetInventoryLine.quantity_missing > 0,
        )
    )
    parts = [
        *session.scalars(set_part_rows).all(),
        *session.scalars(minifig_rows).all(),
    ]
    seen: set[int] = set()
    unique: list[Part] = []
    for part in parts:
        if part.id in seen:
            continue
        seen.add(part.id)
        unique.append(part)
    return unique


def _all_parts_for_catalog(session: Session, catalog_set_id: int) -> list[Part]:
    set_parts = (
        select(Part)
        .join(SetPartInventoryLine, SetPartInventoryLine.part_id == Part.id)
        .where(SetPartInventoryLine.catalog_set_id == catalog_set_id)
    )
    minifig_parts = (
        select(Part)
        .join(MinifigPartInventoryLine, MinifigPartInventoryLine.part_id == Part.id)
        .join(
            SetMinifigInventoryLine,
            SetMinifigInventoryLine.catalog_minifig_id
            == MinifigPartInventoryLine.catalog_minifig_id,
        )
        .where(SetMinifigInventoryLine.catalog_set_id == catalog_set_id)
    )
    parts = [
        *session.scalars(set_parts).all(),
        *session.scalars(minifig_parts).all(),
    ]
    seen: set[int] = set()
    unique: list[Part] = []
    for part in parts:
        if part.id in seen:
            continue
        seen.add(part.id)
        unique.append(part)
    return unique


def _download_missing_part_images(
    session: Session,
    catalog_set_id: int,
    downloader: ImageDownloader,
    result: RebrickableSyncResult,
) -> None:
    for part in _missing_parts_for_catalog(session, catalog_set_id):
        if not part.image_url:
            continue
        try:
            if download_part_image(session, part, downloader):
                result.part_images_downloaded += 1
        except ImageDownloadError as exc:
            result.image_downloads_failed.append(
                ImageSyncFailure(
                    target=f"part:{part.id}",
                    url=part.image_url,
                    message=str(exc),
                )
            )


def _download_all_part_images(
    session: Session,
    catalog_set_id: int,
    downloader: ImageDownloader,
    result: RebrickableSyncResult,
) -> None:
    for part in _all_parts_for_catalog(session, catalog_set_id):
        if not part.image_url:
            continue
        try:
            if download_part_image(session, part, downloader):
                result.part_images_downloaded += 1
        except ImageDownloadError as exc:
            result.image_downloads_failed.append(
                ImageSyncFailure(
                    target=f"part:{part.id}",
                    url=part.image_url,
                    message=str(exc),
                )
            )


def ensure_api_key_configured() -> None:
    """Raise RebrickableConfigError if API key is missing."""
    from app.rebrickable.config import load_rebrickable_settings

    load_rebrickable_settings()
