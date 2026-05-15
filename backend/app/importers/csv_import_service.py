"""Create owned-set instances from parsed set numbers."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import CatalogSet, OwnedSet
from app.importers.set_list_parser import ParseError, parse_set_list

logger = logging.getLogger(__name__)


@dataclass
class CsvImportResult:
    instances_created: int
    catalog_stubs_created: int
    errors: list[ParseError]


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def import_set_list(session: Session, content: str) -> CsvImportResult:
    valid_tokens, errors = parse_set_list(content)
    instances_created = 0
    catalog_stubs_created = 0

    logger.info(
        "CSV import started tokens=%s parse_errors=%s",
        len(valid_tokens),
        len(errors),
    )

    for set_num in valid_tokens:
        catalog_set = session.scalar(
            select(CatalogSet).where(CatalogSet.set_num == set_num)
        )
        if catalog_set is None:
            catalog_set = CatalogSet(
                set_num=set_num,
                source="csv_import",
                source_ref=set_num,
                fetched_at=utc_now(),
            )
            session.add(catalog_set)
            session.flush()
            catalog_stubs_created += 1

        session.add(
            OwnedSet(
                catalog_set_id=catalog_set.id,
                investigated=False,
                created_at=utc_now(),
            )
        )
        instances_created += 1

    session.flush()
    result = CsvImportResult(
        instances_created=instances_created,
        catalog_stubs_created=catalog_stubs_created,
        errors=errors,
    )
    logger.info(
        "CSV import finished instances_created=%s catalog_stubs_created=%s "
        "token_errors=%s",
        result.instances_created,
        result.catalog_stubs_created,
        len(result.errors),
    )
    return result
