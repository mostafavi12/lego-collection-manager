"""CSV import with Rebrickable catalog fetch (Phase 12)."""

from sqlalchemy import func, select

from app.db.models import CatalogSet, OwnedSet, Part, SetPartInventoryLine
from app.importers.csv_import_service import import_set_list
from app.rebrickable.dto import CatalogSetDTO, ThemeDTO
from tests.test_rebrickable_sync_service import (
    FakeRebrickableClient,
    _sample_part_line,
    _sample_set,
)


def _client_for_6024() -> FakeRebrickableClient:
    return FakeRebrickableClient(
        sets={"6024-1": _sample_set()},
        themes={67: ThemeDTO(external_id=67, name="Town")},
        set_parts={"6024-1": [_sample_part_line()]},
    )


def test_csv_import_fetches_catalog_and_inventory(db_session) -> None:
    result = import_set_list(
        db_session, "6024-1", client=_client_for_6024()
    )
    db_session.commit()

    assert result.instances_created == 1
    assert result.sets_fetched == 1
    assert result.catalog_stubs_created == 0
    assert result.sets_failed == []
    catalog = db_session.scalar(
        select(CatalogSet).where(
            CatalogSet.set_number == 6024,
            CatalogSet.set_variant == 1,
        )
    )
    assert catalog is not None
    assert catalog.source == "rebrickable"
    assert catalog.name == "Police Car"
    assert db_session.scalar(select(func.count()).select_from(SetPartInventoryLine)) == 1
    assert db_session.scalar(select(func.count()).select_from(OwnedSet)) == 1


def test_csv_import_does_not_store_image_urls(db_session) -> None:
    import_set_list(db_session, "6024-1", client=_client_for_6024())
    db_session.commit()

    catalog = db_session.scalar(
        select(CatalogSet).where(
            CatalogSet.set_number == 6024,
            CatalogSet.set_variant == 1,
        )
    )
    part = db_session.scalar(select(Part).where(Part.part_num == "3024"))
    assert catalog is not None
    assert catalog.image_url is None
    assert part is not None
    assert part.image_url is None


def test_csv_import_reports_rebrickable_failure_but_creates_stub(db_session) -> None:
    client = FakeRebrickableClient(
        sets={"6024-1": _sample_set()},
        fail_set_nums={"6024-1"},
    )
    result = import_set_list(db_session, "6024-1", client=client)
    db_session.commit()

    assert result.instances_created == 1
    assert result.sets_fetched == 0
    assert result.catalog_stubs_created == 1
    assert len(result.sets_failed) == 1
    assert result.sets_failed[0].set_num == 6024
    catalog = db_session.scalar(
        select(CatalogSet).where(
            CatalogSet.set_number == 6024,
            CatalogSet.set_variant == 1,
        )
    )
    assert catalog is not None
    assert catalog.source == "csv_import"


def test_csv_import_second_token_creates_second_instance(db_session) -> None:
    client = _client_for_6024()
    import_set_list(db_session, "6024-1", client=client)
    db_session.commit()
    result = import_set_list(db_session, "6024-1", client=client)
    db_session.commit()

    assert result.instances_created == 1
    assert result.sets_fetched == 1
    assert db_session.scalar(select(func.count()).select_from(OwnedSet)) == 2


def test_csv_import_sets_age_on_new_instance(db_session) -> None:
    result = import_set_list(
        db_session, "6024-1", client=_client_for_6024()
    )
    db_session.commit()

    assert result.sets_fetched == 1
    owned = db_session.scalar(select(OwnedSet))
    assert owned is not None
    assert owned.age == 6


def test_csv_import_second_instance_gets_age(db_session) -> None:
    client = _client_for_6024()
    import_set_list(db_session, "6024-1", client=client)
    db_session.commit()

    result = import_set_list(db_session, "6024-1", client=client)
    db_session.commit()

    assert result.instances_created == 1
    ages = db_session.scalars(select(OwnedSet.age).order_by(OwnedSet.id)).all()
    assert ages == [6, 6]


def test_csv_import_two_set_nums_in_one_file(db_session) -> None:
    client = FakeRebrickableClient(
        sets={
            "6024-1": _sample_set(),
            "10281-1": CatalogSetDTO(
                set_num="10281-1",
                name="Bonsai",
                year=2021,
                theme_external_id=67,
                num_parts=100,
                image_url=None,
            ),
        },
        themes={67: ThemeDTO(external_id=67, name="Town")},
        set_parts={
            "6024-1": [_sample_part_line()],
            "10281-1": [_sample_part_line("3001")],
        },
    )
    result = import_set_list(db_session, "6024-1,10281-1", client=client)
    db_session.commit()

    assert result.instances_created == 2
    assert result.sets_fetched == 2
    assert db_session.scalar(select(func.count()).select_from(CatalogSet)) == 2
