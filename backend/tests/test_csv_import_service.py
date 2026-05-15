from sqlalchemy import func, select

from app.db.models import CatalogSet, OwnedSet
from app.importers.csv_import_service import import_set_list
from tests.factories import add_catalog_set, add_owned_set


def test_import_creates_stubs_and_instances(db_session) -> None:
    result = import_set_list(db_session, "6024-1,10281-1")
    db_session.commit()

    assert result.instances_created == 2
    assert result.catalog_stubs_created == 2
    assert result.errors == []
    assert db_session.scalar(select(func.count()).select_from(OwnedSet)) == 2


def test_import_reuses_existing_catalog_set(db_session) -> None:
    catalog = add_catalog_set(db_session, set_num="6024-1")
    add_owned_set(db_session, catalog)
    db_session.commit()

    result = import_set_list(db_session, "6024-1")
    db_session.commit()

    assert result.instances_created == 1
    assert result.catalog_stubs_created == 0
    assert db_session.scalar(select(func.count()).select_from(CatalogSet)) == 1
    assert db_session.scalar(select(func.count()).select_from(OwnedSet)) == 2


def test_import_duplicate_tokens_create_multiple_instances(db_session) -> None:
    result = import_set_list(db_session, "6024-1,6024-1")
    db_session.commit()

    assert result.instances_created == 2
    assert result.catalog_stubs_created == 1
    assert db_session.scalar(select(func.count()).select_from(OwnedSet)) == 2


def test_import_skips_invalid_tokens_but_imports_valid(db_session) -> None:
    result = import_set_list(db_session, "6024-1,,bad!")
    db_session.commit()

    assert result.instances_created == 1
    assert len(result.errors) == 2
