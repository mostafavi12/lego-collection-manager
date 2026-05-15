"""Database model and constraint tests."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import CatalogSet, MissingItem, OwnedSet
from tests import factories


def test_create_core_models(db_session: Session) -> None:
    theme = factories.add_theme(db_session)
    catalog_set = factories.add_catalog_set(db_session, theme=theme)
    owned_set = factories.add_owned_set(db_session, catalog_set, label="copy A")
    part = factories.add_part(db_session)
    color = factories.add_color(db_session)
    line = factories.add_set_part_inventory_line(
        db_session, catalog_set=catalog_set, part=part, color=color
    )
    missing = MissingItem(
        owned_set_id=owned_set.id,
        set_part_inventory_line_id=line.id,
        quantity_missing=1,
        created_at=factories.utc_now(),
        updated_at=factories.utc_now(),
    )
    db_session.add(missing)
    db_session.commit()

    assert owned_set.id is not None
    assert owned_set.investigated is False
    assert owned_set.label == "copy A"
    assert missing.id is not None
    assert missing.set_part_inventory_line_id == line.id
    assert missing.minifig_part_inventory_line_id is None


def test_catalog_set_set_num_is_unique(db_session: Session) -> None:
    factories.add_catalog_set(db_session, set_num="6024-1")
    db_session.add(
        CatalogSet(
            set_num="6024-1",
            source="csv_import",
            source_ref="6024-1",
            fetched_at=factories.utc_now(),
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_part_num_is_unique(db_session: Session) -> None:
    factories.add_part(db_session, part_num="3024")
    with pytest.raises(IntegrityError):
        factories.add_part(db_session, part_num="3024")
        db_session.commit()
    db_session.rollback()


def test_multiple_owned_sets_per_catalog_set_id_allowed(db_session: Session) -> None:
    """Schema allows several physical copies of the same set number."""
    catalog_set = factories.add_catalog_set(db_session)
    first = factories.add_owned_set(db_session, catalog_set, label="first")
    second = factories.add_owned_set(db_session, catalog_set, label="second")
    db_session.commit()

    assert first.id != second.id
    assert first.catalog_set_id == second.catalog_set_id == catalog_set.id


def test_owned_set_investigated_defaults_false(db_session: Session) -> None:
    catalog_set = factories.add_catalog_set(db_session)
    owned_set = OwnedSet(catalog_set_id=catalog_set.id, created_at=factories.utc_now())
    db_session.add(owned_set)
    db_session.commit()

    assert owned_set.investigated is False


def test_missing_item_requires_exactly_one_line_reference(db_session: Session) -> None:
    catalog_set = factories.add_catalog_set(db_session)
    owned_set = factories.add_owned_set(db_session, catalog_set)
    part = factories.add_part(db_session)
    color = factories.add_color(db_session)
    line = factories.add_set_part_inventory_line(
        db_session, catalog_set=catalog_set, part=part, color=color
    )
    db_session.commit()

    neither = MissingItem(
        owned_set_id=owned_set.id,
        quantity_missing=1,
        created_at=factories.utc_now(),
        updated_at=factories.utc_now(),
    )
    db_session.add(neither)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    both = MissingItem(
        owned_set_id=owned_set.id,
        set_part_inventory_line_id=line.id,
        minifig_part_inventory_line_id=line.id,
        quantity_missing=1,
        created_at=factories.utc_now(),
        updated_at=factories.utc_now(),
    )
    db_session.add(both)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_missing_item_unique_per_owned_set_and_set_part_line(db_session: Session) -> None:
    catalog_set = factories.add_catalog_set(db_session)
    owned_set = factories.add_owned_set(db_session, catalog_set)
    part = factories.add_part(db_session)
    color = factories.add_color(db_session)
    line = factories.add_set_part_inventory_line(
        db_session, catalog_set=catalog_set, part=part, color=color
    )
    now = factories.utc_now()
    db_session.add(
        MissingItem(
            owned_set_id=owned_set.id,
            set_part_inventory_line_id=line.id,
            quantity_missing=1,
            created_at=now,
            updated_at=now,
        )
    )
    db_session.commit()

    db_session.add(
        MissingItem(
            owned_set_id=owned_set.id,
            set_part_inventory_line_id=line.id,
            quantity_missing=2,
            created_at=now,
            updated_at=now,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_deleting_owned_set_cascades_missing_items(db_session: Session) -> None:
    catalog_set = factories.add_catalog_set(db_session)
    owned_set = factories.add_owned_set(db_session, catalog_set)
    part = factories.add_part(db_session)
    color = factories.add_color(db_session)
    line = factories.add_set_part_inventory_line(
        db_session, catalog_set=catalog_set, part=part, color=color
    )
    missing = MissingItem(
        owned_set_id=owned_set.id,
        set_part_inventory_line_id=line.id,
        quantity_missing=1,
        created_at=factories.utc_now(),
        updated_at=factories.utc_now(),
    )
    db_session.add(missing)
    db_session.commit()
    missing_id = missing.id

    db_session.delete(owned_set)
    db_session.commit()

    assert db_session.get(MissingItem, missing_id) is None
