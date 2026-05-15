"""Create owned-set instances from parsed set numbers with Rebrickable catalog fetch."""

from __future__ import annotations

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CatalogSet, OwnedSet
from app.importers.rebrickable_catalog import utc_now
from app.importers.rebrickable_sync_service import (
    RebrickableReader,
    _format_api_error,
    sync_one_catalog_set,
)
from app.importers.set_list_parser import ParseError, parse_set_list_entries
from app.rebrickable.client import RebrickableClient
from app.rebrickable.exceptions import RebrickableAPIError
from app.services.instance_inventory import clone_instance_inventory

logger = logging.getLogger(__name__)

CSV_STUB_SOURCE = "csv_import"


@dataclass
class CsvImportSetFailure:
    token_index: int
    set_num: str
    message: str


@dataclass
class CsvImportResult:
    instances_created: int
    catalog_stubs_created: int
    sets_fetched: int
    sets_failed: list[CsvImportSetFailure]
    errors: list[ParseError]


def _ensure_catalog_stub(session: Session, set_num: str) -> tuple[CatalogSet, bool]:
    catalog_set = session.scalar(
        select(CatalogSet).where(CatalogSet.set_num == set_num)
    )
    if catalog_set is not None:
        return catalog_set, False
    catalog_set = CatalogSet(
        set_num=set_num,
        source=CSV_STUB_SOURCE,
        source_ref=set_num,
        fetched_at=utc_now(),
    )
    session.add(catalog_set)
    session.flush()
    return catalog_set, True


def _create_owned_instance(session: Session, catalog_set: CatalogSet) -> OwnedSet:
    owned = OwnedSet(
        catalog_set_id=catalog_set.id,
        investigated=False,
        created_at=utc_now(),
    )
    session.add(owned)
    session.flush()
    clone_instance_inventory(session, owned.id)
    return owned


def import_set_list(
    session: Session,
    content: str,
    *,
    client: RebrickableReader | None = None,
) -> CsvImportResult:
    valid_entries, errors = parse_set_list_entries(content)
    instances_created = 0
    catalog_stubs_created = 0
    sets_fetched = 0
    sets_failed: list[CsvImportSetFailure] = []

    logger.info(
        "CSV import started tokens=%s parse_errors=%s",
        len(valid_entries),
        len(errors),
    )

    def process_token(token_index: int, set_num: str, rb_client: RebrickableReader) -> None:
        nonlocal instances_created, catalog_stubs_created, sets_fetched

        try:
            with session.begin_nested():
                sync_one_catalog_set(
                    session,
                    rb_client,
                    set_num,
                    persist_image_urls=False,
                )
            catalog_set = session.scalar(
                select(CatalogSet).where(CatalogSet.set_num == set_num)
            )
            if catalog_set is None:
                raise RuntimeError(f"catalog missing after sync for {set_num}")
            _create_owned_instance(session, catalog_set)
            instances_created += 1
            sets_fetched += 1
            logger.info("CSV import token_ok set_num=%s", set_num)
        except RebrickableAPIError as exc:
            session.rollback()
            message = _format_api_error(exc)
            logger.warning(
                "CSV import token_failed set_num=%s error=%s",
                set_num,
                message,
            )
            catalog_set, created_stub = _ensure_catalog_stub(session, set_num)
            if created_stub:
                catalog_stubs_created += 1
            _create_owned_instance(session, catalog_set)
            instances_created += 1
            sets_failed.append(
                CsvImportSetFailure(
                    token_index=token_index,
                    set_num=set_num,
                    message=message,
                )
            )
        except Exception as exc:
            session.rollback()
            logger.exception("CSV import token_failed set_num=%s", set_num)
            catalog_set, created_stub = _ensure_catalog_stub(session, set_num)
            if created_stub:
                catalog_stubs_created += 1
            _create_owned_instance(session, catalog_set)
            instances_created += 1
            sets_failed.append(
                CsvImportSetFailure(
                    token_index=token_index,
                    set_num=set_num,
                    message=str(exc),
                )
            )

    if client is not None:
        for token_index, set_num in valid_entries:
            process_token(token_index, set_num, client)
    else:
        with RebrickableClient() as rb_client:
            for token_index, set_num in valid_entries:
                process_token(token_index, set_num, rb_client)

    session.flush()
    result = CsvImportResult(
        instances_created=instances_created,
        catalog_stubs_created=catalog_stubs_created,
        sets_fetched=sets_fetched,
        sets_failed=sets_failed,
        errors=errors,
    )
    logger.info(
        "CSV import finished instances_created=%s sets_fetched=%s "
        "catalog_stubs_created=%s sets_failed=%s token_errors=%s",
        result.instances_created,
        result.sets_fetched,
        result.catalog_stubs_created,
        len(result.sets_failed),
        len(result.errors),
    )
    return result
