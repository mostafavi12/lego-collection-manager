"""Importer logging must not emit secrets."""

import logging

import pytest

from app.importers.csv_import_service import import_set_list
from app.importers.rebrickable_sync_service import sync_catalog_for_set_nums
from tests.factories import add_catalog_set, add_owned_set
from app.rebrickable.dto import ThemeDTO
from tests.test_rebrickable_sync_service import FakeRebrickableClient, _sample_set


def test_csv_import_logs_without_secrets(
    db_session, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.importers.csv_import_service")

    client = FakeRebrickableClient(
        sets={"6024-1": _sample_set()},
        themes={67: ThemeDTO(external_id=67, name="Town")},
    )
    import_set_list(
        db_session,
        "6024-1, secret-token-should-not-appear@invalid",
        client=client,
    )

    assert "secret-token-should-not-appear" not in caplog.text
    assert "CSV import finished" in caplog.text


def test_rebrickable_sync_logs_set_summary(
    db_session, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="app.importers.rebrickable_sync_service")

    catalog = add_catalog_set(db_session)
    add_owned_set(db_session, catalog)
    db_session.commit()

    client = FakeRebrickableClient(
        sets={"6024-1": _sample_set()},
        themes={67: ThemeDTO(external_id=67, name="Town")},
    )
    sync_catalog_for_set_nums(db_session, client, ["6024-1"])

    assert "Rebrickable sync set_ok set_num=6024-1" in caplog.text
    assert "your-api-key" not in caplog.text.lower()
