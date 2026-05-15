from sqlalchemy import select

from app.db.models import CatalogSet, MissingItem, OwnedSet, Theme
from tests.factories import add_catalog_set, add_owned_set, add_theme


def test_duplicate_preview_and_create_with_label(api_client, db_session) -> None:
    theme = add_theme(db_session)
    catalog = add_catalog_set(db_session, theme=theme)
    owned = add_owned_set(db_session, catalog, label="copy A")
    db_session.commit()

    preview = api_client.get(f"/api/owned-sets/{owned.id}/duplicate-preview")
    assert preview.status_code == 200
    body = preview.json()
    assert body["set_num"] == 6024
    assert body["existing_copy_count"] == 1
    assert body["suggested_label"] == "Copy #2"

    create = api_client.post(
        f"/api/owned-sets/{owned.id}/duplicate",
        json={"label": "Copy #2"},
    )
    assert create.status_code == 201
    created = create.json()
    assert created["label"] == "Copy #2"
    assert created["display_label"] == "Copy #2"
    assert created["copy_index"] == 2
    assert created["missing_count"] == 0


def test_delete_owned_set_removes_last_catalog(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session, set_number=9999)
    owned = add_owned_set(db_session, catalog)
    catalog_id = catalog.id
    db_session.commit()

    response = api_client.delete(f"/api/owned-sets/{owned.id}")
    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert db_session.get(OwnedSet, owned.id) is None
    assert db_session.get(CatalogSet, catalog_id) is None


def test_patch_catalog_theme_when_no_theme_linked(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    assert catalog.theme_id is None
    owned = add_owned_set(db_session, catalog)
    db_session.commit()

    response = api_client.patch(
        f"/api/owned-sets/{owned.id}",
        json={"catalog_theme_name": "Classic Town"},
    )
    assert response.status_code == 200
    assert response.json()["theme_name"] == "Classic Town"

    db_session.expire_all()
    refreshed = db_session.get(CatalogSet, catalog.id)
    assert refreshed is not None
    assert refreshed.theme_id is not None
    assert refreshed.theme is not None
    assert refreshed.theme.name == "Classic Town"
    assert refreshed.theme.source == "user"


def test_patch_catalog_theme_updates_existing_theme(api_client, db_session) -> None:
    theme = add_theme(db_session, name="Town")
    catalog = add_catalog_set(db_session, theme=theme)
    owned = add_owned_set(db_session, catalog)
    db_session.commit()

    response = api_client.patch(
        f"/api/owned-sets/{owned.id}",
        json={"catalog_theme_name": "Classic Town"},
    )
    assert response.status_code == 200
    assert response.json()["theme_name"] == "Classic Town"

    db_session.expire_all()
    assert db_session.get(Theme, theme.id).name == "Classic Town"


def test_patch_age_updates_all_instances(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    owned_a = add_owned_set(db_session, catalog, label="a")
    owned_b = add_owned_set(db_session, catalog, label="b")
    db_session.commit()

    response = api_client.patch(
        f"/api/owned-sets/{owned_a.id}",
        json={"age": 6},
    )
    assert response.status_code == 200
    assert response.json()["age"] == 6

    db_session.expire_all()
    assert db_session.get(OwnedSet, owned_a.id).age == 6
    assert db_session.get(OwnedSet, owned_b.id).age == 6


def test_patch_set_num_relinks_single_instance(api_client, db_session) -> None:
    catalog = add_catalog_set(db_session)
    owned_a = add_owned_set(db_session, catalog)
    owned_b = add_owned_set(db_session, catalog)
    db_session.commit()

    response = api_client.patch(
        f"/api/owned-sets/{owned_a.id}",
        json={"set_num": "8888-1"},
    )
    assert response.status_code == 200
    assert response.json()["set_num"] == 8888

    db_session.expire_all()
    assert db_session.get(OwnedSet, owned_b.id).catalog_set_id == catalog.id
    new_catalog = db_session.scalar(
        select(CatalogSet).where(CatalogSet.set_number == 8888)
    )
    assert new_catalog is not None
    assert db_session.get(OwnedSet, owned_a.id).catalog_set_id == new_catalog.id
