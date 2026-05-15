from sqlalchemy import select

from app.db.models import MissingItem, OwnedSet
from tests.factories import (
    add_catalog_set,
    add_catalog_stub,
    add_missing_item_for_set_line,
    add_owned_set,
    add_set_part_inventory_line,
    add_theme,
    add_part,
    add_color,
    add_minifig_with_parts,
)


def _seed_collection(db_session):
    theme = add_theme(db_session, external_id=67, name="Town")
    catalog = add_catalog_set(db_session, set_num="6024-1", theme=theme)
    owned_a = add_owned_set(db_session, catalog, investigated=False, label="copy A")
    owned_b = add_owned_set(db_session, catalog, investigated=True, label="copy B")
    part = add_part(db_session, part_num="3024")
    color = add_color(db_session)
    line = add_set_part_inventory_line(db_session, catalog_set=catalog, part=part, color=color)
    add_missing_item_for_set_line(db_session, owned_set=owned_a, line=line)
    add_minifig_with_parts(db_session, catalog_set=catalog)
    db_session.commit()
    return owned_a, owned_b, catalog


def test_list_owned_sets(api_client, db_session) -> None:
    owned_a, owned_b, _ = _seed_collection(db_session)
    response = api_client.get("/api/owned-sets")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert len(body["items"]) == 2
    by_id = {item["id"]: item for item in body["items"]}
    assert by_id[owned_a.id]["missing_count"] == 1
    assert by_id[owned_b.id]["missing_count"] == 0
    assert by_id[owned_a.id]["catalog_sync_state"] == "ok"
    assert by_id[owned_a.id]["theme_name"] == "Town"


def test_list_filter_investigated(api_client, db_session) -> None:
    _seed_collection(db_session)
    response = api_client.get("/api/owned-sets", params={"investigated": "false"})
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert body["items"][0]["investigated"] is False


def test_list_pending_catalog_sync_state(api_client, db_session) -> None:
    stub = add_catalog_stub(db_session, set_num="stub-1")
    add_owned_set(db_session, stub)
    db_session.commit()

    response = api_client.get("/api/owned-sets")
    assert response.json()["items"][0]["catalog_sync_state"] == "pending"


def test_get_owned_set_detail(api_client, db_session) -> None:
    owned_a, _, _ = _seed_collection(db_session)
    response = api_client.get(f"/api/owned-sets/{owned_a.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["catalog"]["set_num"] == "6024-1"
    assert len(body["inventory"]["set_parts"]) == 1
    assert body["inventory"]["set_parts"][0]["missing_quantity"] == 1
    assert body["inventory"]["set_parts"][0]["missing_image_url"] == "/api/media/missing/1"
    assert len(body["inventory"]["minifigs"]) == 1
    assert len(body["inventory"]["minifigs"][0]["parts"]) == 1


def test_get_owned_set_not_found(api_client) -> None:
    assert api_client.get("/api/owned-sets/9999").status_code == 404


def test_patch_owned_set(api_client, db_session) -> None:
    owned_a, _, _ = _seed_collection(db_session)
    response = api_client.patch(
        f"/api/owned-sets/{owned_a.id}",
        json={"investigated": True, "label": "checked"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["investigated"] is True
    assert body["label"] == "checked"


def test_duplicate_owned_set(api_client, db_session) -> None:
    owned_a, _, _ = _seed_collection(db_session)
    response = api_client.post(f"/api/owned-sets/{owned_a.id}/duplicate")
    assert response.status_code == 201
    body = response.json()
    assert body["duplicated_from_owned_set_id"] == owned_a.id
    assert body["investigated"] is False
    assert body["label"] == "Copy #3"
    assert body["display_label"] == "Copy #3"
    assert body["missing_count"] == 0

    source_missing = db_session.scalars(
        select(MissingItem).where(MissingItem.owned_set_id == owned_a.id)
    ).all()
    assert len(source_missing) == 1

    new_id = body["id"]
    new_missing = db_session.scalars(
        select(MissingItem).where(MissingItem.owned_set_id == new_id)
    ).all()
    assert new_missing == []

    assert db_session.scalar(select(OwnedSet).where(OwnedSet.id == new_id)) is not None


def test_duplicate_not_found(api_client) -> None:
    assert api_client.post("/api/owned-sets/9999/duplicate").status_code == 404
